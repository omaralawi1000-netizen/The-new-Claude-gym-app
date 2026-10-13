package app.aven.android;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The back-up alarm at the end of a rest. */
public class RestAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        RestNotifications.alarm(context);
    }
}
