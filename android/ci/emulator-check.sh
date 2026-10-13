#!/usr/bin/env bash
# The Android emulator check in CI (.github/workflows/android.yml). Screenshots go to shots/ (and the android-shots branch).
# Order:
#  1. the debug build's demo trigger (no Chrome needed), a first look at the countdown
#  2. the signed app: the website in it shows its rest notification, which must come out as the app's own live
#     countdown (shade light/dark, lock screen, ticking), ring "Time for set 2" at the end, and go away when the
#     website takes it back
#  3. the app sees the data saved in Chrome
# The emulator runs with ANGLE graphics (-gpu swangle_indirect): with SwiftShader it died soon after Chrome drew the app.
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
notes() { timeout 20 adb shell dumpsys notification --noredact > "shots/$1.txt"; grep -n "pkg=app.aven.android\|android.title=\|android.subText=\|android.text=\|isPromoted\|PROMOTED" "shots/$1.txt" | head -24; }
cdp() { adb forward tcp:9222 localabstract:chrome_devtools_remote; timeout 60 python3 android/ci/cdp.py "$@"; }
tab() { adb shell am start -a android.intent.action.VIEW -d "$SITE" -p com.android.chrome; sleep "${1:-8}"; }

# 1. the demo trigger in the debug build (same code, posted without Chrome)
adb install -r debug/app-debug.apk
adb shell pm grant app.aven.android android.permission.POST_NOTIFICATIONS
adb shell am broadcast -n app.aven.android/.DemoRestReceiver --ei sec 95
sleep 5
shade 7-demo-shade
notes demo
adb uninstall app.aven.android

# 2. the signed app, then the rest notification through Chrome
adb install -r release/aven.apk
adb shell pm grant app.aven.android android.permission.POST_NOTIFICATIONS
adb shell 'echo "_ --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line'
adb shell am set-debug-app --persistent com.android.chrome
adb shell am force-stop com.android.chrome
adb shell dumpsys package com.android.chrome | grep -m1 versionName
tab 15
adb exec-out screencap -p > shots/5-chrome.png
cdp set
# the app; the website in it shows the rest notification (as it does the moment you leave mid-rest), then you leave
adb shell am start -n app.aven.android/com.google.androidbrowserhelper.trusted.LauncherActivity
sleep 6
timeout 10 adb exec-out screencap -p > shots/6-app.png
cdp rest 95 | tee shots/rest-real.txt
timeout 10 adb shell input keyevent KEYCODE_HOME
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
adb shell am start -n app.aven.android/com.google.androidbrowserhelper.trusted.LauncherActivity
sleep 3
cdp rest 6 60 | tee -a shots/rest-real.txt
timeout 10 adb shell input keyevent KEYCODE_HOME
sleep 10
notes real-over
shade 4-real-rest-over
# back in the app: the website takes its notification away, and the alert goes with it
adb shell am start -n app.aven.android/com.google.androidbrowserhelper.trusted.LauncherActivity
sleep 3
cdp clear | tee -a shots/rest-real.txt
timeout 10 adb shell input keyevent KEYCODE_HOME
sleep 3
notes real-after-clear
grep -c "pkg=app.aven.android" shots/real-after-clear.txt | sed 's/^/aven notifications left after clear: /' | tee -a shots/rest-real.txt
timeout 20 adb logcat -d | grep -i "OriginVerifier\|TrustedWebActivity\|TWAConnectionPool\|digital asset\|RestTimer\|ForegroundService\|AvenRest" | tail -40 | tee -a shots/carry-over.txt

# 3. the app sees the site's data (last: the emulator may not survive the app being on screen for long)
cdp set
adb shell am start -n app.aven.android/com.google.androidbrowserhelper.trusted.LauncherActivity
sleep 4
cdp get | tee -a shots/carry-over.txt
timeout 15 adb shell dumpsys activity activities | grep -m2 "ResumedActivity" | tee -a shots/carry-over.txt
timeout 15 adb exec-out screencap -p > shots/6b-app.png
exit 0
