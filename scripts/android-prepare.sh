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
cp android-res/values/ic_launcher_background.xml android/app/src/main/res/values/ic_launcher_background.xml

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

# Version
GRADLE=android/app/build.gradle
sed -i -E "s/versionCode [0-9]+/versionCode ${VERSION_CODE}/; s/versionName \"[^\"]*\"/versionName \"${VERSION_NAME}\"/" "$GRADLE"

# Portrait only, like the web app
sed -i 's/android:name="com.getcapacitor.myapp.MainActivity"/android:name="com.getcapacitor.myapp.MainActivity"\n            android:screenOrientation="portrait"/' android/app/src/main/AndroidManifest.xml || true
grep -q 'screenOrientation' android/app/src/main/AndroidManifest.xml || sed -i '0,/android:name=".MainActivity"/s//android:name=".MainActivity"\n            android:screenOrientation="portrait"/' android/app/src/main/AndroidManifest.xml
echo "Prepared Android project: ${VERSION_NAME} (${VERSION_CODE})"
