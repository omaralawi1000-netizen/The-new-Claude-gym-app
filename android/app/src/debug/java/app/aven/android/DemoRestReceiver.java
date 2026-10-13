package app.aven.android;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import java.text.DateFormat;
import java.util.Date;

/**
 * Debug only. Builds the rest notification the way Chrome hands it over (title, text, two buttons, the end time as its
 * timestamp) and runs it through RestNotifications, as RestDelegationService does.
 *   adb shell am broadcast -n app.aven.android/.DemoRestReceiver --ei sec 90
 */
public class DemoRestReceiver extends BroadcastReceiver {
    static final String TAG = "p#https://omaralawi1000-netizen.github.io#0aven-rest";

    @Override
    @SuppressLint("MissingPermission")
    public void onReceive(Context c, Intent intent) {
        long endsAt = System.currentTimeMillis() + intent.getIntExtra("sec", 90) * 1000L;
        RestNotifications.ensureChannels(c);
        PendingIntent none = PendingIntent.getBroadcast(c, 1, new Intent("app.aven.android.NOTHING"), PendingIntent.FLAG_IMMUTABLE);
        Notification chrome = new Notification.Builder(c, RestNotifications.CH_REST)
            .setSmallIcon(R.drawable.ic_stat_aven)
            .setContentTitle("Back at " + DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(endsAt)))
            .setContentText("Machine Preacher Curl · set 2 of 3 · 25 kg × 10")
            .setWhen(endsAt)
            .setShowWhen(true)
            .addAction(new Notification.Action.Builder(null, "+30 s", none).build())
            .addAction(new Notification.Action.Builder(null, "Skip rest", none).build())
            .build();
        Notification mine = RestNotifications.restyle(c, TAG, 1, chrome);
        c.getSystemService(NotificationManager.class).notify(TAG, 1, mine);
    }
}
