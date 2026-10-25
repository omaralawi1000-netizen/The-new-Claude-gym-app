package app.aven.android;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.PowerManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import android.text.SpannableString;
import android.util.Log;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.RelativeSizeSpan;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
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
    // "Time for set 2": pops up and buzzes, but makes no sound of its own. The app plays the clicks itself (clicks()),
    // because a notification's sound stays silent with the phone on vibrate or silent, and Android also quietens the
    // sounds of an app that posts often (the countdown, every second). Android fixes a channel's sound once it exists,
    // hence a new id; the older ones (the phone's default sound, then the clicks) go.
    static final String CH_OVER = "aven_rest_end";
    private static final String[] CH_OVER_OLD = {"aven_rest_over", "aven_rest_clicks"};
    static final int ID_REST = 71, ID_OVER = 72;
    static final String MARK = "aven-rest|";
    static final String ACTION_MORE = "app.aven.android.REST_MORE";
    static final String ACTION_SKIP = "app.aven.android.REST_SKIP";
    static final String ACTION_GONE = "app.aven.android.REST_GONE";
    /** Done ✓ on "Time for set 2" (phone, lock screen, watch): the website ticks the set that's next as planned */
    static final String ACTION_DONE = "app.aven.android.REST_DONE";
    static final String EXTRA_CHROME = "chrome";
    private static final String PREFS = "aven_rest2";

    /** The rest on show. */
    static final class Rest {
        String chromeTag = "";
        long startedAt, endsAt;
        String exercise = "", line = "", overTitle = "", overBody = "", more = "+30 s", skip = "Skip";
        String done = "", doneNote = ""; // "Done ✓ 80 kg × 8" and, once tapped, "Set 2 ✓ · 80 kg × 8"
        String doneSay = ""; // under it: "Rest 2:45 · then set 3"
        long next; // seconds of rest after the set this alert names (0: none, the next set comes straight away)
        String queue = "[]"; // the sets after it, each with its own words and rest (the website's plan, a few ahead)
        boolean chained; // started here by a Done ✓ (the website was asleep): its buttons stay here, never sent on
        boolean sound = true; // Settings › Sound in the app
        String workout = ""; // the website's workout id (a Done ✓ is kept under it until Aven opens)
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
            over.setSound(null, null);
            nm.createNotificationChannel(over);
        }
        for (String old : CH_OVER_OLD) if (nm.getNotificationChannel(old) != null) nm.deleteNotificationChannel(old);
    }

    // ── from Chrome ──────────────────────────────────────────

    /**
     * Chrome wants to show one of the website's notifications. True when it's ours (shown our way, or not needed);
     * false leaves it to Chrome's own look.
     */
    static boolean fromChrome(Context c, String tag, Notification n) {
        seen(c);
        if (tag == null) return false;
        long now = System.currentTimeMillis();
        if (tag.contains("aven-rest-over")) {
            // the website's back-up alert: ours rings at the exact time already; if somehow it hasn't, ring now
            Rest r = load(c);
            log("website's back-up alert (" + (r == null ? "no rest" : r.chained ? "a rest Done started" : "rest over " + (now - r.endsAt) / 1000 + " s ago") + ")");
            if (r != null && r.chained) return true; // a Done ✓ moved on from that rest here: it's ours to ring
            if (r == null || r.endsAt > now + 1000) return false;
            ring(c);
            return true;
        }
        Rest r = parse(tag, n);
        log("from Chrome: " + (r == null ? "not a rest" : "rest " + (r.endsAt - now) / 1000 + " s left, " + (n.actions == null ? 0 : n.actions.length) + " Chrome buttons, done " + (r.done.isEmpty() ? "no" : "yes")));
        if (r == null) return false;
        if (r.endsAt <= now + 500) return true; // already over (a late update): the alarm has it
        ensureChannels(c);
        Rest old = load(c);
        boolean same = old != null && old.startedAt == r.startedAt;
        // +30 s tapped here a moment ago: the website's catching up, don't let a slower update pull the time back
        if (same && now - localChangeAt < 4000 && r.endsAt < old.endsAt) r.endsAt = old.endsAt;
        if (n.contentIntent != null) chromeTap = n.contentIntent;
        if (n.actions != null && n.actions.length >= 2) { chromeMore = n.actions[0].actionIntent; chromeSkip = n.actions[1].actionIntent; log("  Chrome's Skip: " + kind(chromeSkip)); }
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
        seen(c);
        Rest r = load(c);
        boolean ours = r != null && tag != null && tag.equals(r.chromeTag);
        log("Chrome took its notification away" + (ours ? "" : " (an older one)"));
        if (!ours) return; // an older rest's (a newer one has taken over)
        // just after a Done ✓: an older rest worker closes Chrome's copy then. The rest Done ✓ started here goes on (it
        // stopped it on Omar's phone, 18 Oct: "Rest 3:00", then nothing), and its "Set 2 ✓" stays
        boolean justDone = System.currentTimeMillis() - doneAt < 5000;
        if (justDone && r.chained) { log("(an older worker closing Chrome's copy after Done ✓: the rest goes on)"); return; }
        stopAll(c, !justDone);
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
            r.done = j.optString("d");
            r.doneNote = j.optString("y");
            r.doneSay = j.optString("z");
            r.next = Math.max(0, j.optLong("n", 0));
            JSONArray q = j.optJSONArray("w");
            r.queue = q != null ? q.toString() : "[]";
            r.sound = j.optInt("q", 1) == 1;
            r.workout = j.optString("i");
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

    /** Skip: a rest Done ✓ started here goes straight to "Time for set 3"; the website's own rest ends (it's told). */
    static void skip(Context c) {
        Rest r = load(c);
        if (r != null && r.chained) { ring(c); return; }
        stopAll(c, true);
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
            b.addAction(new Notification.Action.Builder(null, ember(r.more, ember), r.chained ? local(c, ACTION_MORE) : own(c, ACTION_MORE, chromeMore)).build())
                .addAction(new Notification.Action.Builder(null, ember(r.skip, ember), r.chained ? local(c, ACTION_SKIP) : own(c, ACTION_SKIP, chromeSkip)).build());
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
            big.setOnClickPendingIntent(R.id.more, r.chained ? local(c, ACTION_MORE) : own(c, ACTION_MORE, chromeMore));
            big.setOnClickPendingIntent(R.id.skip, r.chained ? local(c, ACTION_SKIP) : own(c, ACTION_SKIP, chromeSkip));
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
        seen(c);
        Rest r = load(c);
        if (r == null) return;
        SharedPreferences p = prefs(c);
        if (p.getLong("rang", 0) == r.startedAt) return;
        // without Chrome's buttons (Android had stopped the app, and the website's back-up alert got here before the
        // alarm), the Done ✓ would tick on the watch and go nowhere: they're fetched from the alarm first, which rings
        if (recoverChrome(c)) return;
        recovering = false;
        log("ring: " + (r.overTitle.isEmpty() ? "rest over" : r.overTitle) + ", Done " + (r.done.isEmpty() ? "missing (no words)" : "shown") + ", Chrome's Skip " + (chromeSkip != null ? "here" : "MISSING"));
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
            .setAutoCancel(true)
            .setTimeoutAfter(15 * 60_000L) // left for a long time, it tidies itself away
            .setContentIntent(tap(c));
        // Done ✓: the set this alert names, ticked as planned, from the lock screen or the watch (this alert reaches the
        // watch, the countdown doesn't). It always shows: it was missing whenever Android had paused the app during the
        // rest (the words weren't saved, and Chrome's button lived only in memory). The tap is handled here (the next rest
        // starts at once) and passed on to the website through Chrome's Skip: once the rest is over a Skip can mean
        // nothing else, and the website's rest worker says "done" (src/screens/workout/rest.ts).
        if (!r.done.isEmpty()) {
            b.addAction(new Notification.Action.Builder(null, ember(r.done, c.getColor(R.color.ember)), own(c, ACTION_DONE, chromeSkip)).build());
        }
        nm.notify(ID_OVER, b.build());
        if (r.sound) clicks(c);
    }

    /**
     * Done ✓ was tapped (on the phone, the lock screen or the watch). The set is done; the website hears it through
     * Chrome (now if it's awake, from its rest worker's cache when it wakes). Here, at once: the next rest starts counting
     * down from this tap, and when it's over "Time for set 3" rings with its own Done ✓, so a whole workout can be done
     * from the wrist with the phone asleep. A short quiet note says what happened ("Set 2 ✓ · 50 kg × 8", "Rest 2:45").
     */
    private static long doneAt; // when Done ✓ was last tapped (Chrome then takes its own copy away: that mustn't take "Set 2 ✓")

    static void done(Context c) {
        seen(c);
        doneAt = System.currentTimeMillis();
        Rest r = load(c);
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.cancel(ID_OVER);
        if (r == null) return;
        keepDone(c, r.workout, doneAt);
        Rest nx = nextOf(r, doneAt);
        log("done: " + (nx == null ? "the last set" : "next rest " + (nx.endsAt - doneAt) / 1000 + " s, then " + nx.overTitle));
        if (nx != null) {
            save(c, nx);
            dismissed = false;
            if (nx.endsAt <= doneAt + 500) { ring(c); return; } // no rest after it (a superset, a warm-up): the next set now
            schedule(c, nx.endsAt);
            show(c, true);
            RestTimerService.start(c);
        } else {
            stopAll(c, false);
        }
        if (r.doneNote.isEmpty()) return;
        Notification.Builder b = new Notification.Builder(c, CH_REST)
            .setSmallIcon(R.drawable.ic_stat_aven)
            .setColor(c.getColor(R.color.ember))
            .setContentTitle(r.doneNote)
            .setContentText(r.doneSay.isEmpty() ? r.exercise : r.doneSay)
            .setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setTimeoutAfter(12_000L) // (a moment on the watch, then the countdown on the phone is the one to look at)
            .setContentIntent(tap(c));
        nm.notify(ID_OVER, b.build());
    }

    // ── Done ✓ kept here until Aven opens ─────────────────────
    // Chrome passes a Done ✓ on to the website only some of the time on Omar's phone (25 Oct: it said it got every one, and
    // the website heard one in six). So every Done ✓ is also kept here, and the next time Aven opens through this app
    // (its icon, or a tap on the rest notification) they go along in the address ("#dn=<workout>:<tap time>,…"). The
    // website ticks each one once, from the time it was tapped, whichever way it heard of it first.
    private static final String DONE_PREFS = "aven_done";

    static void keepDone(Context c, String workout, long at) {
        if (workout == null || workout.isEmpty() || !workout.matches("[A-Za-z0-9_-]{1,64}")) { log("  (no workout id: not kept for Aven)"); return; }
        SharedPreferences p = c.getSharedPreferences(DONE_PREFS, Context.MODE_PRIVATE);
        StringBuilder all = new StringBuilder();
        for (String one : p.getString("dn", "").split(",")) {
            int i = one.lastIndexOf(':');
            if (i <= 0) continue;
            try { if (at - Long.parseLong(one.substring(i + 1)) < 6 * 3600_000L) all.append(one).append(','); } catch (NumberFormatException ignored) { /* dropped */ }
        }
        all.append(workout).append(':').append(at);
        p.edit().putString("dn", all.toString()).apply();
        log("  kept for Aven (" + all.toString().split(",").length + " waiting)");
    }

    /** The Done ✓ taps waiting for Aven ("workout:time,…", or null), taken: they go into the address now. */
    static String takeDone(Context c) {
        SharedPreferences p = c.getSharedPreferences(DONE_PREFS, Context.MODE_PRIVATE);
        String dn = p.getString("dn", "");
        if (dn.isEmpty()) return null;
        p.edit().remove("dn").apply();
        log("Aven opened: " + dn.split(",").length + " Done ✓ handed over");
        return dn;
    }

    static boolean doneWaiting(Context c) { return !c.getSharedPreferences(DONE_PREFS, Context.MODE_PRIVATE).getString("dn", "").isEmpty(); }

    /** The rest after the set just done, from the website's plan: its words for the set after it, timed from now. */
    static Rest nextOf(Rest r, long now) {
        try {
            JSONArray q = new JSONArray(r.queue);
            if (q.length() == 0) return null;
            JSONObject s = q.getJSONObject(0);
            Rest nx = new Rest();
            nx.chromeTag = r.chromeTag; nx.workout = r.workout; nx.sound = r.sound; nx.more = r.more; nx.skip = r.skip;
            nx.startedAt = now;
            nx.endsAt = now + r.next * 1000;
            nx.exercise = s.optString("x"); nx.line = s.optString("l");
            nx.overTitle = s.optString("o"); nx.overBody = s.optString("b");
            nx.done = s.optString("d"); nx.doneNote = s.optString("y"); nx.doneSay = s.optString("z");
            nx.next = Math.max(0, s.optLong("n", 0));
            JSONArray rest = new JSONArray();
            for (int i = 1; i < q.length(); i++) rest.put(q.get(i));
            nx.queue = rest.toString();
            nx.chained = true;
            return nx;
        } catch (JSONException e) {
            return null;
        }
    }

    private static MediaPlayer player; // kept until it has played (a player nobody holds can stop halfway)

    /**
     * The rest-over clicks (res/raw/rest_over.mp3, the same file the website plays), played the way a clock's timer
     * rings: on the alarm volume, so they're heard with the phone on vibrate, in a pocket, with the screen off. Music
     * dips for the half second they take. Settings › Sound in the app turns them off.
     */
    static void clicks(Context c) {
        AudioManager am = c.getSystemService(AudioManager.class);
        AudioAttributes aa = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        AudioFocusRequest focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(aa).build();
        PowerManager.WakeLock awake = c.getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "aven:clicks");
        awake.acquire(5000); // the phone may be asleep: stay up until they've played
        if (player != null) { player.release(); player = null; }
        MediaPlayer mp = new MediaPlayer();
        Runnable done = () -> {
            mp.release();
            if (player == mp) player = null;
            am.abandonAudioFocusRequest(focus);
            if (awake.isHeld()) awake.release();
        };
        try (AssetFileDescriptor fd = c.getResources().openRawResourceFd(R.raw.rest_over)) {
            mp.setAudioAttributes(aa);
            mp.setDataSource(fd);
            mp.setOnCompletionListener(p -> { log("clicks played"); done.run(); });
            mp.setOnErrorListener((p, what, extra) -> { log("clicks failed: " + what + "/" + extra); done.run(); return true; });
            mp.prepare();
            am.requestAudioFocus(focus);
            player = mp;
            mp.start();
            log("clicks: alarm volume " + am.getStreamVolume(AudioManager.STREAM_ALARM) + " of "
                + am.getStreamMaxVolume(AudioManager.STREAM_ALARM) + ", ringer mode " + am.getRingerMode());
        } catch (IOException | RuntimeException e) {
            log("clicks failed: " + e);
            done.run();
        }
    }

    /** Everything off: the countdown, its alarm, and (when you're back) the alert. */
    static void stopAll(Context c, boolean alertToo) {
        log("stop all" + (alertToo ? ", alert too" : ""));
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

    /** What happened, in the phone's log under "AvenRest" (the emulator check prints it). */
    static void log(String what) {
        Log.i("AvenRest", what);
        // and the phone's own log (Aven's Settings › Training › App log shows the last 120 lines): a real phone does what
        // the emulator doesn't (25 Oct: Done ✓ ticked here and never reached Aven, on Omar's phone only)
        Context c = appCtx;
        if (c == null) return;
        try {
            SharedPreferences p = c.getSharedPreferences("aven_restlog", Context.MODE_PRIVATE);
            String line = new java.text.SimpleDateFormat("dd/MM HH:mm:ss", Locale.ROOT).format(new java.util.Date()) + "  " + what;
            String all = p.getString("log", "") + line + "\n";
            String[] lines = all.split("\n");
            if (lines.length > 120) all = String.join("\n", java.util.Arrays.copyOfRange(lines, lines.length - 120, lines.length)) + "\n";
            p.edit().putString("log", all).apply();
        } catch (RuntimeException ignored) { /* the log is never in the way */ }
    }

    private static Context appCtx;
    /** Where the log is kept (every way into the rest code passes through here first). */
    static void seen(Context c) { if (appCtx == null && c != null) appCtx = c.getApplicationContext(); }
    static String savedLog(Context c) { return c.getSharedPreferences("aven_restlog", Context.MODE_PRIVATE).getString("log", ""); }

    /** What kind of button Chrome handed over, and whose (for the log). */
    static String kind(PendingIntent p) {
        if (p == null) return "none";
        String k = "?";
        if (Build.VERSION.SDK_INT >= 31) k = p.isActivity() ? "opens a screen" : p.isBroadcast() ? "a message" : p.isForegroundService() ? "a foreground service" : p.isService() ? "a service" : "?";
        return k + ", from " + p.getCreatorPackage();
    }

    private static void call(Notification.Builder b, String name, Class<?> type, Object value) {
        try {
            Method m = Notification.Builder.class.getMethod(name, type);
            m.invoke(b, value);
        } catch (Exception ignored) { /* not on this Android build */ }
    }

    private static PendingIntent tap(Context c) {
        // Done ✓ taps waiting: open Aven through this app, so they go along (Chrome's own tap would open it without them)
        if (doneWaiting(c)) {
            Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (open != null) return PendingIntent.getActivity(c, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        }
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

    /** A button handled here only (a rest Done ✓ started: the website isn't told about its +30 s or Skip). */
    private static PendingIntent local(Context c, String action) {
        Intent i = new Intent(action).setClass(c, RestActionReceiver.class);
        return PendingIntent.getBroadcast(c, (action + ":local").hashCode(), i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static boolean recovering;

    /**
     * Chrome's buttons for the rest on show, when this process doesn't have them: the end-of-rest alarm carries them
     * (schedule), so it is fired now; its ring() has them. False when there's nothing to fetch them from (ring on).
     */
    private static boolean recoverChrome(Context c) {
        if (chromeSkip != null || recovering) return false;
        PendingIntent alarm = PendingIntent.getBroadcast(c, RestAlarmReceiver.ACTION_END.hashCode(),
            new Intent(RestAlarmReceiver.ACTION_END).setClass(c, RestAlarmReceiver.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_NO_CREATE);
        if (alarm == null) { log("ring: no Chrome buttons, and no alarm to fetch them from"); return false; }
        try {
            recovering = true;
            alarm.send();
            log("ring: fetching Chrome's buttons from the alarm");
            return true;
        } catch (PendingIntent.CanceledException e) {
            recovering = false;
            return false;
        }
    }

    /** Chrome's tap and buttons ride along in the end-of-rest alarm: Android may stop the app during a rest, and the
     *  alert it then rings in a fresh start still has them (they were lost, and with them the watch's Done ✓). */
    static void restoreChrome(Intent i) {
        if (i == null) return;
        try {
            PendingIntent t = i.getParcelableExtra("chromeTap"), m = i.getParcelableExtra("chromeMore"), s = i.getParcelableExtra("chromeSkip");
            if (chromeTap == null && t != null) chromeTap = t;
            if (chromeMore == null && m != null) chromeMore = m;
            if (chromeSkip == null && s != null) chromeSkip = s;
        } catch (RuntimeException ignored) { /* nothing carried */ }
    }

    /** A button's own copy of Chrome's (see own()), for this process when it was started fresh by the tap. */
    static void restoreChrome(String action, PendingIntent chrome) {
        if (chrome == null) return;
        if (ACTION_MORE.equals(action)) { if (chromeMore == null) chromeMore = chrome; }
        else if (chromeSkip == null) chromeSkip = chrome;
    }

    private static void schedule(Context c, long at) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        Intent end = new Intent(RestAlarmReceiver.ACTION_END).setClass(c, RestAlarmReceiver.class);
        if (chromeTap != null) end.putExtra("chromeTap", chromeTap);
        if (chromeMore != null) end.putExtra("chromeMore", chromeMore);
        if (chromeSkip != null) end.putExtra("chromeSkip", chromeSkip);
        PendingIntent pi = PendingIntent.getBroadcast(c, RestAlarmReceiver.ACTION_END.hashCode(), end, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
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
        r.done = p.getString("done", "");
        r.doneNote = p.getString("doneNote", "");
        r.doneSay = p.getString("doneSay", "");
        r.next = p.getLong("next", 0);
        r.queue = p.getString("queue", "[]");
        r.chained = p.getBoolean("chained", false);
        r.sound = p.getBoolean("sound", true);
        r.workout = p.getString("workout", "");
        current = r;
        return r;
    }

    private static void save(Context c, Rest r) {
        current = r;
        prefs(c).edit()
            .putString("chromeTag", r.chromeTag).putLong("startedAt", r.startedAt).putLong("endsAt", r.endsAt)
            .putString("exercise", r.exercise).putString("line", r.line)
            .putString("overTitle", r.overTitle).putString("overBody", r.overBody)
            .putString("more", r.more).putString("skip", r.skip).putBoolean("sound", r.sound)
            // (all of it: after Android had stopped the app mid-rest, the alert came back without its Done ✓ words)
            .putString("done", r.done).putString("doneNote", r.doneNote).putString("doneSay", r.doneSay)
            .putLong("next", r.next).putString("queue", r.queue).putBoolean("chained", r.chained).putString("workout", r.workout)
            .apply();
    }

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
}
