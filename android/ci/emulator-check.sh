#!/usr/bin/env bash
# The Android emulator check in CI (.github/workflows/android.yml). Screenshots go to shots/ (and the android-shots branch).
#  1. the real path: the signed app opens full screen and sees the site's data in Chrome; then the website's rest
#     notification, shown by Chrome, must come out as the app's own live countdown (shade light/dark, lock screen,
#     ticking), ring "Time for set 2" at the end, and go away when the website takes it back
#  2. the debug build's demo trigger (no network needed), as a second look at the countdown
# The screen is set to a phone-like size first so the pictures compare with a real phone's.
set -x
SITE=https://omaralawi1000-netizen.github.io/The-new-Claude-gym-app/
mkdir -p shots
adb logcat -c
(adb logcat -v time > shots/logcat.txt 2>&1 &) # kept on this side, so it survives if the emulator doesn't
adb shell wm size 1080x2229
adb shell wm density 440
adb shell settings put system screen_off_timeout 600000
adb shell svc power stayon true
shade() { adb shell cmd statusbar expand-notifications; sleep 2; adb exec-out screencap -p > "shots/$1.png"; adb shell cmd statusbar collapse; sleep 1; }
notes() { timeout 20 adb shell dumpsys notification --noredact > "shots/$1.txt"; grep -n "pkg=app.aven.android\|android.title=\|android.subText=\|android.text=" "shots/$1.txt" | head -20; }

# 1. the signed app, Chrome's data, and the rest notification through Chrome
adb install -r release/aven.apk
adb shell pm grant app.aven.android android.permission.POST_NOTIFICATIONS
adb shell 'echo "_ --disable-fre --no-default-browser-check --no-first-run --disable-gpu" > /data/local/tmp/chrome-command-line'
adb shell am set-debug-app --persistent com.android.chrome
adb shell am force-stop com.android.chrome
adb shell dumpsys package com.android.chrome | grep -m1 versionName
adb shell am start -a android.intent.action.VIEW -d "$SITE" -p com.android.chrome
sleep 15
adb exec-out screencap -p > shots/5-chrome.png
adb forward tcp:9222 localabstract:chrome_devtools_remote
python3 android/ci/cdp.py set
adb shell am start -n app.aven.android/com.google.androidbrowserhelper.trusted.LauncherActivity
sleep 4 # cdp.py waits for the page itself
adb forward tcp:9222 localabstract:chrome_devtools_remote
timeout 60 python3 android/ci/cdp.py get | tee shots/carry-over.txt
timeout 15 adb shell dumpsys activity activities | grep -m2 "ResumedActivity" | tee -a shots/carry-over.txt
timeout 15 adb exec-out screencap -p > shots/6-app.png
# leave the app, as you do mid-rest; the website then shows the rest notification
timeout 10 adb shell input keyevent KEYCODE_HOME
sleep 2
timeout 60 python3 android/ci/cdp.py rest 95 | tee shots/rest-real.txt
sleep 4
notes real-countdown
shade 1-real-shade
sleep 3
shade 2-real-shade-3s-later
timeout 10 adb shell cmd uimode night yes
sleep 3
shade 2b-real-shade-dark
timeout 10 adb shell cmd uimode night no
sleep 2
adb exec-out screencap -p > shots/3-status-bar.png
adb shell locksettings set-disabled false
adb shell input keyevent KEYCODE_SLEEP
sleep 2
adb shell input keyevent KEYCODE_WAKEUP
sleep 3
adb exec-out screencap -p > shots/3b-lock-screen.png
adb shell wm dismiss-keyguard
adb shell locksettings set-disabled true
sleep 1
# the end of a rest: the countdown goes, the alert rings
timeout 60 python3 android/ci/cdp.py rest 6 60 | tee -a shots/rest-real.txt
sleep 10
notes real-over
shade 4-real-rest-over
# back in the app: the website takes its notification away, and the alert goes with it
timeout 60 python3 android/ci/cdp.py clear | tee -a shots/rest-real.txt
sleep 3
notes real-after-clear
grep -c "pkg=app.aven.android" shots/real-after-clear.txt | sed 's/^/aven notifications left after clear: /' | tee -a shots/rest-real.txt
timeout 20 adb logcat -d | grep -i "OriginVerifier\|TrustedWebActivity\|TWAConnectionPool\|digital asset\|RestTimer\|ForegroundService" | tail -30 | tee -a shots/carry-over.txt

# 2. the demo trigger in the debug build (same code, posted without Chrome)
adb uninstall app.aven.android
adb install -r debug/app-debug.apk
adb shell pm grant app.aven.android android.permission.POST_NOTIFICATIONS
adb shell am broadcast -n app.aven.android/.DemoRestReceiver --ei sec 95
sleep 5
shade 7-demo-shade
notes demo
exit 0
