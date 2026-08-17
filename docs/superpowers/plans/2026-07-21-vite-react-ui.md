# Vite + React UI Implementation Plan

> **For agentic workers:** Execute task-by-task. User approved inline execution (2026-07-21).

**Goal:** Reemplazar la UI monolítica (`public/index.html` + JS vanilla + Astro stub) por una SPA React+Vite servida por Express `:3001`.

**Architecture:** Front en `src/web/` (Vite). API sin cambios en `src/server/standalone.ts` + `src/routes`. Prod: Express sirve `dist/`. Dev: Vite `:5173` con proxy a API `:3001`.

**Tech Stack:** React 18, Vite 5, TypeScript, Tailwind 3, lucide-react, notyf, tom-select (wrapper).

## Global Constraints

- No tocar Express `:3000`, `print-agent/`, instalador.
- Órdenes solo Odoo RO; sin Jasper.
- Puerto planta prod unificado `:3001`.
- Conservar look corporativo (IBM Plex, brand azul).
- No commits salvo que el usuario lo pida.

## File map

| Path | Role |
|------|------|
| `astro-etiquetas/vite.config.ts` | Vite root `src/web`, outDir `dist`, proxy `/api` |
| `astro-etiquetas/src/web/index.html` | Entry HTML |
| `astro-etiquetas/src/web/main.tsx` | React mount |
| `astro-etiquetas/src/web/App.tsx` | Shell |
| `astro-etiquetas/src/web/styles/app.css` | Tailwind only UI CSS |
| `astro-etiquetas/src/web/lib/api.ts` | fetch helpers |
| `astro-etiquetas/src/web/lib/printer-settings.ts` | port de `printer.js` |
| `astro-etiquetas/src/web/context/LabelsAppContext.tsx` | estado + acciones (port `app.js`) |
| `astro-etiquetas/src/web/components/*.tsx` | UI |
| `astro-etiquetas/src/server/standalone.ts` | static `dist` + SPA fallback; sin Astro |

### Task 1: Scaffold Vite+React+Tailwind

- [ ] Añadir deps React/Vite; quitar Astro del `package.json` y scripts
- [ ] Crear `vite.config.ts`, `tsconfig`, entry `src/web`
- [ ] `npm run build` del front debe emitir `dist/index.html`

### Task 2: CSS único + layout React

- [ ] Copiar/migrar `app.css` + reglas necesarias de `styles.css` a `src/web/styles/app.css`
- [ ] Componentes de layout (Topbar, paneles) con markup equivalente

### Task 3: Lógica de impresión (Context)

- [ ] Portar búsqueda OF, lote, selección, preview, print sidebar
- [ ] Portar `printer-settings` y admin impresoras

### Task 4: Express + limpieza

- [ ] `standalone.ts`: servir `dist`, SPA fallback, sin `public/index.html`
- [ ] Eliminar Astro pages/config, `public/index.html`, JS legacy UI
- [ ] `npm run dev` = vite + api; verificar `/api/health` y UI

### Task 5: Verificación

- [ ] `npm run build` OK
- [ ] Smoke: UI carga, busca templates/orders API
