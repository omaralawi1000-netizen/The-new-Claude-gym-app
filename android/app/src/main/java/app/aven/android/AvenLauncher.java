package app.aven.android;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

/**
 * Opens Aven, but first (once, on Android 13 and up) asks Android to let the app show notifications. A freshly installed
 * app starts with them off, and without them the rest countdown can't show at all, not even the website's own notice
 * (Chrome passes the app's answer on to the website). Asked before the website opens, so Chrome sees the answer straight
 * away. Asked once: after a "Don't allow", Settings in Aven says where to turn them on.
 */
public class AvenLauncher extends LauncherActivity {
    private static final int ASK = 7;
    private static final String ASKED = "askedNotifications";
    private static final long ZOOM_AT_MOST = 800; // ms; in case Android never says the opening zoom has finished
    private boolean zoomed, opening, started, left, finishLater;
    private Runnable held;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        RestNotifications.ensureChannels(this); // so the phone's notification settings list the rest timer from the start
        getWindow().getDecorView().postDelayed(this::zoomDone, ZOOM_AT_MOST);
    }

    @Override
    protected boolean shouldLaunchImmediately() {
        if (Build.VERSION.SDK_INT < 33) return true;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return true;
        SharedPreferences p = getSharedPreferences("aven_launch", MODE_PRIVATE);
        if (p.getBoolean(ASKED, false)) return true;
        p.edit().putBoolean(ASKED, true).apply();
        requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, ASK);
        return false;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == ASK) launchTwa();
    }

    @Override
    protected void launchTwa() {
        opening = true;
        super.launchTwa();
    }

    /**
     * Chrome opens once the zoom from the icon has finished, never halfway through it: there, the orb blinked out on a
     * dark window for ~90 ms (3 launches in 4 on Omar's phone). The helper gets everything ready during the zoom (the
     * launch picture on screen, Chrome connected); only the final start is held back, and this screen stays until then.
     * (The helper can wait for the zoom itself, but only when it managed to hand the launch picture to Chrome.)
     */
    @Override
    public void startActivity(Intent intent, Bundle options) {
        // (before launchTwa the helper may restart this screen in a new task: that goes straight through)
        if (!opening) { super.startActivity(intent, options); return; }
        if (left) return; // the person left before Chrome was ready: don't pull them back into the app
        held = () -> { started = true; super.startActivity(intent, options); };
        if (zoomed) zoomDone();
    }

    @Override
    public void finish() {
        if (held != null) finishLater = true; // the helper closes this screen right after starting Chrome
        else super.finish();
    }

    @Override
    public void onEnterAnimationComplete() {
        super.onEnterAnimationComplete();
        zoomDone();
    }

    private void zoomDone() {
        zoomed = true;
        if (held == null) return;
        Runnable start = held;
        held = null;
        start.run();
        if (finishLater) super.finish();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        held = null; // Back during the zoom closes the app, as it would have before
        left = true;
        super.onBackPressed();
    }

    /**
     * Chrome opens over the launch screen with no animation, every time. The helper turns the animation off itself, but
     * only when it managed to hand the launch picture to Chrome; when that fails (1 launch in 4 on Omar's phone) Chrome
     * slid in sideways with the page's orb while the launch screen's orb slid out: two orbs.
     */
    @Override
    protected void onPause() {
        super.onPause();
        if (opening && !started) { // left before Chrome opened (Home, a call): don't open it after the person has gone
            left = true;
            held = null;
            if (finishLater) super.finish();
            return;
        }
        if (opening) overridePendingTransition(0, 0); // (the notifications question keeps its own animation)
    }

    @Override
    protected void onResume() {
        super.onResume();
        left = false; // back before Chrome was ready: carry on opening it
    }
}
