package app.aven.android;

import android.app.Activity;
import android.os.Bundle;

/**
 * Done ✓ on the rest-over alert (phone, lock screen, watch), as an invisible screen that closes at once: Aven doesn't open.
 * Why a screen and not a message like +30 s and Skip: Chrome's button that tells the website is a screen of Chrome's
 * ("opens a screen" in the rest log), and newer Chrome on Android 15/16 doesn't let an app press it from the background,
 * silently (25 Oct, Omar's phone: "Chrome got it", and the website never heard; the emulator's older Chrome uses a
 * message instead). Pressed from a screen of our own, it's allowed. Shown over the lock screen, so it never asks to unlock.
 */
public class RestDoneActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        overridePendingTransition(0, 0);
        // (pressed while this screen is in front; it goes straight away, so it never sits over what you were doing)
        RestActionReceiver.handle(getApplicationContext(), getIntent(), () -> { /* Chrome answered: only logged */ });
        finish();
        overridePendingTransition(0, 0);
    }
}
