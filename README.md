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
# o con PM2:
pm2 start ecosystem.config.cjs
pm2 save
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

## Supuesto de seguridad: LAN interna confiable

**Buscar/leer órdenes de Odoo e imprimir (`/api/orders`, `/api/views/*`,
`/api/labels/*`, `print-batch`, `print-direct`) no piden login.** Es a
propósito: el operario camina a la PC, busca la orden e imprime, sin
loguearse — así lo pidió el dueño del proyecto explícitamente, sabiendo el
trade-off.

Esto asume que **el server solo es alcanzable desde la red interna de la
fábrica**, nunca desde internet (sin VPN, sin port-forward, sin túnel tipo
Cloudflare — hubo uno hace tiempo, se dio de baja, verificado que no corre
ningún proceso/servicio/tarea programada de eso hoy). Si esto cambia
alguna vez (exposición externa por cualquier motivo), hay que agregar
autenticación real a los endpoints de impresión/lectura de datos **antes**
de exponerlo — el PIN de `Configuración → Impresoras`
(`PRINT_ADMIN_PIN`) solo protege el catálogo de impresoras, no estos
endpoints.

Lo que sí está cubierto hoy, independiente de ese supuesto:
- `X-Internal-Key` en `/api/*`: bloquea pedidos directos al puerto de la
  API que no pasen por el proxy del front (ver `apps/web/server.ts` /
  `apps/web/vite.config.ts`) — cierra el acceso desde la red que no sea
  vía la webapp, pero no reemplaza autenticación de usuario.
- Rate-limit (20/min por IP) en los 6 endpoints que renderizan PDF con
  Puppeteer — evita un DoS trivial por loop descontrolado.
- CORS con allowlist de orígenes (no refleja cualquier origen).
