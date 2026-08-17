import type {
  AppliedPackingRow,
  CustomPackingRow,
  OrderResponse,
  PrintBatchJob,
  SelectionGroup,
  SummaryItem,
} from '../types';

export function isAllGroupsSelected(
  groups: SelectionGroup[],
  selectedIds: Set<string>,
): boolean {
  if (!groups.length) return true;
  return groups.every((group) => selectedIds.has(group.id));
}

export function formatCustomPackingParam(rows: AppliedPackingRow[]): string {
  return rows.map((row) => `${row.qty}x${row.count}`).join(',');
}

export interface SummaryMeta {
  bultoDisplay: string;
  productName: string;
  isKit: boolean;
}

export function buildSummaryLookup(summary: SummaryItem[] | undefined): Map<string, SummaryMeta> {
  const map = new Map<string, SummaryMeta>();
  (summary || []).forEach((item) => {
    map.set(item.internalRef, {
      bultoDisplay: item.bultoDisplay,
      productName: item.productName,
      isKit: Boolean(item.isKit),
    });
    (item.children || []).forEach((child) => {
      map.set(child.internalRef, {
        bultoDisplay: child.bultoDisplay,
        productName: child.productName,
        isKit: false,
      });
    });
  });
  return map;
}

export function getOrderPackingTotal(lastOrderData: OrderResponse | null): number {
  const lines = lastOrderData?.order?.lines;
  if (!Array.isArray(lines) || lines.length === 0) return 0;
  return Number(lines[0].quantity) || 0;
}

export function getCustomPackingUsed(rows: CustomPackingRow[]): number {
  return rows.reduce((sum, row) => {
    const qty = Math.max(0, Number(row.qty) || 0);
    const count = Math.max(0, Number(row.count) || 0);
    return sum + qty * count;
  }, 0);
}

/** Borrador normalizado; null si vacío o inválido. */
export function buildDraftCustomPackingPlan(
  rows: CustomPackingRow[],
  _lastOrderData?: OrderResponse | null,
): AppliedPackingRow[] | null {
  const normalized = rows
    .map((row) => ({
      qty: Math.floor(Number(row.qty) || 0),
      count: Math.floor(Number(row.count) || 0),
    }))
    .filter((row) => row.qty >= 1 && row.count >= 1);
  if (normalized.length === 0) return null;
  return normalized;
}

export function packingPlansEqual(
  a: AppliedPackingRow[] | null,
  b: AppliedPackingRow[] | null,
): boolean {
  if (!a && !b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((row, i) => row.qty === b[i].qty && row.count === b[i].count);
}

export function isOrderInBatch(batch: PrintBatchJob[], orderId: number | null): boolean {
  if (!orderId) return false;
  return batch.some((job) => job.orderId === Number(orderId));
}

export function getBatchLabelTotal(batch: PrintBatchJob[]): number {
  return batch.reduce((sum, job) => sum + (job.labelCount || 0), 0);
}

export function jobsPayloadFromBatch(batch: PrintBatchJob[]) {
  return batch.map((job) => {
    const payload: Record<string, unknown> = { orderId: job.orderId };
    if (job.groups) payload.groups = job.groups;
    if (job.units) payload.units = job.units;
    if (job.from) payload.from = job.from;
    if (job.to) payload.to = job.to;
    if (job.dualPacking) payload.dualPacking = job.dualPacking;
    if (job.customPacking) payload.customPacking = job.customPacking;
    if (job.bultoQuantities) payload.bultoQuantities = job.bultoQuantities;
    if (job.inspectorName) payload.inspectorName = job.inspectorName;
    return payload;
  });
}
