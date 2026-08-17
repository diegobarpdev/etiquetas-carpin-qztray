import { existsSync } from 'fs';
import { join } from 'path';
import { Decimal } from '../types';
import { isOdooEnabled, odooQuery } from '../lib/odoo';
import { OrderWithLines, ProductWithBom } from '../types';

/** Catálogo de UI: nombres amigables (HTML/CSS viven en server/templates/labels). */
const TEMPLATE_CATALOG: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'carpinteria', name: 'ADHESIVO - CARPENTER' },
  { code: 'producto-conforme', name: 'ADHESIVO - PRODUCTO CONFORME' },
  { code: 'bulto-estandar', name: 'ADHESIVO - PRODUCTO TERMINADO' },
  {
    code: 'producto-terminado-carpenter',
    name: 'ADHESIVO - PRODUCTO TERMINADO CARPENTER',
  },
  {
    code: 'colchon-v1',
    name: 'ADHESIVO - PRODUCTO TERMINADO COLCHONES HORIZONTAL',
  },
  {
    code: 'colchon-v2',
    name: 'ADHESIVO - PRODUCTO TERMINADO COLCHONES VERTICAL',
  },
  { code: 'carpenter-tela', name: 'TELA - CARPENTER' },
  { code: 'producto-conforme-papel', name: 'TELA - PRODUCTO CONFORME' },
  {
    code: 'producto-conforme-papel-colchones',
    name: 'TELA - PRODUCTO CONFORME COLCHONES',
  },
];

type OdooOrderRow = {
  id: number;
  name: string;
  lot_number: string | null;
  production_date: Date | string | null;
  state: string;
  product_qty: string | number;
  product_id: number;
  bom_id: number | null;
  bom_type: string | null;
  default_code: string | null;
  barcode: string | null;
  product_name: string | null;
  weight: string | number | null;
  volume: string | number | null;
  product_length: string | number | null;
  product_height: string | number | null;
  product_width: string | number | null;
  user_id: number | null;
};

/** Subconjunto de columnas necesario para resolver el producto a etiquetar (kit/simple). */
type ProductLookupRow = Pick<
  OdooOrderRow,
  | 'product_id'
  | 'default_code'
  | 'barcode'
  | 'product_name'
  | 'weight'
  | 'volume'
  | 'product_length'
  | 'product_height'
  | 'product_width'
  | 'bom_id'
  | 'bom_type'
>;

type OdooBomLineRow = {
  product_id: number;
  product_qty: string | number;
  default_code: string | null;
  barcode: string | null;
  product_name: string | null;
  weight: string | number | null;
  volume: string | number | null;
  product_length: string | number | null;
  product_height: string | number | null;
  product_width: string | number | null;
};

/** Listado/búsqueda: query liviana (sin joins de producto). */
const ORDER_LIST_SELECT = `
  SELECT
    mp.id,
    mp.name,
    sl.name AS lot_number,
    COALESCE(mp.date_deadline, mp.date_start, mp.create_date)::date AS production_date,
    mp.state
  FROM public.mrp_production mp
  LEFT JOIN public.stock_lot sl ON sl.id = mp.lot_producing_id
`;

/** Detalle: joins completos para armar etiquetas. */
const ORDER_SELECT = `
  SELECT
    mp.id,
    mp.name,
    sl.name AS lot_number,
    COALESCE(mp.date_deadline, mp.date_start, mp.create_date)::date AS production_date,
    mp.state,
    mp.product_qty,
    mp.product_id,
    mp.bom_id,
    b.type AS bom_type,
    mp.user_id,
    COALESCE(pp.default_code, pt.default_code, '') AS default_code,
    COALESCE(pp.barcode, '') AS barcode,
    COALESCE(
      pt.name->>'es_EC',
      pt.name->>'es_ES',
      pt.name->>'en_US',
      pt.name::text,
      ''
    ) AS product_name,
    COALESCE(pp.weight, pt.weight, 0) AS weight,
    COALESCE(pp.volume, pt.volume, 0) AS volume,
    COALESCE(pp.product_length, 0) AS product_length,
    COALESCE(pp.product_height, 0) AS product_height,
    COALESCE(pp.product_width, 0) AS product_width
  FROM public.mrp_production mp
  LEFT JOIN public.mrp_bom b ON b.id = mp.bom_id
  LEFT JOIN public.product_product pp ON pp.id = mp.product_id
  LEFT JOIN public.product_template pt ON pt.id = pp.product_tmpl_id
  LEFT JOIN public.stock_lot sl ON sl.id = mp.lot_producing_id
`;

const BOM_LINE_SELECT = `
  SELECT
    bl.product_id,
    bl.product_qty,
    COALESCE(pp.default_code, pt.default_code, '') AS default_code,
    COALESCE(pp.barcode, '') AS barcode,
    COALESCE(
      pt.name->>'es_EC',
      pt.name->>'es_ES',
      pt.name->>'en_US',
      pt.name::text,
      ''
    ) AS product_name,
    COALESCE(pp.weight, pt.weight, 0) AS weight,
    COALESCE(pp.volume, pt.volume, 0) AS volume,
    COALESCE(pp.product_length, 0) AS product_length,
    COALESCE(pp.product_height, 0) AS product_height,
    COALESCE(pp.product_width, 0) AS product_width
  FROM public.mrp_bom_line bl
  LEFT JOIN public.product_product pp ON pp.id = bl.product_id
  LEFT JOIN public.product_template pt ON pt.id = pp.product_tmpl_id
  WHERE bl.bom_id = $1
  ORDER BY bl.sequence NULLS LAST, bl.id
`;

/**
 * Prefijos que se usan SOLO para limpiar el EAN del componente
 * (ej. CAB7861223913996 → EAN 7861223913996).
 */
const KIT_EAN_STRIP_PREFIX = /^(CAB|LAR|PIE|VEL|STR|SDB|BAS|BASS|TOC|SL\d*|SOF|MOD|COM|ESP|SIL|MES|GUE|CHA)/i;

/**
 * Productos con estos prefijos se etiquetan SOLOS (no buscar kit padre).
 * Ejemplo: HOT… se fabrica como producto terminado independiente.
 */
const STANDALONE_PRODUCT_PREFIX = /^(HOT)/i;

type OdooParentKitRow = {
  bom_id: number;
  product_id: number;
  default_code: string | null;
  barcode: string | null;
  product_name: string | null;
  weight: string | number | null;
  volume: string | number | null;
  product_length: string | number | null;
  product_height: string | number | null;
  product_width: string | number | null;
};

function dec(value: string | number | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  return new Decimal(value);
}

function suggestTemplateCode(productName: string, defaultCode: string): string {
  const hay = `${productName} ${defaultCode}`.toUpperCase();
  if (/COLCHON|COLCHÓN|COLCH/.test(hay)) return 'colchon-v2';
  if (/CARPENTER|CARPINTER/.test(hay)) return 'carpinteria';
  if (/CONFORME|PAPEL/.test(hay)) return 'producto-conforme-papel';
  return 'bulto-estandar';
}

function templateMeta(code: string) {
  const found = TEMPLATE_CATALOG.find((t) => t.code === code);
  return {
    id: 0,
    code,
    name: found?.name || code,
    htmlTemplate: '',
    css: '',
    isActive: true,
  };
}

function mapProductRow(
  row: {
    product_id: number;
    default_code: string | null;
    barcode: string | null;
    product_name: string | null;
    weight: string | number | null;
    volume: string | number | null;
    product_length: string | number | null;
    product_height: string | number | null;
    product_width: string | number | null;
  },
  boms: ProductWithBom['boms'] = [],
): ProductWithBom {
  const internalRef = String(row.default_code || row.barcode || row.product_id || '').trim();
  // En kits Colineal el EAN suele ser el código numérico del padre (sin prefijo CAB/LAR/SL1…).
  const stripped = internalRef.replace(KIT_EAN_STRIP_PREFIX, '');
  const ean =
    String(row.barcode || '').trim() ||
    (/^\d{8,14}$/.test(stripped) ? stripped : '') ||
    internalRef;
  const productName = String(row.product_name || internalRef || 'Producto').trim();
  const templateCode = suggestTemplateCode(productName, internalRef);

  return {
    id: row.product_id,
    ean,
    internalRef,
    name: productName,
    shortName: productName,
    weightKg: dec(row.weight),
    height: dec(row.product_height),
    width: dec(row.product_width),
    length: dec(row.product_length),
    volumeM3: dec(row.volume),
    numBultos: 1,
    labelTemplateId: 0,
    labelTemplate: templateMeta(templateCode),
    boms,
    bomLines: [],
    orderLines: [],
  } as unknown as ProductWithBom;
}

async function loadKitLines(bomId: number): Promise<ProductWithBom['boms']> {
  const lines = await odooQuery<OdooBomLineRow>(BOM_LINE_SELECT, [bomId]);
  if (lines.length === 0) return [];

  return [
    {
      type: 'kit',
      lines: lines.map((line) => ({
        quantity: dec(line.product_qty),
        componentProduct: mapProductRow(line),
      })),
    },
  ];
}

async function findBomForProduct(productId: number): Promise<number | null> {
  const rows = await odooQuery<{ id: number }>(
    `
    SELECT b.id
    FROM public.mrp_bom b
    JOIN public.product_product pp ON pp.product_tmpl_id = b.product_tmpl_id
    WHERE pp.id = $1
      AND COALESCE(b.active, true) = true
      AND (b.product_id IS NULL OR b.product_id = pp.id)
    ORDER BY
      CASE WHEN b.product_id = pp.id THEN 0 ELSE 1 END,
      b.sequence NULLS LAST,
      b.id DESC
    LIMIT 1
    `,
    [productId],
  );
  return rows[0]?.id || null;
}

/**
 * Busca si el producto es componente de algún BOM phantom activo.
 * Si lo es, devuelve los datos del producto padre (kit) para etiquetar con todos sus bultos.
 * No depende de regex de prefijos: consulta directamente la BD.
 */
async function findParentPhantomKit(
  productId: number,
): Promise<OdooParentKitRow | null> {
  const rows = await odooQuery<OdooParentKitRow>(
    `
    SELECT
      b.id AS bom_id,
      pp.id AS product_id,
      COALESCE(pp.default_code, pt.default_code, '') AS default_code,
      COALESCE(pp.barcode, '') AS barcode,
      COALESCE(
        pt.name->>'es_EC',
        pt.name->>'es_ES',
        pt.name->>'en_US',
        pt.name::text,
        ''
      ) AS product_name,
      COALESCE(pp.weight, pt.weight, 0) AS weight,
      COALESCE(pp.volume, pt.volume, 0) AS volume,
      COALESCE(pp.product_length, 0) AS product_length,
      COALESCE(pp.product_height, 0) AS product_height,
      COALESCE(pp.product_width, 0) AS product_width
    FROM public.mrp_bom_line bl
    JOIN public.mrp_bom b ON b.id = bl.bom_id
    JOIN public.product_template pt ON pt.id = b.product_tmpl_id
    JOIN public.product_product pp ON pp.product_tmpl_id = pt.id
      AND (b.product_id IS NULL OR b.product_id = pp.id OR pp.id = (
        SELECT MIN(pp2.id) FROM public.product_product pp2 WHERE pp2.product_tmpl_id = pt.id
      ))
    WHERE bl.product_id = $1
      AND b.type = 'phantom'
      AND COALESCE(b.active, true) = true
    ORDER BY
      b.id DESC,
      pp.id
    LIMIT 1
    `,
    [productId],
  );

  return rows[0] || null;
}

/**
 * Resuelve el producto a etiquetar:
 * 1) LDM propia de la MO de tipo 'phantom' (Kit de bultos) → desglosar bultos del kit
 * 2) Productos standalone por prefijo (HOT…) → etiquetar directo, sin buscar padre
 * 3) Componente de kit phantom: si el product_id aparece como línea en algún BOM phantom
 *    activo, usar el padre y todos sus bultos
 * 4) De lo contrario (fabricación normal o sin kit phantom) → producto simple
 */
async function resolveLabelProduct(row: ProductLookupRow): Promise<ProductWithBom> {
  const ownCode = String(row.default_code || '').trim();
  const bomType = String(row.bom_type || '').toLowerCase();

  // 1) LDM phantom propia de la MO (Kit de bultos)
  if (row.bom_id && bomType === 'phantom') {
    const boms = await loadKitLines(row.bom_id);
    if (boms.length > 0) {
      return mapProductRow(row, boms);
    }
  }

  // 2) Productos standalone: se etiquetan directo sin buscar padre phantom
  if (STANDALONE_PRODUCT_PREFIX.test(ownCode)) {
    return mapProductRow(row, []);
  }

  // 3) Buscar si es componente de algún BOM phantom → usar el padre con todos sus bultos
  const parent = await findParentPhantomKit(row.product_id);
  if (parent) {
    const boms = await loadKitLines(parent.bom_id);
    return mapProductRow(parent, boms);
  }

  // 4) Producto simple de fabricación (mrp_bom 'normal' o sin kit phantom)
  return mapProductRow(row, []);
}

/** Busca un producto por EAN (o código interno) para impresión manual sin OP en Odoo. */
export async function getProductByEan(ean: string): Promise<ProductWithBom | null> {
  requireOdoo();
  const code = String(ean || '').trim();
  if (!code) return null;

  const rows = await odooQuery<ProductLookupRow>(
    `
    SELECT
      pp.id AS product_id,
      b.id AS bom_id,
      b.type AS bom_type,
      COALESCE(pp.default_code, pt.default_code, '') AS default_code,
      COALESCE(pp.barcode, '') AS barcode,
      COALESCE(
        pt.name->>'es_EC',
        pt.name->>'es_ES',
        pt.name->>'en_US',
        pt.name::text,
        ''
      ) AS product_name,
      COALESCE(pp.weight, pt.weight, 0) AS weight,
      COALESCE(pp.volume, pt.volume, 0) AS volume,
      COALESCE(pp.product_length, 0) AS product_length,
      COALESCE(pp.product_height, 0) AS product_height,
      COALESCE(pp.product_width, 0) AS product_width
    FROM public.product_product pp
    JOIN public.product_template pt ON pt.id = pp.product_tmpl_id
    LEFT JOIN public.mrp_bom b ON b.product_tmpl_id = pt.id
      AND COALESCE(b.active, true) = true
      AND (b.product_id IS NULL OR b.product_id = pp.id)
    WHERE pp.barcode = $1 OR pp.default_code = $1
    ORDER BY
      CASE WHEN b.product_id = pp.id THEN 0 ELSE 1 END,
      b.sequence NULLS LAST,
      b.id DESC
    LIMIT 1
    `,
    [code],
  );

  if (!rows[0]) return null;
  return resolveLabelProduct(rows[0]);
}

/** OPR fija: el lote manual siempre queda PREFIJO/OPR/NUMERO (ej. PLCOL/OPR/00450). */
export function buildManualOrderName(lotPrefix: string, lotNumber: string): string {
  const prefix = String(lotPrefix || '').trim().toUpperCase();
  const number = String(lotNumber || '').trim();
  if (!prefix || !number) return '';
  return `${prefix}/OPR/${number}`;
}

/**
 * Construye una OP "virtual" para imprimir por EAN sin que exista en Odoo:
 * el usuario indica producto (EAN), cantidad y lote/OP a mano.
 */
export async function buildManualOrder(
  ean: string,
  qty: number,
  orderName: string,
): Promise<OrderWithLines> {
  const name = String(orderName || '').trim();
  if (!name) {
    throw new Error('Debes indicar el lote/OP (prefijo y número)');
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error('Debes indicar una cantidad válida');
  }

  const product = await getProductByEan(ean);
  if (!product) {
    throw new Error(`Producto no encontrado con el código: ${ean}`);
  }

  return {
    id: 0,
    name,
    lotNumber: name,
    productionDate: new Date(),
    state: 'manual',
    inspectorName: null,
    lines: [{ quantity: new Decimal(qty), product }],
  };
}

async function resolveInspectorName(userId: number | null | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const rows = await odooQuery<{ name: string | null }>(
      `SELECT COALESCE(p.name, u.login, '') AS name
       FROM public.res_users u
       LEFT JOIN public.res_partner p ON p.id = u.partner_id
       WHERE u.id = $1
       LIMIT 1`,
      [userId],
    );
    const name = String(rows[0]?.name || '').trim();
    return name || null;
  } catch (err) {
    // Sin GRANT SELECT en res_users/res_partner el inspector no se puede resolver.
    console.warn(
      '[odoo] No se pudo leer inspector (res_users/res_partner):',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

async function mapOdooRowToOrder(row: OdooOrderRow): Promise<OrderWithLines> {
  const productionDate =
    row.production_date instanceof Date
      ? row.production_date
      : new Date(String(row.production_date || Date.now()));

  const product = await resolveLabelProduct(row);
  // Sin lote en Odoo: usar el nombre de la OPR como lote (texto y QR).
  const lotNumber = String(row.lot_number || '').trim() || String(row.name || '').trim();
  const inspectorName = await resolveInspectorName(row.user_id);

  return {
    id: row.id,
    name: row.name,
    lotNumber,
    productionDate,
    state: row.state,
    inspectorName,
    lines: [
      {
        quantity: dec(row.product_qty),
        product,
      },
    ],
  };
}

type OdooListRow = {
  id: number;
  name: string;
  lot_number: string | null;
  production_date: Date | string | null;
  state: string;
};

function listSummary(row: OdooListRow | OdooOrderRow) {
  return {
    id: row.id,
    name: row.name,
    lotNumber: String(row.lot_number || '').trim() || String(row.name || '').trim(),
    productionDate:
      row.production_date instanceof Date
        ? row.production_date
        : new Date(String(row.production_date || Date.now())),
    state: row.state,
  };
}

/** Convierte texto de búsqueda a patrón ILIKE.
 *  - sin comodines → contiene (…texto…)
 *  - con % o * → comodín (ej. tap%1070 o tap*1070 → %tap%1070%)
 *  - _ → un carácter
 */
function buildSearchPattern(raw: string): string {
  let q = String(raw || '').trim();
  if (!q) return '%';

  // * es más cómodo en teclado; es equivalente a %
  q = q.replace(/\*/g, '%');

  const hasWildcard = /[%_]/.test(q);
  if (!hasWildcard) {
    return `%${q}%`;
  }

  // Con comodines del usuario: aún envolvemos para que "tap%1070" encuentre "PLTAP/OPR/01070"
  if (!q.startsWith('%')) q = `%${q}`;
  if (!q.endsWith('%')) q = `${q}%`;
  return q;
}

function requireOdoo(): void {
  if (!isOdooEnabled()) {
    throw new Error(
      'ODOO_DATABASE_URL no configurada. Las órdenes se leen solo desde PostgreSQL de Odoo.',
    );
  }
}

export async function listOrders() {
  requireOdoo();
  const rows = await odooQuery<OdooListRow>(
    `${ORDER_LIST_SELECT}
     WHERE mp.state IN ('confirmed', 'progress', 'to_close', 'done')
     ORDER BY mp.id DESC
     LIMIT 100`,
  );
  return rows.map(listSummary);
}

export async function searchOrders(query: string) {
  requireOdoo();
  const pattern = buildSearchPattern(query);
  const rows = await odooQuery<OdooListRow>(
    `${ORDER_LIST_SELECT}
     WHERE (
       mp.name ILIKE $1
       OR COALESCE(sl.name, '') ILIKE $1
     )
     ORDER BY mp.id DESC
     LIMIT 50`,
    [pattern],
  );
  return rows.map(listSummary);
}

export async function getOrderById(id: number): Promise<OrderWithLines | null> {
  requireOdoo();
  const rows = await odooQuery<OdooOrderRow>(`${ORDER_SELECT} WHERE mp.id = $1 LIMIT 1`, [id]);
  if (!rows[0]) return null;
  return mapOdooRowToOrder(rows[0]);
}

/**
 * Lista plantillas para el selector.
 * Une catálogo en disco con BD (si existe), para que plantillas nuevas
 * aparezcan aunque aún no estén sembradas en label_templates.
 */
export async function listTemplates() {
  const labelsDir = join(process.cwd(), 'server', 'templates', 'labels');

  const fromDisk = TEMPLATE_CATALOG.filter((t) =>
    existsSync(join(labelsDir, t.code, 'template.hbs')),
  ).map((t, index) => ({
    id: index + 1,
    code: t.code,
    name: t.name,
    isActive: true,
  }));

  return fromDisk.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export type { ProductWithBom };
