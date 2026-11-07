#!/usr/bin/env bash
# Compila TracKING GO para Android sin Android Studio.
# Necesita (Ubuntu): android-sdk-build-tools android-sdk-platform-23 dalvik-exchange apksigner zipalign y un JDK.
# Uso: ./build.sh            (firma con keystore/trakinggo.jks; pide la clave en KEYSTORE_PASS)
set -euo pipefail
cd "$(dirname "$0")"
SDK=/usr/lib/android-sdk
BT=$SDK/build-tools/debian
JAR=$SDK/platforms/android-23/android.jar
OUT=build
rm -rf $OUT && mkdir -p $OUT/res $OUT/gen $OUT/classes

$BT/aapt2 compile --dir res -o $OUT/res/res.zip
$BT/aapt2 link -o $OUT/unsigned.apk -I $JAR --manifest AndroidManifest.xml \
  --min-sdk-version 23 --target-sdk-version 34 --java $OUT/gen $OUT/res/res.zip --auto-add-overlay

javac -source 8 -target 8 -bootclasspath $JAR -classpath $JAR -Xlint:-options -encoding UTF-8 \
  -d $OUT/classes $(find src $OUT/gen -name '*.java')
dalvik-exchange --dex --min-sdk-version=23 --output=$OUT/classes.dex $OUT/classes
(cd $OUT && zip -q -j unsigned.apk classes.dex)

$BT/zipalign -f -p 4 $OUT/unsigned.apk $OUT/aligned.apk
apksigner sign --ks keystore/trakinggo.jks --ks-pass env:KEYSTORE_PASS --ks-key-alias trakinggo \
  --min-sdk-version 23 --out $OUT/TrakingGO.apk $OUT/aligned.apk
apksigner verify --print-certs $OUT/TrakingGO.apk | head -3
echo "Listo: $OUT/TrakingGO.apk"
