#!/usr/bin/env bash
# Generates the native Android project and applies branding + versioning.
# Usage: scripts/android-prepare.sh <versionName> <versionCode>
set -euo pipefail
VERSION_NAME="${1:?versionName}"; VERSION_CODE="${2:?versionCode}"

[ -d android ] || npx cap add android
npx cap sync android

# Launcher icons + adaptive-icon background
for d in android-res/mipmap-*; do
  name=$(basename "$d")
  mkdir -p "android/app/src/main/res/$name"
  cp "$d"/*.png "android/app/src/main/res/$name/"
done
# Values: launcher background colour + branded launch theme (replaces the template styles.xml)
cp android-res/values/*.xml android/app/src/main/res/values/

# Drawables (shapes, branded splash) + notification layouts + AppWidget XML
mkdir -p android/app/src/main/res/drawable android/app/src/main/res/layout android/app/src/main/res/xml
cp android-res/drawable/*.xml android/app/src/main/res/drawable/
cp android-res/layout/*.xml android/app/src/main/res/layout/
if [ -d android-res/xml ]; then
  cp android-res/xml/*.xml android/app/src/main/res/xml/
fi

# Notification status-bar icon
for d in android-res/drawable-*; do
  name=$(basename "$d")
  mkdir -p "android/app/src/main/res/$name"
  cp "$d"/*.png "android/app/src/main/res/$name/"
done

# Native layer: MainActivity (insets, timer notification, backup files) + helpers
MAIN=$(find android/app/src/main/java -name MainActivity.java | head -1)
JAVA_DIR=$(dirname "$MAIN")
cp android-res/MainActivity.java "$MAIN"
cp android-res/java/*.java "$JAVA_DIR/"
echo "Installed native sources into $JAVA_DIR"

# Timer-finished alarm receiver (must be declared so it can wake the app)
MANIFEST=android/app/src/main/AndroidManifest.xml
if ! grep -q "TimerAlarmReceiver" "$MANIFEST"; then
  sed -i 's#</application>#    <receiver android:name=".TimerAlarmReceiver" android:exported="false" />\n    </application>#' "$MANIFEST"
fi
# Foreground service that owns the running-timer card (top of the shade, survives swiping the app away)
if ! grep -q "FOREGROUND_SERVICE_SPECIAL_USE" "$MANIFEST"; then
  sed -i 's#<application#<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />\n    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />\n    <application#' "$MANIFEST"
fi
if ! grep -q "TimerService" "$MANIFEST"; then
  sed -i 's#</application>#    <service android:name=".TimerService" android:exported="false" android:foregroundServiceType="specialUse">\n        <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="study_timer" />\n    </service>\n    </application>#' "$MANIFEST"
fi
# Notification buttons (Pause / Resume) — a manifest receiver runs even when the app process is dead
if ! grep -q "TimerActionReceiver" "$MANIFEST"; then
  sed -i 's#</application>#    <receiver android:name=".TimerActionReceiver" android:exported="false" />\n    </application>#' "$MANIFEST"
fi
# Android Home Screen AppWidgets
if ! grep -q "StudyWidgetProvider" "$MANIFEST"; then
  sed -i 's#</application>#    <receiver android:name=".StudyWidgetProvider" android:exported="true">\n        <intent-filter>\n            <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />\n        </intent-filter>\n        <meta-data android:name="android.appwidget.provider" android:resource="@xml/rj_study_widget_info" />\n    </receiver>\n    <receiver android:name=".FocusWidgetProvider" android:exported="true">\n        <intent-filter>\n            <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />\n        </intent-filter>\n        <meta-data android:name="android.appwidget.provider" android:resource="@xml/rj_focus_widget_info" />\n    </receiver>\n    </application>#' "$MANIFEST"
fi

# Cloud sync: the bundled WebView must be allowed to reach the sync server.
# (Capacitor templates already include this; re-assert it so a template change cannot break sync.)
if ! grep -q 'android.permission.INTERNET' "$MANIFEST"; then
  sed -i 's#<application#<uses-permission android:name="android.permission.INTERNET" />\n    <application#' "$MANIFEST"
fi

# Version
GRADLE=android/app/build.gradle
sed -i -E "s/versionCode [0-9]+/versionCode ${VERSION_CODE}/; s/versionName \"[^\"]*\"/versionName \"${VERSION_NAME}\"/" "$GRADLE"

# Orientation: NO manifest lock. A portrait lock makes Android show the app as a narrow strip in the
# middle of a tablet held in landscape. MainActivity keeps phones in portrait and lets tablets and
# foldables rotate freely and fill the whole screen (the web layout switches to the side-navigation
# layout from 1024 px wide). Also make sure nothing caps the window's aspect ratio.
sed -i '/android:screenOrientation=/d; /android:maxAspectRatio=/d; /android.max_aspect_ratio/d' "$MANIFEST"
if ! grep -q 'android:resizeableActivity' "$MANIFEST"; then
  sed -i '0,/<activity/s//<activity\n            android:resizeableActivity="true"/' "$MANIFEST"
fi
echo "Prepared Android project: ${VERSION_NAME} (${VERSION_CODE})"
