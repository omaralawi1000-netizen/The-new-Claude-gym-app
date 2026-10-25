package app.aven.android;

import android.app.Activity;
import android.graphics.Typeface;
import android.os.Bundle;
import android.util.TypedValue;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * The rest timer's own log, newest last (Aven's Settings › Training opens it with aven://restlog): what the app got from
 * Chrome, what it rang, which buttons were tapped and whether they reached Chrome. One screenshot shows where a Done ✓
 * stopped on a real phone, which the emulator can't.
 */
public class RestLogActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        TextView t = new TextView(this);
        String log = RestNotifications.savedLog(this);
        t.setText(log.isEmpty() ? "(nothing yet: start a rest in Aven, leave the app, and try again)" : log);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        t.setTypeface(Typeface.MONOSPACE);
        t.setTextIsSelectable(true);
        int pad = Math.round(16 * getResources().getDisplayMetrics().density);
        t.setPadding(pad, pad * 3, pad, pad * 3);
        ScrollView s = new ScrollView(this);
        s.addView(t);
        setContentView(s);
        setTitle("Aven rest log");
        s.post(() -> s.fullScroll(ScrollView.FOCUS_DOWN));
    }
}
