package app.aven.android;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** +30 s and Skip on the countdown (and it being swiped away), Done ✓ on the alert: done here at once, then passed on to
 *  the website. */
public class RestActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String a = intent.getAction();
        PendingIntent carried = Build.VERSION.SDK_INT >= 33
            ? intent.getParcelableExtra(RestNotifications.EXTRA_CHROME, PendingIntent.class)
            : intent.getParcelableExtra(RestNotifications.EXTRA_CHROME);
        RestNotifications.note(c, "button " + (a == null ? "?" : a.substring(a.lastIndexOf('.') + 1)) + (carried == null ? ", NO Chrome button inside" : ", Chrome button inside"));
        RestNotifications.restoreChrome(a, carried); // (a fresh start of the app: what comes next uses Chrome's buttons too)
        if (RestNotifications.ACTION_MORE.equals(a)) RestNotifications.more(c);
        else if (RestNotifications.ACTION_SKIP.equals(a)) RestNotifications.skip(c);
        else if (RestNotifications.ACTION_GONE.equals(a)) RestNotifications.swiped(c);
        else if (RestNotifications.ACTION_DONE.equals(a)) RestNotifications.done(c);
        PendingIntent chrome = carried;
        if (chrome == null) return;
        try {
            chrome.send(); // the website keeps its workout in step (and Chrome's copy of the notification)
            RestNotifications.note(c, "  → sent to Chrome");
        } catch (PendingIntent.CanceledException e) {
            RestNotifications.note(c, "  → Chrome refused it (its notification is gone)");
        } catch (RuntimeException e) {
            RestNotifications.note(c, "  → sending to Chrome failed: " + e.getClass().getSimpleName());
        }
    }
}
