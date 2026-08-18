# Etiquetas Colineal

Front React + API Express + impresión Zebra vía QZ Tray.

| Puerto | Proceso | Carpeta |
|--------|---------|---------|
| **3000** | Front (estático + proxy `/api` → API) | `apps/web/` |
| **3010** | API (órdenes Odoo, PDF, generación de ZPL) | `apps/api/` |

Monorepo con npm workspaces: cada app tiene su propio `package.json`/build, con un
solo `node_modules` hoisteado en la raíz.

Impresión: el server genera el ZPL (bitmap) de cada etiqueta y el browser lo manda
directo a la impresora vía **QZ Tray**, instalado localmente en la PC del operario
(o en la PC con la Zebra por USB, si la impresora está compartida por red hacia esa
PC). QZ Tray se conecta por WebSocket a `localhost` — no hay agente HTTP propio ni
instalador custom. Certificado de firma: el server expone `/api/qz/cert` y
`/api/qz/sign` (auto-firmado, clave en `apps/api/data/qz-key.pem`, fuera de git).

El puerto **3001 ya no se usa**.

## Arranque

```bash
npm install
npm run build
npm start          # API :3010 + front :3000
```

Desarrollo:

```bash
npm run dev        # Vite :3000 + API :3010
```

## Estructura

```
apps/web/      UI React (Vite) + servidor estático de producción (server.ts)
apps/api/      API Express + prisma/ + assets/ (logos) + data/ (config/certificado)
```

## Seguridad

**Toda la app (`/api/*`, salvo el propio desbloqueo) pide un PIN**
(`APP_ACCESS_PIN`) la primera vez que se abre en una PC. Al ingresarlo
queda una cookie `HttpOnly` válida por **30 días** ("confiar en esta PC")
— el operario no vuelve a loguearse en cada uso, solo cuando esa PC nunca
entró o pasaron los 30 días. Es un PIN de acceso general, **distinto** del
PIN de `Configuración → Impresoras` (`PRINT_ADMIN_PIN`, sesión de 30
minutos): ese segundo PIN sigue protegiendo solo el catálogo de
impresoras/estaciones, como una capa extra dentro de la app ya
desbloqueada.

Esto sigue asumiendo que **el server solo es alcanzable desde la red
interna de la fábrica**, nunca desde internet (sin VPN, sin
port-forward, sin túnel tipo Cloudflare — hubo uno hace tiempo, se dio de
baja, verificado que no corre ningún proceso/servicio/tarea programada de
eso hoy). El PIN de acceso frena a cualquiera que llegue a la red interna
sin ser operario; no reemplaza mantener esa red cerrada hacia afuera.

Lo que está cubierto hoy:
- `APP_ACCESS_PIN`: gate de sesión (30 días) sobre toda la API, con
  rate-limit y bloqueo progresivo por IP en `/api/app/unlock` igual que el
  de admin de impresoras.
- `PRINT_ADMIN_PIN`: segundo gate (sesión de 30 min) solo para
  `Configuración → Impresoras`.
- `X-Internal-Key` en `/api/*`: bloquea pedidos directos al puerto de la
  API que no pasen por el proxy del front (ver `apps/web/server.ts` /
  `apps/web/vite.config.ts`).
- Rate-limit (20/min por IP) en los 6 endpoints que renderizan PDF con
  Puppeteer — evita un DoS trivial por loop descontrolado.
- CORS con allowlist de orígenes (no refleja cualquier origen).

**¿Se olvidó un PIN, hay que rotarlo, o alguien se fue de la empresa y
hay que cortar el acceso ya?** Ver
[`docs/seguridad-auth.md`](docs/seguridad-auth.md) — ahí está el
procedimiento para cada caso. Resumen rápido:
- PIN olvidado: mirar el valor real en `.env` (`APP_ACCESS_PIN`/
  `PRINT_ADMIN_PIN`) y pasarlo de nuevo — no hace falta reiniciar nada.
- Rotar un PIN: cambiarlo en `.env` + reiniciar la API. Las sesiones ya
  abiertas siguen vivas hasta que expiren (no las corta el cambio de PIN).
- Cortar todo acceso ya (ej. alguien se va de la empresa): rotar
  `INTERNAL_API_KEY` (invalida TODAS las sesiones de una) — detalle en
  el doc.
