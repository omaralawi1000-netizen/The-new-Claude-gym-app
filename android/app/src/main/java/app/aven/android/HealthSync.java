package app.aven.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
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
 * page comes again). Nothing is written and nothing leaves the phone except into Aven's own page, which it opens
 * with the numbers in its address (after "#", so not even the website's server sees them).
 *
 * Android's own Health Connect (Android 14 and up) is used: no extra library. On older phones the website simply never
 * shows the watch section.
 */
final class HealthSync {
    private HealthSync() {}

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
    };

    /** All of them, for Connect watch (Health Connect asks only for the ones not allowed yet). */
    static String[] all() {
        List<String> out = new ArrayList<>();
        java.util.Collections.addAll(out, PERMS);
        // (history only where Health Connect knows it: an unknown one could make it refuse the whole request)
        for (String p : MORE) if (Build.VERSION.SDK_INT >= 35 || !p.endsWith("HISTORY")) out.add(p);
        return out.toArray(new String[0]);
    }

    /** Something worth asking again (the extra data, added after the watch was first connected). */
    static boolean missingAny(Context c) {
        for (String p : all()) if (c.checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) return true;
        return false;
    }
    private static final String PREFS = "aven_health";
    private static final String ON = "on";
    private static final String LAST = "lastPayload";
    private static final int DAYS = 14;
    /** The older stretch read each time, and how far back it walks before starting over. */
    private static final int CHUNK = 30, BACK = 730;
    private static final String BACK_TO = "backTo", EMPTY = "emptyChunks", EX_CACHE = "exCache";
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

    static void setOn(Context c, boolean on) { prefs(c).edit().putBoolean(ON, on).apply(); }

    /** Connect watch again: the history is walked from the start (newly allowed data comes in). */
    static void restartHistory(Context c) { prefs(c).edit().remove(BACK_TO).remove(EMPTY).apply(); }

    /** The extra data (sleep, HRV…) came after many had connected their watch: asked for once on a sync, never again. */
    static boolean askedMore(Context c) { return prefs(c).getBoolean(ASKED_MORE, false); }
    static void markAskedMore(Context c) { prefs(c).edit().putBoolean(ASKED_MORE, true).apply(); }
    private static final String ASKED_MORE = "askedMore";

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** The last numbers read (used when a fresh read isn't ready in time). */
    static String lastPayload(Context c) { return prefs(c).getString(LAST, null); }

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
                out = encode(collect(app, back).toString());
                prefs(app).edit().putString(LAST, out).apply();
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
    private static <T> T await(Call<T> call) throws Exception {
        CompletableFuture<T> f = new CompletableFuture<>();
        call.run(new OutcomeReceiver<T, HealthConnectException>() {
            @Override public void onResult(T result) { f.complete(result); }
            @Override public void onError(HealthConnectException error) { f.completeExceptionally(error); }
        });
        return f.get(4, TimeUnit.SECONDS);
    }

    private static JSONObject collect(Context c, ExecutorService back) throws Exception {
        HealthConnectManager hc = c.getSystemService(HealthConnectManager.class);
        ZoneId zone = ZoneId.systemDefault();
        LocalDate today = LocalDate.now(zone);
        LocalDate recentFrom = today.minusDays(DAYS - 1);
        // the older stretch this time: the 30 days before the last one sent (back to about two years, then from the top)
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
        int before = 0;
        collectRange(hc, zone, recentFrom, today, days, ex, cache, back, 60);
        before = days.size() + ex.length();
        collectRange(hc, zone, chunkStart, chunkEnd, days, ex, cache, back, 60);
        boolean emptyChunk = days.size() + ex.length() == before;

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

        // where the next stretch starts; two empty ones in a row (nothing that old, or no history allowed) = start over
        int empties = emptyChunk ? p.getInt(EMPTY, 0) + 1 : 0;
        SharedPreferences.Editor e = p.edit().putString(EX_CACHE, trim(cache).toString());
        if (empties >= 2) e.remove(BACK_TO).putInt(EMPTY, 0); else e.putString(BACK_TO, chunkStart.toString()).putInt(EMPTY, empties);
        e.apply();
        return o;
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
