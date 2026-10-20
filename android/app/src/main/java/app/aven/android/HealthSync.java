package app.aven.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.health.connect.AggregateRecordsGroupedByDurationResponse;
import android.health.connect.AggregateRecordsGroupedByPeriodResponse;
import android.health.connect.AggregateRecordsRequest;
import android.health.connect.AggregateRecordsResponse;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.LocalTimeRangeFilter;
import android.health.connect.ReadRecordsRequestUsingFilters;
import android.health.connect.ReadRecordsResponse;
import android.health.connect.TimeInstantRangeFilter;
import android.health.connect.datatypes.ActiveCaloriesBurnedRecord;
import android.health.connect.datatypes.BodyFatRecord;
import android.health.connect.datatypes.FloorsClimbedRecord;
import android.health.connect.datatypes.HeartRateVariabilityRmssdRecord;
import android.health.connect.datatypes.OxygenSaturationRecord;
import android.health.connect.datatypes.Record;
import android.health.connect.datatypes.RespiratoryRateRecord;
import android.health.connect.datatypes.RestingHeartRateRecord;
import android.health.connect.datatypes.SleepSessionRecord;
import android.health.connect.datatypes.TotalCaloriesBurnedRecord;
import android.health.connect.datatypes.Vo2MaxRecord;
import android.health.connect.datatypes.WeightRecord;
import android.health.connect.datatypes.AggregationType;
import android.health.connect.datatypes.DistanceRecord;
import android.health.connect.datatypes.ExerciseSessionRecord;
import android.health.connect.datatypes.ExerciseSessionType;
import android.health.connect.datatypes.HeartRateRecord;
import android.health.connect.datatypes.StepsRecord;
import android.health.connect.datatypes.units.Energy;
import android.health.connect.datatypes.units.Length;
import android.net.Uri;
import android.os.Build;
import android.os.OutcomeReceiver;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.Period;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

/**
 * The watch, through Health Connect (Galaxy Watch → Samsung Health → Health Connect → here). Read only, on this phone only.
 * Each day: steps, active and total calories, distance, floors, resting heart rate, HRV, sleep (with its stages), weight,
 * body fat, VO2 max, blood oxygen and breathing rate; and the workouts (type, start, end, average and highest heart rate,
 * active calories, distance). The last 14 days every time, plus one older 30-day stretch, walking back about two years over
 * the next openings (the address can only carry so much at once), then starting over (so a stretch that never reached the
 * page comes again). And the detail of the last 3 days (heart rate and steps a minute at a time, every sleep stage), plus 4
 * older days walking back 90 days the same way. With "read in the background" allowed (Android 15 and up) HealthJob reads
 * every half hour, so whatever opens Aven finds fresh numbers waiting; the walk only moves on once the page has had a stretch. Nothing is written and nothing leaves the phone except into Aven's own page, which it opens
 * with the numbers in its address (after "#", so not even the website's server sees them).
 *
 * Android's own Health Connect (Android 14 and up) is used: no extra library. On older phones the website simply never
 * shows the watch section.
 */
final class HealthSync {
    private HealthSync() {}

    /** Reading while Aven is closed (HealthJob): asked for with the rest, Android 15 and up. */
    static final String BACKGROUND = "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND";

    /** What the watch needs to be "connected" (steps and workouts). */
    static final String[] PERMS = {
        "android.permission.health.READ_STEPS",
        "android.permission.health.READ_EXERCISE",
        "android.permission.health.READ_HEART_RATE",
        "android.permission.health.READ_ACTIVE_CALORIES_BURNED",
        "android.permission.health.READ_DISTANCE",
    };
    /** Everything else, asked for at the same time but each one optional: what isn't allowed is simply left out. */
    static final String[] MORE = {
        "android.permission.health.READ_SLEEP",
        "android.permission.health.READ_RESTING_HEART_RATE",
        "android.permission.health.READ_HEART_RATE_VARIABILITY",
        "android.permission.health.READ_WEIGHT",
        "android.permission.health.READ_BODY_FAT",
        "android.permission.health.READ_VO2_MAX",
        "android.permission.health.READ_OXYGEN_SATURATION",
        "android.permission.health.READ_RESPIRATORY_RATE",
        "android.permission.health.READ_TOTAL_CALORIES_BURNED",
        "android.permission.health.READ_FLOORS_CLIMBED",
        // older than 30 days before the first "allow" (Android 15 and up; ignored where it doesn't exist)
        "android.permission.health.READ_HEALTH_DATA_HISTORY",
        // read every half hour while Aven is closed (Android 15 and up), so it opens with fresh numbers
        BACKGROUND,
    };

    /** All of them, for Connect watch (Health Connect asks only for the ones not allowed yet). */
    static String[] all() {
        List<String> out = new ArrayList<>();
        java.util.Collections.addAll(out, PERMS);
        // (history only where Health Connect knows it: an unknown one could make it refuse the whole request)
        for (String p : MORE) if (Build.VERSION.SDK_INT >= 35 || !(p.endsWith("HISTORY") || p.equals(BACKGROUND))) out.add(p);
        return out.toArray(new String[0]);
    }

    /** Something worth asking again (the extra data, added after the watch was first connected). */
    static boolean missingAny(Context c) {
        for (String p : all()) if (c.checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) return true;
        return false;
    }
    private static final String PREFS = "aven_health";
    private static final String ON = "on";
    private static final String LAST = "lastPayload", LAST_AT = "lastAt";
    private static final int DAYS = 14;
    /** The older stretch read each time, and how far back it walks before starting over. */
    private static final int CHUNK = 30, BACK = 730;
    private static final String BACK_TO = "backTo", EMPTY = "emptyChunks", EX_CACHE = "exCache";
    /** Where the walks will stand once the page has the last numbers read; the older stretches already read (read once). */
    private static final String PEND_BACK = "pendBack", PEND_EMPTY = "pendEmpty", PEND_DETAIL = "pendDetail", DETAIL_TO = "detailTo";
    private static final String CHUNK_CACHE = "chunkCache", DETAIL_CACHE = "detailCache";
    /** The detail: the last few days every time, and an older few walking back this far. */
    private static final int DETAIL_RECENT = 3, DETAIL_CHUNK = 4, DETAIL_BACK = 90;
    /** The website's own address: a "return" anywhere else is ignored. */
    static final String SITE = "https://omaralawi1000-netizen.github.io/The-new-Claude-gym-app";

    static boolean available(Context c) {
        return Build.VERSION.SDK_INT >= 34 && c.getSystemService(HealthConnectManager.class) != null;
    }

    static boolean granted(Context c) {
        for (String p : PERMS) if (c.checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) return false;
        return true;
    }

    /** Turned on with "Connect watch" in Aven's Settings, and still allowed in Health Connect. */
    static boolean on(Context c) {
        return available(c) && prefs(c).getBoolean(ON, false) && granted(c);
    }

    /** Allowed to read while Aven is closed (HealthJob). */
    static boolean background(Context c) {
        return Build.VERSION.SDK_INT >= 35 && c.checkSelfPermission(BACKGROUND) == PackageManager.PERMISSION_GRANTED;
    }

    static void setOn(Context c, boolean on) { prefs(c).edit().putBoolean(ON, on).apply(); }

    /** Connect watch again: the history is walked from the start (newly allowed data comes in). */
    static void restartHistory(Context c) {
        prefs(c).edit().remove(BACK_TO).remove(EMPTY).remove(DETAIL_TO).remove(CHUNK_CACHE).remove(DETAIL_CACHE)
            .remove(PEND_BACK).remove(PEND_EMPTY).remove(PEND_DETAIL).remove(LAST_AT).apply(); // (and a fresh read, not the last one)
    }

    /** The extra data (sleep, HRV…, then reading in the background) came after many had connected their watch: each
     *  round of it asked for once on a sync, never again. */
    static boolean askedMore(Context c) { return prefs(c).getInt(ASKED_V, prefs(c).getBoolean(ASKED_MORE, false) ? 1 : 0) >= MORE_V; }
    static void markAskedMore(Context c) { prefs(c).edit().putBoolean(ASKED_MORE, true).putInt(ASKED_V, MORE_V).apply(); }
    private static final String ASKED_MORE = "askedMore", ASKED_V = "askedMoreV";
    /** 1: sleep, HRV and the rest; 2: reading in the background. */
    private static final int MORE_V = 2;

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** The last numbers read (used when a fresh read isn't ready in time). */
    static String lastPayload(Context c) { return prefs(c).getString(LAST, null); }

    /** The last numbers read, if they are at most `ms` old (read in the background a moment ago: no need to wait for more). */
    static String freshPayload(Context c, long ms) {
        long at = prefs(c).getLong(LAST_AT, 0);
        return System.currentTimeMillis() - at <= ms ? lastPayload(c) : null;
    }

    /**
     * The page has been handed the last numbers read: the walks back through the history move on to the next stretch.
     * (A read in the background doesn't move them: half-hourly reads would otherwise walk past stretches the page never got.)
     */
    static void delivered(Context c) {
        SharedPreferences p = prefs(c);
        if (!p.contains(PEND_BACK)) return;
        SharedPreferences.Editor e = p.edit();
        String back = p.getString(PEND_BACK, "");
        if (back.isEmpty()) e.remove(BACK_TO); else e.putString(BACK_TO, back);
        String detail = p.getString(PEND_DETAIL, "");
        if (detail.isEmpty()) e.remove(DETAIL_TO); else e.putString(DETAIL_TO, detail);
        e.putInt(EMPTY, p.getInt(PEND_EMPTY, 0)).remove(PEND_BACK).remove(PEND_DETAIL).remove(PEND_EMPTY).apply();
    }

    /** Only ever Aven's own pages. */
    static Uri safeReturn(String ret) {
        if (ret == null || !(ret.equals(SITE) || ret.startsWith(SITE + "/"))) return Uri.parse(SITE + "/");
        Uri u = Uri.parse(ret);
        return u.buildUpon().fragment(null).build();
    }

    /** A small status for the page (no numbers): is it there, is it on, was it allowed. */
    static String status(Context c, String extra) {
        try {
            JSONObject o = new JSONObject();
            o.put("v", 1);
            o.put("avail", available(c));
            o.put("on", available(c) && prefs(c).getBoolean(ON, false));
            o.put("granted", available(c) && granted(c));
            o.put("at", System.currentTimeMillis());
            if (extra != null) o.put("note", extra);
            return encode(o.toString());
        } catch (Exception e) {
            return null;
        }
    }

    static String encode(String json) {
        return Base64.encodeToString(json.getBytes(StandardCharsets.UTF_8), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    /** Reads everything (on a thread of its own) and hands the packed numbers to `done` (null if it failed). */
    static void read(Context c, Consumer<String> done) {
        if (!on(c)) { done.accept(null); return; }
        Context app = c.getApplicationContext();
        ExecutorService exec = Executors.newSingleThreadExecutor();
        ExecutorService back = Executors.newCachedThreadPool();
        exec.execute(() -> {
            String out = null;
            try {
                out = collect(app, back);
            } catch (Throwable t) {
                out = null;
            } finally {
                back.shutdown();
                exec.shutdown();
            }
            done.accept(out);
        });
    }

    private interface Call<T> { void run(OutcomeReceiver<T, HealthConnectException> r); }

    /** One Health Connect call, waited for (at most 4 s). */
    private static <T> T await(Call<T> call) throws Exception { return await(call, 4); }

    /** …or longer (a whole day a minute at a time). */
    private static <T> T await(Call<T> call, int seconds) throws Exception {
        CompletableFuture<T> f = new CompletableFuture<>();
        call.run(new OutcomeReceiver<T, HealthConnectException>() {
            @Override public void onResult(T result) { f.complete(result); }
            @Override public void onError(HealthConnectException error) { f.completeExceptionally(error); }
        });
        return f.get(seconds, TimeUnit.SECONDS);
    }

    /** One read at a time (the half-hourly one and an opening Aven can meet). */
    private static final Object LOCK = new Object();

    /** Reads everything, keeps it as the last numbers read, and returns it packed for the address. */
    private static String collect(Context c, ExecutorService back) throws Exception {
        synchronized (LOCK) { return collectLocked(c, back); }
    }

    private static String collectLocked(Context c, ExecutorService back) throws Exception {
        long t0 = System.currentTimeMillis();
        HealthConnectManager hc = c.getSystemService(HealthConnectManager.class);
        ZoneId zone = ZoneId.systemDefault();
        LocalDate today = LocalDate.now(zone);
        LocalDate recentFrom = today.minusDays(DAYS - 1);
        // the older stretch this time: the 30 days before the last one the page received (back to about two years, then
        // from the top)
        SharedPreferences p = prefs(c);
        String backTo = p.getString(BACK_TO, null);
        LocalDate chunkEnd = backTo == null ? recentFrom.minusDays(1) : LocalDate.parse(backTo).minusDays(1);
        if (chunkEnd.isBefore(today.minusDays(BACK))) chunkEnd = recentFrom.minusDays(1);
        LocalDate chunkStart = chunkEnd.minusDays(CHUNK - 1);

        JSONObject o = new JSONObject();
        o.put("v", 1);
        o.put("avail", true);
        o.put("on", true);
        o.put("granted", true);
        o.put("at", System.currentTimeMillis());

        TreeMap<String, JSONObject> days = new TreeMap<>();
        JSONArray ex = new JSONArray();
        JSONObject cache = cacheOf(p);
        collectRange(hc, zone, recentFrom, today, days, ex, cache, back, 60);

        // the older stretch is read once and kept until the page has had it (the half-hourly reads stay light)
        TreeMap<String, JSONObject> old = new TreeMap<>();
        JSONArray oldEx = new JSONArray();
        JSONObject kept = jsonOf(p, CHUNK_CACHE);
        JSONObject keptDays = kept.optJSONObject("days");
        if (chunkStart.toString().equals(kept.optString("k")) && keptDays != null) {
            for (Iterator<String> it = keptDays.keys(); it.hasNext(); ) { String k = it.next(); JSONObject v = keptDays.optJSONObject(k); if (v != null) old.put(k, v); }
            JSONArray x = kept.optJSONArray("ex");
            if (x != null) oldEx = x;
        } else {
            collectRange(hc, zone, chunkStart, chunkEnd, old, oldEx, cache, back, 60);
            JSONObject d = new JSONObject();
            for (Map.Entry<String, JSONObject> e : old.entrySet()) d.put(e.getKey(), e.getValue());
            kept = new JSONObject().put("k", chunkStart.toString()).put("days", d).put("ex", oldEx);
        }
        String keptText = kept.toString(); // (before the days below get their date written into them)
        boolean emptyChunk = old.isEmpty() && oldEx.length() == 0;
        days.putAll(old);
        for (int i = 0; i < oldEx.length(); i++) ex.put(oldEx.get(i));

        // steps the old way too ([date, steps]: what every version of the page reads)
        JSONArray steps = new JSONArray();
        JSONArray hd = new JSONArray();
        for (Map.Entry<String, JSONObject> d : days.entrySet()) {
            JSONObject v = d.getValue();
            if (v.has("s")) steps.put(new JSONArray().put(d.getKey()).put(v.getLong("s")));
            v.put("d", d.getKey());
            hd.put(v);
        }
        o.put("days", steps);
        o.put("hd", hd);
        o.put("ex", ex);
        o.put("back", new JSONObject().put("from", chunkStart.toString()).put("to", chunkEnd.toString()));

        // the detail: the last days every time (they still change), and an older few walking back (read once, like above)
        String detailTo = p.getString(DETAIL_TO, null);
        LocalDate dEnd = detailTo == null ? today.minusDays(DETAIL_RECENT) : LocalDate.parse(detailTo).minusDays(1);
        if (dEnd.isBefore(today.minusDays(DETAIL_BACK))) dEnd = today.minusDays(DETAIL_RECENT);
        LocalDate dStart = dEnd.minusDays(DETAIL_CHUNK - 1);
        JSONArray dt = detail(hc, zone, today.minusDays(DETAIL_RECENT - 1), today, back);
        JSONObject keptDetail = jsonOf(p, DETAIL_CACHE);
        JSONArray oldDt = keptDetail.optJSONArray("dt");
        if (!dStart.toString().equals(keptDetail.optString("k")) || oldDt == null) {
            oldDt = detail(hc, zone, dStart, dEnd, back);
            keptDetail = new JSONObject().put("k", dStart.toString()).put("dt", oldDt);
        }
        for (int i = 0; i < oldDt.length(); i++) dt.put(oldDt.get(i));
        o.put("dt", dt);
        o.put("ms", System.currentTimeMillis() - t0);
        o.put("bg", background(c)); // (Settings → Watch says whether it also reads while Aven is closed)

        // kept as the last numbers read; where the walks will stand once the page has them (two empty stretches in a row:
        // nothing that old, or no history allowed = start over)
        String out = encode(o.toString());
        int empties = emptyChunk ? p.getInt(EMPTY, 0) + 1 : 0;
        p.edit().putString(EX_CACHE, trim(cache).toString()).putString(CHUNK_CACHE, keptText).putString(DETAIL_CACHE, keptDetail.toString())
            .putString(LAST, out).putLong(LAST_AT, System.currentTimeMillis())
            .putString(PEND_BACK, empties >= 2 ? "" : chunkStart.toString()).putInt(PEND_EMPTY, empties >= 2 ? 0 : empties)
            .putString(PEND_DETAIL, dStart.toString())
            .apply();
        return out;
    }

    /**
     * The detail of the days from..to: heart rate a minute at a time (the average of what the watch measured in that
     * minute: every few minutes at rest, every second in a workout, or all the time with "measure continuously" on the
     * watch), steps a minute at a time (Health Connect's own count, the phone and the watch counted once), and every sleep
     * session that ended that day, each stage with its times.
     */
    private static JSONArray detail(HealthConnectManager hc, ZoneId zone, LocalDate from, LocalDate to, ExecutorService back) {
        TreeMap<String, JSONObject> by = new TreeMap<>();
        Instant now = Instant.now();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            Instant a = d.atStartOfDay(zone).toInstant();
            Instant z = d.plusDays(1).atStartOfDay(zone).toInstant();
            if (z.isAfter(now)) z = now;
            if (!z.isAfter(a)) continue;
            String hr = pack(heartByMinute(hc, zone, a, z, back)), st = pack(stepsByMinute(hc, zone, a, z, back));
            try {
                if (!hr.isEmpty()) dayOf(by, d.toString()).put("hm", hr);
                if (!st.isEmpty()) dayOf(by, d.toString()).put("sm", st);
            } catch (Exception ignored) { /* skip it */ }
        }
        // sleep, by the morning it ended (a session overlapping one already counted, the same night from two apps, is
        // left out); naps too
        List<long[]> slept = new ArrayList<>();
        Instant ia = from.atStartOfDay(zone).toInstant(), iz = to.plusDays(1).atStartOfDay(zone).toInstant();
        if (iz.isAfter(now)) iz = now;
        for (SleepSessionRecord r : records(hc, SleepSessionRecord.class, ia.minusSeconds(12 * 3600), iz, back)) {
            String d = dateOf(r.getEndTime(), zone);
            if (d.compareTo(from.toString()) < 0 || d.compareTo(to.toString()) > 0) continue;
            long s0 = r.getStartTime().toEpochMilli(), e0 = r.getEndTime().toEpochMilli();
            boolean twice = false;
            for (long[] x : slept) if (s0 < x[1] && e0 > x[0]) { twice = true; break; }
            if (twice || e0 <= s0) continue;
            slept.add(new long[] { s0, e0 });
            try {
                JSONObject day = dayOf(by, d);
                JSONArray sp = day.optJSONArray("sp");
                if (sp == null) { sp = new JSONArray(); day.put("sp", sp); }
                sp.put(stagesOf(r));
            } catch (Exception ignored) { /* skip it */ }
        }
        JSONArray out = new JSONArray();
        for (Map.Entry<String, JSONObject> e : by.entrySet()) {
            try { e.getValue().put("d", e.getKey()); } catch (Exception ignored) { /* skip it */ }
            out.put(e.getValue());
        }
        return out;
    }

    /** Heart rate a minute at a time from a..z (one day): the average of every reading in that minute, 0 = none. */
    private static long[] heartByMinute(HealthConnectManager hc, ZoneId zone, Instant a, Instant z, ExecutorService back) {
        long[] sum = new long[1440], n = new long[1440];
        for (HeartRateRecord r : records(hc, HeartRateRecord.class, a, z, back)) {
            for (HeartRateRecord.HeartRateSample s : r.getSamples()) {
                Instant t = s.getTime();
                if (t.isBefore(a) || !t.isBefore(z)) continue;
                int i = minuteOf(t, zone);
                sum[i] += s.getBeatsPerMinute();
                n[i]++;
            }
        }
        long[] out = new long[1440];
        for (int i = 0; i < 1440; i++) if (n[i] > 0) out[i] = Math.round((double) sum[i] / n[i]);
        return out;
    }

    /** Steps a minute at a time from a..z (one day), Health Connect's own count; 0 = none. */
    private static long[] stepsByMinute(HealthConnectManager hc, ZoneId zone, Instant a, Instant z, ExecutorService back) {
        long[] out = new long[1440];
        try {
            AggregateRecordsRequest<Long> req = new AggregateRecordsRequest.Builder<Long>(new TimeInstantRangeFilter.Builder().setStartTime(a).setEndTime(z).build())
                .addAggregationType(StepsRecord.STEPS_COUNT_TOTAL).build();
            List<AggregateRecordsGroupedByDurationResponse<Long>> got = await(r -> hc.aggregateGroupByDuration(req, Duration.ofMinutes(1), back, r), 20);
            for (AggregateRecordsGroupedByDurationResponse<Long> g : got) {
                Long v = g.get(StepsRecord.STEPS_COUNT_TOTAL);
                if (v != null && v > 0) out[minuteOf(g.getStartTime(), zone)] += v; // (the hour that repeats in October: added up)
            }
        } catch (Exception ignored) { /* not allowed, or nothing */ }
        return out;
    }

    private static int minuteOf(Instant t, ZoneId zone) {
        LocalTime lt = t.atZone(zone).toLocalTime();
        return lt.getHour() * 60 + lt.getMinute();
    }

    /**
     * One sleep session: [start, end (ms), then for each stage: stage, minute it began (counted from the start), minutes].
     * Stages: 0 awake (or out of bed), 1 light, 2 deep, 3 REM, 4 asleep (no stage known); the same stage back to back is
     * joined. A session without stages is just its start and end.
     */
    private static JSONArray stagesOf(SleepSessionRecord r) {
        JSONArray out = new JSONArray().put(r.getStartTime().toEpochMilli()).put(r.getEndTime().toEpochMilli());
        List<SleepSessionRecord.Stage> st = new ArrayList<>(r.getStages());
        st.sort((x, y) -> x.getStartTime().compareTo(y.getStartTime()));
        long t0 = r.getStartTime().getEpochSecond();
        int code = -1, n = 0;
        long s = 0, e = 0;
        for (SleepSessionRecord.Stage x : st) {
            int c = stageCode(x.getType());
            long xs = Math.max(0, x.getStartTime().getEpochSecond() - t0), xe = x.getEndTime().getEpochSecond() - t0;
            if (c < 0 || xe <= xs) continue;
            if (c == code && xs <= e + 60) { e = Math.max(e, xe); continue; }
            if (code >= 0 && n++ < 400) putStage(out, code, s, e);
            code = c; s = xs; e = xe;
        }
        if (code >= 0 && n < 400) putStage(out, code, s, e);
        return out;
    }

    private static void putStage(JSONArray out, int code, long s, long e) {
        long m0 = Math.round(s / 60.0), m1 = Math.round(e / 60.0);
        out.put(code).put(m0).put(Math.max(1, m1 - m0));
    }

    /** Health Connect's stages (1 awake, 2 sleeping, 3 out of bed, 4 light, 5 deep, 6 REM, 7 awake in bed) in Aven's. */
    private static int stageCode(int t) {
        switch (t) {
            case 1: case 3: case 7: return 0;
            case 4: return 1;
            case 5: return 2;
            case 6: return 3;
            case 2: return 4;
            default: return -1;
        }
    }

    private static final char[] B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".toCharArray();

    /** A day's minutes as text, two characters a minute (0–4095; "AA" = nothing), the empty end of the day left off. */
    static String pack(long[] v) {
        int n = v.length;
        while (n > 0 && v[n - 1] <= 0) n--;
        StringBuilder sb = new StringBuilder(n * 2);
        for (int i = 0; i < n; i++) {
            int x = (int) Math.max(0, Math.min(4095, v[i]));
            sb.append(B64[x >> 6]).append(B64[x & 63]);
        }
        return sb.toString();
    }

    private static JSONObject jsonOf(SharedPreferences p, String key) {
        try { return new JSONObject(p.getString(key, "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    /** Everything of the days from..to (inclusive) into `days` (one object per date) and the workouts into `ex`. */
    private static void collectRange(HealthConnectManager hc, ZoneId zone, LocalDate from, LocalDate to, TreeMap<String, JSONObject> days,
                                     JSONArray ex, JSONObject cache, ExecutorService back, int maxEx) {
        LocalDateTime a = from.atStartOfDay(), z = to.plusDays(1).atStartOfDay();
        Instant ia = a.atZone(zone).toInstant(), iz = to.equals(LocalDate.now(zone)) ? Instant.now() : z.atZone(zone).toInstant();

        // per day: Health Connect's own totals (the phone and the watch counted once)
        perDay(hc, a, z, StepsRecord.STEPS_COUNT_TOTAL, back, (d, v) -> put(days, d, "s", v));
        perDay(hc, a, z, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL, back, (d, v) -> put(days, d, "ak", Math.round(v.getInCalories() / 1000.0)));
        perDay(hc, a, z, TotalCaloriesBurnedRecord.ENERGY_TOTAL, back, (d, v) -> put(days, d, "tk", Math.round(v.getInCalories() / 1000.0)));
        perDay(hc, a, z, DistanceRecord.DISTANCE_TOTAL, back, (d, v) -> put(days, d, "m", Math.round(v.getInMeters())));
        perDay(hc, a, z, FloorsClimbedRecord.FLOORS_CLIMBED_TOTAL, back, (d, v) -> put(days, d, "fl", Math.round(v)));
        perDay(hc, a, z, RestingHeartRateRecord.BPM_AVG, back, (d, v) -> put(days, d, "rh", v));

        // HRV: the day's average (the watch measures it at night)
        Map<String, double[]> hrv = new TreeMap<>();
        for (HeartRateVariabilityRmssdRecord r : records(hc, HeartRateVariabilityRmssdRecord.class, ia, iz, back)) {
            double[] acc = hrv.computeIfAbsent(dateOf(r.getTime(), zone), k -> new double[2]);
            acc[0] += r.getHeartRateVariabilityMillis(); acc[1]++;
        }
        for (Map.Entry<String, double[]> h : hrv.entrySet()) put(days, h.getKey(), "hv", Math.round(h.getValue()[0] / h.getValue()[1]));

        // sleep, counted on the morning it ended: total, deep, REM, light, awake; when it started and ended. Stages are
        // added up in seconds and rounded once (whole minutes per stage lost up to ~25 min a night), and a session that
        // overlaps one already counted (the same night written by two apps) is skipped
        List<long[]> slept = new ArrayList<>();
        for (SleepSessionRecord r : records(hc, SleepSessionRecord.class, ia.minusSeconds(12 * 3600), iz, back)) {
            String d = dateOf(r.getEndTime(), zone);
            if (d.compareTo(from.toString()) < 0 || d.compareTo(to.toString()) > 0) continue;
            long s0 = r.getStartTime().toEpochMilli(), e0 = r.getEndTime().toEpochMilli();
            boolean twice = false;
            for (long[] x : slept) if (s0 < x[1] && e0 > x[0]) { twice = true; break; }
            if (twice) continue;
            slept.add(new long[] { s0, e0 });
            long deep = 0, rem = 0, light = 0, awake = 0, asleep = 0;
            for (SleepSessionRecord.Stage st : r.getStages()) {
                long sec = Duration.between(st.getStartTime(), st.getEndTime()).getSeconds();
                // 1 awake, 2 sleeping, 3 out of bed, 4 light, 5 deep, 6 REM, 7 awake in bed
                switch (st.getType()) {
                    case 5: deep += sec; asleep += sec; break;
                    case 6: rem += sec; asleep += sec; break;
                    case 4: light += sec; asleep += sec; break;
                    case 2: asleep += sec; break;
                    case 1: case 3: case 7: awake += sec; break;
                    default: break;
                }
            }
            // (seconds → minutes, once)
            deep = Math.round(deep / 60.0); rem = Math.round(rem / 60.0); light = Math.round(light / 60.0); awake = Math.round(awake / 60.0); asleep = Math.round(asleep / 60.0);
            long total = r.getStages().isEmpty() ? Duration.between(r.getStartTime(), r.getEndTime()).toMinutes() : asleep;
            JSONObject day = dayOf(days, d);
            try {
                day.put("sl", day.optLong("sl", 0) + total); // (a nap is added to the night)
                if (deep > 0) day.put("dp", day.optLong("dp", 0) + deep);
                if (rem > 0) day.put("rm", day.optLong("rm", 0) + rem);
                if (light > 0) day.put("lt", day.optLong("lt", 0) + light);
                if (awake > 0) day.put("aw", day.optLong("aw", 0) + awake);
                // the longest one is the night: its bed and wake times
                if (total >= day.optLong("night", 0)) { day.put("night", total); day.put("sb", r.getStartTime().toEpochMilli()); day.put("se", r.getEndTime().toEpochMilli()); }
            } catch (Exception ignored) { /* skip it */ }
        }

        // the last value of the day for these
        for (WeightRecord r : records(hc, WeightRecord.class, ia, iz, back)) put(days, dateOf(r.getTime(), zone), "w", Math.round(r.getWeight().getInGrams() / 100.0) / 10.0);
        for (BodyFatRecord r : records(hc, BodyFatRecord.class, ia, iz, back)) put(days, dateOf(r.getTime(), zone), "bf", Math.round(r.getPercentage().getValue() * 10) / 10.0);
        for (Vo2MaxRecord r : records(hc, Vo2MaxRecord.class, ia, iz, back)) put(days, dateOf(r.getTime(), zone), "vo", Math.round(r.getVo2MillilitersPerMinuteKilogram() * 10) / 10.0);
        Map<String, double[]> o2 = new TreeMap<>(), rr = new TreeMap<>();
        for (OxygenSaturationRecord r : records(hc, OxygenSaturationRecord.class, ia, iz, back)) { double[] x = o2.computeIfAbsent(dateOf(r.getTime(), zone), k -> new double[2]); x[0] += r.getPercentage().getValue(); x[1]++; }
        for (RespiratoryRateRecord r : records(hc, RespiratoryRateRecord.class, ia, iz, back)) { double[] x = rr.computeIfAbsent(dateOf(r.getTime(), zone), k -> new double[2]); x[0] += r.getRate(); x[1]++; }
        for (Map.Entry<String, double[]> x : o2.entrySet()) put(days, x.getKey(), "o2", Math.round(x.getValue()[0] / x.getValue()[1] * 10) / 10.0);
        for (Map.Entry<String, double[]> x : rr.entrySet()) put(days, x.getKey(), "rr", Math.round(x.getValue()[0] / x.getValue()[1] * 10) / 10.0);
        for (JSONObject d : days.values()) d.remove("night");

        // the workouts: their numbers are worked out once and remembered (two years of them would take too long each time)
        int n = 0;
        for (ExerciseSessionRecord s : records(hc, ExerciseSessionRecord.class, ia, iz, back)) {
            Instant ws = s.getStartTime(), we = s.getEndTime();
            if (Duration.between(ws, we).toMinutes() < 3) continue; // a tap by mistake
            try {
                String id = s.getMetadata().getId();
                JSONObject w = new JSONObject();
                w.put("id", id);
                w.put("t", kind(s.getExerciseType()));
                CharSequence title = s.getTitle();
                if (title != null && title.length() > 0) w.put("n", title.toString().substring(0, Math.min(40, title.length())));
                w.put("s", ws.toEpochMilli());
                w.put("e", we.toEpochMilli());
                JSONObject known = cache.optJSONObject(id);
                if (known == null) {
                    known = new JSONObject();
                    TimeInstantRangeFilter in = new TimeInstantRangeFilter.Builder().setStartTime(ws).setEndTime(we).build();
                    try {
                        // average and highest heart rate in one call (both whole numbers), then calories and distance
                        AggregateRecordsRequest<Long> hr = new AggregateRecordsRequest.Builder<Long>(in).addAggregationType(HeartRateRecord.BPM_AVG).addAggregationType(HeartRateRecord.BPM_MAX).build();
                        AggregateRecordsResponse<Long> g = await(r -> hc.aggregate(hr, back, r));
                        Long avg = g.get(HeartRateRecord.BPM_AVG), max = g.get(HeartRateRecord.BPM_MAX);
                        if (avg != null && avg > 0) known.put("hr", avg);
                        if (max != null && max > 0) known.put("hx", max);
                    } catch (Exception ignored) { /* no heart rate for it */ }
                    try { Energy kc = one(hc, in, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL, back); if (kc != null && kc.getInCalories() > 0) known.put("kc", Math.round(kc.getInCalories() / 1000.0)); } catch (Exception ignored) { /* none */ }
                    try { Length m = one(hc, in, DistanceRecord.DISTANCE_TOTAL, back); if (m != null && m.getInMeters() > 0) known.put("m", Math.round(m.getInMeters())); } catch (Exception ignored) { /* none */ }
                    known.put("at", System.currentTimeMillis());
                    cache.put(id, known);
                }
                for (String k : new String[] {"hr", "hx", "kc", "m"}) if (known.has(k)) w.put(k, known.get(k));
                ex.put(w);
                if (++n >= maxEx) break;
            } catch (Exception ignored) { /* skip that one */ }
        }
    }

    /** One per-day total over a range (a type that isn't allowed is simply left out). */
    private static <T> void perDay(HealthConnectManager hc, LocalDateTime a, LocalDateTime z, AggregationType<T> type, ExecutorService back, BiConsumer<String, T> put) {
        try {
            AggregateRecordsRequest<T> req = new AggregateRecordsRequest.Builder<T>(new LocalTimeRangeFilter.Builder().setStartTime(a).setEndTime(z).build())
                .addAggregationType(type).build();
            List<AggregateRecordsGroupedByPeriodResponse<T>> byDay = await(r -> hc.aggregateGroupByPeriod(req, Period.ofDays(1), back, r));
            for (AggregateRecordsGroupedByPeriodResponse<T> d : byDay) {
                T v = d.get(type);
                if (v != null) put.accept(d.getStartTime().toLocalDate().toString(), v);
            }
        } catch (Exception ignored) { /* not allowed, or nothing */ }
    }

    /** All records of a type in a range, a page at a time (none when it isn't allowed). */
    private static <R extends Record> List<R> records(HealthConnectManager hc, Class<R> type, Instant a, Instant z, ExecutorService back) {
        List<R> out = new ArrayList<>();
        try {
            TimeInstantRangeFilter range = new TimeInstantRangeFilter.Builder().setStartTime(a).setEndTime(z).build();
            long page = -1;
            for (int i = 0; i < 10; i++) {
                ReadRecordsRequestUsingFilters.Builder<R> b = new ReadRecordsRequestUsingFilters.Builder<>(type).setTimeRangeFilter(range).setPageSize(1000);
                if (page != -1) b.setPageToken(page);
                ReadRecordsRequestUsingFilters<R> req = b.build();
                ReadRecordsResponse<R> res = await(r -> hc.readRecords(req, back, r));
                out.addAll(res.getRecords());
                page = res.getNextPageToken();
                if (page == -1) break;
            }
        } catch (Exception ignored) { /* not allowed, or nothing */ }
        return out;
    }

    private static String dateOf(Instant t, ZoneId zone) { return t.atZone(zone).toLocalDate().toString(); }

    private static JSONObject dayOf(TreeMap<String, JSONObject> days, String d) { return days.computeIfAbsent(d, k -> new JSONObject()); }

    private static void put(TreeMap<String, JSONObject> days, String d, String key, Object v) {
        try { dayOf(days, d).put(key, v); } catch (Exception ignored) { /* skip it */ }
    }

    private static JSONObject cacheOf(SharedPreferences p) {
        try { return new JSONObject(p.getString(EX_CACHE, "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    /** The remembered workout numbers, at most 800 (the oldest worked out go first). */
    private static JSONObject trim(JSONObject cache) {
        if (cache.length() <= 800) return cache;
        List<String> keys = new ArrayList<>();
        for (Iterator<String> it = cache.keys(); it.hasNext(); ) keys.add(it.next());
        keys.sort((x, y) -> Long.compare(cache.optJSONObject(x) == null ? 0 : cache.optJSONObject(x).optLong("at"), cache.optJSONObject(y) == null ? 0 : cache.optJSONObject(y).optLong("at")));
        for (int i = 0; i < keys.size() - 800; i++) cache.remove(keys.get(i));
        return cache;
    }

    /** One total over a workout's time (its calories, its distance). */
    private static <T> T one(HealthConnectManager hc, TimeInstantRangeFilter in, AggregationType<T> type, ExecutorService back) throws Exception {
        AggregateRecordsRequest<T> req = new AggregateRecordsRequest.Builder<T>(in).addAggregationType(type).build();
        AggregateRecordsResponse<T> g = await(r -> hc.aggregate(req, back, r));
        return g.get(type);
    }

    /** Health Connect's workout types, in Aven's words (the page maps them onto its own kinds). */
    private static String kind(int t) {
        switch (t) {
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING_TREADMILL: return "treadmill";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING: return "run";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_ROWING_MACHINE: return "rowing_machine";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_ROWING: return "rowing";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_STAIR_CLIMBING_MACHINE: return "stair_machine";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_STAIR_CLIMBING: return "stairs";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_BIKING_STATIONARY: return "bike_stationary";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_BIKING: return "bike";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_WALKING: return "walk";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_HIKING: return "hike";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_MARTIAL_ARTS: return "martial_arts";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_SWIMMING_POOL: return "swim";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_SWIMMING_OPEN_WATER: return "swim";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_ELLIPTICAL: return "elliptical";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING: return "hiit";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_STRENGTH_TRAINING: return "strength";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_WEIGHTLIFTING: return "strength";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_YOGA: return "yoga";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_STRETCHING: return "stretch";
            default: return "other";
        }
    }
}
