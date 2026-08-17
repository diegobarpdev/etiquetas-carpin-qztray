# Diseño: UI Vite + React (:3001)

**Fecha:** 2026-07-21  
**Estado:** pendiente de revisión  
**Decisión:** Enfoque A — SPA React con Vite; retirar Astro de la UI.

## Problema

La UI operativa vive en un monolito `astro-etiquetas/public/index.html` + JS vanilla (`app.js`, `printer.js`, `printers-admin.js`) y CSS duplicado (`app.css` / Tailwind + `styles.css` legacy). Astro solo tiene un stub que enlaza al HTML. Eso no escala y no aprovecha un framework de componentes.

## Objetivos

1. UI de impresión 100 % en **React + Vite**.
2. **Un solo pipeline CSS** (Tailwind desde `src/styles/app.css`).
3. Express en **:3001** sigue siendo el servidor de API + estáticos del front.
4. **No tocar** Express `:3000`, `print-agent/`, instalador, ni templates Handlebars de etiquetas.

## Fuera de alcance

- Reescritura del backend (`src/routes`, servicios Odoo/PDF/print-agent).
- Migración de plantillas de etiquetas a React.
- Cambios de marca/visual más allá de conservar el look corporativo ya aplicado (IBM Plex, azul brand).
- Renombrar la carpeta `astro-etiquetas` (opcional después; no bloquea).

## Arquitectura

```
Navegador (React SPA)
    │  fetch /api/*
    ▼
Express :3001
    ├── /api/*          (ya existe)
    ├── /health
    └── /*              estáticos Vite dist/ (prod)
                        o proxy Vite :5173 → API (dev)
```

- **Dev:** `vite` (HMR) + `tsx watch` del standalone Express; Vite hace proxy de `/api` y `/health` a `:3001`.
- **Prod:** `vite build` → `dist/client` (o `dist`); Express sirve ese directorio y hace fallback SPA (`index.html`) para rutas no-API.

Astro (`astro.config`, `src/pages`, adapter Node) se **elimina** de esta app cuando el SPA funcione.

## Estructura de carpetas (propuesta)

Dentro de `astro-etiquetas/` (nombre legacy por ahora):

```
src/
  server/           # Express standalone + API (sin cambio de contrato)
  routes/
  services/
  templates/        # etiquetas Handlebars (sin cambio)
  web/              # NUEVO — front React
    main.tsx
    App.tsx
    index.html      # entry Vite (o raíz web/)
    components/
      Topbar.tsx
      OrderSearch.tsx
      BatchPanel.tsx
      OrderPanel.tsx
      PreviewPanel.tsx
      PrintFab.tsx
      PrintSidebar.tsx
      PrintersAdmin.tsx
    hooks/
    lib/            # api client, printers helpers
    styles/
      app.css       # Tailwind (única fuente UI)
public/             # solo assets estáticos necesarios (fonts, favicon)
                    # sin index.html monolítico ni styles.css legacy
```

Scripts npm:

- `dev` — concurrently: Vite + Express API (+ opcional `css` si Tailwind va por PostCSS de Vite).
- `build` — `vite build` (+ build server si aplica).
- `start` — `NODE_ENV=production` Express sirviendo `dist`.

## Componentes y responsabilidades

| Componente | Responsabilidad |
|------------|-----------------|
| `Topbar` | Título, subtítulo, abrir admin impresoras |
| `OrderSearch` | Filtro OF, lista, añadir a lote |
| `BatchPanel` | Lote a imprimir |
| `OrderPanel` | Detalle OF, grupos, rangos, packing custom |
| `PreviewPanel` | Select plantilla, zoom, iframe preview |
| `PrintFab` + `PrintSidebar` | Flujo impresión Zebra / agente |
| `PrintersAdmin` | PIN, agentes, estaciones |

Estado: preferir **Context + hooks** (o un store mínimo) en lugar de un `app.js` global. Los `id` del DOM pueden desaparecer a favor de refs/estado React, siempre que la API y el flujo de impresión se preserven.

## CSS

- **Única fuente:** Tailwind en `src/web/styles/app.css` (migrar reglas útiles de `public/styles.css`).
- Eliminar: `public/styles.css`, `public/tailwind.css` generado a mano como segundo stylesheet, y links duplicados.
- Fuentes: IBM Plex (local o `@fontsource`) vía el entry CSS de Vite.
- Vendors UI: `tom-select`, `notyf`, `lucide-react` desde **npm** (no `public/vendor/` a largo plazo).

## JS legacy

Migración incremental aceptable:

1. Primera entrega usable: componentes React con markup + llamadas API portadas desde `app.js`.
2. Helpers de impresión (`printer.js`) → módulos `lib/print*.ts`.
3. Admin → `PrintersAdmin` + hook.
4. Borrar `public/app.js`, `printer.js`, `printers-admin.js`, `ui-kit.js`, `index.html`.

Paridad funcional requerida antes de borrar:

- Buscar OF en Odoo, lote, selección, preview HTML, imprimir vía agente, admin impresoras/estaciones.

## Servidor Express (`standalone.ts`)

Cambios:

- Quitar fallback a `public/index.html` monolítico.
- En producción: `express.static(distDir)` + SPA fallback.
- En desarrollo: no hace falta servir UI desde Express si Vite escucha en otro puerto; documentar URLs (`Vite :5173`, API `:3001`).
- Opcional: en prod un solo puerto `:3001` (recomendado para planta).

## Restricciones globales

- Puerto API/UI planta: **3001** (prod unificado).
- No romper **:3000**.
- Sin Jasper.
- Órdenes solo desde Odoo RO (`ODOO_DATABASE_URL`).
- Respuestas UI en español.

## Criterios de aceptación

1. Abrir la app en React (dev y prod) y completar: buscar OF → plantilla → vista previa → imprimir (o simular con agente disponible).
2. Admin de impresoras (PIN) funciona.
3. No existe `public/index.html` monolítico ni dependencia de Astro para la UI.
4. Un solo CSS de app (Tailwind); sin pelea `styles.css` vs `tailwind.css`.
5. `:3000` y print-agent intactos (smoke mínimo).

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Regresión en impresión | Portar `printer.js` con tests existentes / smoke manual |
| CSS roto al fusionar | Migrar por capas; comparar visualmente |
| Dev en dos puertos confunde en planta | Prod siempre `:3001` único; doc clara en README |

## No hacer en esta fase

- React Native / PWA.
- Auth de usuarios de planta (solo PIN admin actual).
- Sustituir iframe de preview por canvas React.
