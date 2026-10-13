package app.aven.android;

import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

/**
 * Ticks the rest countdown once a second while a rest runs: the big "1:42" and the draining bar are redrawn on each
 * whole second. While the screen is off it skips the redraw (nobody's looking, and the phone sleeps anyway); the exact
 * alarm, not this, rings at the end. A foreground service, because a plain background app gets frozen by Android.
 */
public class RestTimerService extends Service {
    static volatile boolean running;
    private final Handler h = new Handler(Looper.getMainLooper());
    private final Runnable tick = this::tick;

    static void start(Context c) {
        try {
            c.startForegroundService(new Intent(c, RestTimerService.class));
        } catch (RuntimeException notNow) {
            // Android doesn't let an app in the background start one of these on its own; an exact alarm may
            RestNotifications.scheduleStart(c);
        }
    }

    static void stop(Context c) {
        if (running) c.stopService(new Intent(c, RestTimerService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        RestNotifications.Rest r = RestNotifications.load(this);
        if (r == null || RestNotifications.isDismissed() || r.endsAt <= System.currentTimeMillis()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            running = true;
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(RestNotifications.ID_REST, RestNotifications.build(this, r, System.currentTimeMillis(), true),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(RestNotifications.ID_REST, RestNotifications.build(this, r, System.currentTimeMillis(), true));
            }
        } catch (RuntimeException notAllowed) {
            running = false;
            RestNotifications.show(this, false); // back to Android's own countdown
            stopSelf();
            return START_NOT_STICKY;
        }
        h.removeCallbacks(tick);
        tick();
        return START_NOT_STICKY;
    }

    private void tick() {
        RestNotifications.Rest r = RestNotifications.load(this);
        if (r == null || RestNotifications.isDismissed()) { stopSelf(); return; }
        long now = System.currentTimeMillis(), left = r.endsAt - now;
        if (left <= 0) { RestNotifications.ring(this); stopSelf(); return; }
        if (getSystemService(PowerManager.class).isInteractive()) {
            getSystemService(NotificationManager.class).notify(RestNotifications.ID_REST, RestNotifications.build(this, r, now, true));
        }
        RestNotifications.checkPromoted(this); // once: a Live Update, or our own layout from the next second on
        // next whole second of what's left (the clock is rounded up, so it changes just after one passes)
        long next = left % 1000;
        h.postDelayed(tick, (next == 0 ? 1000 : next) + 15);
    }

    @Override
    public void onDestroy() {
        h.removeCallbacks(tick);
        running = false;
        stopForeground(STOP_FOREGROUND_REMOVE);
        // still resting (stopped by Android, or swiped away): Android's own countdown takes over, which needs nothing
        RestNotifications.show(this, false);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
