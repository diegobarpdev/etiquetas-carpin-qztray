import { Router, Request, Response } from 'express';
import { LABEL_STOCK_SIZES, LabelStockSizeCode } from '../config/constants';
import { requireAdmin } from '../lib/user-session';
import {
  AvailablePrinter,
  ConfiguredStation,
  PrintersConfig,
  readConfig,
  writeConfig,
} from '../services/printers-config.service';

const router = Router();

function slugId(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || `station-${Date.now()}`
  );
}


/**
 * Catálogo completo (todas las estaciones/impresoras). Qué impresora usa
 * cada PC lo decide el operario en su propio navegador (selección local,
 * ver web/lib/printer-settings.ts) — el server ya no filtra por IP/visible.
 */
function buildAvailablePrinters(stockSize?: string): { printers: AvailablePrinter[] } {
  const config = readConfig();
  const stock =
    stockSize && stockSize in LABEL_STOCK_SIZES ? (stockSize as LabelStockSizeCode) : undefined;

  const results: AvailablePrinter[] = [];
  for (const station of config.stations || []) {
    for (const printer of station.printers) {
      const matchesStock =
        !stock || printer.stocks.length === 0 || printer.stocks.includes(stock);
      results.push({
        stationId: station.id,
        stationName: station.name,
        windowsName: printer.windowsName,
        label: printer.label || printer.windowsName,
        stocks: printer.stocks,
        matchesStock,
      });
    }
  }

  results.sort((a, b) => {
    if (a.matchesStock !== b.matchesStock) return a.matchesStock ? -1 : 1;
    return a.label.localeCompare(b.label, 'es');
  });

  return { printers: results };
}

router.get('/admin/printers/config', requireAdmin, (_req: Request, res: Response) => {
  const config = readConfig();
  res.json({
    stations: config.stations || [],
    stockSizes: Object.keys(LABEL_STOCK_SIZES),
  });
});

router.put('/admin/printers/config', requireAdmin, (req: Request, res: Response) => {
  try {
    const body = req.body as PrintersConfig;
    if (!body || !Array.isArray(body.stations)) {
      res.status(400).json({ error: 'Body inválido: se espera { stations: [...] }' });
      return;
    }
    const saved = writeConfig({ stations: body.stations });
    res.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
});

router.post('/admin/printers/stations', requireAdmin, (req: Request, res: Response) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
    if (!name && !code) {
      res.status(400).json({ error: 'name o code es obligatorio' });
      return;
    }

    const config = readConfig();
    let id =
      typeof req.body?.id === 'string' && req.body.id.trim()
        ? req.body.id.trim()
        : slugId(code || name);
    if (config.stations.some((s) => s.id === id)) {
      id = `${id}-${Date.now().toString(36)}`;
    }

    const station: ConfiguredStation = {
      id,
      code: code || slugId(name).toUpperCase(),
      name: name || code,
      printers: [],
    };
    config.stations.push(station);
    const saved = writeConfig(config);
    res.status(201).json(saved.stations.find((s) => s.id === id));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
});

router.delete(
  '/admin/printers/stations/:stationId',
  requireAdmin,
  (req: Request, res: Response) => {
    const config = readConfig();
    const stationId = String(req.params.stationId);
    const nextStations = config.stations.filter((s) => s.id !== stationId);
    if (nextStations.length === config.stations.length) {
      res.status(404).json({ error: 'Estación no encontrada' });
      return;
    }
    const saved = writeConfig({ stations: nextStations });
    res.json(saved);
  },
);

/** Catálogo completo para la UI de impresión (cada PC filtra localmente cuál usa). */
router.get('/printers/available', (req: Request, res: Response) => {
  try {
    const stock =
      typeof req.query.stockSize === 'string' ? req.query.stockSize : undefined;
    const result = buildAvailablePrinters(stock);
    res.json({ printers: result.printers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

export { buildAvailablePrinters };
export default router;
