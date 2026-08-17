import { describe, expect, it } from 'vitest';
import {
  findStationForClientIp,
  findStationsForClientIp,
  normalizeClientIp,
  printerKey,
  writeConfig,
  readConfig,
  type ConfiguredStation,
} from '../printers-config.service';
import { copyFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

describe('estaciones por IP', () => {
  it('normaliza IPv4 y ::ffff:', () => {
    expect(normalizeClientIp('192.168.80.50')).toBe('192.168.80.50');
    expect(normalizeClientIp('::ffff:192.168.80.50')).toBe('192.168.80.50');
    expect(normalizeClientIp(' 192.168.80.50 ')).toBe('192.168.80.50');
  });

  it('encuentra estación por IP de cliente (varias IPs por estación)', () => {
    const stations: ConfiguredStation[] = [
      {
        id: 'st-1',
        code: 'EMPAQUE-1',
        name: 'Empaque 1',
        agentId: 'a1',
        clientIps: ['192.168.80.50', '192.168.80.51'],
        printers: [{ agentId: 'a1', windowsName: 'Zebra A' }],
      },
      {
        id: 'st-2',
        code: 'CARP-01',
        name: 'Carpenter',
        agentId: 'a2',
        clientIps: ['192.168.80.60'],
        printers: [{ agentId: 'a2', windowsName: 'Zebra B' }],
      },
    ];
    expect(findStationForClientIp(stations, '192.168.80.50')?.code).toBe('EMPAQUE-1');
    expect(findStationForClientIp(stations, '192.168.80.51')?.agentId).toBe('a1');
    expect(findStationForClientIp(stations, '::ffff:192.168.80.60')?.code).toBe('CARP-01');
    expect(findStationForClientIp(stations, '192.168.80.99')).toBeUndefined();
  });

  it('una IP puede pertenecer a varias estaciones', () => {
    const stations: ConfiguredStation[] = [
      {
        id: 'st-1',
        code: 'CALIDAD',
        name: 'Calidad',
        agentId: 'a1',
        clientIps: ['192.168.80.50'],
        printers: [{ agentId: 'a1', windowsName: 'Zebra A' }],
      },
      {
        id: 'st-2',
        code: 'PRODUCCION',
        name: 'Producción',
        agentId: 'a2',
        clientIps: ['192.168.80.50', '192.168.80.51'],
        printers: [{ agentId: 'a2', windowsName: 'Zebra B' }],
      },
    ];
    const matched = findStationsForClientIp(stations, '192.168.80.50');
    expect(matched.map((s) => s.code)).toEqual(['CALIDAD', 'PRODUCCION']);
    expect(findStationsForClientIp(stations, '192.168.80.51').map((s) => s.code)).toEqual([
      'PRODUCCION',
    ]);
  });

  it('printerKey es estable agent+windows', () => {
    expect(printerKey('Ag-1', 'Zebra X')).toBe('ag-1::zebra x');
  });
});

describe('estación ligada a un agente', () => {
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

  it('permite la misma IP en varias estaciones', () => {
    withTempConfig(() => {
      const base = readConfig();
      const a1 = base.agents[0]?.id;
      const a2 = base.agents[1]?.id || a1;
      expect(a1).toBeTruthy();
      const saved = writeConfig({
        agents: base.agents,
        stations: [
          {
            id: 's1',
            code: 'A',
            name: 'A',
            agentId: a1!,
            clientIps: ['10.0.0.1'],
            printers: [],
          },
          {
            id: 's2',
            code: 'B',
            name: 'B',
            agentId: a2!,
            clientIps: ['10.0.0.1'],
            printers: [],
          },
        ],
      });
      expect(saved.stations).toHaveLength(2);
      expect(saved.stations.every((s) => s.clientIps.includes('10.0.0.1'))).toBe(true);
    });
  });

  it('infiere agentId desde impresoras al leer/guardar', () => {
    withTempConfig(() => {
      const base = readConfig();
      const agentId = base.agents[0]?.id;
      expect(agentId).toBeTruthy();
      const saved = writeConfig({
        agents: base.agents,
        stations: [
          {
            id: 's-mig',
            code: 'MIG',
            name: 'Migrada',
            agentId: '',
            clientIps: ['10.0.0.9'],
            printers: [{ agentId: agentId!, windowsName: 'X' }],
          } as ConfiguredStation,
        ],
      });
      expect(saved.stations[0].agentId).toBe(agentId);
      expect(saved.stations[0].printers.every((p) => p.agentId === agentId)).toBe(true);
    });
  });
});
