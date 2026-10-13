package app.aven.android;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The exact alarms: the end of a rest, and the nudge that starts the ticking service when Android wouldn't otherwise. */
public class RestAlarmReceiver extends BroadcastReceiver {
    static final String ACTION_END = "app.aven.android.REST_END";
    static final String ACTION_TICK = "app.aven.android.REST_TICK";

    @Override
    public void onReceive(Context c, Intent intent) {
        if (ACTION_TICK.equals(intent.getAction())) RestTimerService.start(c);
        else RestNotifications.ring(c);
    }
}
