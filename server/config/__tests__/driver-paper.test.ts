import { describe, expect, it } from 'vitest';
import {
  DRIVER_PAPER_BY_STOCK,
  getDriverPaperName,
  listDriverPaperNames,
  suggestStockSizeForTemplate,
  getPrintSizeForTemplate,
} from '../../config/constants';

describe('DRIVER_PAPER_BY_STOCK', () => {
  it('mapea cada stock al formulario Windows exacto', () => {
    expect(DRIVER_PAPER_BY_STOCK['producto-terminado']).toBe('producto terminado');
    expect(DRIVER_PAPER_BY_STOCK['producto-conforme']).toBe('producto conforme');
    expect(DRIVER_PAPER_BY_STOCK.carpinteria).toBe('producto conforme');
    expect(DRIVER_PAPER_BY_STOCK['conforme-papel']).toBe('conforme papel');
  });

  it('getDriverPaperName resuelve stock y cae a terminado', () => {
    expect(getDriverPaperName('producto-conforme')).toBe('producto conforme');
    expect(getDriverPaperName('carpinteria')).toBe('producto conforme');
    expect(getDriverPaperName('desconocido')).toBe('producto terminado');
    expect(getDriverPaperName(null)).toBe('producto terminado');
  });

  it('lista nombres únicos de papel', () => {
    const names = listDriverPaperNames();
    expect(names).toContain('producto terminado');
    expect(names).toContain('producto conforme');
    expect(names).toContain('conforme papel');
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('carpenter-tela', () => {
  it('imprime en 60×90 y sugiere stock conforme-papel', () => {
    expect(getPrintSizeForTemplate('carpenter-tela')).toEqual({
      widthMm: 60,
      heightMm: 90,
    });
    expect(suggestStockSizeForTemplate('carpenter-tela')).toBe('conforme-papel');
    expect(getDriverPaperName(suggestStockSizeForTemplate('carpenter-tela'))).toBe(
      'conforme papel',
    );
  });
});

describe('producto-terminado-carpenter', () => {
  it('imprime en 150×100 y sugiere stock producto-terminado', () => {
    expect(getPrintSizeForTemplate('producto-terminado-carpenter')).toEqual({
      widthMm: 150,
      heightMm: 100,
    });
    expect(suggestStockSizeForTemplate('producto-terminado-carpenter')).toBe(
      'producto-terminado',
    );
  });
});

describe('producto-conforme-papel-colchones', () => {
  it('imprime en 60×100 y sugiere stock conforme-papel', () => {
    expect(getPrintSizeForTemplate('producto-conforme-papel-colchones')).toEqual({
      widthMm: 60,
      heightMm: 100,
    });
    expect(suggestStockSizeForTemplate('producto-conforme-papel-colchones')).toBe('conforme-papel-colchones');
    expect(getDriverPaperName(suggestStockSizeForTemplate('producto-conforme-papel-colchones'))).toBe(
      'conforme papel',
    );
  });
});
