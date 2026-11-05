# Traking GO

Plataforma de rastreo GPS para flotillas: portal web, app de Android y kit para instalar el servidor.

| Carpeta | Qué contiene |
|---|---|
| `web/` | La app web (React + MapLibre) que habla con un servidor Traccar. Ver `web/README.md`. |
| `servidor/` | Kit para instalar todo en un servidor Ubuntu con Docker. Ver `servidor/GUIA.md`. |
| `android/` | App de Android que abre el portal. Ver `android/LEEME.md`. |

## Funciones

- Mapa en vivo con 5 tipos de mapa gratuitos (OpenFreeMap y satélite de Esri).
- Historial de rutas, geocercas, alertas y corte de motor.
- Mantenimiento y conductores.
- Empresas independientes con su logo, usuarios y permisos, administradas desde el Panel Maestro.
- Reportes descargables en Excel y PDF.
- App instalable en el celular con avisos push (Firebase, opcional).

## Arranque rápido

```bash
cd web
npm install
cp .env.example .env      # pon la dirección de tu servidor Traccar
npm run dev
```

Demo sin servidor (datos de prueba en el navegador): `VITE_DEMO=1 npm run build -- --outDir dist-demo`.

> La llave de firma de Android (`android/keystore/`) y los archivos `.env` no se suben al repositorio.
