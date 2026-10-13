package app.aven.android;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationManager;

import androidx.annotation.NonNull;

import com.google.androidbrowserhelper.trusted.DelegationService;

/** Chrome shows Aven's web notifications through here; the rest ones get the native treatment (see RestNotifications). */
public class RestDelegationService extends DelegationService {
    @Override
    @SuppressLint("MissingPermission")
    public boolean onNotifyNotificationWithChannel(@NonNull String platformTag, int platformId,
            @NonNull Notification notification, @NonNull String channelName) {
        Notification mine = RestNotifications.restyle(this, platformTag, platformId, notification);
        if (mine == null) return super.onNotifyNotificationWithChannel(platformTag, platformId, notification, channelName);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (!nm.areNotificationsEnabled()) return false;
        nm.notify(platformTag, platformId, mine);
        return true;
    }

    @Override
    public void onCancelNotification(@NonNull String platformTag, int platformId) {
        super.onCancelNotification(platformTag, platformId);
        if (RestNotifications.isResting(platformTag)) RestNotifications.restCancelled(this, platformTag);
    }
}
