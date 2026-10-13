package app.aven.android;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.service.notification.StatusBarNotification;

import java.lang.reflect.Method;

/**
 * The native side of Aven's rest timer.
 *
 * The website already shows two notifications through its service worker (public/rest-sw.js): a quiet one while you
 * rest, tag "aven-rest", whose timestamp is the moment the rest ends; and the alert when it's over, tag "aven-rest-over".
 * Inside this app Chrome hands both to us (notification delegation), so here they get what a web page can't ask for:
 * the quiet one becomes a live countdown that ticks every second (Android's own chronometer, plus the status-bar chip
 * where the phone supports Live Updates), and an exact alarm stands by to ring even if the website's timer was stopped.
 * The +30 s and Skip rest buttons stay Chrome's own, so they still go to the website, which sends an updated
 * notification (or takes it away) and we follow.
 */
final class RestNotifications {
    static final String CH_REST = "aven_rest_live"; // quiet, the ticking countdown
    static final String CH_OVER = "aven_rest_over"; // rings
    private static final String PREFS = "aven_rest";
    /** the website's own alert gets this long to arrive before the back-up alarm rings instead */
    private static final long GRACE_MS = 1500;
    static final String NATIVE_OVER_TAG = "aven-native-rest-over";

    private RestNotifications() {}

    static boolean isResting(String tag) { return tag != null && tag.contains("aven-rest") && !tag.contains("aven-rest-over"); }
    static boolean isOver(String tag) { return tag != null && tag.contains("aven-rest-over"); }

    static void ensureChannels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CH_REST) == null) {
            NotificationChannel rest = new NotificationChannel(CH_REST, c.getString(R.string.channel_rest), NotificationManager.IMPORTANCE_LOW);
            rest.setDescription(c.getString(R.string.channel_rest_about));
            rest.setShowBadge(false);
            rest.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(rest);
        }
        if (nm.getNotificationChannel(CH_OVER) == null) {
            NotificationChannel over = new NotificationChannel(CH_OVER, c.getString(R.string.channel_over), NotificationManager.IMPORTANCE_HIGH);
            over.setDescription(c.getString(R.string.channel_over_about));
            over.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            over.enableVibration(true);
            over.setVibrationPattern(new long[] {0, 400, 120, 400, 120, 700});
            over.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            nm.createNotificationChannel(over);
        }
    }

    /**
     * Our version of a notification Chrome wants to show, or null when it isn't one of the rest notifications (Chrome's
     * own version is then shown as is).
     */
    static Notification restyle(Context c, String tag, int id, Notification n) {
        ensureChannels(c);
        long now = System.currentTimeMillis();
        if (isResting(tag)) {
            long endsAt = n.when;
            if (endsAt <= now) return null; // an older website version without the end time: leave it as it was
            Notification.Builder b = Notification.Builder.recoverBuilder(c, n)
                .setChannelId(CH_REST)
                .setWhen(endsAt)
                .setShowWhen(true)
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_PROGRESS)
                .setVisibility(Notification.VISIBILITY_PUBLIC);
            promote(b);
            CharSequence body = n.extras.getCharSequence(Notification.EXTRA_TEXT);
            prefs(c).edit()
                .putString("tag", tag).putInt("id", id).putLong("endsAt", endsAt)
                .putString("body", body == null ? "" : body.toString())
                .apply();
            schedule(c, endsAt + GRACE_MS);
            return b.build();
        }
        if (isOver(tag)) {
            cancelAlarm(c);
            Notification.Builder b = Notification.Builder.recoverBuilder(c, n)
                .setChannelId(CH_OVER)
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC);
            // the back-up alarm already rang for this rest: take its place on the quiet channel, without ringing again
            if (now - prefs(c).getLong("nativeRangAt", 0) < 120_000) {
                b.setChannelId(CH_REST);
                c.getSystemService(NotificationManager.class).cancel(NATIVE_OVER_TAG, 1);
            }
            return b.build();
        }
        return null;
    }

    /** The website took the rest notification away: back in the app, skipped, or its own alert is on the way. */
    static void restCancelled(Context c, String tag) {
        if (tag.equals(prefs(c).getString("tag", null))) {
            cancelAlarm(c);
            prefs(c).edit().remove("endsAt").apply();
        }
    }

    /** The back-up alarm: ring unless the website's alert already did. */
    static void alarm(Context c) {
        SharedPreferences p = prefs(c);
        long endsAt = p.getLong("endsAt", 0);
        if (endsAt == 0 || System.currentTimeMillis() < endsAt) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        for (StatusBarNotification s : nm.getActiveNotifications()) if (isOver(s.getTag())) return;
        String tag = p.getString("tag", null);
        if (tag != null) nm.cancel(tag, p.getInt("id", 0)); // the countdown has done its job
        ensureChannels(c);
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        PendingIntent tap = open == null ? null : PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = new Notification.Builder(c, CH_OVER)
            .setSmallIcon(R.drawable.ic_stat_aven)
            .setContentTitle(c.getString(R.string.rest_over))
            .setContentText(p.getString("body", ""))
            .setCategory(Notification.CATEGORY_ALARM)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setAutoCancel(true);
        if (tap != null) b.setContentIntent(tap);
        nm.notify(NATIVE_OVER_TAG, 1, b.build());
        p.edit().remove("endsAt").putLong("nativeRangAt", System.currentTimeMillis()).apply();
    }

    /** Android 16 Live Updates: the countdown also shows as a chip in the status bar and on the lock screen. */
    private static void promote(Notification.Builder b) {
        if (Build.VERSION.SDK_INT < 36) return;
        try {
            Method m = Notification.Builder.class.getMethod("setRequestPromotedOngoing", boolean.class);
            m.invoke(b, true);
        } catch (Exception ignored) { /* not on this phone */ }
    }

    private static void schedule(Context c, long at) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        PendingIntent pi = alarmIntent(c);
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    private static void cancelAlarm(Context c) { c.getSystemService(AlarmManager.class).cancel(alarmIntent(c)); }

    private static PendingIntent alarmIntent(Context c) {
        return PendingIntent.getBroadcast(c, 0, new Intent(c, RestAlarmReceiver.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
}
