import { PNG } from 'pngjs';
import { generateLabelsPdf, BuildLabelsHtmlOptions } from './pdf-generator.service';
import { LabelData } from '../types';
import {
  mmToDots,
  buildHardwareLines,
  scaleRgbaNearest,
  encodeBitmapZ64,
  PrintMode,
  ThermalMethod,
  MediaType,
  HardwareOptions,
  PngToZplResult,
} from './zpl-shared.util';
import { buildNativeLabelZpl, supportsNativeZpl } from './zpl-native-builder.service';

export type { PrintMode, ThermalMethod, MediaType, HardwareOptions, PngToZplResult };
export { mmToDots, buildHardwareLines, scaleRgbaNearest, encodeBitmapZ64 };

const DEFAULT_DPI = 203;
/** Ancho máx. típico cabezal ZT230 200dpi (~4"). */
const MAX_PRINT_WIDTH_MM = 104;

let mupdfPromise: Promise<any> | null = null;
function loadMupdf(): Promise<any> {
  if (!mupdfPromise) mupdfPromise = import('mupdf');
  return mupdfPromise;
}

/** PDF (buffer en memoria) → PNG por página a `dpi`. Sin archivos temporales. */
async function renderPdfToPngBuffers(pdf: Buffer, dpi: number): Promise<Buffer[]> {
  const mupdf = await loadMupdf();
  const bytes = new Uint8Array(pdf);
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf');
  const scale = dpi / 72;
  const matrix = mupdf.Matrix.scale(scale, scale);
  const pages: Buffer[] = [];

  try {
    const pageCount = doc.countPages();
    for (let i = 0; i < pageCount; i += 1) {
      const page = doc.loadPage(i);
      try {
        const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
        try {
          pages.push(Buffer.from(pixmap.asPNG()));
        } finally {
          pixmap.destroy();
        }
      } finally {
        page.destroy();
      }
    }
  } finally {
    doc.destroy();
  }

  return pages;
}

/** Rota 90° antihorario (CSS rotate(-90deg)). */
function rotateRgba90Ccw(
  src: Buffer,
  sw: number,
  sh: number,
): { data: Buffer; width: number; height: number } {
  const dw = sh;
  const dh = sw;
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      const si = (y * sw + x) * 4;
      const dx = y;
      const dy = sw - 1 - x;
      const di = (dy * dw + dx) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return { data: out, width: dw, height: dh };
}

/**
 * Detecta ADHESIVO/PAPEL a partir del nombre de impresora (mismo criterio que
 * usaba print-agent/lib/browser-print.js:roleFromHint, ahora sin resolver
 * el dispositivo físico — el nombre alcanza).
 */
function roleFromPrinterName(name?: string): 'PAPEL' | 'ADHESIVO' | '' {
  const n = String(name || '').toUpperCase();
  if (/PAPEL/.test(n)) return 'PAPEL';
  if (/ADHESIVO|TELA/.test(n)) return 'ADHESIVO';
  if (/ZDESIGNER|ZT230|ZEBRA|ZTC/.test(n)) return 'ADHESIVO';
  return '';
}

/** Perfiles fijos por stock (colchones usan producto-terminado). */
function hardwareByStock(
  stockSizeCode: string | undefined,
  printerName: string | undefined,
  printDarkness: number,
  printDarknessPapel: number,
): HardwareOptions | null {
  const HARDWARE_BY_STOCK: Record<string, HardwareOptions> = {
    'conforme-papel': {
      printMode: 'cutter',
      thermalMethod: 'direct',
      mediaType: 'continuous',
      printDarkness: printDarknessPapel,
    },
    'conforme-papel-colchones': {
      printMode: 'cutter',
      thermalMethod: 'direct',
      mediaType: 'continuous',
      printDarkness: printDarknessPapel,
    },
    'producto-terminado': {
      printMode: 'tear',
      thermalMethod: 'direct',
      mediaType: 'gap',
      printDarkness,
    },
    'producto-conforme': {
      printMode: 'tear',
      thermalMethod: 'direct',
      mediaType: 'gap',
      printDarkness,
    },
    carpinteria: {
      printMode: 'tear',
      thermalMethod: 'direct',
      mediaType: 'gap',
      printDarkness,
    },
  };
  const role = roleFromPrinterName(printerName);
  if (role === 'PAPEL') return HARDWARE_BY_STOCK['conforme-papel'];
  return (stockSizeCode && HARDWARE_BY_STOCK[stockSizeCode]) || null;
}

function pngBufferToZpl(
  png: Buffer,
  options: {
    dpi: number;
    widthMm?: number;
    heightMm?: number;
    copies?: number;
  } & HardwareOptions,
): PngToZplResult {
  const dpi = options.dpi;
  let widthMm = Number(options.widthMm);
  let heightMm = Number(options.heightMm);
  const parsed = PNG.sync.read(png);

  let srcW = parsed.width;
  let srcH = parsed.height;
  let rgba: Buffer = parsed.data;

  const approxWmm = Number.isFinite(widthMm) && widthMm > 0 ? widthMm : (srcW / dpi) * 25.4;
  const approxHmm = Number.isFinite(heightMm) && heightMm > 0 ? heightMm : (srcH / dpi) * 25.4;

  // PDF horizontal > cabezal: rotar -90° (CCW) a vertical para Zebra (producto terminado 150×100).
  if (approxWmm > MAX_PRINT_WIDTH_MM && approxWmm > approxHmm) {
    const rot = rotateRgba90Ccw(rgba, srcW, srcH);
    rgba = rot.data;
    srcW = rot.width;
    srcH = rot.height;
    if (Number.isFinite(widthMm) && Number.isFinite(heightMm)) {
      const swap = widthMm;
      widthMm = heightMm;
      heightMm = swap;
    }
  }

  let targetW = srcW;
  let targetH = srcH;

  if (Number.isFinite(widthMm) && widthMm > 0 && Number.isFinite(heightMm) && heightMm > 0) {
    const wantW = mmToDots(widthMm, dpi);
    const wantH = mmToDots(heightMm, dpi);
    if (wantW !== srcW || wantH !== srcH) {
      targetW = wantW;
      targetH = wantH;
      rgba = scaleRgbaNearest(rgba, srcW, srcH, targetW, targetH);
    } else {
      targetW = wantW;
      targetH = wantH;
    }
  }

  const bytesPerRow = Math.ceil(targetW / 8);
  const totalBytes = bytesPerRow * targetH;
  const bitmap = Buffer.alloc(totalBytes, 0x00);

  for (let y = 0; y < targetH; y += 1) {
    for (let x = 0; x < targetW; x += 1) {
      const i = (y * targetW + x) * 4;
      const a = rgba[i + 3];
      const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      if (a > 64 && lum < 200) {
        bitmap[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  const graphicData = encodeBitmapZ64(bitmap);
  const copies = Math.max(1, Number(options.copies) || 1);
  const mmW =
    Number.isFinite(widthMm) && widthMm > 0
      ? Math.round(widthMm * 100) / 100
      : Math.round((targetW / dpi) * 25.4 * 100) / 100;
  const mmH =
    Number.isFinite(heightMm) && heightMm > 0
      ? Math.round(heightMm * 100) / 100
      : Math.round((targetH / dpi) * 25.4 * 100) / 100;

  const hardware = buildHardwareLines(options);

  const zpl = [
    '^XA',
    '^PON',
    '^LRN',
    '^LH0,0',
    '^LS0',
    '^LT0',
    ...hardware,
    `^PW${targetW}`,
    `^LL${targetH}`,
    `^FO0,0^GFA,${totalBytes},${totalBytes},${bytesPerRow},${graphicData}^FS`,
    copies > 1 ? `^PQ${copies},0,1,Y` : '^PQ1,0,1,Y',
    '^XZ',
    '',
  ].join('\r\n');

  return { zpl, widthDots: targetW, heightDots: targetH, widthMm: mmW, heightMm: mmH };
}

export interface GenerateLabelsZplOptions extends BuildLabelsHtmlOptions {
  stockSizeCode?: string;
  printerName?: string;
  copies?: number;
  dpi?: number;
  printMode?: PrintMode;
  thermalMethod?: ThermalMethod;
  mediaType?: MediaType;
  printSpeedIps?: number;
  printDarkness?: number;
  /**
   * Flag de prueba (fase 1 del ZPL nativo, ver docs/evaluacion-zpl-nativo.md).
   * 'native' fuerza el generador ^A0/^BQ para las plantillas que ya lo
   * soportan (bulto-estandar/colchon-v1/colchon-v2); el resto sigue por el
   * path legacy en la misma tanda. Sin este flag el comportamiento es
   * idéntico a antes — nadie lo usa por default todavía.
   */
  debugZplEngine?: 'native';
}

export interface GenerateLabelsZplResult {
  zpl: string;
  pages: number;
  nativeLabelsCount: number;
  widthMm: number;
  heightMm: number;
  widthDots: number;
  heightDots: number;
  dpi: number;
}

/**
 * Genera el PDF de las etiquetas (Puppeteer) y lo convierte a un único
 * stream ZPL (bitmap ^GFA comprimido Z64) listo para mandar crudo por QZ Tray.
 * Reemplaza al paso PDF→PNG→ZPL que antes hacía print-agent.
 */
export async function generateLabelsZpl(
  labels: LabelData[],
  options: GenerateLabelsZplOptions = {},
): Promise<GenerateLabelsZplResult> {
  const dpi = Number(options.dpi) || DEFAULT_DPI;
  const copies = Math.max(1, Math.min(99, Number(options.copies) || 1));
  const printDarkness = Number.isFinite(Number(process.env.PRINT_DARKNESS))
    ? Number(process.env.PRINT_DARKNESS)
    : NaN;
  const printDarknessPapel = Number.isFinite(Number(process.env.PRINT_DARKNESS_PAPEL))
    ? Number(process.env.PRINT_DARKNESS_PAPEL)
    : 25;

  const forced = hardwareByStock(
    options.stockSizeCode,
    options.printerName,
    printDarkness,
    printDarknessPapel,
  );

  const printMode = forced?.printMode ?? options.printMode ?? 'tear';
  // Solo papel/tela deja elegir método (transferencia/directa) — para el
  // resto el método viene fijo del perfil, no hay que confiar en lo que
  // mande el cliente (puede traer un valor viejo de otra estación).
  const isPapelStock =
    options.stockSizeCode === 'conforme-papel' ||
    options.stockSizeCode === 'conforme-papel-colchones' ||
    roleFromPrinterName(options.printerName) === 'PAPEL';
  const thermalMethod = isPapelStock
    ? options.thermalMethod ?? forced?.thermalMethod ?? 'direct'
    : forced?.thermalMethod ?? 'direct';
  const mediaType = forced?.mediaType ?? options.mediaType ?? 'gap';
  const printDarknessResolved =
    options.printDarkness != null
      ? Number(options.printDarkness)
      : forced?.printDarkness ?? undefined;
  const defaultSpeedIps = Number.isFinite(Number(process.env.PRINT_SPEED_IPS))
    ? Number(process.env.PRINT_SPEED_IPS)
    : 6;
  const printSpeedIps = Number(options.printSpeedIps) || defaultSpeedIps;

  // Fase 1 ZPL nativo: partir la tanda en nativo (sin Puppeteer) + legacy
  // (PDF→PNG→bitmap, como siempre), y volver a armar en el orden original.
  // Sin el flag, nativeIndices queda vacío y el comportamiento es idéntico
  // al de antes (todo por el path legacy, una sola llamada a Puppeteer).
  const nativeIndices: number[] = [];
  const legacyLabels: LabelData[] = [];
  const legacyOriginalIndex: number[] = [];
  labels.forEach((label, idx) => {
    if (options.debugZplEngine === 'native' && supportsNativeZpl(label.templateCode)) {
      nativeIndices.push(idx);
    } else {
      legacyLabels.push(label);
      legacyOriginalIndex.push(idx);
    }
  });

  const nativeResults = nativeIndices.map((idx) =>
    buildNativeLabelZpl(labels[idx], {
      dpi,
      copies,
      printMode,
      thermalMethod,
      mediaType,
      printSpeedIps,
      printDarkness: printDarknessResolved,
    }),
  );

  let legacyPages: PngToZplResult[] = [];
  if (legacyLabels.length > 0) {
    const pdf = await generateLabelsPdf(legacyLabels, {
      preview: options.preview,
      labelIndex: options.labelIndex,
      stockSizeCode: options.stockSizeCode,
      printSizeOverride: options.printSizeOverride,
    });

    const pngs = await renderPdfToPngBuffers(pdf, dpi);
    if (pngs.length === 0) {
      throw new Error('No se pudo rasterizar el PDF de etiquetas');
    }

    legacyPages = pngs.map((png) =>
      pngBufferToZpl(png, {
        dpi,
        copies,
        printMode,
        thermalMethod,
        mediaType,
        printSpeedIps,
        printDarkness: printDarknessResolved,
      }),
    );
  }

  const bodyByIndex = new Map<number, PngToZplResult>();
  nativeIndices.forEach((idx, i) => bodyByIndex.set(idx, nativeResults[i]));
  legacyOriginalIndex.forEach((idx, i) => bodyByIndex.set(idx, legacyPages[i]));
  const pages = labels.map((_, idx) => bodyByIndex.get(idx)!);

  const first = pages[0];
  const md =
    printDarknessResolved != null && Number.isFinite(Number(printDarknessResolved))
      ? Math.max(-30, Math.min(30, Math.round(Number(printDarknessResolved))))
      : null;
  const preamble = [
    '^XA',
    printMode === 'cutter' ? '^MMC' : '^MMT',
    thermalMethod === 'direct' ? '^MTD' : '^MTT',
    mediaType === 'continuous' ? '^MNN' : '^MNY',
    `^PR${Math.round(printSpeedIps)}`,
    ...(md != null ? [`^MD${md}`] : []),
    `^PW${first.widthDots}`,
    `^LL${first.heightDots}`,
    '^JUS',
    '^XZ',
    '',
  ].join('\r\n');

  return {
    zpl: `${preamble}${pages.map((p) => p.zpl).join('')}`,
    pages: pages.length,
    nativeLabelsCount: nativeIndices.length,
    widthMm: first.widthMm,
    heightMm: first.heightMm,
    widthDots: first.widthDots,
    heightDots: first.heightDots,
    dpi,
  };
}
