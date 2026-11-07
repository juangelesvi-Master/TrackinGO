# TracKING GO · App web

Primera versión de la app de rastreo de flota. Se conecta a un servidor **Traccar** y muestra:

- Pantallas de cuenta: iniciar sesión y recuperar contraseña por correo. No hay "Crear cuenta": las cuentas las da el Maestro o el administrador de cada empresa.
- **Panel Maestro** (solo la cuenta Maestro): alta, edición y baja de **empresas**. Cada empresa tiene su propio administrador y ve solo lo suyo: vehículos, usuarios, choferes, mantenimiento, geocercas y alertas. Se le puede poner logo, máximo de vehículos y de usuarios, asignarle vehículos, desactivarla o ponerle fecha de vencimiento. Con **Entrar** el Maestro abre el portal de una empresa para darle soporte (para volver hay que salir e iniciar sesión otra vez). En Admin → Usuarios el Maestro ve a qué empresa pertenece cada usuario. Al borrar una empresa se borran también sus usuarios; sus vehículos se quedan en la cuenta Maestro.
- **Logo de cada empresa**: sale en el portal de la empresa y de todos sus usuarios, y en sus reportes PDF.
- **App para celular**: se instala desde el navegador (Android: "Instalar la app"; iPhone: Compartir → Agregar a pantalla de inicio). Con Firebase configurado en el servidor, las alertas llegan al celular aunque la app esté cerrada (ver `../servidor/GUIA.md`).
- Mapa con todos los vehículos, en vivo (verde = en línea, gris = sin conexión, ámbar = desconocido; la flechita indica hacia dónde va).
- Lista de vehículos con buscador, velocidad y último reporte. Al hacer clic en uno, el mapa va hacia él y muestra su ficha.
- **Historial**: recorrido de un vehículo en un día, con kilómetros, velocidad máxima, paradas y reproducción del trayecto.
- **Reportes** (Excel y PDF): Resumen (km, velocidad máxima y promedio, horas de motor, paradas y excesos por vehículo), Viajes, Paradas y Excesos de velocidad. Por periodo (hoy, ayer, 7 días, este mes, mes pasado o fechas a elegir) y por vehículos. El PDF lleva el logo de la empresa.
- **Geocercas**: dibujar zonas (círculo o polígono) en el mapa y elegir a qué vehículos aplican.
- **Alertas**: avisos en pantalla al momento (entrada/salida de geocerca, exceso de velocidad, desconexión, motor encendido/apagado, alarmas como SOS), lista de las últimas 24 horas, y opción de recibirlas por correo.
- **Corte de motor**: botones para apagar y reactivar el motor, con confirmación (hay que escribir el nombre del vehículo) y aviso si va en movimiento.
- **Admin**: alta, edición y baja de vehículos (con límite de velocidad y ajuste del odómetro), y para administradores, usuarios y qué vehículos ve cada uno.
- **Usuarios y permisos** (en Admin, solo administradores): el administrador de cada empresa crea a su personal con usuario y contraseña (puede generarla), le da un rol (Supervisor, Monitorista, Solo ver o Personalizado) y elige qué vehículos ve. Al crearla se muestran los datos de acceso listos para copiar y mandar. Se puede desactivar el acceso o ponerle fecha de vencimiento. Los permisos se aplican también en el servidor (Traccar), no solo se ocultan en pantalla.
- **Choferes** (en Admin): registro con licencia, teléfono y vencimiento de licencia; asignación de un chofer por vehículo, visible en la ficha del vehículo. Si el vehículo tiene lector de tarjeta, se muestra el chofer que la pasó.
- **Mantenimiento** (en Admin): servicios por kilómetros o por fecha para cada vehículo, con estado Al día / Próximo / Vencido, botón “Marcar hecho” y aviso cuando toca (regla “Mantenimiento” en Alertas).

## Cómo ejecutarla en tu computadora

1. Instala **Node.js** (versión 20 o más nueva) desde https://nodejs.org.
2. Abre una terminal en esta carpeta (`web`) y ejecuta:

   ```bash
   npm install
   cp .env.example .env
   npm run dev
   ```

3. Abre http://localhost:5173 en el navegador.

## Probarla sin tener servidor propio

Por defecto la app usa el servidor de demostración gratuito de Traccar (`https://demo.traccar.org`):

1. Entra a https://demo.traccar.org y crea una cuenta gratis.
2. Para tener un "vehículo" de prueba, instala en tu celular la app **Traccar Client** (Android/iOS). En esa app pon como servidor `http://demo.traccar.org:5055` y copia su **identificador del dispositivo**.
3. En demo.traccar.org agrega un dispositivo con ese identificador.
4. Entra a nuestra app (http://localhost:5173) con el mismo correo y contraseña. (En el servidor de demostración tu cuenta no es Maestro, así que no verás esa pestaña.) Verás tu celular moverse en el mapa.

## Usar tu propio servidor Traccar

Edita el archivo `.env` y cambia la dirección:

```
TRACCAR_URL=https://gps.tuempresa.com
```

y vuelve a ejecutar `npm run dev`.

## Cuentas y empresas

- **Maestro**: es el administrador del servidor Traccar (la primera cuenta que se crea, ver `../servidor/GUIA.md`, paso 5). Ve todo y es el único con la pestaña Maestro.
- **Empresa**: en Traccar es un usuario "manager" (con límite de usuarios distinto de 0). Traccar mismo se encarga de que solo vea sus vehículos, los usuarios que crea y sus geocercas, choferes, mantenimientos y alertas.
- **Usuarios de una empresa**: los crea el administrador de la empresa en Admin → Usuarios, y solo ven los vehículos que él les asigna.
- El registro público del servidor debe quedar apagado, para que nadie se cree una cuenta por su cuenta.
- **Recuperar contraseña** necesita que el servidor tenga configurado un correo de salida (SMTP) en `traccar.xml`, y que `web.url` apunte a la dirección de esta app, para que el enlace del correo abra nuestra pantalla `/reset-password`.

## Roles

| Rol | Mapa en vivo y alertas | Historial | Geocercas y reglas de alerta | Corte de motor | Vehículos, choferes, mantenimiento | Usuarios |
|---|---|---|---|---|---|---|
| Maestro | ✓ (todos los de todas las empresas) | ✓ | ✓ | ✓ | ✓ | ✓ y empresas |
| Administrador de empresa | ✓ (los de su empresa) | ✓ | ✓ | ✓ | ✓ | ✓ (los suyos) |
| Supervisor | ✓ | ✓ | ✓ | ✓ | — | — |
| Monitorista | ✓ | ✓ | — | — | — | — |
| Solo ver | ✓ | — | — | — | — | — |

## Cosas que dependen del servidor o del rastreador

- **Corte de motor** solo aparece si Traccar sabe mandar esa orden al modelo de rastreador (depende de la marca y del protocolo) y si el equipo tiene el relevador instalado en el vehículo. Si no, la ficha dice que no lo admite.
- **Exceso de velocidad** usa el límite que pongas a cada vehículo en Admin.
- **Motor encendido/apagado** necesita que el rastreador reporte la ignición.
- **Alertas por correo** necesitan el correo de salida configurado en el servidor.
- Las alertas en pantalla llegan mientras la app está abierta. Con la app abierta o cerrada, al celular llegan solo si se configuró Firebase y la persona activó "Avisos en el celular".
- En Traccar cada regla de aviso pertenece a un usuario. Al activar una regla, la app la comparte con el personal de esa empresa, y a cada usuario nuevo le comparte las reglas activas.

## Archivos principales

- `src/traccar.ts`: conexión con la API de Traccar (sesión, vehículos, posiciones y actualizaciones en vivo).
- `src/auth/`: pantallas de iniciar sesión, recuperar y cambiar contraseña.
- `src/router.ts`: navegación entre pantallas.
- `src/Fleet.tsx`: estructura principal (pestañas, datos en vivo, avisos).
- `src/panels/`: cada pestaña (en vivo, historial, reportes, geocercas, alertas, admin, maestro) y el corte de motor.
- `src/reports.ts`: arma los reportes y los archivos Excel y PDF.
- `src/push.ts` y `public/sw.js`: instalación en el celular y avisos push.
- `src/brand.ts`: logo y nombre de cada empresa.
- `src/mapUtil.ts`: utilidades del mapa y del formato de geocercas de Traccar.
- `src/labels.ts`: textos en español de los eventos.
- `src/FleetMap.tsx`: mapa con los vehículos.
- `vite.config.ts`: en desarrollo reenvía `/api` al servidor Traccar de `.env`.

Para publicarla en un servidor propio, sigue la guía `../servidor/GUIA.md`.
