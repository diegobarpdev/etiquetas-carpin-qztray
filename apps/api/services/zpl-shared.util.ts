import { deflateSync } from 'zlib';

/**
 * Primitivas ZPL compartidas entre el path legacy (bitmap ^GFA,
 * zpl-generator.service.ts) y el nativo (^A0/^BQ/^GB,
 * zpl-native-builder.service.ts). Vive aparte para que ninguno de los
 * dos dependa del otro (zpl-generator sí importa de zpl-native-builder
 * para el flag de prueba — evita el ciclo).
 */

export type PrintMode = 'tear' | 'cutter';
export type ThermalMethod = 'transfer' | 'direct';
export type MediaType = 'gap' | 'continuous';

export interface HardwareOptions {
  printMode?: PrintMode;
  thermalMethod?: ThermalMethod;
  mediaType?: MediaType;
  printSpeedIps?: number;
  printDarkness?: number | null;
}

export interface PngToZplResult {
  zpl: string;
  widthDots: number;
  heightDots: number;
  widthMm: number;
  heightMm: number;
}

export function mmToDots(mm: number, dpi: number): number {
  return Math.max(1, Math.round((Number(mm) / 25.4) * dpi));
}

/** Líneas ^MM/^MT/^MN/^PR/^MD comunes a cualquier bloque ^XA...^XZ (bitmap o nativo). */
export function buildHardwareLines(options: HardwareOptions): string[] {
  const hardware: string[] = [];
  if (options.printMode) hardware.push(options.printMode === 'cutter' ? '^MMC' : '^MMT');
  if (options.thermalMethod) hardware.push(options.thermalMethod === 'direct' ? '^MTD' : '^MTT');
  if (options.mediaType) hardware.push(options.mediaType === 'continuous' ? '^MNN' : '^MNY');
  const speed = Number(options.printSpeedIps);
  if (Number.isFinite(speed) && speed >= 2) {
    hardware.push(`^PR${Math.max(2, Math.min(14, Math.round(speed)))}`);
  }
  const md = Number(options.printDarkness);
  if (Number.isFinite(md)) {
    hardware.push(`^MD${Math.max(-30, Math.min(30, Math.round(md)))}`);
  }
  hardware.push('^JUS');
  return hardware;
}

export function scaleRgbaNearest(
  src: Buffer,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Buffer {
  if (sw === dw && sh === dh) return src;
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y += 1) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / dh));
    for (let x = 0; x < dw; x += 1) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / dw));
      const si = (sy * sw + sx) * 4;
      const di = (y * dw + x) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return out;
}

/** Rota 90° antihorario (CSS rotate(-90deg)). Para bitmaps (^GFA) que no tienen parámetro de orientación propio. */
export function rotateRgba90Ccw(
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

/** CRC-16/XMODEM requerido por ZB64: init 0x0000. */
export function crc16Ccitt(buf: Buffer): number {
  let crc = 0x0000;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i] << 8;
    for (let b = 0; b < 8; b += 1) {
      if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff;
      else crc = (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/** Bitmap → :Z64: (zlib + base64). ~10× más chico que hex. */
export function encodeBitmapZ64(bitmap: Buffer): string {
  const compressed = deflateSync(bitmap, { level: 9 });
  const b64 = compressed.toString('base64');
  const crc = crc16Ccitt(Buffer.from(b64, 'ascii')).toString(16).toUpperCase().padStart(4, '0');
  return `:Z64:${b64}:${crc}`;
}
