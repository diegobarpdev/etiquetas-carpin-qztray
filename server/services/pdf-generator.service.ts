import puppeteer, { Browser } from 'puppeteer';
import {
  getPrintSizeForTemplate,
  LabelPrintSize,
} from '../config/constants';
import { LabelData } from '../types';
import { renderLabel, RenderedLabel } from '../templates/registry';

let browserInstance: Browser | null = null;

const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
      headless: true,
      args: PUPPETEER_ARGS,
    };

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    browserInstance = await puppeteer.launch(launchOptions);
  }
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

function collectCssByTemplate(renderedLabels: RenderedLabel[]): Map<string, string> {
  const cssByTemplate = new Map<string, string>();
  for (const rendered of renderedLabels) {
    if (cssByTemplate.has(rendered.templateCode)) continue;
    const styleMatch = rendered.html.match(/<style>([\s\S]*?)<\/style>/);
    if (styleMatch) {
      cssByTemplate.set(rendered.templateCode, styleMatch[1]);
    }
  }
  return cssByTemplate;
}

function sizesEqual(a: LabelPrintSize, b: LabelPrintSize): boolean {
  return a.widthMm === b.widthMm && a.heightMm === b.heightMm;
}

function buildPageStyle(printSize?: LabelPrintSize | null): string {
  const pageRule = printSize
    ? `@page {
      size: ${printSize.widthMm}mm ${printSize.heightMm}mm;
      margin: 0;
    }`
    : '';

  const sizeWidth = printSize ? `${printSize.widthMm}mm` : 'auto';
  const sizeHeight = printSize ? `${printSize.heightMm}mm` : 'auto';

  return `
    ${pageRule}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label-page {
      width: ${sizeWidth};
      height: ${sizeHeight};
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
      position: relative;
      background: #fff;
    }
    .label-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .label-scaler {
      transform-origin: top left;
    }
    @media screen {
      html, body {
        min-height: 100%;
        background: #e5e7eb;
      }
      body {
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
      }
      .label-page {
        flex: 0 0 auto;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.14);
      }
    }
    @media print {
      html, body {
        width: ${sizeWidth};
        height: auto;
        background: #fff !important;
        padding: 0 !important;
        display: block !important;
      }
      .label-page {
        box-shadow: none !important;
        margin: 0 !important;
      }
    }
  `;
}

function buildPreviewScreenStyle(): string {
  return `
    body.preview-mode {
      background: #e5e7eb;
      padding: 1.5rem;
      margin: 0;
      min-height: 0;
      overflow: hidden;
    }
    body.preview-mode .preview-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.4rem;
      margin: 0 auto 1.25rem;
      width: fit-content;
      max-width: 100%;
    }
    body.preview-mode .preview-page:last-child {
      margin-bottom: 0;
    }
    body.preview-mode .preview-page-num {
      align-self: flex-start;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      background: #1e293b;
      color: #f8fafc;
      font: 600 0.72rem/1.2 system-ui, sans-serif;
      letter-spacing: 0.01em;
    }
    body.preview-mode .label-page {
      margin: 0;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
      background: #fff;
      page-break-after: auto;
      break-after: auto;
    }
  `;
}

function extractLabelBody(html: string): string {
  const bodyMatch = html.match(/<body>([\s\S]*?)<\/body>/);
  return bodyMatch ? bodyMatch[1] : html;
}

export interface BuildLabelsHtmlOptions {
  preview?: boolean;
  labelIndex?: number;
  stockSizeCode?: string | null;
  printSizeOverride?: LabelPrintSize | null;
}

/**
 * Tamaño de la hoja = tamaño nativo de la plantilla.
 * El stock solo elige impresora/papel; no escala ni cambia el mm de la etiqueta.
 */
function resolvePageSize(
  templateCode: string,
  options: BuildLabelsHtmlOptions,
): LabelPrintSize {
  if (options.printSizeOverride) return options.printSizeOverride;
  return getPrintSizeForTemplate(templateCode);
}

function wrapLabelToPage(
  body: string,
  designSize: LabelPrintSize,
  pageSize: LabelPrintSize,
): string {
  if (sizesEqual(designSize, pageSize)) {
    return body;
  }

  const scaleX = pageSize.widthMm / designSize.widthMm;
  const scaleY = pageSize.heightMm / designSize.heightMm;

  return `<div class="label-scaler" style="width:${designSize.widthMm}mm;height:${designSize.heightMm}mm;transform:scale(${scaleX},${scaleY})">${body}</div>`;
}

export async function buildLabelsHtml(
  labels: LabelData[],
  options: BuildLabelsHtmlOptions = {},
): Promise<string> {
  if (labels.length === 0) {
    throw new Error('No hay etiquetas para generar');
  }

  const renderedLabels = await Promise.all(labels.map((label) => renderLabel(label)));
  const cssByTemplate = collectCssByTemplate(renderedLabels);

  const labelIndex =
    options.labelIndex !== undefined ? options.labelIndex : undefined;
  const slice =
    labelIndex !== undefined
      ? renderedLabels.slice(labelIndex, labelIndex + 1)
      : renderedLabels;

  if (slice.length === 0) {
    throw new Error('Índice de etiqueta fuera de rango');
  }

  const pageSizeForCss =
    options.printSizeOverride ?? getPrintSizeForTemplate(slice[0].templateCode);
  const pageStyle = buildPageStyle(pageSizeForCss);
  const previewStyle = options.preview ? buildPreviewScreenStyle() : '';
  const totalPages = slice.length;

  const labelPages = slice.map((r, idx) => {
    const designSize = getPrintSizeForTemplate(r.templateCode);
    const pageSize = resolvePageSize(r.templateCode, options);
    const body = wrapLabelToPage(extractLabelBody(r.html), designSize, pageSize);
    const pageHtml = `<div class="label-page" data-template="${r.templateCode}" style="width:${pageSize.widthMm}mm;height:${pageSize.heightMm}mm">${body}</div>`;

    if (!options.preview) return pageHtml;

    const pageNum = idx + 1;
    return `<div class="preview-page">
      <div class="preview-page-num">Página ${pageNum} de ${totalPages}</div>
      ${pageHtml}
    </div>`;
  });

  const bodyClass = options.preview ? ' class="preview-mode"' : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${pageStyle}</style>
  ${previewStyle ? `<style>${previewStyle}</style>` : ''}
  ${[...cssByTemplate.entries()].map(([code, css]) => `<style data-template="${code}">${css}</style>`).join('\n')}
</head>
<body${bodyClass}>
  ${labelPages.join('\n')}
</body>
</html>`;
}

async function renderHtmlToPdf(html: string, printSize: LabelPrintSize): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'load' });

    // Pulgadas exactas evita MediaBox “raro” que Windows marca como User defined.
    const widthIn = printSize.widthMm / 25.4;
    const heightIn = printSize.heightMm / 25.4;

    // preferCSSPageSize:false — impone el stock (p.ej. 100×150). Si es true,
    // Chromium a veces toma un @page de plantilla más chico (conforme) y el ZPL sale pequeño.
    const pdf = await page.pdf({
      width: `${widthIn.toFixed(4)}in`,
      height: `${heightIn.toFixed(4)}in`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: false,
    });

    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

/**
 * Genera un PDF con el tamaño nativo de cada plantilla.
 * El stockSize no altera el tamaño de página (solo impresora/papel en el agente).
 */
export async function generateLabelsPdf(
  labels: LabelData[],
  options: BuildLabelsHtmlOptions = {},
): Promise<Buffer> {
  if (labels.length === 0) {
    throw new Error('No hay etiquetas para generar');
  }

  const groups = new Map<string, LabelData[]>();
  for (const label of labels) {
    const size = getPrintSizeForTemplate(label.templateCode);
    const key = `${size.widthMm}x${size.heightMm}`;
    const group = groups.get(key) ?? [];
    group.push(label);
    groups.set(key, group);
  }

  if (groups.size === 1) {
    const size = getPrintSizeForTemplate(labels[0].templateCode);
    const html = await buildLabelsHtml(labels, {
      ...options,
      stockSizeCode: null,
    });
    return renderHtmlToPdf(html, size);
  }

  // Varios tamaños: escalamos al de la primera etiqueta para un solo PDF.
  const primarySize = getPrintSizeForTemplate(labels[0].templateCode);
  const html = await buildLabelsHtml(labels, {
    ...options,
    stockSizeCode: null,
    printSizeOverride: primarySize,
  });
  return renderHtmlToPdf(html, primarySize);
}
