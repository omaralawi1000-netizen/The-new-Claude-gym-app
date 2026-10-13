#!/usr/bin/env bash
# The Android emulator check in CI (.github/workflows/android.yml). Screenshots go to shots/ (and the android-shots branch).
#  1. the live rest countdown (debug build: it has a demo trigger that posts a notification like Chrome would)
#  2. the rest-over alert from the back-up alarm
#  3. the real signed app: opens full screen (no browser bar) and sees what the site saved in Chrome
set -x
SITE=https://omaralawi1000-netizen.github.io/The-new-Claude-gym-app/
mkdir -p shots

# 1. countdown
adb install -r debug/app-debug.apk
adb shell pm grant app.aven.android android.permission.POST_NOTIFICATIONS
adb shell am broadcast -n app.aven.android/.DemoRestReceiver --ei sec 95
sleep 2
adb shell cmd statusbar expand-notifications
sleep 5
adb exec-out screencap -p > shots/1-shade.png
sleep 5
adb exec-out screencap -p > shots/2-shade-5s-later.png
adb shell cmd statusbar collapse
sleep 1
adb exec-out screencap -p > shots/3-status-bar.png
adb shell locksettings set-disabled false
adb shell input keyevent KEYCODE_SLEEP
sleep 2
adb shell input keyevent KEYCODE_WAKEUP
sleep 3
adb exec-out screencap -p > shots/3b-lock-screen.png
adb shell dumpsys notification --noredact > shots/notifications.txt
grep -n "aven-rest\|PROMOTED\|requestPromoted\|mImportance=" shots/notifications.txt | head -20
adb shell wm dismiss-keyguard
adb shell locksettings set-disabled true
sleep 1

# 2. back-up alarm
adb shell am broadcast -n app.aven.android/.DemoRestReceiver --ei sec 4
sleep 10
adb shell dumpsys notification --noredact > shots/after-alarm.txt
adb shell cmd statusbar expand-notifications
sleep 2
adb exec-out screencap -p > shots/4-rest-over.png
adb shell cmd statusbar collapse

# 3. the signed app and Chrome's data
adb uninstall app.aven.android
adb install -r release/aven.apk
adb shell 'echo "_ --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line'
adb shell am set-debug-app --persistent com.android.chrome
adb shell am force-stop com.android.chrome
adb shell dumpsys package com.android.chrome | grep -m1 versionName
adb shell am start -a android.intent.action.VIEW -d "$SITE" -p com.android.chrome
sleep 15
adb exec-out screencap -p > shots/5-chrome.png
adb forward tcp:9222 localabstract:chrome_devtools_remote
python3 android/ci/cdp.py set
adb shell am start -n app.aven.android/com.google.androidbrowserhelper.trusted.LauncherActivity
sleep 20
adb exec-out screencap -p > shots/6-app.png
python3 android/ci/cdp.py get | tee shots/carry-over.txt
exit 0
