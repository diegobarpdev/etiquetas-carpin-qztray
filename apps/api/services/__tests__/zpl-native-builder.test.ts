import { describe, it, expect } from 'vitest';
import { buildNativeLabelZpl, supportsNativeZpl } from '../zpl-native-builder.service';
import { LabelData } from '../../types';

function baseLabel(overrides: Partial<LabelData> = {}): LabelData {
  return {
    productName: 'Colchon Milo King 2.00 x 2.00',
    shortName: 'Colchon Milo King',
    ean: '7861000001234',
    internalRef: 'COL-MILO-KING',
    lotNumber: 'LOTE-2026-001',
    orderName: 'OPR/00861',
    bultoCurrent: 1,
    bultoTotal: 2,
    quantity: 5,
    serialCurrent: 3,
    serialTotal: 10,
    weightKg: '35.5',
    productionDate: '2026-08-18',
    height: '30',
    width: '200',
    length: '200',
    volumeM3: '1.2',
    templateCode: 'bulto-estandar',
    showInternalRefQr: true,
    qrSku: '7861000001234',
    qrInternalRef: 'COL-MILO-KING',
    qrLotNumber: 'LOTE-2026-001',
    finishInstructions: 'LINEA UNO\nLINEA DOS',
    showKitSubproduct: false,
    selectionGroupIds: [],
    globalIndex: 0,
    ...overrides,
  };
}

const OPTS = {
  dpi: 203,
  printMode: 'tear' as const,
  thermalMethod: 'direct' as const,
  mediaType: 'gap' as const,
  printSpeedIps: 6,
  printDarkness: 15,
};

describe('supportsNativeZpl', () => {
  it('solo admite las 3 plantillas triviales', () => {
    expect(supportsNativeZpl('bulto-estandar')).toBe(true);
    expect(supportsNativeZpl('colchon-v1')).toBe(true);
    expect(supportsNativeZpl('colchon-v2')).toBe(true);
    expect(supportsNativeZpl('carpenter-tela')).toBe(false);
    expect(supportsNativeZpl('producto-conforme')).toBe(false);
  });
});

describe('buildNativeLabelZpl', () => {
  it('rechaza plantillas sin generador nativo', () => {
    const label = baseLabel({ templateCode: 'carpenter-tela' });
    expect(() => buildNativeLabelZpl(label, OPTS)).toThrow(/sin generador ZPL nativo/);
  });

  it('produce un bloque ^XA...^XZ autocontenido de 100x150mm a 203dpi (rotado -90° para el cabezal ~104mm)', () => {
    const result = buildNativeLabelZpl(baseLabel(), OPTS);
    expect(result.widthMm).toBe(100);
    expect(result.heightMm).toBe(150);
    expect(result.widthDots).toBe(799); // round(100/25.4*203)
    expect(result.heightDots).toBe(1199); // round(150/25.4*203)
    expect(result.zpl.startsWith('^XA')).toBe(true);
    expect(result.zpl.trim().endsWith('^XZ')).toBe(true);
    expect(result.zpl).toContain('^CI28'); // UTF-8, por acentos
  });

  it('incluye los 3 QR (sku/ref/lote) cuando showInternalRefQr=true', () => {
    const label = baseLabel({ showInternalRefQr: true });
    const { zpl } = buildNativeLabelZpl(label, OPTS);
    const qrCount = (zpl.match(/\^BQB,2,/g) || []).length;
    expect(qrCount).toBe(3);
    expect(zpl).toContain(`^FDQA,${label.qrSku}^FS`);
    expect(zpl).toContain(`^FDQA,${label.qrInternalRef}^FS`);
    expect(zpl).toContain(`^FDQA,${label.qrLotNumber}^FS`);
  });

  it('omite el QR de referencia interna cuando showInternalRefQr=false', () => {
    const label = baseLabel({ showInternalRefQr: false });
    const { zpl } = buildNativeLabelZpl(label, OPTS);
    const qrCount = (zpl.match(/\^BQB,2,/g) || []).length;
    expect(qrCount).toBe(2);
    expect(zpl).not.toContain(`^FDQA,${label.qrInternalRef}^FS`);
  });

  it('el QR de lote cae a orderName cuando no hay qrLotNumber (mismo fallback que registry.ts)', () => {
    const label = baseLabel({ qrLotNumber: '', orderName: 'OPR/00999' });
    const { zpl } = buildNativeLabelZpl(label, OPTS);
    expect(zpl).toContain('^FDQA,OPR/00999^FS');
  });

  it('bulto-estandar imprime BULTO/CANTIDAD; colchon-v1/v2 imprimen SERIAL + instrucciones', () => {
    const bulto = buildNativeLabelZpl(baseLabel({ templateCode: 'bulto-estandar' }), OPTS);
    expect(bulto.zpl).toContain('BULTO: 1-2');
    expect(bulto.zpl).toContain('CANTIDAD: 5');
    expect(bulto.zpl).not.toContain('SERIAL:');

    const v1 = buildNativeLabelZpl(baseLabel({ templateCode: 'colchon-v1' }), OPTS);
    expect(v1.zpl).toContain('SERIAL: 3/10');
    expect(v1.zpl).toContain('LINEA UNO');
    expect(v1.zpl).toContain('LINEA DOS');
    expect(v1.zpl).not.toContain('BULTO:');
  });

  it('las líneas de instrucciones no se salen del label físico (rotado)', () => {
    const manyLines = 'UNO\nDOS\nTRES\nCUATRO\nCINCO\nSEIS';
    const label = baseLabel({ templateCode: 'colchon-v2', finishInstructions: manyLines });
    const result = buildNativeLabelZpl(label, OPTS);
    const yPositions = [...result.zpl.matchAll(/\^FO\d+,(\d+)\^A0B/g)].map((m) => Number(m[1]));
    expect(Math.max(...yPositions)).toBeLessThan(result.heightDots);
  });

  it('sanea ^ y ~ en texto libre para no romper el stream ZPL', () => {
    const label = baseLabel({ productName: 'Sofa ^Rustico~ 3 plazas' });
    const { zpl } = buildNativeLabelZpl(label, OPTS);
    expect(zpl).toContain('SOFA RUSTICO 3 PLAZAS');
  });

  it('aplica hardware (^MMT/^MTD/^MNY/^PR/^MD) igual que el path legacy', () => {
    const { zpl } = buildNativeLabelZpl(baseLabel(), OPTS);
    expect(zpl).toContain('^MMT');
    expect(zpl).toContain('^MTD');
    expect(zpl).toContain('^MNY');
    expect(zpl).toContain('^PR6');
    expect(zpl).toContain('^MD15');
  });

  it('respeta copies > 1 con ^PQ', () => {
    const { zpl } = buildNativeLabelZpl(baseLabel(), { ...OPTS, copies: 3 });
    expect(zpl).toContain('^PQ3,0,1,Y');
  });
});
