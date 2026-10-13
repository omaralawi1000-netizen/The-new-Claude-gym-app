package app.aven.android;

import android.app.Notification;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Debug only. Builds a rest notification the way Chrome hands the website's over (tag with the words, the end time as
 * its timestamp, two buttons) and runs it through RestNotifications, as RestDelegationService does. The CI emulator check
 * also tests the real thing through Chrome; this one needs no network.
 *   adb shell am broadcast -n app.aven.android/.DemoRestReceiver --ei sec 90
 */
public class DemoRestReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        long now = System.currentTimeMillis();
        long endsAt = now + intent.getIntExtra("sec", 90) * 1000L;
        String tag = "p#https://omaralawi1000-netizen.github.io#0" + RestNotifications.MARK
            + "{\"v\":1,\"s\":" + (now - 25_000) + ",\"x\":\"Incline Smith Machine Press\",\"l\":\"Set 2 of 3 · 60 kg × 8\","
            + "\"o\":\"Time for set 2\",\"b\":\"Incline Smith Machine Press · 60 kg × 8\",\"p\":\"+30 s\",\"k\":\"Skip\"}";
        RestNotifications.ensureChannels(c);
        PendingIntent none = PendingIntent.getBroadcast(c, 1, new Intent("app.aven.android.NOTHING"), PendingIntent.FLAG_IMMUTABLE);
        Notification chrome = new Notification.Builder(c, RestNotifications.CH_REST)
            .setSmallIcon(R.drawable.ic_stat_aven)
            .setContentTitle("Back at …")
            .setWhen(endsAt)
            .addAction(new Notification.Action.Builder(null, "+30 s", none).build())
            .addAction(new Notification.Action.Builder(null, "Skip", none).build())
            .build();
        RestNotifications.fromChrome(c, tag, chrome);
    }
}
