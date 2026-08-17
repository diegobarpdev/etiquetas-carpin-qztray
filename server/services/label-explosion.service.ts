import { LabelData, LabelSelectionGroup, LabelSummaryItem, OrderWithLines, ProductWithBom } from '../types';
import {
  componentGroupId,
  lineGroupId,
} from './label-selection.service';
import {
  COLCHON_V1_FINISH_INSTRUCTIONS,
  COLCHON_V2_FINISH_INSTRUCTIONS,
  PRODUCTO_CONFORME_MADE_IN,
  PRODUCTO_CONFORME_SUBTITLE,
  PRODUCTO_CONFORME_TITLE,
  PRODUCTO_TERMINADO_FACTORY_FOOTER,
} from '../config/constants';

function formatDecimal(value: { toString(): string }, decimals = 4): string {
  return Number(value.toString()).toFixed(decimals).replace('.', ',');
}

/** Peso legible: sin ceros de más (32,9000 → 32,9; 10,0000 → 10). */
function formatWeight(value: { toString(): string } | string): string {
  const n = Number(String(typeof value === 'string' ? value : value.toString()).replace(',', '.'));
  if (!Number.isFinite(n)) return '0';
  const trimmed = n
    .toFixed(4)
    .replace(/(\.\d*?[1-9])0+$/, '$1')
    .replace(/\.0+$/, '')
    .replace('.', ',');
  return trimmed === '-0' ? '0' : trimmed;
}

function formatDimension(value: { toString(): string }): string {
  return Number(value.toString()).toFixed(1).replace('.', ',');
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function conformeExtras() {
  return {
    finishInstructions: '',
    conformeTitle: PRODUCTO_CONFORME_TITLE,
    conformeSubtitle: PRODUCTO_CONFORME_SUBTITLE,
    madeIn: PRODUCTO_CONFORME_MADE_IN,
    showInternalRefQr: false,
  };
}

function skuQrFromLabel(templateCode: string, label: LabelData): string {
  if (templateCode === 'producto-conforme') return label.internalRef;
  if (
    templateCode === 'producto-conforme-papel' ||
    templateCode === 'producto-conforme-papel-colchones'
  )
    return label.ean;
  return label.qrSku;
}

function templateExtras(templateCode: string) {
  switch (templateCode) {
    case 'colchon-v1':
      return {
        finishInstructions: COLCHON_V1_FINISH_INSTRUCTIONS,
        factoryFooter: PRODUCTO_TERMINADO_FACTORY_FOOTER,
      };
    case 'colchon-v2':
      return {
        finishInstructions: COLCHON_V2_FINISH_INSTRUCTIONS,
        factoryFooter: PRODUCTO_TERMINADO_FACTORY_FOOTER,
      };
    case 'bulto-estandar':
    case 'producto-terminado-carpenter':
      return {
        finishInstructions: '',
        factoryFooter: PRODUCTO_TERMINADO_FACTORY_FOOTER,
        madeIn: PRODUCTO_CONFORME_MADE_IN,
      };
    case 'producto-conforme':
    case 'producto-conforme-papel':
    case 'producto-conforme-papel-colchones':
      return conformeExtras();
    case 'carpinteria':
    case 'carpenter-tela':
      return {
        finishInstructions: '',
        madeIn: PRODUCTO_CONFORME_MADE_IN,
        showInternalRefQr: false,
      };
    default:
      return { finishInstructions: '' };
  }
}

function buildLabelData(
  product: ProductWithBom,
  order: OrderWithLines,
  bultoCurrent: number,
  bultoTotal: number,
  parentProduct?: ProductWithBom,
  serialCurrent?: number,
  serialTotal?: number,
): Omit<LabelData, 'selectionGroupIds' | 'globalIndex'> {
  const componentName = product.shortName || product.name;
  const titleName = parentProduct
    ? parentProduct.shortName || parentProduct.name
    : componentName;

  const templateCode = product.labelTemplate.code;
  const extras = templateExtras(templateCode);
  const isKitComponent = Boolean(parentProduct);
  // En kit: SKU/EAN = código del producto padre; QR del medio = ref del subproducto.
  const eanForLabel = parentProduct?.ean || product.ean;
  const skuQr =
    templateCode === 'producto-conforme' ? product.internalRef : eanForLabel;
  const showKitSubproduct = isKitComponent;
  const subproductName = showKitSubproduct
    ? componentName.length > 35
      ? `${componentName.slice(0, 35)}...`
      : componentName
    : undefined;
  const showInternalRefQr =
    extras.showInternalRefQr !== undefined
      ? extras.showInternalRefQr
      : isKitComponent
        ? true
        : product.internalRef !== eanForLabel;

  // Sin lote: usar la OPR como número de lote (impreso y en QR).
  const lotNumber = String(order.lotNumber || '').trim() || String(order.name || '').trim();

  return {
    productName: titleName,
    shortName: componentName,
    ean: eanForLabel,
    internalRef: product.internalRef,
    lotNumber,
    orderName: order.name,
    bultoCurrent,
    bultoTotal,
    quantity: 1,
    serialCurrent: serialCurrent ?? bultoCurrent,
    serialTotal: serialTotal ?? bultoTotal,
    weightKg: isConformeTemplate(templateCode)
      ? formatWeight(product.weightKg)
      : formatDecimal(product.weightKg),
    productionDate: formatDate(order.productionDate),
    height: formatDimension(product.height),
    width: formatDimension(product.width),
    length: formatDimension(product.length),
    volumeM3: formatDecimal(product.volumeM3),
    templateCode,
    ...extras,
    showInternalRefQr,
    qrSku: skuQr,
    qrInternalRef: product.internalRef,
    qrLotNumber: lotNumber,
    inspectorName: '',
    showKitSubproduct,
    subproductName,
  };
}

function getKitBom(product: ProductWithBom) {
  return product.boms.find((bom) => bom.type === 'kit');
}

function pieceKeyFromProduct(product: ProductWithBom): string {
  return (product.shortName || product.name || product.internalRef)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isConformeTemplate(templateCode: string): boolean {
  return (
    templateCode === 'producto-conforme' ||
    templateCode === 'producto-conforme-papel' ||
    templateCode === 'producto-conforme-papel-colchones' ||
    templateCode === 'carpinteria' ||
    templateCode === 'carpenter-tela'
  );
}

/** SERIAL / N/S = unidad de producto (no bulto físico). */
function usesProductSerial(templateCode: string): boolean {
  return (
    isConformeTemplate(templateCode) ||
    templateCode === 'colchon-v1' ||
    templateCode === 'colchon-v2'
  );
}

function explodeProduct(
  product: ProductWithBom,
  orderQty: number,
): Array<{ product: ProductWithBom; componentQty: number }> {
  const kitBom = getKitBom(product);

  if (kitBom) {
    return kitBom.lines.map((line) => ({
      product: line.componentProduct,
      componentQty: Number(line.quantity.toString()) * orderQty,
    }));
  }

  return [{ product, componentQty: orderQty }];
}

function pushLabel(
  labels: LabelData[],
  label: Omit<LabelData, 'selectionGroupIds' | 'globalIndex'>,
  selectionGroupIds: string[],
  globalIndex: number,
): void {
  labels.push({
    ...label,
    selectionGroupIds,
    globalIndex,
  });
}

export function buildLabelGroups(
  order: OrderWithLines,
  options?: LabelExplosionOptions,
): LabelSelectionGroup[] {
  const groups: LabelSelectionGroup[] = [];
  const dual = shouldApplyDualPacking(order, options);
  const packRows = resolveCustomPackRows(order, options);

  order.lines.forEach((line, lineIndex) => {
    const orderQty = Number(line.quantity.toString());
    const kitBom = getKitBom(line.product);
    const lineId = lineGroupId(lineIndex);

    if (kitBom) {
      const children = kitBom.lines.map((bomLine) => {
        const bomLineQty = Math.max(1, Number(bomLine.quantity.toString()));
        const component = bomLine.componentProduct;
        const labelCount = options?.expandBomQuantityToLabels
          ? orderQty * bomLineQty
          : orderQty;
        return {
          id: componentGroupId(lineIndex, component.internalRef),
          label: component.shortName || component.name,
          parentId: lineId,
          internalRef: component.internalRef,
          // Producto terminado: 1 etiqueta/tipo/unidad (qty en campo).
          // Conforme: 1 etiqueta por pieza LDM.
          labelCount,
          isKitParent: false,
        };
      });

      groups.push({
        id: lineId,
        label: `${line.product.shortName || line.product.name} (kit completo)`,
        internalRef: line.product.internalRef,
        labelCount: children.reduce((sum, child) => sum + child.labelCount, 0),
        isKitParent: true,
      });
      groups.push(...children);
    } else {
      const bultosPerUnit = Math.max(1, line.product.numBultos);
      const labelCount = packRows
        ? customPackLabelCount(packRows)
        : dualLabelCount(orderQty, dual) * bultosPerUnit;
      groups.push({
        id: lineId,
        label: line.product.shortName || line.product.name,
        internalRef: line.product.internalRef,
        labelCount,
        isKitParent: false,
      });
    }
  });

  return groups;
}

export type CustomPackRow = {
  /** Unidades por bulto */
  qty: number;
  /** Número de bultos con esa cantidad */
  count: number;
};

export type LabelExplosionOptions = {
  /** Agrupa 2 unidades por etiqueta. BULTO no cambia. */
  dualPacking?: boolean;
  /**
   * Si true, aplica dual sin exigir prefijo PLSIL/
   * (p. ej. ADHESIVO - PRODUCTO TERMINADO CARPENTER / sillas).
   */
  dualPackingAnyOrder?: boolean;
  /**
   * Reparto personalizado (PLLEN): filas qty×count.
   * La suma debe coincidir con la cantidad de cada línea no-kit.
   */
  customPacking?: CustomPackRow[];
  /**
   * Conforme / Carpenter: en kits, LDM qty 2 → 2 etiquetas (no 1 con CANTIDAD 2).
   * Producto terminado: false (1 etiqueta con quantity = LDM).
   */
  expandBomQuantityToLabels?: boolean;
  /** Cantidades personalizadas por bulto/componente (ej. { "2-2": 10 }) */
  bultoQuantities?: Record<string, number>;
};

export function isPlsilOrder(orderName: string): boolean {
  return String(orderName || '')
    .trim()
    .toUpperCase()
    .startsWith('PLSIL/');
}

export function isPllenOrder(orderName: string): boolean {
  return String(orderName || '')
    .trim()
    .toUpperCase()
    .startsWith('PLLEN/');
}

/** Suma qty×count de un plan de empaque. */
export function customPackingTotal(rows: CustomPackRow[]): number {
  return rows.reduce((sum, row) => sum + row.qty * row.count, 0);
}

/** Expande el plan a una lista de cantidades por etiqueta/bulto. */
export function expandCustomPackSizes(rows: CustomPackRow[]): number[] {
  const sizes: number[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.count; i += 1) {
      sizes.push(row.qty);
    }
  }
  return sizes;
}

/**
 * Parsea `20x7,10x1` o JSON `[{qty,count},…]`.
 * Devuelve [] si el input está vacío.
 */
export function parseCustomPacking(raw: unknown): CustomPackRow[] {
  if (raw === undefined || raw === null || raw === '') return [];

  if (Array.isArray(raw)) {
    return normalizeCustomPackRows(raw);
  }

  if (typeof raw === 'object') {
    return normalizeCustomPackRows([raw]);
  }

  const text = String(raw).trim();
  if (!text) return [];

  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error('Reparto inválido: se esperaba un arreglo JSON');
      }
      return normalizeCustomPackRows(parsed);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Reparto')) throw err;
      throw new Error('Reparto inválido: JSON mal formado');
    }
  }

  const rows: CustomPackRow[] = [];
  for (const token of text.split(',')) {
    const part = token.trim();
    if (!part) continue;
    const match = part.match(/^(\d+)\s*[xX×]\s*(\d+)$/);
    if (!match) {
      throw new Error(`Reparto inválido: "${part}" (use ej. 20x7,10x1)`);
    }
    rows.push({
      qty: parseInt(match[1], 10),
      count: parseInt(match[2], 10),
    });
  }
  return normalizeCustomPackRows(rows);
}

function normalizeCustomPackRows(rawRows: unknown[]): CustomPackRow[] {
  const rows: CustomPackRow[] = [];
  for (const item of rawRows) {
    if (!item || typeof item !== 'object') {
      throw new Error('Reparto inválido: cada fila debe ser { qty, count }');
    }
    const row = item as Record<string, unknown>;
    const qty = Number(row.qty ?? row.quantity ?? row.uds);
    const count = Number(row.count ?? row.bultos ?? row.n);
    if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < 1) {
      throw new Error('Reparto inválido: uds por bulto debe ser entero ≥ 1');
    }
    if (!Number.isFinite(count) || !Number.isInteger(count) || count < 1) {
      throw new Error('Reparto inválido: nº de bultos debe ser entero ≥ 1');
    }
    rows.push({ qty, count });
  }
  return rows;
}

function resolveCustomPackRows(
  order: OrderWithLines,
  options?: LabelExplosionOptions,
): CustomPackRow[] | null {
  const rows = options?.customPacking;
  if (!rows || rows.length === 0) return null;
  return rows;
}

function customPackLabelCount(rows: CustomPackRow[]): number {
  return rows.reduce((sum, row) => sum + row.count, 0);
}

function customPackBultoDisplay(rows: CustomPackRow[]): string {
  return rows.map((row) => `1-${row.count}`).join(', ');
}

export function parseBultoQuantities(raw: unknown): Record<string, number> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const res: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const num = Number(v);
      if (Number.isFinite(num) && num > 0) res[k] = num;
    }
    return res;
  }
  const text = String(raw).trim();
  if (!text) return {};
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      return parseBultoQuantities(parsed);
    } catch {
      return {};
    }
  }
  const res: Record<string, number> = {};
  text.split(',').forEach((part) => {
    const [key, val] = part.split(':').map((s) => s.trim());
    if (key && val) {
      const num = Number(val);
      if (Number.isFinite(num) && num > 0) res[key] = num;
    }
  });
  return res;
}

function resolveCustomBultoQuantity(
  options: LabelExplosionOptions | undefined,
  groupIds: string[],
  bultoCurrent: number,
  bultoTotal: number,
  productRef: string,
): number | undefined {
  if (!options?.bultoQuantities) return undefined;
  const bMap = options.bultoQuantities;

  for (const gid of groupIds) {
    if (bMap[gid] !== undefined && bMap[gid] > 0) return bMap[gid];
  }

  const bDisplay = `${bultoCurrent}-${bultoTotal}`;
  if (bMap[bDisplay] !== undefined && bMap[bDisplay] > 0) return bMap[bDisplay];

  if (bMap[productRef] !== undefined && bMap[productRef] > 0) return bMap[productRef];

  return undefined;
}

function shouldApplyDualPacking(
  order: OrderWithLines,
  options?: LabelExplosionOptions,
): boolean {
  if (options?.customPacking && options.customPacking.length > 0) return false;
  if (!options?.dualPacking) return false;
  if (options.dualPackingAnyOrder) return true;
  return isPlsilOrder(order.name);
}

function dualOptionsForTemplate(
  templateCode: string | undefined,
  options?: LabelExplosionOptions,
): LabelExplosionOptions {
  return {
    ...options,
    dualPackingAnyOrder:
      Boolean(options?.dualPackingAnyOrder) ||
      templateCode === 'producto-terminado-carpenter',
  };
}

function packingOptionsForTemplate(
  templateCode: string | undefined,
  options?: LabelExplosionOptions,
): LabelExplosionOptions {
  return dualOptionsForTemplate(templateCode, options);
}

function dualLabelCount(orderQty: number, dual: boolean): number {
  if (!dual) return orderQty;
  return Math.ceil(orderQty / 2);
}

export function explodeLabels(
  order: OrderWithLines,
  options?: LabelExplosionOptions,
): LabelData[] {
  const labels: LabelData[] = [];
  let globalIndex = 0;
  const dual = shouldApplyDualPacking(order, options);
  const packRows = resolveCustomPackRows(order, options);

  order.lines.forEach((line, lineIndex) => {
    const orderQty = Number(line.quantity.toString());
    const kitBom = getKitBom(line.product);
    const lineId = lineGroupId(lineIndex);

    if (kitBom) {
      const totalBultos = kitBom.lines.length;
      kitBom.lines.forEach((bomLine, lineIndexInKit) => {
        const bomLineQty = Math.max(1, Number(bomLine.quantity.toString()));
        const product = bomLine.componentProduct;
        const bultoCurrent = lineIndexInKit + 1;
        const compId = componentGroupId(lineIndex, product.internalRef);
        const groupIds = [lineId, compId];
        const customQty = resolveCustomBultoQuantity(
          options,
          groupIds,
          bultoCurrent,
          totalBultos,
          product.internalRef,
        );

        if (customQty !== undefined && customQty > 0) {
          // Bulto personalizado por el usuario (ej. 10 para VIT): 1 sola etiqueta con esa cantidad
          pushLabel(
            labels,
            {
              ...buildLabelData(
                product,
                order,
                bultoCurrent,
                totalBultos,
                line.product,
                1,
                1,
              ),
              quantity: customQty,
              orderUnitIndex: 0,
              orderUnitTotal: 1,
              pieceKey: pieceKeyFromProduct(product),
            },
            groupIds,
            globalIndex,
          );
          globalIndex += 1;
        } else {
          for (let kitUnit = 0; kitUnit < orderQty; kitUnit++) {
            pushLabel(
              labels,
              {
                ...buildLabelData(
                  product,
                  order,
                  bultoCurrent,
                  totalBultos,
                  line.product,
                  kitUnit + 1,
                  orderQty,
                ),
                quantity: bomLineQty,
                orderUnitIndex: kitUnit,
                orderUnitTotal: orderQty,
                pieceKey: pieceKeyFromProduct(product),
              },
              groupIds,
              globalIndex,
            );
            globalIndex += 1;
          }
        }
      });
    } else if (packRows) {
      // Cada fila del reparto numera BULTO por su cuenta (7×20 → 1-7…7-7; 1×10 → 1-1).
      const totalPacks = customPackLabelCount(packRows);
      let packIndex = 0;
      for (const row of packRows) {
        for (let i = 0; i < row.count; i += 1) {
          pushLabel(
            labels,
            {
              ...buildLabelData(line.product, order, i + 1, row.count),
              quantity: row.qty,
              // Filtro "N° de unidad" = índice global de etiqueta del reparto (1…N)
              unitsPacked: 1,
              orderUnitIndex: packIndex,
              orderUnitTotal: totalPacks,
            },
            [lineId],
            globalIndex,
          );
          packIndex += 1;
          globalIndex += 1;
        }
      }
    } else {
      const bultosPerUnit = Math.max(1, line.product.numBultos);
      const isConforme = isConformeTemplate(line.product.labelTemplate.code);
      const withProductSerial = usesProductSerial(line.product.labelTemplate.code);
      const unitsPerLabel = dual && !isConforme ? 2 : 1;

      for (let bulto = 1; bulto <= bultosPerUnit; bulto++) {
        const customQty = resolveCustomBultoQuantity(
          options,
          [lineId],
          bulto,
          bultosPerUnit,
          line.product.internalRef,
        );

        if (customQty !== undefined && customQty > 0) {
          pushLabel(
            labels,
            {
              ...buildLabelData(
                line.product,
                order,
                bulto,
                bultosPerUnit,
                undefined,
                1,
                1,
              ),
              quantity: customQty,
              unitsPacked: customQty,
            },
            [lineId],
            globalIndex,
          );
          labels[labels.length - 1].orderUnitIndex = 0;
          labels[labels.length - 1].orderUnitTotal = 1;
          globalIndex += 1;
        } else {
          for (let unit = 0; unit < orderQty; unit += unitsPerLabel) {
            const packQty = Math.min(unitsPerLabel, orderQty - unit);
            const serialCurrent = withProductSerial ? unit + 1 : undefined;
            const serialTotal = withProductSerial ? orderQty : undefined;

            pushLabel(
              labels,
              {
                ...buildLabelData(
                  line.product,
                  order,
                  bulto,
                  bultosPerUnit,
                  undefined,
                  serialCurrent,
                  serialTotal,
                ),
                quantity: packQty,
                unitsPacked: packQty,
              },
              [lineId],
              globalIndex,
            );
            labels[labels.length - 1].orderUnitIndex = unit;
            labels[labels.length - 1].orderUnitTotal = orderQty;
            globalIndex += 1;
          }
        }
      }
    }
  });

  return labels;
}

export function buildLabelSummary(
  order: OrderWithLines,
  options?: LabelExplosionOptions,
) {
  const summary: LabelSummaryItem[] = [];
  const dual = shouldApplyDualPacking(order, options);
  const packRows = resolveCustomPackRows(order, options);

  for (const line of order.lines) {
    const orderQty = Number(line.quantity.toString());
    const kitBom = getKitBom(line.product);

    if (kitBom) {
      const totalBultos = kitBom.lines.length;
      const children = kitBom.lines.map((bomLine, lineIndex) => {
        const bomLineQty = Math.max(1, Number(bomLine.quantity.toString()));
        const component = bomLine.componentProduct;
        const totalLabels = options?.expandBomQuantityToLabels
          ? orderQty * bomLineQty
          : orderQty;
        return {
          internalRef: component.internalRef,
          productName: component.name,
          componentQuantity: bomLineQty,
          bultoDisplay: `${lineIndex + 1}-${totalBultos}`,
          totalLabels,
          templateCode: component.labelTemplate.code,
          templateName: component.labelTemplate.name,
        };
      });

      summary.push({
        internalRef: line.product.internalRef,
        productName: line.product.name,
        orderQuantity: orderQty,
        isKit: true,
        bultoDisplay: String(totalBultos),
        totalLabels: children.reduce((sum, child) => sum + child.totalLabels, 0),
        templateCode: line.product.labelTemplate.code,
        templateName: line.product.labelTemplate.name,
        children,
      });
    } else {
      const bultosPerUnit = Math.max(1, line.product.numBultos);
      const totalLabels = packRows
        ? customPackLabelCount(packRows)
        : dualLabelCount(orderQty, dual) * bultosPerUnit;

      summary.push({
        internalRef: line.product.internalRef,
        productName: line.product.name,
        orderQuantity: orderQty,
        isKit: false,
        bultoDisplay: packRows
          ? customPackBultoDisplay(packRows)
          : bultosPerUnit === 1
            ? '1-1'
            : String(bultosPerUnit),
        totalLabels,
        templateCode: line.product.labelTemplate.code,
        templateName: line.product.labelTemplate.name,
      });
    }
  }

  return summary;
}

export function applyTemplateOverride(
  labels: LabelData[],
  templateCode?: string,
  options?: LabelExplosionOptions,
): LabelData[] {
  // Conforme / Carpenter: LDM qty 2 → 2 stickers (mismo N/S).
  // Producto terminado: no expandir (1 etiqueta con CANTIDAD = LDM).
  // Aplica con override O con la plantilla propia de cada etiqueta.
  const baseLabels: LabelData[] = labels.flatMap((label) => {
    const effectiveCode = templateCode || label.templateCode;
    // Si la cantidad de bulto fue personalizada explícitamente, conservarla en la etiqueta
    if (options?.bultoQuantities && Object.keys(options.bultoQuantities).length > 0) {
      return [label];
    }
    if (!isConformeTemplate(effectiveCode)) {
      return [label];
    }
    const qty = Math.max(1, Number(label.quantity) || 1);
    if (qty <= 1) return [label];
    return Array.from({ length: qty }, (_, copyIdx) => ({
      ...label,
      quantity: 1,
      globalIndex: label.globalIndex * 1000 + copyIdx,
    }));
  });

  // Sin override: ya expandimos; devolver con índices renumerados si hubo expansión.
  if (!templateCode) {
    const anyExpanded = baseLabels.length !== labels.length;
    if (!anyExpanded) return labels;
    return baseLabels.map((label, idx) => ({ ...label, globalIndex: idx }));
  }

  const withOrderSerial = usesProductSerial(templateCode);

  const serialGroups = new Map<string, number[]>();
  baseLabels.forEach((label, idx) => {
    // En kits: agrupar por unidad de orden para que 2 veladores de la misma cama
    // compartan el mismo N/S (1/30 y 1/30, no 1/30 y 2/30).
    const key =
      label.orderUnitIndex != null
        ? `${label.internalRef}::${label.orderName}::u${label.orderUnitIndex}`
        : `${label.internalRef}::${label.orderName}`;
    if (!serialGroups.has(key)) serialGroups.set(key, []);
    serialGroups.get(key)!.push(idx);
  });

  const serialAt = new Map<number, { current: number; total: number }>();
  for (const indices of serialGroups.values()) {
    const sample = baseLabels[indices[0]];
    if (sample.orderUnitIndex != null && sample.orderUnitTotal != null) {
      const current = sample.orderUnitIndex + 1;
      const total = sample.orderUnitTotal;
      indices.forEach((idx) => {
        serialAt.set(idx, { current, total });
      });
    } else {
      indices.forEach((idx, pos) => {
        serialAt.set(idx, { current: pos + 1, total: indices.length });
      });
    }
  }

  return baseLabels.map((label, idx) => {
    const extras = templateExtras(templateCode);
    const serial = serialAt.get(idx)!;
    return {
      ...label,
      templateCode,
      ...extras,
      showInternalRefQr:
        extras.showInternalRefQr ??
        (label.showKitSubproduct ? true : label.showInternalRefQr),
      qrSku: skuQrFromLabel(templateCode, label),
      selectionGroupIds: label.selectionGroupIds,
      globalIndex: idx,
      orderUnitIndex: label.orderUnitIndex,
      orderUnitTotal: label.orderUnitTotal,
      quantity: label.quantity ?? 1,
      ...(isConformeTemplate(templateCode)
        ? { weightKg: formatWeight(label.weightKg) }
        : {}),
      ...(withOrderSerial
        ? { serialCurrent: serial.current, serialTotal: serial.total }
        : {}),
    };
  });
}

function syncCountsFromLabels(
  groups: LabelSelectionGroup[],
  summary: LabelSummaryItem[],
  labels: LabelData[],
): { groups: LabelSelectionGroup[]; summary: LabelSummaryItem[] } {
  const countByGroupId = new Map<string, number>();
  const countByRef = new Map<string, number>();

  for (const label of labels) {
    countByRef.set(label.internalRef, (countByRef.get(label.internalRef) || 0) + 1);
    for (const gid of label.selectionGroupIds || []) {
      countByGroupId.set(gid, (countByGroupId.get(gid) || 0) + 1);
    }
  }

  const syncedGroups = groups.map((group) => {
    if (group.isKitParent) {
      // Suma de hijos (no de etiquetas del padre: el padre no genera sticker propio)
      const childSum = groups
        .filter((g) => g.parentId === group.id)
        .reduce((sum, child) => sum + (countByGroupId.get(child.id) || 0), 0);
      return { ...group, labelCount: childSum };
    }
    return {
      ...group,
      labelCount: countByGroupId.get(group.id) ?? group.labelCount,
    };
  });

  const syncedSummary = summary.map((item) => {
    if (item.isKit && item.children?.length) {
      const children = item.children.map((child) => ({
        ...child,
        totalLabels: countByRef.get(child.internalRef) ?? child.totalLabels,
      }));
      return {
        ...item,
        totalLabels: children.reduce((sum, c) => sum + c.totalLabels, 0),
        children,
      };
    }
    return {
      ...item,
      totalLabels: countByRef.get(item.internalRef) ?? item.totalLabels,
    };
  });

  return { groups: syncedGroups, summary: syncedSummary };
}

export function buildLabelPreview(
  order: OrderWithLines,
  templateOverride?: string,
  options?: LabelExplosionOptions,
) {
  const effectiveTemplate =
    templateOverride || order.lines[0]?.product.labelTemplate.code;
  const packingOpts = packingOptionsForTemplate(effectiveTemplate, {
    ...options,
    expandBomQuantityToLabels: isConformeTemplate(effectiveTemplate || ''),
  });
  // Solo pasar override si el usuario eligió plantilla; si no, cada etiqueta
  // usa la suya y conforme igual expande LDM qty → N stickers.
  const labels = applyTemplateOverride(
    explodeLabels(order, packingOpts),
    templateOverride,
    packingOpts,
  );
  const { groups, summary } = syncCountsFromLabels(
    buildLabelGroups(order, packingOpts),
    buildLabelSummary(order, packingOpts),
    labels,
  );
  return {
    totalLabels: labels.length,
    summary,
    groups,
    labels,
  };
}

// Export helpers for testing
export const _test = {
  explodeProduct,
  getKitBom,
  buildLabelData,
  formatWeight,
};
