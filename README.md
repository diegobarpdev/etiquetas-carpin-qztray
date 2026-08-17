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
