# Traking GO para Android

App de Android que abre el portal https://trakinggo.noadstudios.online en pantalla completa.

- Archivo para instalar: `TrakingGO.apk`.
- Para apuntar a otro servidor, cambia `PORTAL` en `src/online/noadstudios/trakinggo/MainActivity.java`, sube `android:versionCode` en `AndroidManifest.xml` y vuelve a compilar con `./build.sh`.
- Los reportes en Excel y PDF se guardan con el diálogo "Guardar como" de Android.

## Llave de firma (importante)

`keystore/trakinggo.jks` firma la app y `keystore/clave.txt` es su contraseña. Guárdalas en un lugar seguro y no las compartas.
Cada versión nueva debe firmarse con esta misma llave; si se pierde, los celulares no aceptarán la actualización y habrá que desinstalar la app vieja.

## Compilar

En Ubuntu: `sudo apt install android-sdk-build-tools android-sdk-platform-23 dalvik-exchange apksigner zipalign openjdk-21-jdk`,
y luego `KEYSTORE_PASS="$(cat keystore/clave.txt)" ./build.sh`.
