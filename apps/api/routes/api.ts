import { Router, Request, Response } from 'express';
import { odooQuery } from '../lib/odoo';
import {
  getDriverPaperName,
  getLabelStockSize,
  LABEL_STOCK_SIZES,
  LabelStockSizeCode,
} from '../config/constants';
import { buildLabelPreview, isPlsilOrder, isPllenOrder, parseCustomPacking, parseBultoQuantities } from '../services/label-explosion.service';
import {
  applyLabelSelection,
  parseLabelSelection,
} from '../services/label-selection.service';
import { buildLabelsHtml, generateLabelsPdf } from '../services/pdf-generator.service';
import { generateLabelsZpl } from '../services/zpl-generator.service';
import { getStationById } from '../services/printers-config.service';
import {
  buildManualOrder,
  buildManualOrderName,
  getOrderById,
  getProductByEan,
  listTemplates,
  listOrders,
  searchOrders,
} from '../services/manufacturing-order.service';
import { listAvailableTemplates } from '../templates/registry';
import type { LabelData } from '../types';
import { createRateLimiter } from '../lib/rate-limit';
import printersRouter from './printers';
import qzRouter from './qz';
import inspectorsRouter from './inspectors';

const router = Router();
router.use(printersRouter);
router.use(qzRouter);
router.use(inspectorsRouter);

/**
 * Cada request acá dispara un render de PDF con Puppeteer (y para los de
 * impresión, además rasteriza con mupdf) — caro en CPU/memoria. Sin esto,
 * un loop descontrolado (o un DoS a propósito) tumba el único server que
 * también sirve el resto de la app.
 */
const renderRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  message: 'Demasiadas impresiones/PDFs seguidos. Esperá un momento y volvé a intentar.',
});

/**
 * Genera el ZPL (bitmap ^GFA) de las etiquetas para que el browser lo mande
 * crudo a QZ Tray — reemplaza el reenvío de PDF a print-agent.
 */
async function buildZplForLabels(
  labels: LabelData[],
  opts: {
    stockSizeCode: string;
    copies: number;
    printerName?: string;
    printMode: 'tear' | 'cutter';
    thermalMethod: 'transfer' | 'direct';
    mediaType: 'gap' | 'continuous';
    debugZplEngine?: 'native';
  },
) {
  if (labels.length === 0) {
    throw new Error('No hay etiquetas para imprimir');
  }
  return generateLabelsZpl(labels, {
    stockSizeCode: opts.stockSizeCode,
    printerName: opts.printerName,
    copies: opts.copies,
    printMode: opts.printMode,
    thermalMethod: opts.thermalMethod,
    mediaType: opts.mediaType,
    debugZplEngine: opts.debugZplEngine,
  });
}

/**
 * Flag de prueba (fase 1 ZPL nativo): ?zplEngine=native o
 * body.debugZplEngine="native" — nadie lo manda salvo que se agregue a
 * propósito (ver apps/web `?zplEngine=native` en la URL). Sin esto el
 * comportamiento de impresión es exactamente el de siempre.
 */
function resolveDebugZplEngine(req: Request): 'native' | undefined {
  const raw = req.body?.debugZplEngine ?? req.query?.zplEngine;
  return raw === 'native' ? 'native' : undefined;
}
function resolveTemplateOverride(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const code = raw.trim();
  if (!code || code === 'auto') return undefined;
  const available = listAvailableTemplates();
  if (!available.includes(code)) {
    throw new Error(`Plantilla no válida: ${code}`);
  }
  return code;
}

function resolveStockSizeCode(raw: unknown): LabelStockSizeCode | undefined {
  if (typeof raw !== 'string') return undefined;
  const code = raw.trim();
  if (!code) return undefined;
  if (!(code in LABEL_STOCK_SIZES)) {
    throw new Error(`Tamaño de etiqueta no válido: ${code}`);
  }
  return code as LabelStockSizeCode;
}

function handleApiError(error: unknown, res: Response, defaultMessage: string) {
  if (error instanceof Error) {
    if (
      error.message.startsWith('Plantilla no válida') ||
      error.message.startsWith('Tamaño de etiqueta no válido') ||
      error.message.startsWith('Reparto inválido') ||
      error.message.startsWith('El reparto suma')
    ) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error.message === 'Índice de etiqueta fuera de rango') {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error.message === 'No hay etiquetas que coincidan con la selección') {
      res.status(400).json({ error: error.message });
      return;
    }
    if (
      error.message.startsWith('jobs') ||
      error.message.startsWith('Job ') ||
      error.message.startsWith('Debes indicar') ||
      error.message.startsWith('Orden no encontrada') ||
      error.message.startsWith('Producto no encontrado') ||
      error.message.includes('no tiene etiquetas')
    ) {
      res.status(400).json({ error: error.message });
      return;
    }
  }
  console.error(error);
  res.status(500).json({ error: defaultMessage });
}

function parseLabelIndex(raw: unknown, total: number): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const index = parseInt(String(raw), 10);
  if (isNaN(index) || index < 0 || index >= total) {
    throw new Error('Índice de etiqueta fuera de rango');
  }
  return index;
}

function parseDualPacking(query: Record<string, unknown>): boolean {
  const raw = query.dualPacking ?? query.dual;
  if (raw === undefined || raw === null || raw === '') return false;
  const value = String(raw).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function applyInspectorOverride(labels: LabelData[], raw: unknown): LabelData[] {
  const name = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!name) return labels;
  return labels.map((label) => ({ ...label, inspectorName: name }));
}

function resolveLabelsFromRequest(
  order: NonNullable<Awaited<ReturnType<typeof getOrderById>>>,
  query: Record<string, unknown>,
  templateOverride?: string,
) {
  const dualPacking = parseDualPacking(query);
  const customPacking = parseCustomPacking(
    query.customPacking ?? query.packing ?? query.reparto,
  );
  const bultoQuantities = parseBultoQuantities(
    query.bultoQuantities ?? query.bultoQty ?? query.bultosQty,
  );
  const preview = buildLabelPreview(order, templateOverride, {
    dualPacking,
    customPacking: customPacking.length > 0 ? customPacking : undefined,
    bultoQuantities: Object.keys(bultoQuantities).length > 0 ? bultoQuantities : undefined,
  });
  const selection = parseLabelSelection(query);
  const labels = applyInspectorOverride(
    applyLabelSelection(preview.labels, selection),
    query.inspectorName,
  );

  if (labels.length === 0 && preview.labels.length > 0) {
    throw new Error('No hay etiquetas que coincidan con la selección');
  }

  return { preview, selection, labels, dualPacking, customPacking, bultoQuantities };
}

function parseManualQty(raw: unknown): number {
  return Number(raw);
}

async function resolveManualOrder(query: Record<string, unknown>) {
  const ean = typeof query.ean === 'string' ? query.ean.trim() : '';
  const qty = parseManualQty(query.qty ?? query.quantity);
  const orderName =
    typeof query.orderName === 'string' && query.orderName.trim()
      ? query.orderName.trim()
      : buildManualOrderName(
          typeof query.lotPrefix === 'string' ? query.lotPrefix : '',
          typeof query.lotNumber === 'string' ? query.lotNumber : '',
        );
  return buildManualOrder(ean, qty, orderName);
}

interface BatchJobInput {
  orderId: number;
  groups?: string;
  units?: string;
  from?: string | number;
  to?: string | number;
  dualPacking?: boolean | string | number;
  customPacking?: string;
  bultoQuantities?: Record<string, number> | string;
  inspectorName?: string;
}

function parseBatchJobs(raw: unknown): BatchJobInput[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('jobs inválido: se esperaba JSON');
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Debes indicar al menos una orden en el lote (jobs)');
  }

  return parsed.map((item, idx) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Job ${idx + 1} inválido`);
    }
    const row = item as Record<string, unknown>;
    const orderId = Number(row.orderId ?? row.id);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      throw new Error(`Job ${idx + 1}: orderId inválido`);
    }
    return {
      orderId,
      groups: typeof row.groups === 'string' ? row.groups : undefined,
      units: typeof row.units === 'string' ? row.units : undefined,
      from: row.from as string | number | undefined,
      to: row.to as string | number | undefined,
      dualPacking: row.dualPacking as boolean | string | number | undefined,
      customPacking:
        typeof row.customPacking === 'string'
          ? row.customPacking
          : row.customPacking != null
            ? JSON.stringify(row.customPacking)
            : undefined,
      bultoQuantities:
        typeof row.bultoQuantities === 'string'
          ? row.bultoQuantities
          : row.bultoQuantities != null
            ? JSON.stringify(row.bultoQuantities)
            : undefined,
      inspectorName:
        typeof row.inspectorName === 'string' && row.inspectorName.trim()
          ? row.inspectorName.trim().toUpperCase()
          : undefined,
    };
  });
}

async function resolveLabelsFromBatchJobs(
  jobs: BatchJobInput[],
  templateOverride?: string,
  inspectorName?: string,
) {
  const allLabels: Awaited<
    ReturnType<typeof resolveLabelsFromRequest>
  >['labels'] = [];
  const orderNames: string[] = [];

  for (const job of jobs) {
    const order = await getOrderById(job.orderId);
    if (!order) {
      throw new Error(`Orden no encontrada: ${job.orderId}`);
    }
    orderNames.push(order.name);
    const query: Record<string, unknown> = {};
    if (job.groups !== undefined) query.groups = job.groups;
    if (job.units !== undefined) query.units = job.units;
    if (job.from !== undefined) query.from = job.from;
    if (job.to !== undefined) query.to = job.to;
    if (job.dualPacking !== undefined) query.dualPacking = job.dualPacking;
    if (job.customPacking !== undefined) query.customPacking = job.customPacking;
    if (job.bultoQuantities !== undefined) query.bultoQuantities = job.bultoQuantities;
    // Inspector por orden; el global del request solo es respaldo.
    const jobInspector = job.inspectorName || inspectorName;
    if (jobInspector) query.inspectorName = jobInspector;

    const { labels } = resolveLabelsFromRequest(order, query, templateOverride);
    if (labels.length === 0) {
      throw new Error(`La orden ${order.name} no tiene etiquetas con esa selección`);
    }
    allLabels.push(...labels);
  }

  return { labels: allLabels, orderNames };
}

router.get('/orders', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) || '';
    if (!q.trim()) {
      const orders = await listOrders();
      res.json(orders);
      return;
    }
    const orders = await searchOrders(q.trim());
    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al buscar órdenes' });
  }
});

/**
 * Endpoint para consultar la vista `col_ordenes_produccion`
 * Soporta parámetros de consulta opcionales: limit, offset
 */
router.get('/views/col-ordenes-produccion', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '100'), 10), 1000);
    const offset = Math.max(parseInt(String(req.query.offset || '0'), 10), 0);
    const rows = await odooQuery(
      'SELECT * FROM col_ordenes_produccion LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    res.json({
      count: rows.length,
      limit,
      offset,
      data: rows,
    });
  } catch (error) {
    handleApiError(error, res, 'Error al consultar la vista col_ordenes_produccion');
  }
});

/**
 * Endpoint para consultar la vista `vi_maestro_subarticulos`
 * Soporta parámetros de consulta opcionales: limit, offset
 */
router.get('/views/vi-maestro-subarticulos', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '100'), 10), 1000);
    const offset = Math.max(parseInt(String(req.query.offset || '0'), 10), 0);
    const rows = await odooQuery(
      'SELECT * FROM vi_maestro_subarticulos LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    res.json({
      count: rows.length,
      limit,
      offset,
      data: rows,
    });
  } catch (error) {
    handleApiError(error, res, 'Error al consultar la vista vi_maestro_subarticulos');
  }
});

router.get('/orders/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }

    const order = await getOrderById(id);
    if (!order) {
      res.status(404).json({ error: 'Orden no encontrada' });
      return;
    }

    const templateOverride = resolveTemplateOverride(req.query.template);
    const { preview, labels } = resolveLabelsFromRequest(
      order,
      req.query as Record<string, unknown>,
      templateOverride,
    );
    res.json({
      order: {
        id: order.id,
        name: order.name,
        lotNumber: order.lotNumber,
        productionDate: order.productionDate,
        state: order.state,
        inspectorName: order.inspectorName,
        supportsDualPacking: isPlsilOrder(order.name),
        supportsCustomPacking: true,
        lines: order.lines.map((l) => ({
          productName: l.product.name,
          internalRef: l.product.internalRef,
          quantity: Number(l.quantity.toString()),
          bomType: l.product.boms[0]?.type || 'manufacture',
        })),
      },
      preview: {
        totalLabels: labels.length,
        totalLabelsAll: preview.totalLabels,
        summary: preview.summary,
        groups: preview.groups,
        templateCode: labels[0]?.templateCode || preview.labels[0]?.templateCode || '',
      },
    });
  } catch (error) {
    handleApiError(error, res, 'Error al obtener la orden');
  }
});

router.get('/orders/:id/labels/preview', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }

    const order = await getOrderById(id);
    if (!order) {
      res.status(404).json({ error: 'Orden no encontrada' });
      return;
    }

    const templateOverride = resolveTemplateOverride(req.query.template);
    const { preview, labels } = resolveLabelsFromRequest(
      order,
      req.query as Record<string, unknown>,
      templateOverride,
    );
    res.json({
      ...preview,
      totalLabels: labels.length,
      labels,
    });
  } catch (error) {
    handleApiError(error, res, 'Error al generar vista previa');
  }
});

router.get('/orders/:id/labels/html', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }

    const order = await getOrderById(id);
    if (!order) {
      res.status(404).json({ error: 'Orden no encontrada' });
      return;
    }

    const templateOverride = resolveTemplateOverride(req.query.template);
    const stockSizeCode = resolveStockSizeCode(req.query.stockSize);
    const { labels } = resolveLabelsFromRequest(
      order,
      req.query as Record<string, unknown>,
      templateOverride,
    );
    if (labels.length === 0) {
      res.status(400).json({ error: 'La orden no tiene etiquetas para generar' });
      return;
    }

    const labelIndex = parseLabelIndex(req.query.index, labels.length);
    const previewRaw = String(req.query.preview ?? '1').toLowerCase();
    const isPreview = !(
      previewRaw === '0' ||
      previewRaw === 'false' ||
      previewRaw === 'print'
    );
    const html = await buildLabelsHtml(labels, {
      preview: isPreview,
      labelIndex,
      stockSizeCode,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    handleApiError(error, res, 'Error al generar vista previa HTML');
  }
});

router.get('/orders/:id/labels/pdf', renderRateLimit, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }

    const order = await getOrderById(id);
    if (!order) {
      res.status(404).json({ error: 'Orden no encontrada' });
      return;
    }

    const templateOverride = resolveTemplateOverride(req.query.template);
    const stockSizeCode = resolveStockSizeCode(req.query.stockSize);
    const { labels } = resolveLabelsFromRequest(
      order,
      req.query as Record<string, unknown>,
      templateOverride,
    );
    if (labels.length === 0) {
      res.status(400).json({ error: 'La orden no tiene etiquetas para generar' });
      return;
    }

    const labelIndex = parseLabelIndex(req.query.index, labels.length);
    const labelsToPrint =
      labelIndex !== undefined
        ? labels.slice(labelIndex, labelIndex + 1)
        : labels;

    const pdf = await generateLabelsPdf(labelsToPrint, { stockSizeCode });
    const filename = `etiquetas-${order.name.replace(/\//g, '-')}.pdf`;

    const download = req.query.download === '1' || req.query.download === 'true';
    const disposition = download ? 'attachment' : 'inline';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (error) {
    handleApiError(error, res, 'Error al generar PDF');
  }
});

router.post('/orders/:id/labels/generate', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }

    const order = await getOrderById(id);
    if (!order) {
      res.status(404).json({ error: 'Orden no encontrada' });
      return;
    }

    const templateOverride = resolveTemplateOverride(
      req.body?.template ?? req.query.template,
    );
    const stockSizeCode = resolveStockSizeCode(
      req.body?.stockSize ?? req.query.stockSize,
    );
    const { labels } = resolveLabelsFromRequest(
      order,
      { ...(req.query as Record<string, unknown>), ...(req.body ?? {}) },
      templateOverride,
    );
    if (labels.length === 0) {
      res.status(400).json({ error: 'La orden no tiene etiquetas para generar' });
      return;
    }

    const pdf = await generateLabelsPdf(labels, { stockSizeCode });
    const filename = `etiquetas-${order.name.replace(/\//g, '-')}.pdf`;

    const download = req.query.download === '1' || req.query.download === 'true';
    const disposition = download ? 'attachment' : 'inline';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (error) {
    handleApiError(error, res, 'Error al generar PDF');
  }
});

router.get('/labels/batch/html', async (req: Request, res: Response) => {
  try {
    const jobs = parseBatchJobs(req.query.jobs);
    const templateOverride = resolveTemplateOverride(req.query.template);
    const stockSizeCode = resolveStockSizeCode(req.query.stockSize);
    const inspectorName =
      typeof req.query.inspectorName === 'string' && req.query.inspectorName.trim()
        ? req.query.inspectorName.trim().toUpperCase()
        : undefined;
    const { labels } = await resolveLabelsFromBatchJobs(
      jobs,
      templateOverride,
      inspectorName,
    );

    const previewRaw = String(req.query.preview ?? '1').toLowerCase();
    const isPreview = !(
      previewRaw === '0' ||
      previewRaw === 'false' ||
      previewRaw === 'print'
    );
    const html = await buildLabelsHtml(labels, {
      preview: isPreview,
      stockSizeCode,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    handleApiError(error, res, 'Error al generar vista previa del lote');
  }
});

router.get('/labels/batch/pdf', renderRateLimit, async (req: Request, res: Response) => {
  try {
    const jobs = parseBatchJobs(req.query.jobs);
    const templateOverride = resolveTemplateOverride(req.query.template);
    const stockSizeCode = resolveStockSizeCode(req.query.stockSize);
    const inspectorName =
      typeof req.query.inspectorName === 'string' && req.query.inspectorName.trim()
        ? req.query.inspectorName.trim().toUpperCase()
        : undefined;
    const { labels, orderNames } = await resolveLabelsFromBatchJobs(
      jobs,
      templateOverride,
      inspectorName,
    );

    const pdf = await generateLabelsPdf(labels, { stockSizeCode });
    const filename = `etiquetas-lote-${orderNames
      .slice(0, 3)
      .map((n) => n.replace(/\//g, '-'))
      .join('_')}.pdf`;
    const download = req.query.download === '1' || req.query.download === 'true';
    const disposition = download ? 'attachment' : 'inline';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (error) {
    handleApiError(error, res, 'Error al generar PDF del lote');
  }
});

router.post('/labels/print-batch', renderRateLimit, async (req: Request, res: Response) => {
  try {
    const jobs = parseBatchJobs(req.body?.jobs ?? req.query.jobs);
    const templateOverride = resolveTemplateOverride(
      req.body?.template ?? req.query.template,
    );
    const stockSizeCode =
      resolveStockSizeCode(req.body?.stockSize ?? req.query.stockSize) ??
      'producto-terminado';
    const copies = Math.max(1, Math.min(99, Number(req.body?.copies) || 1));
    const printerName =
      typeof req.body?.printerName === 'string' && req.body.printerName.trim()
        ? req.body.printerName.trim()
        : undefined;
    const stationId =
      typeof req.body?.stationId === 'string' && req.body.stationId.trim()
        ? req.body.stationId.trim()
        : undefined;
    const printMode = req.body?.printMode === 'cutter' ? 'cutter' : 'tear';
    const thermalMethod = req.body?.thermalMethod === 'transfer' ? 'transfer' : 'direct';
    const mediaType = req.body?.mediaType === 'continuous' ? 'continuous' : 'gap';

    let stationName: string | undefined;
    if (stationId) {
      const station = getStationById(stationId);
      if (!station) {
        res.status(400).json({ error: `Estación no encontrada: ${stationId}` });
        return;
      }
      const configured = station.printers.find(
        (p) => p.windowsName === printerName,
      );
      if (printerName && !configured) {
        res.status(400).json({
          error:
            'La impresora no está en el catálogo de la estación. Revisa Configuración de impresoras.',
        });
        return;
      }
      stationName = station.name;
    }

    if (!printerName) {
      res.status(400).json({ error: 'Falta printerName (impresora Windows)' });
      return;
    }
    if (!stationId) {
      res.status(400).json({ error: 'Falta stationId (estación de impresión)' });
      return;
    }

    const inspectorName =
      typeof req.body?.inspectorName === 'string' && req.body.inspectorName.trim()
        ? req.body.inspectorName.trim().toUpperCase()
        : undefined;

    const { labels, orderNames } = await resolveLabelsFromBatchJobs(
      jobs,
      templateOverride,
      inspectorName,
    );
    const paperName = getDriverPaperName(stockSizeCode);
    const result = await buildZplForLabels(labels, {
      stockSizeCode,
      copies,
      printerName,
      printMode,
      thermalMethod,
      mediaType,
      debugZplEngine: resolveDebugZplEngine(req),
    });

    const stockMeta = getLabelStockSize(stockSizeCode);
    res.json({
      ok: true,
      mode: 'direct-batch',
      zpl: result.zpl,
      pages: result.pages,
      nativeLabelsCount: result.nativeLabelsCount,
      orders: orderNames,
      jobs: jobs.length,
      copies,
      stockSize: stockSizeCode,
      paperName,
      printer: printerName,
      stationId,
      stationName,
      form: stockMeta
        ? { name: paperName, widthMm: result.widthMm, heightMm: result.heightMm }
        : { name: paperName, widthMm: result.widthMm, heightMm: result.heightMm },
    });
  } catch (error) {
    if (error instanceof Error) {
      const msg = error.message;
      console.error('[print-batch]', msg);
      if (
        msg.includes('Estación') ||
        msg.includes('imprimir') ||
        msg.includes('formulario') ||
        msg.includes('impresora') ||
        msg.includes('PDF') ||
        msg.includes('jobs') ||
        msg.includes('Job') ||
        msg.includes('Orden no encontrada') ||
        msg.includes('no tiene etiquetas')
      ) {
        res.status(400).json({ error: msg });
        return;
      }
    } else {
      console.error('[print-batch]', error);
    }
    handleApiError(error, res, 'Error en impresión del lote');
  }
});

router.post('/orders/:id/labels/print-direct', renderRateLimit, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }

    const order = await getOrderById(id);
    if (!order) {
      res.status(404).json({ error: 'Orden no encontrada' });
      return;
    }

    const templateOverride = resolveTemplateOverride(
      req.body?.template ?? req.query.template,
    );
    const stockSizeCode =
      resolveStockSizeCode(req.body?.stockSize ?? req.query.stockSize) ??
      'producto-terminado';
    const copies = Math.max(1, Math.min(99, Number(req.body?.copies) || 1));
    const printerName =
      typeof req.body?.printerName === 'string' && req.body.printerName.trim()
        ? req.body.printerName.trim()
        : undefined;
    const stationId =
      typeof req.body?.stationId === 'string' && req.body.stationId.trim()
        ? req.body.stationId.trim()
        : undefined;
    const printMode = req.body?.printMode === 'cutter' ? 'cutter' : 'tear';
    const thermalMethod = req.body?.thermalMethod === 'transfer' ? 'transfer' : 'direct';
    const mediaType = req.body?.mediaType === 'continuous' ? 'continuous' : 'gap';

    let stationName: string | undefined;
    if (stationId) {
      const station = getStationById(stationId);
      if (!station) {
        res.status(400).json({ error: `Estación no encontrada: ${stationId}` });
        return;
      }
      const configured = station.printers.find(
        (p) => p.windowsName === printerName,
      );
      if (printerName && !configured) {
        res.status(400).json({
          error:
            'La impresora no está en el catálogo de la estación. Revisa Configuración de impresoras.',
        });
        return;
      }
      stationName = station.name;
    }

    if (!printerName) {
      res.status(400).json({ error: 'Falta printerName (impresora Windows)' });
      return;
    }
    if (!stationId) {
      res.status(400).json({ error: 'Falta stationId (estación de impresión)' });
      return;
    }

    const { labels } = resolveLabelsFromRequest(
      order,
      { ...(req.query as Record<string, unknown>), ...(req.body ?? {}) },
      templateOverride,
    );
    if (labels.length === 0) {
      res.status(400).json({ error: 'La orden no tiene etiquetas para generar' });
      return;
    }

    const labelIndex = parseLabelIndex(req.body?.index ?? req.query.index, labels.length);
    const labelsToPrint =
      labelIndex !== undefined ? labels.slice(labelIndex, labelIndex + 1) : labels;

    const paperName = getDriverPaperName(stockSizeCode);
    const result = await buildZplForLabels(labelsToPrint, {
      stockSizeCode,
      copies,
      printerName,
      printMode,
      thermalMethod,
      mediaType,
      debugZplEngine: resolveDebugZplEngine(req),
    });

    const stockMeta = getLabelStockSize(stockSizeCode);
    res.json({
      ok: true,
      mode: 'direct',
      zpl: result.zpl,
      pages: result.pages,
      nativeLabelsCount: result.nativeLabelsCount,
      copies,
      stockSize: stockSizeCode,
      paperName,
      printer: printerName,
      stationId,
      stationName,
      form: stockMeta
        ? { name: paperName, widthMm: result.widthMm, heightMm: result.heightMm }
        : { name: paperName, widthMm: result.widthMm, heightMm: result.heightMm },
    });
  } catch (error) {
    if (error instanceof Error) {
      const msg = error.message;
      if (
        msg.includes('Estación') ||
        msg.includes('imprimir') ||
        msg.includes('formulario') ||
        msg.includes('impresora') ||
        msg.includes('PDF')
      ) {
        res.status(502).json({ error: msg });
        return;
      }
      res.status(502).json({ error: msg });
      return;
    }
    handleApiError(error, res, 'Error en impresión directa');
  }
});

router.get('/manual/product', async (req: Request, res: Response) => {
  try {
    const ean = typeof req.query.ean === 'string' ? req.query.ean.trim() : '';
    if (!ean) {
      res.status(400).json({ error: 'Debes indicar un código EAN' });
      return;
    }
    const product = await getProductByEan(ean);
    if (!product) {
      res.status(404).json({ error: `Producto no encontrado con el código: ${ean}` });
      return;
    }
    res.json({
      id: product.id,
      ean: product.ean,
      internalRef: product.internalRef,
      name: product.name,
      templateCode: product.labelTemplate.code,
      isKit: product.boms.some((b) => b.type === 'kit'),
    });
  } catch (error) {
    handleApiError(error, res, 'Error al buscar el producto');
  }
});

router.get('/manual/order', async (req: Request, res: Response) => {
  try {
    const order = await resolveManualOrder(req.query as Record<string, unknown>);
    const templateOverride = resolveTemplateOverride(req.query.template);
    const { preview, labels } = resolveLabelsFromRequest(
      order,
      req.query as Record<string, unknown>,
      templateOverride,
    );
    res.json({
      order: {
        id: order.id,
        name: order.name,
        lotNumber: order.lotNumber,
        productionDate: order.productionDate,
        state: order.state,
        inspectorName: order.inspectorName,
        supportsDualPacking: isPlsilOrder(order.name),
        supportsCustomPacking: true,
        lines: order.lines.map((l) => ({
          productName: l.product.name,
          internalRef: l.product.internalRef,
          quantity: Number(l.quantity.toString()),
          bomType: l.product.boms[0]?.type || 'manufacture',
        })),
      },
      preview: {
        totalLabels: labels.length,
        totalLabelsAll: preview.totalLabels,
        summary: preview.summary,
        groups: preview.groups,
        templateCode: labels[0]?.templateCode || preview.labels[0]?.templateCode || '',
      },
    });
  } catch (error) {
    handleApiError(error, res, 'Error al generar la orden manual');
  }
});

router.get('/manual/labels/html', async (req: Request, res: Response) => {
  try {
    const order = await resolveManualOrder(req.query as Record<string, unknown>);
    const templateOverride = resolveTemplateOverride(req.query.template);
    const stockSizeCode = resolveStockSizeCode(req.query.stockSize);
    const { labels } = resolveLabelsFromRequest(
      order,
      req.query as Record<string, unknown>,
      templateOverride,
    );
    if (labels.length === 0) {
      res.status(400).json({ error: 'No hay etiquetas para generar' });
      return;
    }

    const labelIndex = parseLabelIndex(req.query.index, labels.length);
    const previewRaw = String(req.query.preview ?? '1').toLowerCase();
    const isPreview = !(
      previewRaw === '0' ||
      previewRaw === 'false' ||
      previewRaw === 'print'
    );
    const html = await buildLabelsHtml(labels, {
      preview: isPreview,
      labelIndex,
      stockSizeCode,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    handleApiError(error, res, 'Error al generar vista previa HTML');
  }
});

router.get('/manual/labels/pdf', renderRateLimit, async (req: Request, res: Response) => {
  try {
    const order = await resolveManualOrder(req.query as Record<string, unknown>);
    const templateOverride = resolveTemplateOverride(req.query.template);
    const stockSizeCode = resolveStockSizeCode(req.query.stockSize);
    const { labels } = resolveLabelsFromRequest(
      order,
      req.query as Record<string, unknown>,
      templateOverride,
    );
    if (labels.length === 0) {
      res.status(400).json({ error: 'No hay etiquetas para generar' });
      return;
    }

    const labelIndex = parseLabelIndex(req.query.index, labels.length);
    const labelsToPrint =
      labelIndex !== undefined ? labels.slice(labelIndex, labelIndex + 1) : labels;

    const pdf = await generateLabelsPdf(labelsToPrint, { stockSizeCode });
    const filename = `etiquetas-${order.name.replace(/\//g, '-')}.pdf`;

    const download = req.query.download === '1' || req.query.download === 'true';
    const disposition = download ? 'attachment' : 'inline';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (error) {
    handleApiError(error, res, 'Error al generar PDF');
  }
});

router.post('/manual/labels/print-direct', renderRateLimit, async (req: Request, res: Response) => {
  try {
    const merged = { ...(req.query as Record<string, unknown>), ...(req.body ?? {}) };
    const order = await resolveManualOrder(merged);

    const templateOverride = resolveTemplateOverride(req.body?.template ?? req.query.template);
    const stockSizeCode =
      resolveStockSizeCode(req.body?.stockSize ?? req.query.stockSize) ??
      'producto-terminado';
    const copies = Math.max(1, Math.min(99, Number(req.body?.copies) || 1));
    const printerName =
      typeof req.body?.printerName === 'string' && req.body.printerName.trim()
        ? req.body.printerName.trim()
        : undefined;
    const stationId =
      typeof req.body?.stationId === 'string' && req.body.stationId.trim()
        ? req.body.stationId.trim()
        : undefined;
    const printMode = req.body?.printMode === 'cutter' ? 'cutter' : 'tear';
    const thermalMethod = req.body?.thermalMethod === 'transfer' ? 'transfer' : 'direct';
    const mediaType = req.body?.mediaType === 'continuous' ? 'continuous' : 'gap';

    let stationName: string | undefined;
    if (stationId) {
      const station = getStationById(stationId);
      if (!station) throw new Error(`Estación no encontrada: ${stationId}`);
      const configured = station.printers.find(
        (p) => p.windowsName === printerName,
      );
      if (printerName && !configured) {
        throw new Error(
          'La impresora no está en el catálogo de la estación. Revisa Configuración de impresoras.',
        );
      }
      stationName = station.name;
    }
    if (!printerName) throw new Error('Falta printerName (impresora Windows)');
    if (!stationId) throw new Error('Falta stationId (estación de impresión)');

    const { labels } = resolveLabelsFromRequest(order, merged, templateOverride);
    if (labels.length === 0) throw new Error('La orden no tiene etiquetas para generar');

    const labelIndex = parseLabelIndex(req.body?.index ?? req.query.index, labels.length);
    const labelsToPrint =
      labelIndex !== undefined ? labels.slice(labelIndex, labelIndex + 1) : labels;

    const paperName = getDriverPaperName(stockSizeCode);
    const result = await buildZplForLabels(labelsToPrint, {
      stockSizeCode,
      copies,
      printerName,
      printMode,
      thermalMethod,
      mediaType,
      debugZplEngine: resolveDebugZplEngine(req),
    });

    const stockMeta = getLabelStockSize(stockSizeCode);
    res.json({
      ok: true,
      mode: 'manual',
      zpl: result.zpl,
      pages: result.pages,
      nativeLabelsCount: result.nativeLabelsCount,
      copies,
      stockSize: stockSizeCode,
      paperName,
      printer: printerName,
      stationId,
      stationName,
      form: stockMeta
        ? { name: paperName, widthMm: result.widthMm, heightMm: result.heightMm }
        : { name: paperName, widthMm: result.widthMm, heightMm: result.heightMm },
    });
  } catch (error) {
    if (error instanceof Error) {
      const msg = error.message;
      console.error('[print-direct-manual]', msg);
      const validationPrefixes = [
        'Producto no encontrado',
        'Debes indicar',
        'Plantilla no válida',
        'Tamaño de etiqueta no válido',
        'Reparto inválido',
        'El reparto suma',
        'Falta printerName',
        'Falta stationId',
        'Estación no encontrada',
      ];
      const isValidation =
        validationPrefixes.some((p) => msg.startsWith(p)) ||
        msg === 'Índice de etiqueta fuera de rango' ||
        msg === 'No hay etiquetas que coincidan con la selección' ||
        msg.includes('no tiene etiquetas') ||
        msg.includes('no está en el catálogo de la estación');
      res.status(isValidation ? 400 : 502).json({ error: msg });
      return;
    }
    handleApiError(error, res, 'Error en impresión directa manual');
  }
});

router.get('/templates', async (_req: Request, res: Response) => {
  try {
    const templates = await listTemplates();
    res.json(templates);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al listar plantillas' });
  }
});

export default router;
