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
adb install -r release/aven.apk # no permission granted by script: the app must ask for it itself, as on a phone
adb shell 'echo "_ --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line'
adb shell am set-debug-app --persistent com.android.chrome
adb shell am force-stop com.android.chrome
adb shell dumpsys package com.android.chrome | grep -m1 versionName
tab 15
adb exec-out screencap -p > shots/5-chrome.png
cdp set
# the app; the website in it shows the rest notification (as it does the moment you leave mid-rest), then you leave
adb shell am start -n app.aven.android/com.google.androidbrowserhelper.trusted.LauncherActivity
for i in 1 2 3 4; do timeout 5 adb exec-out screencap -p > shots/6a-launch-$i.png; done # the opening, frame by frame
# the first opening asks to allow notifications: tap Allow like a person would
sleep 3
adb exec-out screencap -p > shots/6c-ask.png
tapid() { timeout 15 adb shell uiautomator dump /sdcard/ui.xml >/dev/null; adb shell cat /sdcard/ui.xml > shots/ui-$2.xml
  XY=$(python3 - "$1" "shots/ui-$2.xml" <<'PY'
import re, sys
x = open(sys.argv[2]).read()
m = re.search(r'resource-id="' + re.escape(sys.argv[1]) + r'"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', x)
print(f"{(int(m[1])+int(m[3]))//2} {(int(m[2])+int(m[4]))//2}" if m else "")
PY
); echo "$1 at: ${XY:-not found}" | tee -a shots/rest-real.txt; [ -n "$XY" ] && adb shell input tap $XY; }
tapid com.android.permissioncontroller:id/permission_allow_button ask
sleep 6
adb shell dumpsys package app.aven.android | grep -m1 "POST_NOTIFICATIONS" | sed 's/^ */notification permission: /' | tee -a shots/rest-real.txt
timeout 10 adb exec-out screencap -p > shots/6-app.png
cdp rest 95 | tee -a shots/rest-real.txt
timeout 10 adb shell input keyevent KEYCODE_HOME
sleep 4
notes real-countdown
shade 1-real-shade
sleep 3
shade 2-real-shade-3s-later
# our own +30 s button, tapped like a finger would (it must still reach the app and the website)
adb shell cmd statusbar expand-notifications; sleep 2
timeout 15 adb shell uiautomator dump /sdcard/ui.xml >/dev/null; adb shell cat /sdcard/ui.xml > shots/ui-shade.xml
XY=$(python3 - <<'PY'
import re
x = open('shots/ui-shade.xml').read()
m = re.search(r'text="\+30 s"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', x)
print(f"{(int(m[1])+int(m[3]))//2} {(int(m[2])+int(m[4]))//2}" if m else "")
PY
)
echo "+30 s button at: ${XY:-not found}" | tee -a shots/rest-real.txt
[ -n "$XY" ] && adb shell input tap $XY
sleep 3
adb exec-out screencap -p > shots/2c-after-plus30.png
adb shell cmd statusbar collapse; sleep 1
notes after-plus30
cdp watch | grep -v '^pages' | tee -a shots/rest-real.txt
timeout 10 adb shell cmd uimode night yes
sleep 3
shade 2b-real-shade-dark
cdp seen | grep -v '^pages' | tee -a shots/rest-real.txt
notes after-dark >/dev/null; grep -c "pkg=app.aven.android" shots/after-dark.txt | sed 's/^/aven notifications after dark mode (want 1+): /' | tee -a shots/rest-real.txt
timeout 10 adb shell cmd uimode night no
sleep 2
adb exec-out screencap -p > shots/3-status-bar.png
adb shell locksettings set-disabled false
adb shell input keyevent KEYCODE_SLEEP
sleep 2
adb shell input keyevent KEYCODE_WAKEUP
sleep 3
adb exec-out screencap -p > shots/3b-lock-screen.png
sleep 4
adb exec-out screencap -p > shots/3c-lock-screen-later.png
adb shell wm dismiss-keyguard
adb shell locksettings set-disabled true
sleep 1
# the end of a rest, as in a pocket: screen off, the phone dozing, sound on vibrate. The alert must pop up and the app
# must play the clicks itself (on the alarm volume: a notification's own sound is silent on vibrate)
adb shell am start -n app.aven.android/com.google.androidbrowserhelper.trusted.LauncherActivity
sleep 3
cdp rest 30 60 | tee -a shots/rest-real.txt
timeout 10 adb shell input keyevent KEYCODE_HOME
sleep 2
adb shell cmd audio set-ringer-mode VIBRATE 2>&1 | tee -a shots/rest-real.txt || true
adb shell media volume --stream 2 --set 0 >/dev/null 2>&1 || true # ring volume 0: vibrate, on any Android
adb shell dumpsys battery unplug
adb shell input keyevent KEYCODE_SLEEP
sleep 2
adb shell dumpsys deviceidle force-idle | sed 's/^/doze: /' | tee -a shots/rest-real.txt
timeout 20 adb shell dumpsys audio | grep -A2 "Ringer mode" | tr -s ' \n' ' ' | sed 's/^/sound: /' | tee -a shots/rest-real.txt; echo
adb shell dumpsys power | grep -m1 "mWakefulness=" | sed 's/^ */screen: /' | tee -a shots/rest-real.txt
# Android stops the app during a long rest (Omar's phone, 18 Oct: the alert then came without its Done ✓): do it here too
sleep 8
echo "app before: $(adb shell pidof app.aven.android)" | tee -a shots/rest-real.txt
adb root >/dev/null 2>&1; sleep 3; adb wait-for-device
adb shell "kill -9 \$(pidof app.aven.android)" 2>&1 | tee -a shots/rest-real.txt
sleep 1
echo "app after the kill: '$(adb shell pidof app.aven.android)' (empty = stopped)" | tee -a shots/rest-real.txt
# …and the website's back-up alert gets there just before the alarm (Omar's phone, 18 Oct: the alert was then built in
# a fresh start without Chrome's buttons, and its Done ✓ went nowhere)
LEFT=$(adb forward tcp:9222 localabstract:chrome_devtools_remote >/dev/null; timeout 30 python3 android/ci/cdp.py left | grep -v '^pages' | tail -1)
echo "rest left: ${LEFT} ms" | tee -a shots/rest-real.txt
python3 -c "import time,sys; time.sleep(max(0, (int(sys.argv[1]) - 700) / 1000))" "${LEFT:-0}"
cdp overalert | grep -v '^pages' | sed 's/^/back-up first: /' | tee -a shots/rest-real.txt
sleep 8
timeout 20 adb shell dumpsys audio > shots/audio.txt
grep -c "usage=USAGE_ALARM" shots/audio.txt | sed 's/^/alarm-volume sounds in the audio log (want 1+): /' | tee -a shots/rest-real.txt
grep -m6 "USAGE_ALARM" shots/audio.txt | cut -c1-220 | tee -a shots/rest-real.txt
adb shell dumpsys deviceidle unforce >/dev/null
adb shell dumpsys battery reset
adb shell cmd audio set-ringer-mode NORMAL >/dev/null 2>&1 || true
adb shell media volume --stream 2 --set 5 >/dev/null 2>&1 || true
adb shell input keyevent KEYCODE_WAKEUP
sleep 2
notes real-over
shade 4-real-rest-over
# the website's back-up alert arrives a moment later (as on a phone where the page wasn't asleep): the app's alert must stay
cdp overalert | grep -v '^pages' | tee -a shots/rest-real.txt
sleep 4
notes after-overalert >/dev/null; grep -c "android.title=String (Time for set 2)" shots/after-overalert.txt | sed 's/^/alerts showing after the website'"'"'s back-up (want 1+): /' | tee -a shots/rest-real.txt
# Done ✓ on the alert, tapped like a finger (on a watch it is this same button): it must reach the website's worker and page
cdp listen | grep -v '^pages' | tee -a shots/rest-real.txt
tapDone() {
  adb shell cmd statusbar expand-notifications; sleep 2
  timeout 15 adb shell uiautomator dump /sdcard/ui.xml >/dev/null; adb shell cat /sdcard/ui.xml > shots/ui-$1.xml
  XY=$(python3 - "shots/ui-$1.xml" <<'PY'
import re, sys
x = open(sys.argv[1]).read()
m = re.search(r'text="(?i:done)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', x)
print(f"{(int(m[1])+int(m[3]))//2} {(int(m[2])+int(m[4]))//2}" if m else "")
PY
)
  echo "Done button ($1) at: ${XY:-not found}" | tee -a shots/rest-real.txt
  [ -n "$XY" ] && adb shell input tap $XY
  sleep 5
}
tapDone over
adb exec-out screencap -p > shots/4b-after-done.png
adb shell cmd statusbar collapse; sleep 1
notes after-done
cdp heard | grep -v '^pages' | tee -a shots/rest-real.txt
# the app carries on by itself: the next rest counts down (set 3), and its alert rings with its own Done ✓
grep -c "Set 3 of 3\|Rest 0:15" shots/after-done.txt | sed 's/^/next rest counting down after Done (want 1+): /' | tee -a shots/rest-real.txt
sleep 16
notes over-3 >/dev/null; grep -c "android.title=String (Time for set 3)" shots/over-3.txt | sed 's/^/"Time for set 3" rang by itself (want 1+): /' | tee -a shots/rest-real.txt
shade 4c-set-3
tapDone over-3
cdp heard | grep -v '^pages' | tee -a shots/rest-real.txt
# back in the app: the website takes its notification away, and the alert goes with it (by itself: "closed 0" below)
cdp watch | grep -v '^pages' | tee -a shots/rest-real.txt
adb shell am start -n app.aven.android/com.google.androidbrowserhelper.trusted.LauncherActivity
sleep 3
cdp seen | grep -v '^pages' | tee -a shots/rest-real.txt
cdp clear | tee -a shots/rest-real.txt
timeout 10 adb shell input keyevent KEYCODE_HOME
sleep 3
notes real-after-clear
grep -c "pkg=app.aven.android" shots/real-after-clear.txt | sed 's/^/aven notifications left after clear: /' | tee -a shots/rest-real.txt
timeout 20 adb logcat -d -s AvenRest | tee -a shots/rest-real.txt
timeout 20 adb logcat -d -b events | grep -i "notification_cancel\|notification_enqueue" | grep -i aven | tail -30 | tee -a shots/rest-real.txt
timeout 20 adb logcat -d | grep -i "OriginVerifier\|TrustedWebActivity\|TWAConnectionPool\|digital asset\|RestTimer\|ForegroundService\|AvenRest" | tail -40 | tee -a shots/carry-over.txt

# 3. the app sees the data saved in Chrome's tab before it was first opened
adb shell am start -n app.aven.android/com.google.androidbrowserhelper.trusted.LauncherActivity
sleep 4
cdp get | tee -a shots/carry-over.txt
timeout 15 adb shell dumpsys activity activities | grep -m2 "ResumedActivity" | tee -a shots/carry-over.txt
timeout 15 adb exec-out screencap -p > shots/6b-app.png

# 3b. the watch's numbers come back in the address (HealthActivity → AvenLauncher → Chrome, "#hc=…") while Aven is
# already open. Omar's phone: a short answer ("not allowed") got through, the full one never did. Which sizes arrive?
hcsize() { python3 - "$1" "$2" <<'PY'
import base64, json, sys, time
n = int(sys.argv[1]); k = int(sys.argv[2]); now = int(time.time() * 1000)
ex = [{"id": "%036d" % i, "t": "walk", "s": now - (i + 1) * 3600000, "e": now - (i + 1) * 3600000 + 1800000, "src": "com.sec.android.app.shealth", "hr": 120, "hx": 150, "kc": 200, "m": 2000} for i in range(n)]
# k days of minute-by-minute detail (heart rate and steps every minute, a night of stages)
ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
full = "".join(ABC[x >> 6] + ABC[x & 63] for x in (60 + (i % 120) for i in range(1440)))
dt = [{"d": time.strftime("%Y-%m-%d", time.localtime(now / 1000 - i * 86400)), "hm": full, "sm": full, "sp": [[now - 9 * 3600000, now - 3600000, 1, 0, 20, 2, 20, 45, 3, 65, 25]]} for i in range(k)]
o = {"v": 1, "avail": True, "on": True, "granted": True, "at": now, "days": [], "ex": ex, "dt": dt}
print(base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("="))
PY
}
# (the address is written to a file on the phone and read there: adb's own command line has a length limit of its own)
for nk in "0 0" "5 0" "20 0" "60 0" "120 0" "20 1" "20 2" "20 3" "20 4" "20 5" "20 7"; do
  set -- $nk
  P=$(hcsize $1 $2)
  printf '%s' "${SITE}#hc=$P" > /tmp/hc-url.txt
  adb push /tmp/hc-url.txt /data/local/tmp/hc-url.txt >/dev/null
  adb logcat -c
  adb shell 'am start -n app.aven.android/.AvenLauncher --ez aven.fresh true -d "$(cat /data/local/tmp/hc-url.txt)"' 2>&1 | tail -1 | sed "s/^/am: /" | tee -a shots/hc-size.txt
  sleep 7
  cdp hclast | grep -v '^pages' | sed "s/^/$1 workouts + $2 detail days (${#P} chars): /" | tee -a shots/hc-size.txt
  timeout 10 adb logcat -d | grep -i "TransactionTooLarge\|AndroidRuntime\|aven\|cr_" | tail -4 | sed 's/^/  log: /' | tee -a shots/hc-size.txt
done

# 3c. Connect watch for real, from the page in the app, with Health Connect access already given (Omar's phone: the
# pop-up closed and no answer ever reached Aven)
for x in READ_STEPS READ_EXERCISE READ_HEART_RATE READ_ACTIVE_CALORIES_BURNED READ_DISTANCE READ_SLEEP READ_RESTING_HEART_RATE \
    READ_HEART_RATE_VARIABILITY READ_WEIGHT READ_BODY_FAT READ_VO2_MAX READ_OXYGEN_SATURATION READ_RESPIRATORY_RATE \
    READ_TOTAL_CALORIES_BURNED READ_FLOORS_CLIMBED READ_HEALTH_DATA_HISTORY; do
  adb shell pm grant app.aven.android android.permission.health.$x 2>&1 | head -1 | sed "s/^/grant $x: /" | tee -a shots/hc-connect.txt
done
adb logcat -c
cdp connect | grep -v '^pages' | tee -a shots/hc-connect.txt
sleep 14
cdp hclast | grep -v '^pages' | sed "s/^/after connect: /" | tee -a shots/hc-connect.txt
timeout 15 adb exec-out screencap -p > shots/7-after-connect.png
timeout 20 adb logcat -d | grep -i "AvenHealth\|ActivityTaskManager: START\|Displayed app.aven\|HealthActivity\|AvenLauncher\|LauncherActivity\|ExternalNav\|cr_TWA\|Background activity\|BAL\|AndroidRuntime" | tail -60 | tee -a shots/hc-connect.txt

# 4. Omar's path: the app's notifications off, then switched on in Settings later. When does the website see it?
perm() { timeout 10 adb shell am start -n app.aven.android/com.google.androidbrowserhelper.trusted.LauncherActivity; sleep 8
  cdp perm | grep -v '^pages' | sed "s/^/$1: /" | tee -a shots/perm-path.txt; timeout 10 adb shell input keyevent KEYCODE_HOME; sleep 2; }
adb shell pm revoke app.aven.android android.permission.POST_NOTIFICATIONS
adb shell pm set-permission-flags app.aven.android android.permission.POST_NOTIFICATIONS user-set user-fixed
adb shell am force-stop app.aven.android
perm "switched off, app restarted"
adb shell am force-stop com.android.chrome
perm "switched off, Chrome restarted too"
adb shell pm clear-permission-flags app.aven.android android.permission.POST_NOTIFICATIONS user-fixed
adb shell pm grant app.aven.android android.permission.POST_NOTIFICATIONS
adb shell am force-stop app.aven.android
perm "switched on, app restarted"
adb shell am force-stop com.android.chrome
perm "switched on, Chrome restarted too"
exit 0
