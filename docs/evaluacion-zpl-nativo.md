# Evaluación: migrar de HTML→Puppeteer→ZPL a ZPL nativo

Fecha: 2026-08-17. Contexto: hoy la generación de etiquetas es
`plantilla Handlebars (.hbs+.css) → HTML → Puppeteer arma el PDF (tamaño
exacto en mm) → mupdf rasteriza a PNG → el PNG se convierte a un bitmap ZPL
comprimido (^GFA + Z64) → se manda por QZ Tray`.

Esta nota evalúa qué tan grande sería reescribir ese camino para generar
**ZPL nativo** (`^A0` para texto, `^BC`/`^BQ`/`^BE` para códigos de barra,
posiciones en dots) y saltarse Puppeteer/mupdf enteros en el camino de
impresión — no toca la vista previa en pantalla, que ya usa el HTML/CSS
directo en el navegador sin pasar por Puppeteer.

## Por qué se podría querer

- Sin Chrome headless: menos CPU/memoria por etiqueta, arranque más rápido.
- ZPL nativo es más chico y se imprime más rápido en el cabezal que un
  bitmap rasterizado completo.
- Texto más nítido a baja resolución (fuente vectorial del firmware vs.
  bitmap).

## Costo

Cada plantilla queda con **dos representaciones separadas** que hay que
mantener sincronizadas: el HTML/CSS de la vista previa (sin cambios) y un
generador ZPL nuevo para la impresión real — hoy son la misma fuente.

## Códigos de barra/QR (mapeo directo, no es el problema)

- **QR** (`qrcode` npm) → `^BQ` de ZPL. 1:1.
- **EAN13** (`bwip-js`) → `^BE`. 1:1, y `^BE` ya dibuja el dígito de margen
  aparte del gráfico automáticamente (hoy en HTML eso se simula con un
  `<span>` de texto separado — en ZPL nativo ese truco desaparece).
- **Code128** (código secundario "Carpenter tela": `00` + 5 dígitos OPR +
  6 dígitos N/S, ver `apps/api/utils/barcode.ts:35-44`) → `^BC`. Es solo
  construcción de string + `^BC`, trivial.

## Tabla por plantilla (`apps/api/templates/labels/*`)

| Plantilla | Tamaño | Códigos | Veredicto | Por qué |
|---|---|---|---|---|
| `bulto-estandar` | 150×100mm | 3 QR | **Trivial** | Posicionamiento absoluto ya en mm (listo para pasar a dots), sin rotación, un solo `if` (2 vs 3 QR) con las 2 coordenadas ya fijas en el CSS. |
| `colchon-v1` | 150×100mm | 3 QR | **Trivial** | Igual que bulto-estandar + un bloque de texto estático multilínea (instrucciones fijas). |
| `colchon-v2` | 150×100mm | 3 QR | **Trivial** | Clon de v1, solo cambian tamaños de fuente. Los 3 (bulto+v1+v2) se podrían migrar con una sola rutina genérica. |
| `producto-conforme` | 100×70mm | 2 QR | **Moderado** | Grid simple sin rotación, pero el condicional "kit-subproducto" cambia la CANTIDAD de filas (no solo mueve algo existente) — hay que calcular el reflow vertical a mano. |
| `producto-conforme-papel` | 60×90mm | 2 QR | **Moderado** | Mismo condicional kit-subproducto. Tiene `rotate(90deg)` en CSS, pero eso en realidad *ayuda* en ZPL (ver nota abajo). |
| `producto-conforme-papel-colchones` | 60×100mm | 2 QR | **Moderado** | Clon del anterior con offset vertical distinto. |
| `producto-terminado-carpenter` | 150×100mm | EAN13+Code128 | **Moderado** | Sin condicionales estructurales, pero el layout usa columnas fraccionarias (flexbox/grid "fluido") en vez de mm fijos — hay que traducir proporciones a offsets fijos a mano. |
| `carpinteria` | 100×70mm | EAN13+Code128 | **Moderado** | Mismo problema de layout fluido que producto-terminado-carpenter, sin condicionales. |
| `carpenter-tela` | 60×90mm | EAN13+Code128 | **Moderado-difícil** | Layout fluido + rotación + un condicional (`showBultoLine`) que cambia cantidad de líneas y desplaza todo lo de abajo — el navegador lo resuelve solo, en ZPL hay que escribir esa lógica a mano. Es la plantilla con más factores combinados. |
| `materia-prima` (legacy) | — | — | Fuera de alcance | `isActive: false` en el seed, placeholder muerto. |
| `velador-simple` (legacy) | — | — | Fuera de alcance | `isActive: false` en el seed, placeholder muerto. |

## Hallazgo clave: la rotación 90° no complica, ayuda

`carpenter-tela`, `producto-conforme-papel` y `producto-conforme-papel-colchones`
usan `transform: rotate(90deg)` en CSS para encajar un diseño horizontal en
un rollo de papel angosto y alto. El propio código ya admite que es un
parche incómodo — `apps/api/templates/labels/bulto-estandar/styles.css:1`
dice *"Sin rotate CSS: Puppeteer PDF lo rompe"*. ZPL soporta rotación de
campo nativa por elemento (`^FWR`, o el parámetro de orientación en
`^A0`/`^BQ`/`^BC`), sin necesidad de rotar un lienzo entero. Lo caro de
portar a ZPL no es la rotación ni los códigos de barra — es traducir los
layouts "fluidos" (proporciones flexbox) a coordenadas fijas, y escribir a
mano el reflow vertical de los pocos condicionales que cambian cantidad de
líneas.

## Recomendación

Viable, ni tan grande ni tan chico. Si se hace en algún momento: arrancar
por `bulto-estandar`/`colchon-v1`/`colchon-v2` (ganancia rápida, bajo
riesgo, casi una sola rutina para los 3), dejar `carpenter-tela` para el
final.
