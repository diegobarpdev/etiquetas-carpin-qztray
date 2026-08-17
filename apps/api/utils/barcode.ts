import bwipjs from 'bwip-js/node';

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function computeEan13CheckDigit(base12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = Number(base12[i]);
    sum += i % 2 === 0 ? n : n * 3;
  }
  return String((10 - (sum % 10)) % 10);
}

/** EAN-13 válido para barcode: 12 dígitos base + dígito de control calculado. */
export function ean13ForBarcode(value: string): string {
  const digits = digitsOnly(value);
  const base12 = digits.slice(0, 12).padStart(12, '0');
  return base12 + computeEan13CheckDigit(base12);
}

/** Últimos 5 dígitos del número OPR (ej. PLTEL/OPR/00861 → 00861). */
export function extractOprFiveDigits(orderName: string): string {
  const m = String(orderName || '').match(/OPR\/(\d+)/i);
  const digits = m ? m[1] : digitsOnly(orderName);
  return digits.slice(-5).padStart(5, '0');
}

/**
 * Código secundario Carpenter tela (13 dígitos exactos, sin dígito de control EAN):
 * 00 + 5 dígitos OPR + 6 dígitos N/S (unidad de producto).
 * Ej.: OPR 00354, N/S 1 → 0000354000001 ; N/S 2 → 0000354000002
 */
export function buildCarpenterTelaSecondaryCode(
  orderName: string,
  serialCurrent: number,
): string {
  const opr = extractOprFiveDigits(orderName);
  const serial = String(Math.max(0, Math.floor(Number(serialCurrent) || 0)))
    .padStart(6, '0')
    .slice(-6);
  return `00${opr}${serial}`;
}

/** Formato legible del secundario Carpenter tela: "0 000354 000001" */
export function formatCarpenterTelaSecondaryDisplay(code: string): string {
  const d = digitsOnly(code).padStart(13, '0').slice(0, 13);
  return `${d[0]} ${d.slice(1, 7)} ${d.slice(7)}`;
}

export function carpenterTelaSecondaryPrefix(code: string): string {
  return digitsOnly(code).padStart(13, '0').slice(0, 13)[0];
}

export function carpenterTelaSecondaryBody(code: string): string {
  const d = digitsOnly(code).padStart(13, '0').slice(0, 13);
  return `${d.slice(1, 7)} ${d.slice(7)}`;
}

/** Formato legible EAN-13: "7 861214 835924" */
export function formatEan13Display(value: string): string {
  const d = ean13ForBarcode(value);
  return `${d[0]} ${d.slice(1, 7)} ${d.slice(7)}`;
}

/** Primer dígito EAN-13 (va a la izquierda del código). */
export function ean13Prefix(value: string): string {
  return ean13ForBarcode(value)[0];
}

/** Cuerpo legible sin el primer dígito: "861214 835924" */
export function ean13BodyDisplay(value: string): string {
  const d = ean13ForBarcode(value);
  return `${d.slice(1, 7)} ${d.slice(7)}`;
}

export async function generateEan13DataUri(value: string): Promise<string> {
  const png = await bwipjs.toBuffer({
    bcid: 'ean13',
    text: ean13ForBarcode(value),
    scale: 3,
    height: 14,
    includetext: false,
  });
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** Code128 con el texto exacto (para Carpenter tela: sin check EAN). */
export async function generateCode128DataUri(value: string): Promise<string> {
  const text = String(value || '').trim();
  if (!text) return '';
  const png = await bwipjs.toBuffer({
    bcid: 'code128',
    text,
    scale: 3,
    height: 14,
    includetext: false,
  });
  return `data:image/png;base64,${png.toString('base64')}`;
}
