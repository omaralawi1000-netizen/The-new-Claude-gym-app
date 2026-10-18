package app.aven.android;

import android.app.Activity;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Health Connect shows this when someone asks why Aven wants their health data (Android requires it, or the request is
 * refused): what is read, and that it stays on the phone.
 */
public class PrivacyActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        TextView t = new TextView(this);
        t.setText(R.string.health_privacy);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        t.setLineSpacing(0, 1.25f);
        t.setGravity(Gravity.START);
        int pad = Math.round(24 * getResources().getDisplayMetrics().density);
        t.setPadding(pad, pad, pad, pad);
        ScrollView s = new ScrollView(this);
        s.addView(t);
        setContentView(s);
        setTitle(R.string.health_privacy_title);
    }
}
