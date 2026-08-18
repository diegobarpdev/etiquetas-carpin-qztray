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

**Cuentas reales por persona** (email + clave), no un PIN compartido.
Cualquiera puede registrarse desde la pantalla de acceso, pero la cuenta
queda `pending` hasta que un admin la aprueba desde `Configuración →
Usuarios` — sin eso no puede loguearse. Hay 2 roles: `operario` (buscar
e imprimir) y `admin` (además, `Configuración → Impresoras/Inspectores/
Usuarios`). La sesión (cookie `HttpOnly`, `SameSite=Lax`, `Secure` si la
conexión es HTTPS) dura 30 días, pero el rol/estado del usuario se relee
de la base en cada request — aprobar, rechazar, promover o degradar a
alguien surte efecto de inmediato, sin esperar a que expire la sesión.

Pensado para exponerse más allá de la LAN de la fábrica (con TLS propio
delante) — a diferencia del PIN compartido de antes, cortar acceso a una
persona puntual ya no obliga a cambiarle la clave a todos. Aun así el
`X-Internal-Key` sigue siendo la única barrera contra pedidos directos al
puerto de la API sin pasar por el proxy del front.

Lo que está cubierto hoy:
- Auto-registro con aprobación de admin; claves con `scrypt` (nativo de
  Node, salteado, sin dependencia externa).
- Rol `admin`/`operario` releído en vivo desde la DB en cada request
  (`requireLogin`/`requireAdmin`, `apps/api/lib/user-session.ts`) — no
  hay claim de rol viajando en la cookie que pueda quedar desactualizado.
- Guarda de "último admin": no se puede rechazar ni degradar al único
  admin aprobado que queda (`apps/api/routes/admin-users.ts`).
- Rate-limit (10/min login, 5/min registro) por IP contra fuerza bruta,
  además del rate-limit (20/min por IP) en los 7 endpoints que renderizan
  PDF con Puppeteer.
- `X-Internal-Key` en `/api/*`: bloquea pedidos directos al puerto de la
  API que no pasen por el proxy del front (ver `apps/web/server.ts` /
  `apps/web/vite.config.ts`).
- CORS con allowlist de orígenes (no refleja cualquier origen).

**¿Cómo entro la primera vez, cómo apruebo gente, o alguien se fue de la
empresa y hay que cortar el acceso ya?** Ver
[`docs/seguridad-auth.md`](docs/seguridad-auth.md) — procedimiento para
cada caso. Resumen rápido:
- Primera vez: definir `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD`
  en `.env` antes de arrancar — crea el primer admin si no existe.
- Aprobar/rechazar/promover/resetear clave de alguien: `Configuración →
  Usuarios`, como cualquier otro admin.
- Cortar acceso a una persona ya: rechazarla desde ahí — efecto
  inmediato, no hace falta esperar a que expire su sesión.
- Cortar TODO acceso de una (ej. incidente grave): rotar
  `INTERNAL_API_KEY` en `.env` + reiniciar — invalida todas las sesiones
  de una (la firma de la cookie deja de calzar).
