package app.aven.android;

import android.app.Notification;

import androidx.annotation.NonNull;

import com.google.androidbrowserhelper.trusted.DelegationService;

/** Chrome shows Aven's web notifications through here; the rest ones get the native treatment (see RestNotifications). */
public class RestDelegationService extends DelegationService {
    @Override
    public boolean onNotifyNotificationWithChannel(@NonNull String platformTag, int platformId,
            @NonNull Notification notification, @NonNull String channelName) {
        if (RestNotifications.fromChrome(this, platformTag, notification)) return true;
        return super.onNotifyNotificationWithChannel(platformTag, platformId, notification, channelName);
    }

    @Override
    public void onCancelNotification(@NonNull String platformTag, int platformId) {
        super.onCancelNotification(platformTag, platformId);
        RestNotifications.chromeCancelled(this, platformTag);
    }
}
