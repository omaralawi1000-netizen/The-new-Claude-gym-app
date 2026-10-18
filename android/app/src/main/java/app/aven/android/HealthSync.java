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
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * The watch, through Health Connect (Galaxy Watch → Samsung Health → Health Connect → here). Read only, on this phone only:
 * the steps of each of the last 14 days, and the workouts of those days (type, start, end, average and highest heart rate,
 * active calories, distance). Nothing is written and nothing leaves the phone except into Aven's own page, which it opens
 * with the numbers in its address (after "#", so not even the website's server sees them).
 *
 * Android's own Health Connect (Android 14 and up) is used: no extra library. On older phones the website simply never
 * shows the watch section.
 */
final class HealthSync {
    private HealthSync() {}

    static final String[] PERMS = {
        "android.permission.health.READ_STEPS",
        "android.permission.health.READ_EXERCISE",
        "android.permission.health.READ_HEART_RATE",
        "android.permission.health.READ_ACTIVE_CALORIES_BURNED",
        "android.permission.health.READ_DISTANCE",
    };
    private static final String PREFS = "aven_health";
    private static final String ON = "on";
    private static final String LAST = "lastPayload";
    private static final int DAYS = 14;
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
        LocalDateTime from = today.minusDays(DAYS - 1).atStartOfDay();
        JSONObject o = new JSONObject();
        o.put("v", 1);
        o.put("avail", true);
        o.put("on", true);
        o.put("granted", true);
        o.put("at", System.currentTimeMillis());

        // steps per local day: Health Connect's own total, which counts the phone and the watch only once
        JSONArray days = new JSONArray();
        AggregateRecordsRequest<Long> stepsReq = new AggregateRecordsRequest.Builder<Long>(
            new LocalTimeRangeFilter.Builder().setStartTime(from).setEndTime(today.plusDays(1).atStartOfDay()).build())
            .addAggregationType(StepsRecord.STEPS_COUNT_TOTAL).build();
        List<AggregateRecordsGroupedByPeriodResponse<Long>> byDay = await(r -> hc.aggregateGroupByPeriod(stepsReq, Period.ofDays(1), back, r));
        for (AggregateRecordsGroupedByPeriodResponse<Long> d : byDay) {
            Long n = d.get(StepsRecord.STEPS_COUNT_TOTAL);
            if (n == null || n <= 0) continue;
            days.put(new JSONArray().put(d.getStartTime().toLocalDate().toString()).put(n));
        }
        o.put("days", days);

        // the workouts of those days
        Instant start = from.atZone(zone).toInstant(), end = Instant.now();
        TimeInstantRangeFilter range = new TimeInstantRangeFilter.Builder().setStartTime(start).setEndTime(end).build();
        List<ExerciseSessionRecord> sessions = new ArrayList<>();
        long page = -1;
        for (int i = 0; i < 5; i++) {
            ReadRecordsRequestUsingFilters.Builder<ExerciseSessionRecord> b = new ReadRecordsRequestUsingFilters.Builder<>(ExerciseSessionRecord.class)
                .setTimeRangeFilter(range).setPageSize(100);
            if (page != -1) b.setPageToken(page);
            ReadRecordsRequestUsingFilters<ExerciseSessionRecord> req = b.build();
            ReadRecordsResponse<ExerciseSessionRecord> res = await(r -> hc.readRecords(req, back, r));
            sessions.addAll(res.getRecords());
            page = res.getNextPageToken();
            if (page == -1) break;
        }
        JSONArray ex = new JSONArray();
        for (ExerciseSessionRecord s : sessions) {
            Instant a = s.getStartTime(), z = s.getEndTime();
            if (Duration.between(a, z).toMinutes() < 3) continue; // a tap by mistake
            JSONObject w = new JSONObject();
            w.put("id", s.getMetadata().getId());
            w.put("t", kind(s.getExerciseType()));
            CharSequence title = s.getTitle();
            if (title != null && title.length() > 0) w.put("n", title.toString().substring(0, Math.min(40, title.length())));
            w.put("s", a.toEpochMilli());
            w.put("e", z.toEpochMilli());
            w.put("src", s.getMetadata().getDataOrigin().getPackageName());
            try {
                TimeInstantRangeFilter in = new TimeInstantRangeFilter.Builder().setStartTime(a).setEndTime(z).build();
                Long avg = one(hc, in, HeartRateRecord.BPM_AVG, back), max = one(hc, in, HeartRateRecord.BPM_MAX, back);
                Energy kc = one(hc, in, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL, back);
                Length m = one(hc, in, DistanceRecord.DISTANCE_TOTAL, back);
                if (avg != null && avg > 0) w.put("hr", avg);
                if (max != null && max > 0) w.put("hx", max);
                if (kc != null && kc.getInCalories() > 0) w.put("kc", Math.round(kc.getInCalories() / 1000.0));
                if (m != null && m.getInMeters() > 0) w.put("m", Math.round(m.getInMeters()));
            } catch (Exception ignored) {
                // a workout without heart rate (or the watch hadn't synced it yet) still counts
            }
            ex.put(w);
            if (ex.length() >= 60) break;
        }
        o.put("ex", ex);
        return o;
    }

    /** One total over a workout's time (its average heart rate, its calories…). */
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
