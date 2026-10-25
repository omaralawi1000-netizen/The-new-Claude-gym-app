package app.aven.android;

import android.app.ActivityOptions;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

/** +30 s and Skip on the countdown (and it being swiped away), Done ✓ on the alert: done here at once, then passed on to
 *  the website. */
public class RestActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        PendingResult wait = goAsync();
        handle(c, intent, wait::finish);
    }

    /** The button, here or from RestDoneActivity (Done ✓); `finished` runs once Chrome has it (or it can't). */
    static void handle(Context c, Intent intent, Runnable finished) {
        String a = intent.getAction();
        RestNotifications.seen(c);
        RestNotifications.log("button: " + a);
        PendingIntent carried = Build.VERSION.SDK_INT >= 33
            ? intent.getParcelableExtra(RestNotifications.EXTRA_CHROME, PendingIntent.class)
            : intent.getParcelableExtra(RestNotifications.EXTRA_CHROME);
        RestNotifications.restoreChrome(a, carried); // (a fresh start of the app: what comes next uses Chrome's buttons too)
        if (RestNotifications.ACTION_MORE.equals(a)) RestNotifications.more(c);
        else if (RestNotifications.ACTION_SKIP.equals(a)) RestNotifications.skip(c);
        else if (RestNotifications.ACTION_GONE.equals(a)) RestNotifications.swiped(c);
        else if (RestNotifications.ACTION_DONE.equals(a)) RestNotifications.done(c);
        PendingIntent chrome = carried;
        RestNotifications.log("  Chrome's button inside: " + RestNotifications.kind(chrome));
        if (chrome == null) { finished.run(); return; }
        // the website keeps its workout in step (and Chrome's copy of the notification). Chrome's button opens a screen of
        // Chrome's for a moment, and newer Android silently drops that when it's sent from the background unless the
        // sender passes on this tap's permission to do so. A plain send() (18 Oct clean-up) made every Done ✓ go nowhere
        // on Omar's phone from the APK he installed on 20 Oct ("not working again", 25 Oct); the emulator let it through.
        Handler h = new Handler(Looper.getMainLooper());
        boolean[] over = { false };
        Runnable finish = () -> { if (!over[0]) { over[0] = true; finished.run(); } };
        Bundle opts = null;
        if (Build.VERSION.SDK_INT >= 34) {
            ActivityOptions o = ActivityOptions.makeBasic();
            int mode = ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED;
            try { mode = ActivityOptions.class.getField("MODE_BACKGROUND_ACTIVITY_START_ALLOW_ALWAYS").getInt(null); } catch (ReflectiveOperationException ignored) { /* before Android 16 */ }
            o.setPendingIntentBackgroundActivityStartMode(mode);
            opts = o.toBundle();
        }
        try {
            chrome.send(c, 0, null, (pi, in, code, data, extras) -> { RestNotifications.log("  → Chrome got it (" + code + ")"); h.post(finish); }, h, null, opts);
            RestNotifications.log("  → sent to Chrome");
            h.postDelayed(() -> { if (!over[0]) RestNotifications.log("  → no answer from Chrome in 4 s"); finish.run(); }, 4000);
        } catch (PendingIntent.CanceledException e) {
            RestNotifications.log("  → Chrome refused it (its notification is gone)");
            finish.run();
        } catch (RuntimeException e) {
            RestNotifications.log("  → sending to Chrome failed: " + e);
            finish.run();
        }
    }
}
