package app.aven.android;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;

/** The exact alarms: the end of a rest, and the nudge that starts the ticking service when Android wouldn't otherwise. */
public class RestAlarmReceiver extends BroadcastReceiver {
    static final String ACTION_END = "app.aven.android.REST_END";
    static final String ACTION_TICK = "app.aven.android.REST_TICK";

    @Override
    public void onReceive(Context c, Intent intent) {
        RestNotifications.seen(c);
        if (ACTION_TICK.equals(intent.getAction())) { RestTimerService.start(c); return; }
        // the end: kept awake a moment longer, so Android doesn't freeze the app while the clicks play
        PendingResult later = goAsync();
        RestNotifications.restoreChrome(intent); // (Android may have stopped the app during the rest)
        RestNotifications.ring(c);
        new Handler(Looper.getMainLooper()).postDelayed(later::finish, 2500);
    }
}
