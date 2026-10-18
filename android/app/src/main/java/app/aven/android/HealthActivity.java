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
                if (HealthSync.granted(this)) { HealthSync.setOn(this, true); sync(); }
                else requestPermissions(HealthSync.PERMS, ASK);
                break;
            case "off":
                HealthSync.setOn(this, false);
                open(HealthSync.status(this, "off"));
                break;
            default:
                sync();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != ASK) return;
        Log.i("AvenHealth", "Health Connect answered: allowed " + HealthSync.granted(this));
        if (HealthSync.granted(this)) { HealthSync.setOn(this, true); sync(); }
        else open(HealthSync.status(this, "denied"));
    }

    private void sync() {
        if (!HealthSync.on(this)) { open(HealthSync.status(this, "denied")); return; }
        Handler main = new Handler(Looper.getMainLooper());
        // (a slow Health Connect never holds the page back for long: after 6 s it opens with what it has)
        main.postDelayed(() -> open(HealthSync.status(this, "slow")), 6000);
        HealthSync.read(this, payload -> main.post(() -> open(payload != null ? payload : HealthSync.status(this, "failed"))));
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
