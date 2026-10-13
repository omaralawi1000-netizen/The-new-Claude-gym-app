package app.aven.android;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** +30 s and Skip on the countdown (and it being swiped away): done here at once, then passed on to the website. */
public class RestActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String a = intent.getAction();
        if (RestNotifications.ACTION_MORE.equals(a)) RestNotifications.more(c);
        else if (RestNotifications.ACTION_SKIP.equals(a)) RestNotifications.stopAll(c, true);
        else if (RestNotifications.ACTION_GONE.equals(a)) RestNotifications.swiped(c);
        PendingIntent chrome = Build.VERSION.SDK_INT >= 33
            ? intent.getParcelableExtra(RestNotifications.EXTRA_CHROME, PendingIntent.class)
            : intent.getParcelableExtra(RestNotifications.EXTRA_CHROME);
        if (chrome == null) return;
        try {
            chrome.send(); // the website keeps its workout in step (and Chrome's copy of the notification)
        } catch (PendingIntent.CanceledException ignored) { /* the website's notification is gone already */ }
    }
}
