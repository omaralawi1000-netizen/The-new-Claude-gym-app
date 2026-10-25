package app.aven.android;

import android.content.Context;
import android.content.pm.PackageManager;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.InsertRecordsResponse;
import android.health.connect.RecordIdFilter;
import android.health.connect.datatypes.Metadata;
import android.health.connect.datatypes.NutritionRecord;
import android.health.connect.datatypes.Record;
import android.health.connect.datatypes.WeightRecord;
import android.health.connect.datatypes.units.Energy;
import android.health.connect.datatypes.units.Mass;
import android.os.OutcomeReceiver;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Aven's weigh-ins and each day's food totals, written into Health Connect (so Samsung Health and other apps see them). The
 * page hands them over when Sync now or Connect watch is tapped ("w=" in the link: weigh-ins [date, kg, time], days
 * [date, kcal, protein, carbs, fat], and the dates to take out again). One record per day each, named by date, so sending a
 * day again replaces it instead of adding a second one. Only with Health Connect's "write weight / nutrition" allowed.
 * Aven's own weigh-ins are never read back in as the watch's (HealthSync skips its own records).
 */
final class HealthWrite {
    private HealthWrite() {}

    static final String[] PERMS = {
        "android.permission.health.WRITE_WEIGHT",
        "android.permission.health.WRITE_NUTRITION",
    };

    static boolean allowed(Context c) {
        for (String p : PERMS) if (c.checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) return false;
        return true;
    }

    /**
     * Writes what the page sent. Returns what to tell it: the number of records written and taken out, "denied" (not
     * allowed in Health Connect: nothing written, the page keeps them for next time) or "failed".
     */
    static String write(Context c, String packed) {
        if (packed == null || packed.isEmpty()) return null;
        if (!allowed(c)) return "denied";
        HealthConnectManager hc = c.getSystemService(HealthConnectManager.class);
        ExecutorService back = Executors.newCachedThreadPool();
        try {
            JSONObject o = new JSONObject(new String(Base64.decode(packed, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING), StandardCharsets.UTF_8));
            ZoneId zone = ZoneId.systemDefault();
            long version = System.currentTimeMillis(); // (newer wins over what was sent before for the same day)
            Instant now = Instant.now();
            List<Record> recs = new ArrayList<>();
            JSONArray w = o.optJSONArray("w");
            for (int i = 0; w != null && i < w.length() && i < 400; i++) {
                JSONArray x = w.optJSONArray(i);
                if (x == null) continue;
                String date = x.optString(0);
                double kg = x.optDouble(1, 0);
                long at = x.optLong(2, 0);
                if (!date.matches("\\d{4}-\\d{2}-\\d{2}") || kg < 25 || kg > 400) continue;
                Instant t = at > 0 ? Instant.ofEpochMilli(at) : LocalDate.parse(date).atTime(8, 0).atZone(zone).toInstant();
                if (t.isAfter(now)) t = now;
                recs.add(new WeightRecord.Builder(meta("aven-w-" + date, version), t, Mass.fromGrams(kg * 1000)).build());
            }
            JSONArray n = o.optJSONArray("n");
            for (int i = 0; n != null && i < n.length() && i < 400; i++) {
                JSONArray x = n.optJSONArray(i);
                if (x == null) continue;
                String date = x.optString(0);
                if (!date.matches("\\d{4}-\\d{2}-\\d{2}")) continue;
                double kcal = x.optDouble(1, 0), p = x.optDouble(2, 0), cb = x.optDouble(3, 0), f = x.optDouble(4, 0);
                if (kcal <= 0 || kcal > 20000) continue;
                // the day as one meal-less entry from the start of the day (until now, for today)
                Instant a = LocalDate.parse(date).atStartOfDay(zone).toInstant();
                Instant z = LocalDate.parse(date).plusDays(1).atStartOfDay(zone).toInstant().minusSeconds(60);
                if (z.isAfter(now)) z = now;
                if (!z.isAfter(a)) continue;
                NutritionRecord.Builder b = new NutritionRecord.Builder(meta("aven-n-" + date, version), a, z)
                    .setMealName("Aven").setEnergy(Energy.fromCalories(kcal * 1000));
                if (p > 0) b.setProtein(Mass.fromGrams(p));
                if (cb > 0) b.setTotalCarbohydrate(Mass.fromGrams(cb));
                if (f > 0) b.setTotalFat(Mass.fromGrams(f));
                recs.add(b.build());
            }
            int wrote = 0, gone = 0;
            if (!recs.isEmpty()) {
                CompletableFuture<InsertRecordsResponse> done = new CompletableFuture<>();
                hc.insertRecords(recs, back, receiver(done));
                wrote = done.get(15, TimeUnit.SECONDS).getRecords().size();
            }
            // days that had a weigh-in or food before and have none now (deleted in Aven): out of Health Connect too
            List<RecordIdFilter> out = new ArrayList<>();
            JSONArray dw = o.optJSONArray("dw"), dn = o.optJSONArray("dn");
            for (int i = 0; dw != null && i < dw.length() && i < 400; i++) out.add(RecordIdFilter.fromClientRecordId(WeightRecord.class, "aven-w-" + dw.optString(i)));
            for (int i = 0; dn != null && i < dn.length() && i < 400; i++) out.add(RecordIdFilter.fromClientRecordId(NutritionRecord.class, "aven-n-" + dn.optString(i)));
            if (!out.isEmpty()) {
                CompletableFuture<Void> done = new CompletableFuture<>();
                hc.deleteRecords(out, back, receiver(done));
                done.get(15, TimeUnit.SECONDS);
                gone = out.size();
            }
            return String.valueOf(wrote + gone);
        } catch (Throwable t) {
            return "failed";
        } finally {
            back.shutdown();
        }
    }

    private static Metadata meta(String id, long version) {
        return new Metadata.Builder().setClientRecordId(id).setClientRecordVersion(version).setRecordingMethod(Metadata.RECORDING_METHOD_MANUAL_ENTRY).build();
    }

    private static <T> OutcomeReceiver<T, HealthConnectException> receiver(CompletableFuture<T> f) {
        return new OutcomeReceiver<T, HealthConnectException>() {
            @Override public void onResult(T result) { f.complete(result); }
            @Override public void onError(HealthConnectException error) { f.completeExceptionally(error); }
        };
    }
}
