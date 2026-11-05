# Cómo poner Traking GO en línea

Esta carpeta instala en un solo servidor todo lo necesario:

- **Traccar**: recibe las señales de los rastreadores.
- **Base de datos** (PostgreSQL): guarda vehículos, usuarios y recorridos.
- **La app web de Teesa**, con candado de seguridad (HTTPS) automático y gratuito.

Lo haces una sola vez. Te toma cerca de una hora, y casi todo el tiempo es esperar.

---

## Lo que necesitas antes

1. **Una cuenta en DigitalOcean** (o cualquier proveedor de servidores con Ubuntu).
2. **Un dominio** que ya sea tuyo, por ejemplo `tuempresa.com`. La app vivirá en una dirección como `gps.tuempresa.com`.
3. **Esta carpeta `teesa-app`** completa, con `web` y `servidor` adentro.

## Paso 1. Crear el servidor

En DigitalOcean: **Create → Droplets**.

- Imagen: **Ubuntu 24.04 LTS**.
- Tamaño: **4 CPU / 8 GB de RAM**, suficiente para unos 200 vehículos y para crecer.
- Región: la más cercana a tus vehículos.
- Acceso: agrega una **SSH key** o una contraseña de root.
- Activa **Backups** (copias automáticas semanales del servidor completo).

Al terminar te da una **IP pública**, por ejemplo `164.90.10.20`. Anótala.

## Paso 2. Apuntar el dominio

Donde compraste el dominio (o en DigitalOcean → Networking → Domains), crea un registro:

| Tipo | Nombre | Valor |
|------|--------|-------|
| A    | gps    | la IP del servidor |

El cambio puede tardar desde unos minutos hasta un par de horas en verse en todo internet.

## Paso 3. Subir la carpeta al servidor

Desde tu computadora, en la carpeta que contiene `teesa-app`:

```bash
scp -r teesa-app root@164.90.10.20:/opt/
```

## Paso 4. Configurar y arrancar

Entra al servidor y ejecuta:

```bash
ssh root@164.90.10.20
cd /opt/teesa-app/servidor
cp .env.example .env
nano .env        # cambia DOMAIN y DB_PASSWORD; guarda con Ctrl+O, Enter, Ctrl+X
./instalar.sh
```

El script instala Docker, abre los puertos necesarios en el firewall y arranca todo. La primera vez tarda unos minutos porque compila la app.

## Paso 5. Primer ingreso

La app ya no tiene "Crear cuenta": las cuentas las das tú. Tu cuenta **Maestro** se crea una sola vez desde el panel original de Traccar:

1. En tu computadora abre una terminal y ejecuta (con la IP de tu servidor):

   ```bash
   ssh -L 8082:localhost:8082 root@164.90.10.20
   ```

2. Con esa ventana abierta, entra a `http://localhost:8082` y usa **Register / Registrarse**. **La primera cuenta queda como administrador del servidor**: esa es tu cuenta Maestro.
3. Ahí mismo, en **Configuración → Servidor**, apaga **Registro** para que nadie más pueda crearse una cuenta.
4. Entra a `https://gps.tuempresa.com` con esa cuenta. Verás la pestaña **Maestro**, donde das de alta cada empresa con su usuario y contraseña.

## Paso 6. Conectar los rastreadores

Cada rastreador se configura, casi siempre por SMS, con dos datos: la **dirección del servidor** (tu dominio o la IP) y el **puerto**. El puerto depende de la marca o del protocolo:

| Marca / protocolo | Puerto |
|---|---|
| Concox, JimiIoT (GT06) | 5023 |
| Teltonika | 5027 |
| Coban (GPS103) | 5001 |
| TK103 | 5002 |
| Queclink | 5004 |
| Suntech | 5011 |
| Sinotrack y genéricos H02 | 5013 |
| Meitrack | 5020 |
| App Traccar Client (celular) | 5055 |

Después, en la app: **Admin → + Agregar vehículo**, con el **IMEI** del equipo. En cuanto el equipo reporte, el vehículo aparece en el mapa.

> Cuando sepamos la marca de tus rastreadores, conviene dejar abierto solo su puerto. Así el servidor queda más protegido.

---

## Opcional

### Correo (alertas y recuperar contraseña)

Llena las líneas `SMTP_...` del archivo `.env` y reinicia con:

```bash
docker compose up -d
```

Con Gmail necesitas una **contraseña de aplicación**: en tu cuenta de Google, Seguridad → Verificación en dos pasos → Contraseñas de aplicaciones.

### Respaldos diarios de la base de datos

```bash
cd /opt/teesa-app/servidor
./respaldo.sh                                                     # prueba una vez
(crontab -l; echo "0 3 * * * /opt/teesa-app/servidor/respaldo.sh") | crontab -   # cada noche a las 3:00
```

Las copias se guardan en `servidor/respaldos/` y se conservan 14 días.

### Cuánto historial se guarda

Cada noche el servidor borra solo los recorridos y eventos con más de **180 días** (unos 6 meses), para que el disco no se llene.
No se borran vehículos, usuarios, empresas, geocercas ni alertas configuradas; solo el historial viejo, que ya no se podrá ver ni sacar en reportes.

Para cambiarlo, edita `HISTORY_DAYS` en `.env` (por ejemplo `365` para un año, o `0` para no borrar nunca) y aplica con:

```bash
cd /opt/teesa-app/servidor && docker compose up -d
```

Si quieres conservar el historial viejo, los respaldos diarios guardan copia de todo, pero solo 14 días.

### Panel original de Traccar (ajustes avanzados)

Algunos ajustes solo están en el panel original de Traccar (por ejemplo, el registro público, que debe quedar apagado). Por seguridad, ese panel no está abierto a internet. Para usarlo desde tu computadora:

```bash
ssh -L 8082:localhost:8082 root@164.90.10.20
```

Con esa ventana abierta, entra a `http://localhost:8082` en tu navegador, con tu misma cuenta de administrador.

### Instalar la app en el celular

No hace falta tienda de aplicaciones. Abre `https://gps.tuempresa.com` en el celular:

- **Android (Chrome):** en Alertas → Qué avisar toca **Instalar la app**, o en el menú ⋮ elige "Instalar aplicación".
- **iPhone (Safari):** botón Compartir → **Agregar a pantalla de inicio**. Después abre Teesa desde el ícono.

### Avisos en el celular

Para que las alertas lleguen aunque la app esté cerrada se usa Firebase de Google (gratis).

1. Entra a https://console.firebase.google.com y crea un proyecto (por ejemplo "teesa").
2. En **Configuración del proyecto → General → Tus apps**, agrega una app **Web**. Copia los datos que te muestra (`apiKey`, `projectId`, `messagingSenderId`, `appId`, etc.).
3. En **Configuración del proyecto → Cloud Messaging → Configuración web**, toca **Generar par de claves** y copia la clave.
4. En **Configuración del proyecto → Cuentas de servicio**, toca **Generar nueva clave privada**. Se descarga un archivo `.json`; súbelo al servidor, por ejemplo a `/opt/teesa-app/servidor/firebase.json`.
5. En el archivo `.env` del servidor llena (todo en una línea, entre comillas simples):

   ```
   NOTIFICATOR_TYPES=web,mail,firebase
   FIREBASE_WEB_CONFIG='{"apiKey":"...","authDomain":"...","projectId":"...","messagingSenderId":"...","appId":"...","vapidKey":"LA CLAVE DEL PASO 3"}'
   ```

   y para la clave privada ejecuta:

   ```bash
   echo "FIREBASE_SERVICE_ACCOUNT='$(jq -c . firebase.json)'" >> .env
   ```

6. Reinicia con `docker compose up -d --build`.
7. Cada persona activa los avisos en su celular en **Alertas → Qué avisar → Avisos en el celular**. Las reglas que se activen desde entonces también se mandan al celular.

En iPhone los avisos solo funcionan con la app instalada en la pantalla de inicio (iOS 16.4 o más nuevo).

### Actualizar la app cuando haya cambios

Sube la carpeta `web` nueva al servidor y ejecuta:

```bash
cd /opt/teesa-app/servidor && docker compose up -d --build
```

### Si algo no funciona

```bash
docker compose ps                  # ¿están los 3 servicios "running"?
docker compose logs -f traccar     # mensajes de Traccar (Ctrl+C para salir)
docker compose logs -f web         # mensajes del certificado HTTPS y de la app
```

Si el candado HTTPS no aparece, casi siempre el dominio todavía no apunta a la IP (Paso 2). Espera un rato y ejecuta `docker compose restart web`.

---

## Servidor de pruebas en casa (Coolify)

Para probar antes de pagar un droplet se puede usar un servidor en casa que ya tenga Coolify. Se usa `docker-compose.coolify.yml`, que no ocupa los puertos 80/443 de Coolify y no necesita dominio.

1. En Coolify: **+ New → Public Repository**, pega la dirección de este repositorio y elige el Build Pack **Docker Compose**.
2. En **Docker Compose Location** pon `/servidor/docker-compose.coolify.yml`.
3. En **Environment Variables** llena `DB_PASSWORD` (una contraseña larga) y `WEB_URL` (por ejemplo `http://192.168.1.109:8090`).
4. Dale **Deploy**.

Quedan así, dentro de la red de la casa:

| Qué | Dirección |
|---|---|
| App web de Traking GO | `http://IP-DEL-SERVIDOR:8090` |
| Panel original de Traccar | `http://IP-DEL-SERVIDOR:8082` |
| Rastreadores Teltonika | puerto `5027` (ábrelo en el módem hacia el servidor) |

La cuenta Maestro se crea igual que en el Paso 5, pero entrando directo a `http://IP-DEL-SERVIDOR:8082`.

> Sin HTTPS, el celular no deja instalar la app ni recibir avisos push. Para eso hace falta el servidor con dominio.
