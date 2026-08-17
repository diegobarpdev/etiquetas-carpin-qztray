import { describe, it, expect } from 'vitest';
import {
  applyLabelSelection,
  componentGroupId,
  filterLabelsByGroups,
  filterLabelsByUnits,
  lineGroupId,
} from '../label-selection.service';
import { LabelData } from '../../types';

function makeLabel(
  overrides: Partial<LabelData> & { selectionGroupIds: string[]; globalIndex: number },
): LabelData {
  return {
    productName: 'Test',
    shortName: 'Test',
    ean: '123',
    internalRef: 'REF',
    lotNumber: 'LOT',
    orderName: 'ORD',
    bultoCurrent: 1,
    bultoTotal: 1,
    quantity: 1,
    serialCurrent: 1,
    serialTotal: 1,
    weightKg: '1',
    productionDate: '2026-01-01',
    height: '1',
    width: '1',
    length: '1',
    volumeM3: '1',
    templateCode: 'bulto-estandar',
    showInternalRefQr: false,
    qrSku: '123',
    qrInternalRef: 'REF',
    qrLotNumber: 'LOT',
    finishInstructions: '',
    ...overrides,
  };
}

describe('LabelSelectionService', () => {
  const labels = [
    makeLabel({ internalRef: 'A', selectionGroupIds: ['L0'], globalIndex: 0 }),
    makeLabel({ internalRef: 'B', selectionGroupIds: ['L1'], globalIndex: 1 }),
    makeLabel({
      internalRef: 'CAB',
      selectionGroupIds: ['L2', 'L2:CCAB'],
      globalIndex: 2,
      orderUnitIndex: 0,
    }),
    makeLabel({
      internalRef: 'VEL',
      selectionGroupIds: ['L2', 'L2:CVEL'],
      globalIndex: 3,
      orderUnitIndex: 1,
    }),
  ];

  it('genera ids de grupo por línea y componente', () => {
    expect(lineGroupId(0)).toBe('L0');
    expect(componentGroupId(1, '7861223913996')).toBe('L1:C7861223913996');
  });

  it('filtra por grupos seleccionados', () => {
    const filtered = filterLabelsByGroups(labels, ['L1']);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].internalRef).toBe('B');
  });

  it('filtra componente de kit sin incluir otros del mismo kit', () => {
    const filtered = filterLabelsByGroups(labels, ['L2:CCAB']);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].internalRef).toBe('CAB');
  });

  it('incluye todo el kit al seleccionar la línea padre', () => {
    const filtered = filterLabelsByGroups(labels, ['L2']);
    expect(filtered).toHaveLength(2);
  });

  it('aplica rango 1-based sobre etiquetas filtradas', () => {
    const result = applyLabelSelection(labels, { from: 2, to: 3 });
    expect(result).toHaveLength(2);
    expect(result[0].globalIndex).toBe(1);
    expect(result[1].globalIndex).toBe(2);
  });

  it('rango 1–2 devuelve exactamente 2 etiquetas', () => {
    const result = applyLabelSelection(labels, { from: 1, to: 2 });
    expect(result).toHaveLength(2);
  });

  it('filtra por unidades de la orden (1-based)', () => {
    const filtered = filterLabelsByUnits(labels, [2]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].internalRef).toBe('VEL');
  });

  it('devuelve una sola etiqueta por índice', () => {
    const filtered = filterLabelsByGroups(labels, ['L2']);
    const result = applyLabelSelection(filtered, { index: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].internalRef).toBe('VEL');
  });

  it('combina grupos y rango', () => {
    const allKit = filterLabelsByGroups(labels, ['L2']);
    const result = applyLabelSelection(allKit, { from: 1, to: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].internalRef).toBe('CAB');
  });

  it('combina grupos y unidades específicas', () => {
    const allKit = filterLabelsByGroups(labels, ['L2']);
    const result = applyLabelSelection(allKit, { units: [2] });
    expect(result).toHaveLength(1);
    expect(result[0].internalRef).toBe('VEL');
  });
});
