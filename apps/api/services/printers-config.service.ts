import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { LABEL_STOCK_SIZES, LabelStockSizeCode } from '../config/constants';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ConfiguredPrinter {
  windowsName: string;
  label: string;
  /** Si vacío, aparece para todos los stocks. */
  stocks: LabelStockSizeCode[];
}

/**
 * Estación (ej. CALIDAD, COLCHONES): agrupa el catálogo de impresoras
 * conocidas (nombre local o de red, tal cual las ve QZ Tray). No filtra por
 * IP — qué impresora usa cada PC lo decide el propio operario en su
 * navegador (ver web/lib/printer-settings.ts, selección guardada local).
 */
export interface ConfiguredStation {
  id: string;
  code: string;
  name: string;
  printers: ConfiguredPrinter[];
}

export interface PrintersConfig {
  stations: ConfiguredStation[];
}

export interface AvailablePrinter {
  stationId: string;
  stationName: string;
  windowsName: string;
  label: string;
  stocks: LabelStockSizeCode[];
  /** true si no tiene filtro de stock o incluye el stock pedido */
  matchesStock: boolean;
}

function resolveDataDir(): string {
  const fromEnv = String(process.env.PRINTERS_CONFIG_DIR || '').trim();
  if (fromEnv) return fromEnv;
  return join(__dirname, '..', 'data');
}

const DATA_DIR = resolveDataDir();
const CONFIG_PATH = join(DATA_DIR, 'printers-config.json');

function slugId(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || `station-${Date.now()}`
  );
}

export function printerKey(stationId: string, windowsName: string): string {
  return `${String(stationId).trim().toLowerCase()}::${String(windowsName).trim().toLowerCase()}`;
}

function normalizePrinter(raw: Partial<ConfiguredPrinter>): ConfiguredPrinter | null {
  const windowsName = String(raw?.windowsName || '').trim();
  if (!windowsName) return null;
  return {
    windowsName,
    label: String(raw.label || windowsName).trim(),
    stocks: Array.isArray(raw.stocks)
      ? (raw.stocks.filter((s) => s in LABEL_STOCK_SIZES) as LabelStockSizeCode[])
      : [],
  };
}

function normalizeStation(raw: Partial<ConfiguredStation>, index: number): ConfiguredStation {
  const code = String(raw.code || raw.name || `ST-${index + 1}`)
    .trim()
    .toUpperCase();
  const id = String(raw.id || '').trim() || slugId(code) || `station-${index + 1}`;
  const printers = Array.isArray(raw.printers)
    ? (raw.printers.map((p) => normalizePrinter(p)).filter(Boolean) as ConfiguredPrinter[])
    : [];

  return {
    id,
    code,
    name: String(raw.name || code).trim(),
    printers,
  };
}

function defaultConfig(): PrintersConfig {
  return { stations: [] };
}

function ensureConfigFile(): PrintersConfig {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!existsSync(CONFIG_PATH)) {
    const seed = defaultConfig();
    writeFileSync(CONFIG_PATH, JSON.stringify(seed, null, 2), 'utf8');
    return seed;
  }
  return readConfig();
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function readConfig(): PrintersConfig {
  if (!existsSync(CONFIG_PATH)) {
    return ensureConfigFile();
  }
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as PrintersConfig;
    if (!parsed || !Array.isArray(parsed.stations)) {
      return defaultConfig();
    }
    return {
      stations: parsed.stations.map((st, i) => normalizeStation(st, i)),
    };
  } catch {
    return defaultConfig();
  }
}

export function writeConfig(config: PrintersConfig): PrintersConfig {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  const normalized: PrintersConfig = {
    stations: (config.stations || []).map((st, i) => normalizeStation(st, i)),
  };

  const stationIds = normalized.stations.map((s) => s.id);
  if (new Set(stationIds).size !== stationIds.length) {
    throw new Error('Hay ids de estación duplicados');
  }
  const stationCodes = normalized.stations.map((s) => s.code.toUpperCase());
  if (new Set(stationCodes).size !== stationCodes.length) {
    throw new Error('Hay códigos de estación duplicados');
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

export function getStationById(stationId: string): ConfiguredStation | undefined {
  return readConfig().stations.find((s) => s.id === stationId);
}

/** Inicializa el archivo si no existe (llamar al arranque). */
export function initPrintersConfig(): PrintersConfig {
  return ensureConfigFile();
}
