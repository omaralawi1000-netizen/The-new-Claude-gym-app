package app.aven.android;

import android.Manifest;
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
    private boolean opening;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        RestNotifications.ensureChannels(this); // so the phone's notification settings list the rest timer from the start
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
     * Chrome opens over the launch screen with no animation, every time. The helper turns the animation off itself, but
     * only when it managed to hand the launch picture to Chrome; when that fails (1 launch in 4 on Omar's phone) Chrome
     * slid in sideways with the page's orb while the launch screen's orb slid out: two orbs.
     */
    @Override
    protected void onPause() {
        super.onPause();
        if (opening) overridePendingTransition(0, 0); // (the notifications question keeps its own animation)
    }
}
