import type { HardwareProfile, PrinterSelection, PrinterSettings } from '../types';

const STORAGE_KEY = 'colineal-printer-settings';

/** Perfil adhesivo / gap (mayoría de plantillas). */
export const ADHESIVO_HARDWARE: HardwareProfile = {
  printMode: 'tear',
  thermalMethod: 'direct',
  mediaType: 'gap',
};

/** Perfil fijo para conforme papel / Carpenter tela. */
export const PAPEL_HARDWARE: HardwareProfile = {
  printMode: 'cutter',
  thermalMethod: 'direct',
  mediaType: 'continuous',
};

/**
 * Hardware fijo por stock / plantilla.
 * colchon-v1/v2 usan stock producto-terminado.
 */
export const HARDWARE_BY_STOCK: Record<string, HardwareProfile> = {
  'producto-terminado': { ...ADHESIVO_HARDWARE },
  'producto-conforme': { ...ADHESIVO_HARDWARE },
  carpinteria: { ...ADHESIVO_HARDWARE },
  'conforme-papel': { ...PAPEL_HARDWARE },
  'conforme-papel-colchones': { ...PAPEL_HARDWARE },
};

export const DEFAULT_SETTINGS: PrinterSettings = {
  mode: 'direct',
  copies: 1,
  stockSize: 'producto-terminado',
  printMode: 'tear',
  thermalMethod: 'direct',
  mediaType: 'gap',
  selectedPrinterByStock: {},
};

/** Nombre exacto del papel en el driver Zebra / Windows. */
export const DRIVER_PAPER_BY_STOCK: Record<string, string> = {
  'producto-terminado': 'producto terminado',
  'producto-conforme': 'producto conforme',
  carpinteria: 'producto conforme',
  'conforme-papel': 'conforme papel',
  'conforme-papel-colchones': 'conforme papel',
};

export function loadSettings(): PrinterSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: PrinterSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getDriverPaperName(stockSize?: string | null): string {
  return DRIVER_PAPER_BY_STOCK[stockSize || ''] || 'producto terminado';
}

export function getPrinterForStock(
  settings: PrinterSettings,
  stockSize: string,
): PrinterSelection | null {
  const map = settings?.selectedPrinterByStock || {};
  const value = map[stockSize];
  if (value && typeof value === 'object' && value.stationId && value.windowsName) {
    return value;
  }
  return null;
}

export function printerRoleFromName(windowsName?: string | null): string {
  const n = String(windowsName || '').toUpperCase();
  if (/PAPEL/.test(n)) return 'PAPEL';
  if (/ADHESIVO|TELA/.test(n)) return 'ADHESIVO';
  if (/ZDESIGNER|ZT230|ZEBRA/.test(n)) return 'ADHESIVO';
  return '';
}

export function isPapelTarget({
  stockSize,
  windowsName,
  templateCode,
}: { stockSize?: string; windowsName?: string; templateCode?: string } = {}): boolean {
  if (stockSize === 'conforme-papel' || stockSize === 'conforme-papel-colchones') return true;
  if (
    templateCode === 'producto-conforme-papel' ||
    templateCode === 'producto-conforme-papel-colchones' ||
    templateCode === 'carpenter-tela'
  )
    return true;
  return printerRoleFromName(windowsName) === 'PAPEL';
}

/**
 * Perfil de hardware por stock (o PAPEL si la impresora es PAPEL).
 */
export function getHardwareProfile({
  stockSize,
  windowsName,
  templateCode,
  thermalMethod,
}: { stockSize?: string; windowsName?: string; templateCode?: string; thermalMethod?: 'transfer' | 'direct' } = {}): HardwareProfile {
  let base: HardwareProfile;
  if (isPapelTarget({ stockSize, windowsName, templateCode })) {
    base = { ...PAPEL_HARDWARE };
  } else if (stockSize && HARDWARE_BY_STOCK[stockSize]) {
    base = { ...HARDWARE_BY_STOCK[stockSize] };
  } else {
    base = { ...ADHESIVO_HARDWARE };
  }
  if (thermalMethod) {
    base.thermalMethod = thermalMethod;
  }
  return base;
}

/** Aplica el perfil fijo del stock/impresora. */
export function resolveHardwareSettings(settings: PrinterSettings): PrinterSettings {
  const selected = getPrinterForStock(settings, settings?.stockSize);
  const forced = getHardwareProfile({
    stockSize: settings?.stockSize,
    windowsName: selected?.windowsName,
  });
  // Solo papel/tela deja elegir método (selector en el sidebar). Para
  // adhesivo el método viene fijo del perfil — no dejar que un valor de UI
  // viejo (arranca en 'transfer') lo pise.
  const isPapel = isPapelTarget({ stockSize: settings?.stockSize, windowsName: selected?.windowsName });
  const chosenMethod = isPapel
    ? settings?.thermalMethodByStock?.[settings?.stockSize] ||
      settings?.thermalMethod ||
      forced.thermalMethod
    : forced.thermalMethod;
  return {
    ...settings,
    printMode: forced.printMode,
    thermalMethod: chosenMethod,
    mediaType: forced.mediaType,
  };
}

export function describeHardwareProfile(profile?: HardwareProfile | null): string {
  if (!profile) return '';
  const mode = profile.printMode === 'cutter' ? 'Cortadora' : 'Tear-off';
  const thermal = profile.thermalMethod === 'direct' ? 'Térmica directa' : 'Transferencia';
  const media = profile.mediaType === 'continuous' ? 'Continua' : 'Gap/notch';
  return `${mode} · ${thermal} · ${media}`;
}

/** Sugiere el stock/papel según la plantilla (copia local, ver server/config/constants.ts). */
export function suggestStockSizeForTemplate(templateCode: string): string {
  if (templateCode === 'producto-conforme') {
    return 'producto-conforme';
  }
  if (templateCode === 'producto-conforme-papel') {
    return 'conforme-papel';
  }
  if (templateCode === 'producto-conforme-papel-colchones') {
    return 'conforme-papel-colchones';
  }
  if (templateCode === 'carpinteria') {
    return 'carpinteria';
  }
  if (templateCode === 'carpenter-tela') {
    return 'conforme-papel';
  }
  return 'producto-terminado';
}

export function buildPrintChecklist(stockSize: string): string[] {
  const paper = getDriverPaperName(stockSize);
  return [
    `Tamaño del papel: «${paper}» (no uses «User defined»)`,
    'Escala: 100% / Tamaño real (no “Ajustar al papel” ni “Predeterminado” si se ve chica)',
    'Márgenes: Ninguno',
    'Marca «Gráficos de fondo» si está disponible',
  ];
}

export function encodePrinterValue(stationId: string, windowsName: string): string {
  return `${stationId}::${windowsName}`;
}

export function decodePrinterValue(value?: string | null): PrinterSelection | null {
  if (!value || !value.includes('::')) return null;
  const idx = value.indexOf('::');
  return {
    stationId: value.slice(0, idx),
    windowsName: value.slice(idx + 2),
  };
}

// ——— Impresoras "visibles" en esta PC ———
//
// El catálogo de impresoras es compartido (server), pero cuáles aparecen
// para elegir en CADA PC es una marca local: por defecto ninguna. Cada
// operario, en su propia PC, marca cuáles del catálogo completo son "las
// suyas" — eso se guarda acá, en el navegador, nunca en el server.

const LOCAL_VISIBLE_KEY = 'colineal-visible-printers';

export function loadLocalVisiblePrinters(): Set<string> {
  try {
    const raw = localStorage.getItem(LOCAL_VISIBLE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v) => typeof v === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function saveLocalVisiblePrinters(keys: Set<string>): void {
  localStorage.setItem(LOCAL_VISIBLE_KEY, JSON.stringify([...keys]));
}

export function isPrinterLocallyVisible(stationId: string, windowsName: string): boolean {
  return loadLocalVisiblePrinters().has(printerVisibilityKey(stationId, windowsName));
}

export function setPrinterLocallyVisible(
  stationId: string,
  windowsName: string,
  visible: boolean,
): Set<string> {
  const keys = loadLocalVisiblePrinters();
  const key = printerVisibilityKey(stationId, windowsName);
  if (visible) keys.add(key);
  else keys.delete(key);
  saveLocalVisiblePrinters(keys);
  return keys;
}

function printerVisibilityKey(stationId: string, windowsName: string): string {
  return encodePrinterValue(stationId, windowsName);
}
