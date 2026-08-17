import { describe, expect, it } from 'vitest';
import { printerKey, writeConfig, readConfig } from '../printers-config.service';
import { copyFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

describe('printerKey', () => {
  it('es estable estación+windows (case-insensitive)', () => {
    expect(printerKey('st-1', 'Zebra X')).toBe('st-1::zebra x');
    expect(printerKey('ST-1', 'ZEBRA X')).toBe(printerKey('st-1', 'zebra x'));
  });
});

describe('config de estaciones', () => {
  const configPath = join(process.cwd(), 'data', 'printers-config.json');
  const backupPath = join(process.cwd(), 'data', 'printers-config.test-bak.json');

  function withTempConfig(fn: () => void) {
    if (!existsSync(configPath)) return;
    copyFileSync(configPath, backupPath);
    try {
      fn();
    } finally {
      copyFileSync(backupPath, configPath);
      unlinkSync(backupPath);
    }
  }

  it('guarda el catálogo de impresoras de cada estación (sin visible/IP)', () => {
    withTempConfig(() => {
      const saved = writeConfig({
        stations: [
          {
            id: 's-x',
            code: 'X',
            name: 'Estación X',
            printers: [
              {
                windowsName: 'ZDesigner ZT230-200dpi ZPL',
                label: 'Adhesiva',
                stocks: ['producto-terminado'],
              },
              {
                windowsName: '\\\\192.168.80.89\\ZDesigner ZT230-200dpi ZPL',
                label: 'Conexión Adhesiva',
                stocks: ['producto-terminado'],
              },
            ],
          },
        ],
      });
      expect(saved.stations[0].printers).toHaveLength(2);
      expect(saved.stations[0].printers[0]).toEqual({
        windowsName: 'ZDesigner ZT230-200dpi ZPL',
        label: 'Adhesiva',
        stocks: ['producto-terminado'],
      });
    });
  });

  it('rechaza códigos de estación duplicados', () => {
    withTempConfig(() => {
      expect(() =>
        writeConfig({
          stations: [
            { id: 's1', code: 'A', name: 'A', printers: [] },
            { id: 's2', code: 'A', name: 'A dup', printers: [] },
          ],
        }),
      ).toThrow(/duplicad/);
    });
  });

  it('rechaza ids de estación duplicados', () => {
    withTempConfig(() => {
      expect(() =>
        writeConfig({
          stations: [
            { id: 's1', code: 'A', name: 'A', printers: [] },
            { id: 's1', code: 'B', name: 'B', printers: [] },
          ],
        }),
      ).toThrow(/duplicad/);
    });
  });

  it('lee de vuelta lo guardado', () => {
    withTempConfig(() => {
      writeConfig({
        stations: [{ id: 's1', code: 'A', name: 'A', printers: [] }],
      });
      const config = readConfig();
      expect(config.stations.map((s) => s.code)).toEqual(['A']);
    });
  });
});
