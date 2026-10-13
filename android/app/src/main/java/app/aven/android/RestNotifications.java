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
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.RelativeSizeSpan;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONException;
import org.json.JSONObject;

import java.lang.reflect.Method;
import java.util.Collections;
import java.util.Locale;

/**
 * The native side of Aven's rest timer.
 *
 * How a rest gets here: when you leave Aven mid-rest, the website shows a notification from a small second service worker
 * whose scope is /The-new-Claude-gym-app-rest/ (android/site/). Chrome hands a site's notifications to an installed web app
 * (the old home-screen icon) before it tries this app, and only when the notification's scope is the web app's; this scope
 * isn't, so the rest always reaches us, whichever icon Aven was opened from. Its timestamp is when the rest ends, and its
 * tag carries the words as JSON after "aven-rest|" (the tag never shows anywhere).
 *
 * What it becomes: our own notification instead of Chrome's: the time left in big numbers, ticking every second
 * (RestTimerService), a bar that drains, the set that's next, +30 s and Skip, and Android 16's Live Update chip where the
 * phone has it. An exact alarm rings "Time for set 2" when it's over. Coming back to Aven, the website takes its
 * notification away and that takes ours away too, the alert included.
 */
final class RestNotifications {
    static final String CH_REST = "aven_rest_live"; // quiet: the countdown
    static final String CH_OVER = "aven_rest_over"; // rings
    static final int ID_REST = 71, ID_OVER = 72;
    static final String MARK = "aven-rest|";
    static final String ACTION_MORE = "app.aven.android.REST_MORE";
    static final String ACTION_SKIP = "app.aven.android.REST_SKIP";
    static final String ACTION_GONE = "app.aven.android.REST_GONE";
    static final String EXTRA_CHROME = "chrome";
    private static final String PREFS = "aven_rest2";

    /** The rest on show. */
    static final class Rest {
        String chromeTag = "";
        long startedAt, endsAt;
        String exercise = "", line = "", overTitle = "", overBody = "", more = "+30 s", skip = "Skip";
    }

    private static Rest current; // this process's copy of what's in the prefs
    // Chrome's own tap and buttons for the rest on show: tapping goes to the website, which opens the workout, and the
    // buttons tell it about +30 s / Skip. Kept for this process's life (the buttons also carry theirs inside, see own()).
    private static PendingIntent chromeTap, chromeMore, chromeSkip;
    private static long localChangeAt; // when +30 s was last tapped here (the website's own update comes a moment later)
    private static boolean dismissed; // swiped away: stop putting it back every second
    // Android made the countdown a Live Update (null: not known yet). Only then does it keep the big numbers of the
    // standard layout; everywhere else the countdown uses our own layout, with the numbers big all the same
    private static Boolean promoted;

    private RestNotifications() {}

    static void ensureChannels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CH_REST) == null) {
            // DEFAULT, not LOW, but without sound or buzz: LOW counts as "silent", which many phones leave off the lock
            // screen and out of the status bar, and the lock screen is the point
            NotificationChannel rest = new NotificationChannel(CH_REST, c.getString(R.string.channel_rest), NotificationManager.IMPORTANCE_DEFAULT);
            rest.setDescription(c.getString(R.string.channel_rest_about));
            rest.setSound(null, null);
            rest.enableVibration(false);
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

    // ── from Chrome ──────────────────────────────────────────

    /**
     * Chrome wants to show one of the website's notifications. True when it's ours (shown our way, or not needed);
     * false leaves it to Chrome's own look.
     */
    static boolean fromChrome(Context c, String tag, Notification n) {
        if (tag == null) return false;
        long now = System.currentTimeMillis();
        if (tag.contains("aven-rest-over")) {
            // the website's back-up alert: ours rings at the exact time already; if somehow it hasn't, ring now
            Rest r = load(c);
            if (r == null || r.endsAt > now + 1000) return false;
            ring(c);
            return true;
        }
        Rest r = parse(tag, n);
        if (r == null) return false;
        if (r.endsAt <= now + 500) return true; // already over (a late update): the alarm has it
        ensureChannels(c);
        Rest old = load(c);
        boolean same = old != null && old.startedAt == r.startedAt;
        // +30 s tapped here a moment ago: the website's catching up, don't let a slower update pull the time back
        if (same && now - localChangeAt < 4000 && r.endsAt < old.endsAt) r.endsAt = old.endsAt;
        if (n.contentIntent != null) chromeTap = n.contentIntent;
        if (n.actions != null && n.actions.length >= 2) { chromeMore = n.actions[0].actionIntent; chromeSkip = n.actions[1].actionIntent; }
        if (!same) {
            dismissed = false;
            c.getSystemService(NotificationManager.class).cancel(ID_OVER); // a new rest: the last alert has done its job
        }
        save(c, r);
        schedule(c, r.endsAt);
        show(c, true);
        RestTimerService.start(c);
        return true;
    }

    /** Chrome took one of the website's notifications away: you're back in Aven, or the rest was skipped. */
    static void chromeCancelled(Context c, String tag) {
        Rest r = load(c);
        if (r == null || tag == null || !tag.equals(r.chromeTag)) return; // an older rest's (a newer one has taken over)
        stopAll(c, true);
    }

    static Rest parse(String tag, Notification n) {
        int i = tag.indexOf(MARK);
        if (i < 0) return null;
        try {
            JSONObject j = new JSONObject(tag.substring(i + MARK.length()));
            Rest r = new Rest();
            r.chromeTag = tag;
            r.startedAt = j.getLong("s");
            r.endsAt = n.when;
            r.exercise = j.optString("x");
            r.line = j.optString("l");
            r.overTitle = j.optString("o");
            r.overBody = j.optString("b");
            r.more = j.optString("p", r.more);
            r.skip = j.optString("k", r.skip);
            return r.endsAt > r.startedAt ? r : null;
        } catch (JSONException e) {
            return null;
        }
    }

    // ── the buttons ──────────────────────────────────────────

    static void more(Context c) {
        Rest r = load(c);
        if (r == null) return;
        r.endsAt += 30_000;
        localChangeAt = System.currentTimeMillis();
        save(c, r);
        schedule(c, r.endsAt);
        show(c, true);
    }

    static void swiped(Context c) {
        dismissed = true;
        RestTimerService.stop(c); // the alarm stays: it still rings at the end
    }

    // ── showing it ───────────────────────────────────────────

    /** Posts the countdown (the ticking service posts the same notification every second while it runs). */
    static void show(Context c, boolean evenIfSwiped) {
        Rest r = load(c);
        if (r == null || (dismissed && !evenIfSwiped)) return;
        if (r.endsAt <= System.currentTimeMillis() || prefs(c).getLong("rang", 0) == r.startedAt) return; // over: the alert has it
        if (evenIfSwiped) dismissed = false;
        c.getSystemService(NotificationManager.class).notify(ID_REST, build(c, r, System.currentTimeMillis(), RestTimerService.running));
        if (promoted == null) new Handler(Looper.getMainLooper()).postDelayed(() -> checkPromoted(c), 400);
    }

    /** After the first countdown is up: did Android make it a Live Update? If not, it's redrawn in our own layout. */
    static void checkPromoted(Context c) {
        if (promoted != null) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        for (StatusBarNotification sbn : nm.getActiveNotifications()) {
            if (sbn.getId() != ID_REST) continue;
            promoted = isPromoted(sbn.getNotification());
            if (!promoted) {
                Rest r = load(c);
                if (r != null && !dismissed && r.endsAt > System.currentTimeMillis()) {
                    nm.notify(ID_REST, build(c, r, System.currentTimeMillis(), RestTimerService.running));
                }
            }
            return;
        }
    }

    private static boolean isPromoted(Notification n) {
        if (Build.VERSION.SDK_INT < 36) return false;
        try {
            return (Boolean) Notification.class.getMethod("isPromotedOngoing").invoke(n);
        } catch (Exception e) {
            return false;
        }
    }

    static boolean isDismissed() { return dismissed; }

    /**
     * The countdown: the exercise in the header, the time left in big numbers ("1:42"), the set, a draining bar, and
     * +30 s / Skip. Ticking (the service runs) we redraw the numbers every second; otherwise Android counts down by
     * itself. As a Live Update it's Android's standard layout (the only one it promotes); elsewhere our own layout,
     * because Android shows the standard one's title at normal size there.
     */
    static Notification build(Context c, Rest r, long now, boolean ticking) {
        long left = Math.max(0, r.endsAt - now);
        long total = Math.max(1000, r.endsAt - r.startedAt);
        int ember = c.getColor(R.color.ember);
        Notification.Builder b = new Notification.Builder(c, CH_REST)
            .setSmallIcon(R.drawable.ic_stat_aven)
            .setColor(ember)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setLocalOnly(true)
            .setCategory(Notification.CATEGORY_STOPWATCH)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(tap(c))
            .setDeleteIntent(own(c, ACTION_GONE, null));
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        int max = (int) (total / 100), at = (int) (left / 100); // the bar: what's left of the rest, draining
        if ((Build.VERSION.SDK_INT >= 36 && promoted == null) || Boolean.TRUE.equals(promoted)) {
            // the standard layout, which Android can make a Live Update (a chip in the status bar, the lock screen)
            if (ticking) {
                String clock = clock(left);
                SpannableString big = new SpannableString(clock); // kept big in a Live Update
                big.setSpan(new RelativeSizeSpan(1.6f), 0, clock.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                b.setContentTitle(big).setContentText(r.line).setSubText(r.exercise).setShowWhen(false);
                criticalText(b, clock);
            } else {
                b.setContentTitle(r.line).setContentText(r.exercise)
                    .setWhen(r.endsAt).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true);
            }
            // Android's own buttons here, in Aven's colour where the phone keeps it
            b.addAction(new Notification.Action.Builder(null, ember(r.more, ember), own(c, ACTION_MORE, chromeMore)).build())
                .addAction(new Notification.Action.Builder(null, ember(r.skip, ember), own(c, ACTION_SKIP, chromeSkip)).build());
            if (Build.VERSION.SDK_INT >= 36) {
                b.setStyle(new Notification.ProgressStyle()
                    .setProgressSegments(Collections.singletonList(new Notification.ProgressStyle.Segment(max).setColor(ember)))
                    .setProgress(at));
            } else {
                b.setProgress(max, at, false);
            }
        } else {
            // our own layout under Android's header (app, exercise): big numbers, the set, the bar and our own +30 s / Skip
            // (Android's are thin words in the phone's blue, pushed left). Folded there's no header, so the exercise is ours.
            RemoteViews small = countdown(c, R.layout.rest_small, r, left, ticking);
            small.setTextViewText(R.id.exercise, r.exercise);
            small.setViewVisibility(R.id.exercise, r.exercise.isEmpty() ? View.GONE : View.VISIBLE);
            small.setProgressBar(R.id.bar, max, at, false);
            RemoteViews big = countdown(c, R.layout.rest_big, r, left, ticking);
            big.setProgressBar(R.id.bar, max, at, false);
            big.setTextViewText(R.id.more, r.more);
            big.setTextViewText(R.id.skip, r.skip);
            big.setOnClickPendingIntent(R.id.more, own(c, ACTION_MORE, chromeMore));
            big.setOnClickPendingIntent(R.id.skip, own(c, ACTION_SKIP, chromeSkip));
            b.setStyle(new Notification.DecoratedCustomViewStyle()).setCustomContentView(small).setCustomBigContentView(big)
                .setSubText(r.exercise).setShowWhen(false);
        }
        promote(b);
        return b.build();
    }

    /** The numbers: ours, redrawn every second while the ticking service runs; otherwise Android's own countdown. */
    private static RemoteViews countdown(Context c, int layout, Rest r, long left, boolean ticking) {
        RemoteViews v = new RemoteViews(c.getPackageName(), layout);
        v.setTextViewText(R.id.line, r.line);
        if (ticking) {
            v.setTextViewText(R.id.clock, clock(left));
        } else {
            v.setViewVisibility(R.id.clock, View.GONE);
            v.setViewVisibility(R.id.chrono, View.VISIBLE);
            v.setChronometer(R.id.chrono, SystemClock.elapsedRealtime() + left + 999, null, true); // + 999: rounded up
            v.setChronometerCountDown(R.id.chrono, true);
        }
        return v;
    }

    /** A button's words in ember (Android keeps the colour on some phones and drops it on others). */
    private static CharSequence ember(String text, int colour) {
        SpannableString s = new SpannableString(text);
        s.setSpan(new ForegroundColorSpan(colour), 0, text.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return s;
    }

    /** "1:42" (rounded up, so it says 0:01 until the very end, like a kitchen timer). */
    static String clock(long ms) {
        long s = (ms + 999) / 1000;
        return String.format(Locale.ROOT, "%d:%02d", s / 60, s % 60);
    }

    // ── the end ──────────────────────────────────────────────

    /** The rest is over: the countdown goes, "Time for set 2" rings (once per rest, whoever gets here first). */
    static void ring(Context c) {
        Rest r = load(c);
        if (r == null) return;
        SharedPreferences p = prefs(c);
        if (p.getLong("rang", 0) == r.startedAt) return;
        p.edit().putLong("rang", r.startedAt).apply();
        cancelAlarm(c);
        RestTimerService.stop(c);
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.cancel(ID_REST);
        ensureChannels(c);
        Notification.Builder b = new Notification.Builder(c, CH_OVER)
            .setSmallIcon(R.drawable.ic_stat_aven)
            .setColor(c.getColor(R.color.ember))
            .setContentTitle(r.overTitle.isEmpty() ? c.getString(R.string.rest_over) : r.overTitle)
            .setContentText(r.overBody)
            .setCategory(Notification.CATEGORY_ALARM)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setLocalOnly(true)
            .setAutoCancel(true)
            .setTimeoutAfter(15 * 60_000L) // left for a long time, it tidies itself away
            .setContentIntent(tap(c));
        nm.notify(ID_OVER, b.build());
    }

    /** Everything off: the countdown, its alarm, and (when you're back) the alert. */
    static void stopAll(Context c, boolean alertToo) {
        cancelAlarm(c);
        RestTimerService.stop(c);
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.cancel(ID_REST);
        if (alertToo) nm.cancel(ID_OVER);
        current = null;
        prefs(c).edit().remove("startedAt").apply();
    }

    // ── odds and ends ────────────────────────────────────────

    /** Android 16 Live Updates: the countdown also shows as a chip in the status bar and on the lock screen. */
    private static void promote(Notification.Builder b) {
        if (Build.VERSION.SDK_INT < 36) return;
        // the request is an extra the system reads (what AndroidX's setRequestPromotedOngoing sets too); the builder
        // method only exists on newer Android 16 builds
        Bundle e = new Bundle();
        e.putBoolean("android.requestPromotedOngoing", true);
        b.addExtras(e);
        call(b, "setRequestPromotedOngoing", boolean.class, true);
    }

    /** The chip's text ("1:42"), on Android 16 builds that have it. */
    private static void criticalText(Notification.Builder b, String text) {
        if (Build.VERSION.SDK_INT >= 36) call(b, "setShortCriticalText", String.class, text);
    }

    private static void call(Notification.Builder b, String name, Class<?> type, Object value) {
        try {
            Method m = Notification.Builder.class.getMethod(name, type);
            m.invoke(b, value);
        } catch (Exception ignored) { /* not on this Android build */ }
    }

    private static PendingIntent tap(Context c) {
        if (chromeTap != null) return chromeTap;
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (open == null) open = new Intent();
        return PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /**
     * Our own button: it acts here at once, then passes the tap on to Chrome's button (carried inside, so it still
     * works if Android restarted this app in between). Without Chrome's (rebuilding after a restart), the one already
     * made is reused as it is.
     */
    private static PendingIntent own(Context c, String action, PendingIntent chrome) {
        Intent i = new Intent(action).setClass(c, RestActionReceiver.class);
        int flags = PendingIntent.FLAG_IMMUTABLE;
        if (chrome != null) { i.putExtra(EXTRA_CHROME, chrome); flags |= PendingIntent.FLAG_UPDATE_CURRENT; }
        return PendingIntent.getBroadcast(c, action.hashCode(), i, flags);
    }

    private static void schedule(Context c, long at) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        PendingIntent pi = alarmIntent(c, RestAlarmReceiver.ACTION_END);
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    /** Android lets an exact alarm (a timer you started) start the ticking service when nothing else may. */
    static void scheduleStart(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) return;
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 50, alarmIntent(c, RestAlarmReceiver.ACTION_TICK));
    }

    private static void cancelAlarm(Context c) { c.getSystemService(AlarmManager.class).cancel(alarmIntent(c, RestAlarmReceiver.ACTION_END)); }

    private static PendingIntent alarmIntent(Context c, String action) {
        return PendingIntent.getBroadcast(c, action.hashCode(), new Intent(action).setClass(c, RestAlarmReceiver.class),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static Rest load(Context c) {
        if (current != null) return current;
        SharedPreferences p = prefs(c);
        if (!p.contains("startedAt")) return null;
        Rest r = new Rest();
        r.chromeTag = p.getString("chromeTag", "");
        r.startedAt = p.getLong("startedAt", 0);
        r.endsAt = p.getLong("endsAt", 0);
        r.exercise = p.getString("exercise", "");
        r.line = p.getString("line", "");
        r.overTitle = p.getString("overTitle", "");
        r.overBody = p.getString("overBody", "");
        r.more = p.getString("more", r.more);
        r.skip = p.getString("skip", r.skip);
        current = r;
        return r;
    }

    private static void save(Context c, Rest r) {
        current = r;
        prefs(c).edit()
            .putString("chromeTag", r.chromeTag).putLong("startedAt", r.startedAt).putLong("endsAt", r.endsAt)
            .putString("exercise", r.exercise).putString("line", r.line)
            .putString("overTitle", r.overTitle).putString("overBody", r.overBody)
            .putString("more", r.more).putString("skip", r.skip)
            .apply();
    }

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
}
