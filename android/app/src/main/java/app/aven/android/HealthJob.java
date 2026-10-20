package app.aven.android;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/**
 * Reads the watch every half hour while Aven is closed (only when "read in the background" is allowed in Health Connect,
 * Android 15 and up), so whatever opens Aven finds fresh numbers waiting instead of the ones from last time. Android picks
 * the exact moment (it bundles such work to save battery) and skips it when the battery is low. Nothing leaves the phone:
 * the numbers wait in the app until Aven opens.
 */
public class HealthJob extends JobService {
    private static final int ID = 4711;
    private static final long EVERY = 30 * 60_000L, LEEWAY = 10 * 60_000L;

    /** Started (or stopped) to match the watch's state: on and allowed in the background, or not. Cheap to call often. */
    static void schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js == null) return;
        if (!HealthSync.on(c) || !HealthSync.background(c)) { js.cancel(ID); return; }
        if (js.getPendingJob(ID) != null) return;
        js.schedule(new JobInfo.Builder(ID, new ComponentName(c, HealthJob.class))
            .setPeriodic(EVERY, LEEWAY)
            .setPersisted(true) // (after a restart of the phone too)
            .setRequiresBatteryNotLow(true)
            .build());
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        if (!HealthSync.on(this) || !HealthSync.background(this)) { schedule(this); return false; }
        HealthSync.read(this, payload -> jobFinished(params, false));
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true; // stopped halfway (Android needed the phone): try again later
    }
}
