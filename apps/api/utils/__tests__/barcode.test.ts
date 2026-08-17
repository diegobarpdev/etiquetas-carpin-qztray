import { describe, expect, it } from 'vitest';
import {
  ean13ForBarcode,
  formatEan13Display,
  generateEan13DataUri,
  extractOprFiveDigits,
  buildCarpenterTelaSecondaryCode,
  carpenterTelaSecondaryPrefix,
  carpenterTelaSecondaryBody,
} from '../barcode';

describe('barcode', () => {
  it('calcula dígito de control EAN-13', () => {
    expect(ean13ForBarcode('7861214835924')).toBe('7861214835924');
    expect(ean13ForBarcode('0008300000001')).toBe('0008300000003');
  });

  it('genera PNG para referencias con dígito inválido', async () => {
    const uri = await generateEan13DataUri('0008300000001');
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('formatea display EAN-13', () => {
    expect(formatEan13Display('7861214835924')).toBe('7 861214 835924');
    expect(formatEan13Display('0008300000001')).toBe('0 008300 000003');
  });

  it('extrae 5 dígitos OPR', () => {
    expect(extractOprFiveDigits('PSTAB/OPR/00861')).toBe('00861');
    expect(extractOprFiveDigits('PLTEL/OPR/00001')).toBe('00001');
  });

  it('arma código secundario Carpenter tela: 00 + OPR + N/S', () => {
    expect(buildCarpenterTelaSecondaryCode('PSTAB/OPR/00354', 1)).toBe('0000354000001');
    expect(buildCarpenterTelaSecondaryCode('PSTAB/OPR/00354', 2)).toBe('0000354000002');
    expect(buildCarpenterTelaSecondaryCode('PSTAB/OPR/00861', 12)).toBe('0000861000012');
  });

  it('formatea secundario Carpenter como 0 + 6+6 (adhesivo/tela)', () => {
    expect(carpenterTelaSecondaryPrefix('0000123000001')).toBe('0');
    expect(carpenterTelaSecondaryBody('0000123000001')).toBe('000123 000001');
    expect(buildCarpenterTelaSecondaryCode('PSTAB/OPR/00123', 1)).toBe('0000123000001');
  });

  it('producto terminado carpenter usa el mismo código N/S por unidad', () => {
    expect(buildCarpenterTelaSecondaryCode('PLSIL/OPR/00861', 1)).toBe('0000861000001');
  });
});
