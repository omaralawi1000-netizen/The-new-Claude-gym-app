package app.aven.android;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

/**
 * What Aven's Settings asks for (aven://health/…, sent as an intent: link from the page):
 *  - connect: asks Health Connect for read access (steps, workouts, heart rate, calories, distance), then reads;
 *  - sync: reads again now;
 *  - off: stops reading (access can be taken back in Health Connect too).
 * Then it opens Aven again at the page it came from (the real app or Aven Beta), with the numbers — or just how it went —
 * in the address after "#hc=". Nothing is shown here: the screen is see-through and gone in a moment.
 */
public class HealthActivity extends Activity {
    private static final int ASK = 11;
    private Uri back;
    private boolean done;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri in = getIntent().getData();
        back = HealthSync.safeReturn(in != null ? in.getQueryParameter("return") : null);
        String what = in != null && in.getPath() != null ? in.getPath().replace("/", "") : "";
        Log.i("AvenHealth", "asked: " + what + ", available " + HealthSync.available(this) + ", allowed " + HealthSync.granted(this) + ", back to " + back);
        if (!HealthSync.available(this)) { open(HealthSync.status(this, "unavailable")); return; }
        switch (what) {
            case "connect":
                // the whole history again from the top (newly allowed data comes in); everything is asked for, and
                // Health Connect shows only what isn't allowed yet (sleep, heart rate variability… added later)
                HealthSync.restartHistory(this);
                if (HealthSync.missingAny(this)) requestPermissions(HealthSync.all(), ASK);
                else { HealthSync.setOn(this, true); sync(); }
                break;
            case "off":
                HealthSync.setOn(this, false);
                HealthJob.schedule(this); // (stops the half-hourly read)
                open(HealthSync.status(this, "off"));
                break;
            default:
                // connected before sleep, HRV and the rest were added: asked for once here (the whole history again then)
                if (HealthSync.on(this) && HealthSync.missingAny(this) && !HealthSync.askedMore(this)) {
                    HealthSync.markAskedMore(this);
                    HealthSync.restartHistory(this);
                    requestPermissions(HealthSync.all(), ASK);
                } else sync();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != ASK) return;
        Log.i("AvenHealth", "Health Connect answered: allowed " + HealthSync.granted(this));
        if (HealthSync.granted(this)) { HealthSync.setOn(this, true); HealthJob.schedule(this); sync(); }
        else open(HealthSync.status(this, "denied"));
    }

    private void sync() {
        if (!HealthSync.on(this)) { open(HealthSync.status(this, "denied")); return; }
        HealthJob.schedule(this);
        // read in the background a moment ago: those at once
        String fresh = HealthSync.freshPayload(this, 2 * 60_000L);
        if (fresh != null) { openWith(fresh); return; }
        Handler main = new Handler(Looper.getMainLooper());
        // (a slow Health Connect never holds the page back for long: after 15 s it opens with the last numbers read, and
        // the read carries on for next time; the first read with history can take a while)
        main.postDelayed(() -> { String last = HealthSync.lastPayload(this); if (last != null) openWith(last); else open(HealthSync.status(this, "slow")); }, 15000);
        HealthSync.read(this, payload -> main.post(() -> { if (payload != null) openWith(payload); else open(HealthSync.status(this, "failed")); }));
    }

    /** Opens Aven with numbers (not just how it went): the walks through the history move on. */
    private void openWith(String payload) {
        if (done) return;
        HealthSync.delivered(this);
        open(payload);
    }

    private void open(String payload) {
        if (done) return;
        done = true;
        Uri url = payload != null ? back.buildUpon().fragment("hc=" + payload).build() : back;
        Log.i("AvenHealth", "opening Aven again with " + (payload == null ? 0 : payload.length()) + " chars");
        Intent i = new Intent(this, AvenLauncher.class).setData(url).putExtra(AvenLauncher.FRESH, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(i);
        finish();
        overridePendingTransition(0, 0);
    }
}
