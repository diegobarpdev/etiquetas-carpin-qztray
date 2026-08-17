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
  if (value && typeof value === 'object' && value.agentId && value.windowsName) {
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
  const chosenMethod =
    settings?.thermalMethodByStock?.[settings?.stockSize] ||
    settings?.thermalMethod ||
    forced.thermalMethod;
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

export function buildPrintChecklist(stockSize: string): string[] {
  const paper = getDriverPaperName(stockSize);
  return [
    `Tamaño del papel: «${paper}» (no uses «User defined»)`,
    'Escala: 100% / Tamaño real (no “Ajustar al papel” ni “Predeterminado” si se ve chica)',
    'Márgenes: Ninguno',
    'Marca «Gráficos de fondo» si está disponible',
  ];
}

export function encodePrinterValue(agentId: string, windowsName: string): string {
  return `${agentId}::${windowsName}`;
}

export function decodePrinterValue(value?: string | null): PrinterSelection | null {
  if (!value || !value.includes('::')) return null;
  const idx = value.indexOf('::');
  return {
    agentId: value.slice(0, idx),
    windowsName: value.slice(idx + 2),
  };
}
