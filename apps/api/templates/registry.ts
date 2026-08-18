import Handlebars from 'handlebars';
import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import { FACTORY_INFO, PRODUCTO_TERMINADO_FACTORY_FOOTER } from '../config/constants';
import { LabelData } from '../types';
import {
  formatEan13Display,
  ean13Prefix,
  ean13BodyDisplay,
  generateEan13DataUri,
  generateCode128DataUri,
  buildCarpenterTelaSecondaryCode,
  formatCarpenterTelaSecondaryDisplay,
  carpenterTelaSecondaryPrefix,
  carpenterTelaSecondaryBody,
} from '../utils/barcode';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = join(__dirname, '..');
const TEMPLATES_DIR = join(__dirname, 'labels');

export interface RenderedLabel {
  html: string;
  templateCode: string;
}

function loadFile(dir: string, filename: string): string {
  const path = join(dir, filename);
  if (!existsSync(path)) {
    throw new Error(`Archivo de plantilla no encontrado: ${path}`);
  }
  const buffer = readFileSync(path);
  // Evitar CSS/HTML UTF-16 (p. ej. guardado desde Windows) que el navegador ignora.
  const isUtf16LeBom = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe;
  const isUtf16BeBom = buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff;
  const isUtf16LeNoBom =
    !isUtf16LeBom &&
    !isUtf16BeBom &&
    buffer.length >= 4 &&
    buffer[1] === 0 &&
    buffer[3] === 0;

  if (isUtf16LeBom || isUtf16LeNoBom) {
    return buffer.toString('utf16le').replace(/^\uFEFF/, '');
  }
  if (isUtf16BeBom) {
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let i = 2; i + 1 < buffer.length; i += 2) {
      swapped[i - 2] = buffer[i + 1];
      swapped[i - 1] = buffer[i];
    }
    return swapped.toString('utf16le').replace(/^\uFEFF/, '');
  }
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

const LOGO_CANDIDATES = ['colineallogo.png', 'logo-colineal.png'];
const CARPENTER_LOGO_CANDIDATES = [
  'carpenter-logo.jpeg',
  'carpenter-logo.jpg',
  'carpenter-logo.png',
  'carpenter-logo.svg',
  'logo-carpenter.png',
];
const LOGO_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp']);

function fileToDataUri(filePath: string): string {
  const buffer = readFileSync(filePath);
  const mimeByExt: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  };
  const mime = mimeByExt[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function getLogoFromCandidates(candidates: string[]): string | null {
  const assetsDir = join(API_ROOT, 'assets');

  for (const name of candidates) {
    const logoPath = join(assetsDir, name);
    if (existsSync(logoPath)) {
      return fileToDataUri(logoPath);
    }
  }

  return null;
}

function getLogoDataUri(): string {
  const fromCandidates = getLogoFromCandidates(LOGO_CANDIDATES);
  if (fromCandidates) return fromCandidates;

  const assetsDir = join(API_ROOT, 'assets');
  if (existsSync(assetsDir)) {
    const imageFile = readdirSync(assetsDir).find((file) =>
      LOGO_EXTENSIONS.has(extname(file).toLowerCase()),
    );
    if (imageFile) {
      return fileToDataUri(join(assetsDir, imageFile));
    }
  }

  // SVG placeholder si no hay logo
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" fill="#000"/>
    <text x="32" y="38" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="7" font-weight="bold">COLINEAL</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function getCarpenterLogoDataUri(): string {
  return getLogoFromCandidates(CARPENTER_LOGO_CANDIDATES) ?? getLogoDataUri();
}

/** QR "esqueleto" con leyenda SIN LOTE, para dejar claro que la orden no tiene lote. */
function buildMissingQrPlaceholder(caption = 'SIN LOTE'): string {
  // Patrones localizadores (esquinas) tipo QR, en gris, + leyenda central.
  const finder = (x: number, y: number) => `
    <g transform="translate(${x},${y})">
      <rect x="0" y="0" width="26" height="26" fill="none" stroke="#94a3b8" stroke-width="4"/>
      <rect x="9" y="9" width="8" height="8" fill="#94a3b8"/>
    </g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
    <rect x="1" y="1" width="118" height="118" fill="#fff" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4 3"/>
    ${finder(8, 8)}
    ${finder(86, 8)}
    ${finder(8, 86)}
    <rect x="34" y="52" width="52" height="18" rx="3" fill="#fff" stroke="#94a3b8" stroke-width="1.5"/>
    <text x="60" y="65" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#475569">${caption}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function generateQrDataUri(text: string): Promise<string> {
  const value = String(text || '').trim();
  if (!value) {
    return buildMissingQrPlaceholder('SIN LOTE');
  }
  return QRCode.toDataURL(value, {
    width: 120,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}

interface TemplateCacheEntry {
  template: Handlebars.TemplateDelegate;
  css: string;
  htmlMtime: number;
  cssMtime: number;
}

const templateCache = new Map<string, TemplateCacheEntry>();

function getFileMtime(path: string): number {
  return statSync(path).mtimeMs;
}

export function getTemplateFromFiles(code: string) {
  const dir = join(TEMPLATES_DIR, code);
  const htmlPath = join(dir, 'template.hbs');
  const cssPath = join(dir, 'styles.css');
  const htmlMtime = getFileMtime(htmlPath);
  const cssMtime = getFileMtime(cssPath);

  const cached = templateCache.get(code);
  if (cached && cached.htmlMtime === htmlMtime && cached.cssMtime === cssMtime) {
    return cached;
  }

  const htmlSource = loadFile(dir, 'template.hbs');
  const css = loadFile(dir, 'styles.css');
  const template = Handlebars.compile(htmlSource);

  const entry: TemplateCacheEntry = { template, css, htmlMtime, cssMtime };
  templateCache.set(code, entry);
  return entry;
}

export async function renderLabel(label: LabelData): Promise<RenderedLabel> {
  const code = label.templateCode;
  let template: Handlebars.TemplateDelegate;
  let css: string;

  try {
    const fromFiles = getTemplateFromFiles(code);
    template = fromFiles.template;
    css = fromFiles.css;
  } catch {
    throw new Error(`Plantilla no encontrada: ${code}`);
  }

  const lotNumberDisplay =
    String(label.lotNumber || '').trim() ||
    String(label.orderName || '').trim() ||
    'SIN LOTE';
  // Mismo valor en el QR: sin lote → OPR.
  const lotForQr =
    String(label.qrLotNumber || '').trim() ||
    String(label.orderName || '').trim();

  const usesCarpenterBarcodes =
    code === 'carpinteria' ||
    code === 'carpenter-tela' ||
    code === 'producto-terminado-carpenter';
  const usesCarpenterSecondaryCode =
    code === 'carpinteria' ||
    code === 'carpenter-tela' ||
    code === 'producto-terminado-carpenter';
  // N/S del código secundario = unidad de producto (no bulto físico).
  const nsSerial =
    label.orderUnitIndex != null
      ? label.orderUnitIndex + 1
      : label.serialCurrent;
  // Carpenter secundario: 00 + OPR(5) + N/S(6), exacto (ej. 0000861000001).
  const secondaryBarcodeValue = usesCarpenterSecondaryCode
    ? buildCarpenterTelaSecondaryCode(label.orderName, nsSerial)
    : label.internalRef;

  const [qrSku, qrLotNumber, barcodeEan, barcodeRef] = await Promise.all([
    generateQrDataUri(label.qrSku),
    generateQrDataUri(lotForQr),
    usesCarpenterBarcodes
      ? generateEan13DataUri(label.ean)
      : Promise.resolve(''),
    usesCarpenterSecondaryCode
      ? generateCode128DataUri(secondaryBarcodeValue)
      : usesCarpenterBarcodes
        ? generateEan13DataUri(secondaryBarcodeValue)
        : Promise.resolve(''),
  ]);

  const qrInternalRef = label.showInternalRefQr
    ? await generateQrDataUri(label.qrInternalRef)
    : '';

  const productionDateDisplay =
    code === 'producto-terminado-carpenter'
      ? String(label.productionDate || '').replace(/-/g, ' - ')
      : label.productionDate;

  const bodyHtml = template({
    ...label,
    shortName:
      (code === 'carpinteria' ||
        code === 'carpenter-tela' ||
        code === 'producto-terminado-carpenter') &&
      String(label.shortName || '').length > 25
        ? `${String(label.shortName).slice(0, 25)}...`
        : label.shortName,
    productionDate: productionDateDisplay,
    showBultoLine: Number(label.bultoTotal) > 1,
    lotNumber: lotNumberDisplay,
    qrSku,
    qrInternalRef,
    qrLotNumber,
    logoDataUri: getLogoDataUri(),
    carpenterLogoDataUri: getCarpenterLogoDataUri(),
    barcodeEan,
    barcodeRef,
    barcodeEanDisplay: formatEan13Display(label.ean),
    barcodeRefDisplay: usesCarpenterSecondaryCode
      ? formatCarpenterTelaSecondaryDisplay(secondaryBarcodeValue)
      : formatEan13Display(secondaryBarcodeValue),
    barcodeEanPrefix: ean13Prefix(label.ean),
    barcodeEanBody: ean13BodyDisplay(label.ean),
    barcodeRefPrefix: usesCarpenterSecondaryCode
      ? carpenterTelaSecondaryPrefix(secondaryBarcodeValue)
      : ean13Prefix(secondaryBarcodeValue),
    barcodeRefBody: usesCarpenterSecondaryCode
      ? carpenterTelaSecondaryBody(secondaryBarcodeValue)
      : ean13BodyDisplay(secondaryBarcodeValue),
    barcodeRefFull: secondaryBarcodeValue,
    factoryAddress: FACTORY_INFO.address,
    factoryPhone: FACTORY_INFO.phone,
    factoryEmail: FACTORY_INFO.email,
    factoryFooter:
      label.factoryFooter ??
      (label.templateCode === 'carpinteria' ||
      label.templateCode === 'carpenter-tela'
        ? `${FACTORY_INFO.address} ${FACTORY_INFO.phone} ${FACTORY_INFO.email}`
        : PRODUCTO_TERMINADO_FACTORY_FOOTER),
  });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${css}</style>
</head>
<body>${bodyHtml}</body>
</html>`;

  return { html, templateCode: code };
}

export function listAvailableTemplates(): string[] {
  const { readdirSync } = require('fs') as typeof import('fs');
  return readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}
