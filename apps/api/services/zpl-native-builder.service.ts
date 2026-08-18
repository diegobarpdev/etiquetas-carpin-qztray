import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PNG } from 'pngjs';
import { LabelData } from '../types';
import { PRODUCTO_TERMINADO_FACTORY_FOOTER } from '../config/constants';
import {
  mmToDots,
  buildHardwareLines,
  encodeBitmapZ64,
  scaleRgbaNearest,
  HardwareOptions,
  PngToZplResult,
} from './zpl-shared.util';

/**
 * Generador ZPL nativo (texto/QR con comandos ^A0/^BQ/^GB, sin Puppeteer ni
 * rasterización) para las plantillas cuyo layout es fijo en mm — ver
 * docs/evaluacion-zpl-nativo.md. Coexiste con el path legacy
 * (Puppeteer→PDF→PNG→^GFA) mientras no esté validado en impresora real.
 */
export const NATIVE_ZPL_TEMPLATES = new Set(['bulto-estandar', 'colchon-v1', 'colchon-v2']);

export function supportsNativeZpl(templateCode: string): boolean {
  return NATIVE_ZPL_TEMPLATES.has(templateCode);
}

const LOGO_PATH = join(__dirname, '..', 'assets', 'colineallogo.png');
const logoFieldCache = new Map<number, { field: string; widthDots: number; heightDots: number }>();

/** PNG (archivo fijo, no depende de datos del label) → campo ^GFA reusable. */
function getLogoGfaField(dpi: number, widthMm: number, heightMm: number) {
  const cached = logoFieldCache.get(dpi);
  if (cached) return cached;
  if (!existsSync(LOGO_PATH)) return null;

  const parsed = PNG.sync.read(readFileSync(LOGO_PATH));
  const targetW = mmToDots(widthMm, dpi);
  const targetH = mmToDots(heightMm, dpi);
  const rgba = scaleRgbaNearest(parsed.data, parsed.width, parsed.height, targetW, targetH);

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
  const result = {
    field: `^GFA,${totalBytes},${totalBytes},${bytesPerRow},${graphicData}`,
    widthDots: targetW,
    heightDots: targetH,
  };
  logoFieldCache.set(dpi, result);
  return result;
}

/** ^ y ~ son prefijos de comando ZPL — no deben aparecer en datos literales. */
function zplText(value: unknown): string {
  return String(value ?? '')
    .replace(/\^/g, '')
    .replace(/~/g, '');
}

function ptToDots(pt: number, dpi: number): number {
  return Math.max(1, Math.round((pt / 72) * dpi));
}

interface FieldOpts {
  dpi: number;
  xMm: number;
  yMm: number;
  fontPt: number;
  text: string;
}

/** Campo de una línea, ^A0 (fuente vectorial escalable). */
function textField({ dpi, xMm, yMm, fontPt, text }: FieldOpts): string {
  const h = ptToDots(fontPt, dpi);
  const x = mmToDots(xMm, dpi);
  const y = mmToDots(yMm, dpi);
  return `^FO${x},${y}^A0N,${h},${h}^FD${zplText(text)}^FS`;
}

interface BlockFieldOpts extends FieldOpts {
  widthMm: number;
  maxLines: number;
  justify?: 'L' | 'C' | 'R';
}

/** Campo con reflow (^FB) para texto de largo variable (título, nombre corto). */
function blockTextField({
  dpi,
  xMm,
  yMm,
  widthMm,
  fontPt,
  maxLines,
  justify = 'L',
  text,
}: BlockFieldOpts): string {
  const h = ptToDots(fontPt, dpi);
  const x = mmToDots(xMm, dpi);
  const y = mmToDots(yMm, dpi);
  const w = mmToDots(widthMm, dpi);
  return `^FO${x},${y}^A0N,${h},${h}^FB${w},${maxLines},0,${justify},0^FD${zplText(text)}^FS`;
}

function graphicBox(dpi: number, xMm: number, yMm: number, widthMm: number, heightMm: number, thicknessMm = 0.35): string {
  const x = mmToDots(xMm, dpi);
  const y = mmToDots(yMm, dpi);
  const w = mmToDots(widthMm, dpi);
  const h = mmToDots(Math.max(heightMm, 0.01), dpi);
  const t = mmToDots(thicknessMm, dpi);
  return `^FO${x},${y}^GB${w},${h},${t}^FS`;
}

/** ^BQ (QR Code, Model 2). "QA," = modo automático + corrección M por defecto. */
function qrField(dpi: number, xMm: number, yMm: number, sizeMm: number, magnification: number, data: string): string {
  const x = mmToDots(xMm, dpi);
  const y = mmToDots(yMm, dpi);
  return `^FO${x},${y}^BQN,2,${magnification}^FDQA,${zplText(data)}^FS`;
}

interface DimensionsTableOpts {
  dpi: number;
  xMm: number;
  bottomMm: number;
  widthMm: number;
  labelHeightMm: number;
  rows: Array<[string, string]>;
}

function dimensionsTable({ dpi, xMm, bottomMm, widthMm, labelHeightMm, rows }: DimensionsTableOpts): string {
  const rowHeightMm = 6;
  const tableHeightMm = rowHeightMm * rows.length;
  const topMm = labelHeightMm - bottomMm - tableHeightMm;
  const labelColMm = widthMm / 2;
  const fields: string[] = [];

  fields.push(graphicBox(dpi, xMm, topMm, widthMm, tableHeightMm, 0.3));
  fields.push(graphicBox(dpi, xMm + labelColMm, topMm, 0.3, tableHeightMm, 0.3));
  for (let i = 1; i < rows.length; i += 1) {
    fields.push(graphicBox(dpi, xMm, topMm + i * rowHeightMm, widthMm, 0.3, 0.3));
  }

  rows.forEach(([label, value], idx) => {
    const rowTop = topMm + idx * rowHeightMm + 1.6;
    fields.push(textField({ dpi, xMm: xMm + 1.2, yMm: rowTop, fontPt: 8, text: label }));
    fields.push(textField({ dpi, xMm: xMm + labelColMm + 1.2, yMm: rowTop, fontPt: 8, text: value }));
  });

  return fields.join('\n');
}

export interface NativeZplOptions extends HardwareOptions {
  dpi: number;
  copies?: number;
}

/** Construye el bloque ^XA...^XZ nativo para bulto-estandar/colchon-v1/colchon-v2. */
export function buildNativeLabelZpl(label: LabelData, options: NativeZplOptions): PngToZplResult {
  const code = label.templateCode;
  if (!NATIVE_ZPL_TEMPLATES.has(code)) {
    throw new Error(`Plantilla sin generador ZPL nativo: ${code}`);
  }

  const dpi = options.dpi;
  const widthMm = 150;
  const heightMm = 100;
  const widthDots = mmToDots(widthMm, dpi);
  const heightDots = mmToDots(heightMm, dpi);

  const twoQr = !label.showInternalRefQr;
  const lotForQr = String(label.qrLotNumber || '').trim() || String(label.orderName || '').trim();
  const lotNumberDisplay =
    String(label.lotNumber || '').trim() || String(label.orderName || '').trim() || 'SIN LOTE';
  const factoryFooter = label.factoryFooter ?? PRODUCTO_TERMINADO_FACTORY_FOOTER;

  const fields: string[] = [];

  // Marco.
  fields.push(graphicBox(dpi, 4, 4, widthMm - 8, heightMm - 8, 0.35));

  // Logo.
  const logo = getLogoGfaField(dpi, 14, 14);
  if (logo) {
    const x = mmToDots(6.5, dpi);
    const y = mmToDots(5.5, dpi);
    fields.push(`^FO${x},${y}${logo.field}^FS`);
  }

  // Título + nombre corto (reflow a 2 líneas).
  fields.push(
    blockTextField({
      dpi,
      xMm: 22,
      yMm: 6.5,
      widthMm: 122,
      fontPt: 10.5,
      maxLines: 2,
      justify: 'L',
      text: label.productName.toUpperCase(),
    }),
  );
  fields.push(
    blockTextField({
      dpi,
      xMm: 27,
      yMm: 54.5,
      widthMm: 96,
      fontPt: 8.5,
      maxLines: 2,
      justify: 'C',
      text: String(label.shortName || '').toUpperCase(),
    }),
  );

  if (code === 'bulto-estandar') {
    fields.push(
      textField({ dpi, xMm: 45, yMm: 71.5, fontPt: 10, text: `BULTO: ${label.bultoCurrent}-${label.bultoTotal}` }),
    );
    fields.push(textField({ dpi, xMm: 45, yMm: 77.5, fontPt: 10, text: `CANTIDAD: ${label.quantity}` }));
  } else {
    fields.push(
      textField({ dpi, xMm: 45, yMm: 65.5, fontPt: 10, text: `SERIAL: ${label.serialCurrent}/${label.serialTotal}` }),
    );
    // CSS ancla este bloque desde bottom:10mm (max-height 22mm v1 / 24mm v2) —
    // hay que calcular el top real según cuántas líneas trae el texto, no un
    // top fijo, o las instrucciones largas (colchon-v2) pisan el pie de fábrica.
    const finishFontPt = code === 'colchon-v1' ? 10 : 9;
    const finishLines = String(label.finishInstructions || '')
      .toUpperCase()
      .split('\n')
      .filter(Boolean);
    const finishLineHeightMm = (finishFontPt / 72) * 25.4 * 1.25;
    const finishBottomMm = 10;
    const finishStartYMm = heightMm - finishBottomMm - finishLines.length * finishLineHeightMm;
    finishLines.forEach((line, idx) => {
      fields.push(
        blockTextField({
          dpi,
          xMm: 30,
          yMm: finishStartYMm + idx * finishLineHeightMm,
          widthMm: 90,
          fontPt: finishFontPt,
          maxLines: 1,
          justify: 'C',
          text: line,
        }),
      );
    });
  }

  const pesoTopMm = code === 'bulto-estandar' ? 69 : 74;
  const fechaTopMm = code === 'bulto-estandar' ? 78.5 : 82;
  fields.push(textField({ dpi, xMm: 7, yMm: pesoTopMm, fontPt: 8, text: 'PESO' }));
  fields.push(textField({ dpi, xMm: 7, yMm: pesoTopMm + 3.6, fontPt: 9.5, text: `${label.weightKg} Kg` }));
  fields.push(textField({ dpi, xMm: 7, yMm: fechaTopMm, fontPt: 8, text: 'FECHA:' }));
  fields.push(textField({ dpi, xMm: 7, yMm: fechaTopMm + 3.6, fontPt: 9.5, text: String(label.productionDate) }));

  fields.push(
    dimensionsTable({
      dpi,
      xMm: 108,
      bottomMm: 12.5,
      widthMm: 34,
      labelHeightMm: heightMm,
      rows: [
        ['ALTO', String(label.height)],
        ['LARGO', String(label.length)],
        ['ANCHO', String(label.width)],
        ['VOLUMEN', `${label.volumeM3} m3`],
      ],
    }),
  );

  // QR 1: SKU. QR2 (opcional): REF/SUB. QR3: lote.
  const qr1X = twoQr ? 32 : 18;
  const qr3X = twoQr ? 90 : 104;
  const qr1TextX = twoQr ? 28 : 14;
  const qr3TextX = twoQr ? 86 : 100;

  fields.push(textField({ dpi, xMm: qr1TextX + 4, yMm: 18.5, fontPt: 6.5, text: `SKU ${label.ean}` }));
  fields.push(qrField(dpi, qr1X, 24.5, 28, 6, label.qrSku));

  if (!twoQr) {
    fields.push(
      textField({
        dpi,
        xMm: 61,
        yMm: 18.5,
        fontPt: 6.5,
        text: `${label.showKitSubproduct ? 'SUB' : 'REF'} ${label.internalRef}`,
      }),
    );
    fields.push(qrField(dpi, 61, 24.5, 28, 6, label.qrInternalRef));
  }

  fields.push(textField({ dpi, xMm: qr3TextX + 4, yMm: 18.5, fontPt: 6.5, text: `No. LOTE ${lotNumberDisplay}` }));
  fields.push(qrField(dpi, qr3X, 24.5, 28, 6, lotForQr));

  // Línea + pie de fábrica.
  const factoryLineTopMm = code === 'bulto-estandar' ? 88 : 90.5;
  const factoryTopMm = code === 'bulto-estandar' ? 90.5 : 92.5;
  fields.push(graphicBox(dpi, 6, factoryLineTopMm, 138, 0, 0.35));
  fields.push(
    blockTextField({
      dpi,
      xMm: 6,
      yMm: factoryTopMm,
      widthMm: 138,
      fontPt: 6.5,
      maxLines: 2,
      justify: 'C',
      text: factoryFooter,
    }),
  );

  const copies = Math.max(1, Number(options.copies) || 1);
  const hardware = buildHardwareLines(options);

  const zpl = [
    '^XA',
    '^CI28',
    '^PON',
    '^LRN',
    '^LH0,0',
    '^LS0',
    '^LT0',
    ...hardware,
    `^PW${widthDots}`,
    `^LL${heightDots}`,
    ...fields,
    copies > 1 ? `^PQ${copies},0,1,Y` : '^PQ1,0,1,Y',
    '^XZ',
    '',
  ].join('\r\n');

  return { zpl, widthDots, heightDots, widthMm, heightMm };
}
