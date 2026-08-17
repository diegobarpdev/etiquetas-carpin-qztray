import { LabelData } from '../types';

export interface LabelSelection {
  groups?: string[];
  from?: number;
  to?: number;
  index?: number;
  units?: number[];
}

export function lineGroupId(lineIndex: number): string {
  return `L${lineIndex}`;
}

export function componentGroupId(lineIndex: number, internalRef: string): string {
  return `${lineGroupId(lineIndex)}:C${internalRef}`;
}

function parseUnitToken(token: string): number[] {
  const value = token.trim();
  if (!value) return [];

  const rangeMatch = value.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    if (start < 1 || end < 1 || start > end) {
      throw new Error(`Rango de unidades inválido: "${value}"`);
    }
    return Array.from({ length: end - start + 1 }, (_, idx) => start + idx);
  }

  const unit = parseInt(value, 10);
  if (!Number.isNaN(unit) && unit >= 1) return [unit];
  throw new Error(`Unidad inválida: "${value}"`);
}

export function parseLabelSelection(query: Record<string, unknown>): LabelSelection {
  const selection: LabelSelection = {};

  const groupsRaw = query.groups;
  if (typeof groupsRaw === 'string') {
    selection.groups = groupsRaw.trim()
      ? groupsRaw
          .split(',')
          .map((g) => g.trim())
          .filter(Boolean)
      : [];
  }

  const fromRaw = query.from;
  if (fromRaw !== undefined && fromRaw !== null && fromRaw !== '') {
    const from = parseInt(String(fromRaw), 10);
    if (!isNaN(from) && from >= 1) selection.from = from;
  }

  const toRaw = query.to;
  if (toRaw !== undefined && toRaw !== null && toRaw !== '') {
    const to = parseInt(String(toRaw), 10);
    if (!isNaN(to) && to >= 1) selection.to = to;
  }

  const indexRaw = query.index;
  if (indexRaw !== undefined && indexRaw !== null && indexRaw !== '') {
    const index = parseInt(String(indexRaw), 10);
    if (!isNaN(index) && index >= 0) selection.index = index;
  }

  const unitsRaw = query.units;
  if (typeof unitsRaw === 'string') {
    const tokens = unitsRaw
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean);
    if (tokens.length > 0) {
      selection.units = [...new Set(tokens.flatMap(parseUnitToken))].sort((a, b) => a - b);
    }
  }

  return selection;
}

export function filterLabelsByGroups(
  labels: LabelData[],
  groupIds?: string[],
): LabelData[] {
  if (groupIds === undefined) return labels;
  if (groupIds.length === 0) return [];

  const selected = new Set(groupIds);
  return labels.filter((label) =>
    label.selectionGroupIds.some((groupId) => selected.has(groupId)),
  );
}

export function applyRangeToLabels(
  labels: LabelData[],
  from?: number,
  to?: number,
): LabelData[] {
  if (from === undefined && to === undefined) return labels;

  const start = Math.max(0, (from ?? 1) - 1);
  // `to` es inclusivo (1-based): rango 1–2 → exactamente 2 etiquetas.
  const endExclusive =
    to === undefined ? labels.length : Math.max(start, to);
  if (start >= labels.length) return [];
  return labels.slice(start, endExclusive);
}

export function filterLabelsByUnits(labels: LabelData[], units?: number[]): LabelData[] {
  if (units === undefined) return labels;
  if (units.length === 0) return [];

  const selectedUnits = new Set(units.map((unit) => unit - 1));
  return labels.filter((label) => {
    if (label.orderUnitIndex === undefined) return false;
    const packed = Math.max(1, label.unitsPacked ?? 1);
    for (let u = label.orderUnitIndex; u < label.orderUnitIndex + packed; u += 1) {
      if (selectedUnits.has(u)) return true;
    }
    return false;
  });
}

export function applyLabelSelection(
  labels: LabelData[],
  selection: LabelSelection,
): LabelData[] {
  let filtered = filterLabelsByGroups(labels, selection.groups);
  filtered = filterLabelsByUnits(filtered, selection.units);

  if (selection.index !== undefined) {
    if (selection.index < 0 || selection.index >= filtered.length) {
      throw new Error('Índice de etiqueta fuera de rango');
    }
    return filtered.slice(selection.index, selection.index + 1);
  }

  filtered = applyRangeToLabels(filtered, selection.from, selection.to);
  return filtered;
}
