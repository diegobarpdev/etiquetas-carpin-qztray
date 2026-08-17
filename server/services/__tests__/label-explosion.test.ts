import { describe, it, expect } from 'vitest';
import {
  explodeLabels,
  buildLabelSummary,
  buildLabelGroups,
  applyTemplateOverride,
  buildLabelPreview,
  parseCustomPacking,
  _test,
} from '../label-explosion.service';
import { OrderWithLines, ProductWithBom } from '../../types';

function makeProduct(overrides: Partial<ProductWithBom> & { internalRef: string; name: string }): ProductWithBom {
  const { internalRef, name, shortName, numBultos, boms, ...rest } = overrides;
  return {
    id: 1,
    ean: '7861223913996',
    internalRef,
    name,
    shortName: shortName || name,
    weightKg: { toString: () => '10.0000' } as never,
    height: { toString: () => '100.0' } as never,
    width: { toString: () => '50.0' } as never,
    length: { toString: () => '30.0' } as never,
    volumeM3: { toString: () => '0.1500' } as never,
    numBultos: numBultos ?? 1,
    labelTemplateId: 1,
    labelTemplate: {
      id: 1,
      code: 'bulto-estandar',
      name: 'Bulto estándar',
      htmlTemplate: '',
      css: '',
      isActive: true,
    },
    boms: boms || [],
    ...rest,
  } as ProductWithBom;
}

function makeOrder(
  lines: OrderWithLines['lines'],
  overrides: Partial<OrderWithLines> = {},
): OrderWithLines {
  return {
    id: 1,
    name: 'PLDOR/OPR/00564',
    lotNumber: 'PLDOR/OPR/00564',
    productionDate: new Date('2026-06-24'),
    state: 'confirmed',
    lines,
    ...overrides,
  };
}

describe('LabelExplosionService', () => {
  describe('producto simple (velador)', () => {
    const velador = makeProduct({
      internalRef: '7861223924572',
      name: 'VELADOR CALABRIA',
      ean: '7861223924572',
      numBultos: 1,
      boms: [{ type: 'manufacture', lines: [] }],
    });

    it('oculta QR de referencia interna cuando ref = EAN', () => {
      const order = makeOrder([
        { quantity: { toString: () => '1' } as never, product: velador },
      ]);

      const labels = explodeLabels(order);
      expect(labels[0].showInternalRefQr).toBe(false);
    });

    it('genera una etiqueta 1-1 por unidad de orden', () => {
      const order = makeOrder([
        { quantity: { toString: () => '2' } as never, product: velador },
      ]);

      const labels = explodeLabels(order);
      expect(labels).toHaveLength(2);
      expect(labels.every((l) => l.bultoCurrent === 1 && l.bultoTotal === 1)).toBe(true);
    });

    it('titulo y centro usan el mismo producto sin kit', () => {
      const order = makeOrder([
        { quantity: { toString: () => '1' } as never, product: velador },
      ]);

      const labels = explodeLabels(order);
      expect(labels[0].productName).toBe('VELADOR CALABRIA');
      expect(labels[0].shortName).toBe('VELADOR CALABRIA');
      expect(labels[0].showKitSubproduct).toBe(false);
      expect(labels[0].subproductName).toBeUndefined();
    });

    it('resumen muestra 1-1 para producto sin kit', () => {
      const order = makeOrder([
        { quantity: { toString: () => '1' } as never, product: velador },
      ]);

      const summary = buildLabelSummary(order);
      expect(summary[0].bultoDisplay).toBe('1-1');
      expect(summary[0].children).toBeUndefined();
      expect(summary[0].totalLabels).toBe(1);
    });

    it('incluye indicaciones de acabado en plantilla colchon-v1', () => {
      const colchon = makeProduct({
        internalRef: 'SMT01COL10400DI010',
        name: 'SEM TABLEROS SILLON AUX DIDI SUITE',
        ean: '7861223913996',
        labelTemplate: {
          id: 2,
          code: 'colchon-v1',
          name: 'Colchón v1',
          htmlTemplate: '',
          css: '',
          isActive: true,
        },
        boms: [{ type: 'manufacture', lines: [] }],
      });

      const order = makeOrder([
        { quantity: { toString: () => '1' } as never, product: colchon },
      ]);

      const labels = explodeLabels(order);
      expect(labels[0].finishInstructions).toContain('TRANSPORTAR Y MANIPULAR');
      expect(labels[0].finishInstructions).toContain('POSICIÓN HORIZONTAL');
    });

    it('SERIAL de colchón = número de producto, no bulto', () => {
      const colchon = makeProduct({
        internalRef: 'COL-DREAMS-KING',
        name: 'COLCHON COLINEAL DREAMS GENIAL KING',
        ean: '7861223905267',
        numBultos: 1,
        labelTemplate: {
          id: 3,
          code: 'colchon-v2',
          name: 'Colchón v2',
          htmlTemplate: '',
          css: '',
          isActive: true,
        },
        boms: [{ type: 'manufacture', lines: [] }],
      });

      const order = makeOrder([
        { quantity: { toString: () => '3' } as never, product: colchon },
      ]);

      const labels = explodeLabels(order);
      expect(labels).toHaveLength(3);
      expect(labels.map((l) => `${l.serialCurrent}/${l.serialTotal}`)).toEqual([
        '1/3',
        '2/3',
        '3/3',
      ]);
      expect(labels.every((l) => l.bultoCurrent === 1 && l.bultoTotal === 1)).toBe(true);

      const overridden = applyTemplateOverride(labels, 'colchon-v1');
      expect(overridden.map((l) => `${l.serialCurrent}/${l.serialTotal}`)).toEqual([
        '1/3',
        '2/3',
        '3/3',
      ]);
    });
  });

  describe('kit cama', () => {
    const cab = makeProduct({
      internalRef: 'CAB7861223913996',
      name: 'CAB CAMA VARI III PLUS KING',
      numBultos: 2,
      boms: [{ type: 'manufacture', lines: [] }],
    });

    const lar = makeProduct({
      internalRef: 'LAR7861223913996',
      name: 'LARGUEROS CAMA VARI III PLUS KING',
      numBultos: 1,
      boms: [{ type: 'manufacture', lines: [] }],
    });

    const pie = makeProduct({
      internalRef: 'PIE7861223913996',
      name: 'PIECERO CAMA VARI III PLUS KING',
      numBultos: 1,
      boms: [{ type: 'manufacture', lines: [] }],
    });

    const vel = makeProduct({
      internalRef: 'VEL7861223913996',
      name: 'VELADOR CAMA VARI III PLUS KING',
      numBultos: 1,
      boms: [{ type: 'manufacture', lines: [] }],
    });

    const kitCama = makeProduct({
      internalRef: '7861223913996',
      name: 'CAMA VARI III PLUS KING C/VELADORES',
      boms: [
        {
          type: 'kit',
          lines: [
            { quantity: { toString: () => '1' } as never, componentProduct: cab },
            { quantity: { toString: () => '1' } as never, componentProduct: lar },
            { quantity: { toString: () => '1' } as never, componentProduct: pie },
            { quantity: { toString: () => '2' } as never, componentProduct: vel },
          ],
        },
      ],
    });

    it('explota kit en componentes y genera etiquetas correctas', () => {
      const order = makeOrder([
        { quantity: { toString: () => '1' } as never, product: kitCama },
      ]);

      const labels = explodeLabels(order);
      // 1 etiqueta por tipo de pieza (CAB, LAR, PIE, VEL) — veladores van juntos con cantidad
      expect(labels).toHaveLength(4);

      const cabLabels = labels.filter((l) => l.internalRef === 'CAB7861223913996');
      expect(cabLabels).toHaveLength(1);
      expect(cabLabels[0].productName).toBe('CAMA VARI III PLUS KING C/VELADORES');
      expect(cabLabels[0].shortName).toBe('CAB CAMA VARI III PLUS KING');
      expect(cabLabels[0].showKitSubproduct).toBe(true);
      expect(cabLabels[0].subproductName).toBe('CAB CAMA VARI III PLUS KING');
      expect(cabLabels[0].bultoCurrent).toBe(1);
      expect(cabLabels[0].bultoTotal).toBe(4);
      expect(cabLabels[0].quantity).toBe(1);

      const velLabels = labels.filter((l) => l.internalRef === 'VEL7861223913996');
      expect(velLabels).toHaveLength(1);
      expect(velLabels[0].bultoCurrent).toBe(4);
      expect(velLabels[0].bultoTotal).toBe(4);
      expect(velLabels[0].quantity).toBe(2);
    });

    it('20 camas generan 80 etiquetas y velador lleva cantidad 2', () => {
      const order = makeOrder([
        { quantity: { toString: () => '20' } as never, product: kitCama },
      ]);

      const labels = explodeLabels(order);
      expect(labels).toHaveLength(80);
      expect(labels.slice(0, 20).every((l) => l.internalRef === 'CAB7861223913996')).toBe(true);
      expect(labels.slice(20, 40).every((l) => l.internalRef === 'LAR7861223913996')).toBe(true);
      expect(labels.slice(40, 60).every((l) => l.internalRef === 'PIE7861223913996')).toBe(true);
      expect(labels.slice(60, 80).every((l) => l.internalRef === 'VEL7861223913996')).toBe(true);
      const velLabels = labels.filter((l) => l.internalRef === 'VEL7861223913996');
      expect(velLabels).toHaveLength(20);
      expect(velLabels.every((l) => l.quantity === 2)).toBe(true);
    });

    it('mantiene numeración de unidad dentro del bloque por componente', () => {
      const order = makeOrder([
        { quantity: { toString: () => '3' } as never, product: kitCama },
      ]);

      const labels = explodeLabels(order);
      const cabLabels = labels.filter((l) => l.internalRef === 'CAB7861223913996');
      expect(cabLabels.map((l) => l.orderUnitIndex)).toEqual([0, 1, 2]);
      expect(cabLabels.every((l) => l.orderUnitTotal === 3)).toBe(true);
    });

    it('en conforme kit: padre arriba y subproducto truncado a 35 con …', () => {
      const longCab = makeProduct({
        internalRef: 'CAB7861223913996',
        name: 'CAB CAMA VARI III PLUS KING C/VELADORES C/HONEY WASH V8',
        numBultos: 1,
        boms: [],
      });
      const kit = makeProduct({
        internalRef: '7861223913996',
        name: 'CAMA VARI III PLUS KING C/VELADORES C/HONEY WASH V8',
        boms: [
          {
            type: 'kit',
            lines: [{ quantity: { toString: () => '1' } as never, componentProduct: longCab }],
          },
        ],
      });
      const order = makeOrder([
        { quantity: { toString: () => '1' } as never, product: kit },
      ]);
      const labels = applyTemplateOverride(explodeLabels(order), 'producto-conforme');
      expect(labels[0].showKitSubproduct).toBe(true);
      expect(labels[0].productName).toBe('CAMA VARI III PLUS KING C/VELADORES C/HONEY WASH V8');
      expect(labels[0].subproductName).toBe('CAB CAMA VARI III PLUS KING C/VELAD...');
      expect(labels[0].subproductName).toHaveLength(38);
    });

    it('en conforme, ambos veladores de la misma unidad comparten N/S', () => {
      const order = makeOrder([
        { quantity: { toString: () => '30' } as never, product: kitCama },
      ]);

      const labels = applyTemplateOverride(explodeLabels(order), 'producto-conforme');
      const velLabels = labels.filter((l) => l.internalRef === 'VEL7861223913996');
      expect(velLabels).toHaveLength(60);

      // Unidad 1: los 2 veladores → 1/30
      expect(velLabels[0].serialCurrent).toBe(1);
      expect(velLabels[0].serialTotal).toBe(30);
      expect(velLabels[1].serialCurrent).toBe(1);
      expect(velLabels[1].serialTotal).toBe(30);

      // Unidad 2: los 2 veladores → 2/30
      expect(velLabels[2].serialCurrent).toBe(2);
      expect(velLabels[3].serialCurrent).toBe(2);
      expect(velLabels[3].serialTotal).toBe(30);
    });

    it('preview conforme (sin override): LDM qty 2 → 2 etiquetas, no 1 con CANTIDAD 2', () => {
      const vel = makeProduct({
        internalRef: 'VEL-CONFORME',
        name: 'VELADOR',
        ean: '7861223913996',
        numBultos: 1,
        labelTemplate: {
          id: 2,
          code: 'producto-conforme',
          name: 'Producto conforme',
          htmlTemplate: '',
          css: '',
          isActive: true,
        },
        boms: [{ type: 'manufacture', lines: [] }],
      });
      const cab = makeProduct({
        internalRef: 'CAB-CONFORME',
        name: 'CABECERA',
        ean: '7861223911111',
        numBultos: 1,
        labelTemplate: {
          id: 2,
          code: 'producto-conforme',
          name: 'Producto conforme',
          htmlTemplate: '',
          css: '',
          isActive: true,
        },
        boms: [{ type: 'manufacture', lines: [] }],
      });
      const kit = makeProduct({
        internalRef: 'KIT-CONFORME',
        name: 'CAMA KIT',
        ean: '7861223999999',
        numBultos: 1,
        labelTemplate: {
          id: 2,
          code: 'producto-conforme',
          name: 'Producto conforme',
          htmlTemplate: '',
          css: '',
          isActive: true,
        },
        boms: [
          {
            type: 'kit',
            lines: [
              { quantity: { toString: () => '1' } as never, componentProduct: cab },
              { quantity: { toString: () => '2' } as never, componentProduct: vel },
            ],
          },
        ],
      });

      const order = makeOrder([
        { quantity: { toString: () => '1' } as never, product: kit },
      ]);
      const preview = buildLabelPreview(order);
      const velLabels = preview.labels.filter((l) => l.internalRef === 'VEL-CONFORME');
      expect(velLabels).toHaveLength(2);
      expect(velLabels.every((l) => l.quantity === 1)).toBe(true);
      expect(preview.totalLabels).toBe(3); // 1 cab + 2 vel

      const velGroup = preview.groups.find((g) => g.internalRef === 'VEL-CONFORME');
      expect(velGroup?.labelCount).toBe(2);
      const kitGroup = preview.groups.find((g) => g.isKitParent);
      expect(kitGroup?.labelCount).toBe(3);
    });

    it('preview producto terminado: LDM qty 2 → 1 etiqueta con CANTIDAD 2', () => {
      const order = makeOrder([
        { quantity: { toString: () => '1' } as never, product: kitCama },
      ]);
      const preview = buildLabelPreview(order, 'bulto-estandar');
      const velLabels = preview.labels.filter((l) => l.internalRef === 'VEL7861223913996');
      expect(velLabels).toHaveLength(1);
      expect(velLabels[0].quantity).toBe(2);
    });

    it('muestra QR de referencia interna en componentes de kit', () => {
      const order = makeOrder([
        { quantity: { toString: () => '1' } as never, product: kitCama },
      ]);

      const labels = explodeLabels(order);
      expect(labels.every((l) => l.showInternalRefQr)).toBe(true);
    });

    it('en producto terminado kit: QR1 = EAN del padre y QR2 = ref del subproducto', () => {
      const bas = makeProduct({
        internalRef: 'BAS7861223911640',
        ean: 'BAS7861223911640',
        name: 'BASE CAMA',
        boms: [],
      });
      const kit = makeProduct({
        internalRef: '7861223911640',
        ean: '7861223911640',
        name: 'CAMA KIT',
        boms: [
          {
            type: 'kit',
            lines: [{ quantity: { toString: () => '1' } as never, componentProduct: bas }],
          },
        ],
      });

      const labels = explodeLabels(
        makeOrder([{ quantity: { toString: () => '1' } as never, product: kit }]),
      );
      expect(labels[0].showInternalRefQr).toBe(true);
      expect(labels[0].ean).toBe('7861223911640');
      expect(labels[0].qrSku).toBe('7861223911640');
      expect(labels[0].internalRef).toBe('BAS7861223911640');
      expect(labels[0].qrInternalRef).toBe('BAS7861223911640');
    });

    it('genera resumen jerárquico con padre kit y 4 bultos', () => {
      const order = makeOrder([
        { quantity: { toString: () => '1' } as never, product: kitCama },
      ]);

      const summary = buildLabelSummary(order);
      expect(summary).toHaveLength(1);

      const parent = summary[0];
      expect(parent.internalRef).toBe('7861223913996');
      expect(parent.isKit).toBe(true);
      expect(parent.bultoDisplay).toBe('4');
      expect(parent.totalLabels).toBe(4);
      expect(parent.children).toHaveLength(4);

      const cabChild = parent.children!.find((c) => c.internalRef === 'CAB7861223913996');
      expect(cabChild?.totalLabels).toBe(1);
      expect(cabChild?.bultoDisplay).toBe('1-4');

      const velChild = parent.children!.find((c) => c.internalRef === 'VEL7861223913996');
      expect(velChild?.componentQuantity).toBe(2);
      expect(velChild?.bultoDisplay).toBe('4-4');
      expect(velChild?.totalLabels).toBe(1);
    });
  });

  describe('orden mixta (kit + velador)', () => {
    it('combina etiquetas de kit y producto simple', () => {
      const velador = makeProduct({
        internalRef: '7861223924572',
        name: 'VELADOR CALABRIA',
        ean: '7861223924572',
        numBultos: 1,
        boms: [{ type: 'manufacture', lines: [] }],
      });

      const component = makeProduct({
        internalRef: 'CAB7861223913996',
        name: 'CAB',
        numBultos: 2,
        boms: [],
      });

      const kit = makeProduct({
        internalRef: '7861223913996',
        name: 'KIT CAMA',
        boms: [
          {
            type: 'kit',
            lines: [
              { quantity: { toString: () => '1' } as never, componentProduct: component },
            ],
          },
        ],
      });

      const order = makeOrder([
        { quantity: { toString: () => '1' } as never, product: kit },
        { quantity: { toString: () => '1' } as never, product: velador },
      ]);

      const labels = explodeLabels(order);
      // kit: 1 (CAB qty 1 en LdM) + velador: 1 = 2
      expect(labels).toHaveLength(2);

      const summary = buildLabelSummary(order);
      expect(summary).toHaveLength(2);
      expect(summary[0].isKit).toBe(true);
      expect(summary[1].isKit).toBe(false);
      expect(summary[1].internalRef).toBe('7861223924572');
      expect(summary[1].bultoDisplay).toBe('1-1');
    });
  });

  describe('explodeProduct helper', () => {
    it('no explota productos manufacture', () => {
      const product = makeProduct({
        internalRef: '7861223924572',
        name: 'VELADOR',
        boms: [{ type: 'manufacture', lines: [] }],
      });

      const result = _test.explodeProduct(product, 3);
      expect(result).toHaveLength(1);
      expect(result[0].componentQty).toBe(3);
    });
  });

  describe('applyTemplateOverride', () => {
    it('sobreescribe templateCode y finishInstructions', () => {
      const labels = [
        {
          templateCode: 'bulto-estandar',
          finishInstructions: '',
          productName: 'Test',
        },
      ] as Parameters<typeof applyTemplateOverride>[0];

      const overridden = applyTemplateOverride(labels, 'colchon-v1');
      expect(overridden[0].templateCode).toBe('colchon-v1');
      expect(overridden[0].finishInstructions).not.toBe('');
    });

    it('no modifica si no hay override', () => {
      const labels = [{ templateCode: 'bulto-estandar', productName: 'Test' }] as Parameters<
        typeof applyTemplateOverride
      >[0];
      expect(applyTemplateOverride(labels)).toBe(labels);
    });
  });

  describe('producto conforme', () => {
    it('formatea peso sin ceros de más', () => {
      expect(_test.formatWeight('32.9000')).toBe('32,9');
      expect(_test.formatWeight('10.0000')).toBe('10');
      expect(_test.formatWeight('0.5000')).toBe('0,5');
      expect(_test.formatWeight({ toString: () => '71.2500' })).toBe('71,25');
    });

    it('genera una etiqueta 1-1 para PSTAB/OPR/00859', () => {
      const product = makeProduct({
        internalRef: 'SMT01COL10400DI010',
        name: 'SEM TABLEROS SILLON AUX DIDI SUITE',
        numBultos: 1,
        labelTemplate: {
          id: 5,
          code: 'producto-conforme',
          name: 'Producto conforme',
          htmlTemplate: '',
          css: '',
          isActive: true,
        },
        boms: [{ type: 'manufacture', lines: [] }],
      });

      const order = makeOrder([
        { quantity: { toString: () => '1' } as never, product },
      ], {
        name: 'PSTAB/OPR/00859',
        lotNumber: 'LOTE TAB-0620-001',
        inspectorName: 'LOPEZ FAJARDO LUIS VICENTE',
      });

      const labels = explodeLabels(order);
      expect(labels).toHaveLength(1);
      expect(labels[0].lotNumber).toBe('LOTE TAB-0620-001');
      expect(labels[0].orderName).toBe('PSTAB/OPR/00859');
      expect(labels[0].qrLotNumber).toBe('LOTE TAB-0620-001');
      expect(labels[0].bultoCurrent).toBe(1);
      expect(labels[0].bultoTotal).toBe(1);
      expect(labels[0].serialCurrent).toBe(1);
      expect(labels[0].serialTotal).toBe(1);
      expect(labels[0].conformeTitle).toBe('PRODUCTO CONFORME');
      expect(labels[0].madeIn).toBe('CUENCA - ECUADOR');
      expect(labels[0].inspectorName).toBe('');
      expect(labels[0].qrSku).toBe('SMT01COL10400DI010');
      expect(labels[0].showInternalRefQr).toBe(false);
    });

    it('si no hay lote, usa la OPR como lote y QR', () => {
      const product = makeProduct({
        internalRef: 'SMT01COL10400DI010',
        name: 'SEM TABLEROS SILLON AUX DIDI SUITE',
        numBultos: 1,
        labelTemplate: {
          id: 5,
          code: 'producto-conforme',
          name: 'Producto conforme',
          htmlTemplate: '',
          css: '',
          isActive: true,
        },
        boms: [{ type: 'manufacture', lines: [] }],
      });

      const order = makeOrder(
        [{ quantity: { toString: () => '1' } as never, product }],
        {
          name: 'PSTAB/OPR/00859',
          lotNumber: '',
        },
      );

      const labels = explodeLabels(order);
      expect(labels).toHaveLength(1);
      expect(labels[0].lotNumber).toBe('PSTAB/OPR/00859');
      expect(labels[0].qrLotNumber).toBe('PSTAB/OPR/00859');
      expect(labels[0].orderName).toBe('PSTAB/OPR/00859');
    });

    it('genera una etiqueta por bulto físico cuando numBultos > 1', () => {
      const product = makeProduct({
        internalRef: 'CONF-MULTI-BULTO',
        name: 'Producto conforme multi-bulto',
        numBultos: 2,
        labelTemplate: {
          id: 5,
          code: 'producto-conforme',
          name: 'Producto conforme',
          htmlTemplate: '',
          css: '',
          isActive: true,
        },
        boms: [{ type: 'manufacture', lines: [] }],
      });

      const order = makeOrder([
        { quantity: { toString: () => '1' } as never, product },
      ]);

      const labels = explodeLabels(order);
      expect(labels).toHaveLength(2);
      expect(labels[0].bultoCurrent).toBe(1);
      expect(labels[0].bultoTotal).toBe(2);
      expect(labels[1].bultoCurrent).toBe(2);
      // N/S = unidad de producto (1 de 1); ambos bultos comparten el mismo N/S.
      expect(labels[0].serialCurrent).toBe(1);
      expect(labels[0].serialTotal).toBe(1);
      expect(labels[1].serialCurrent).toBe(1);
      expect(labels[1].serialTotal).toBe(1);
    });

    it('guarda la unidad de orden también en productos simples', () => {
      const product = makeProduct({
        internalRef: 'CONF-UNIDADES',
        name: 'Producto conforme por unidad',
        numBultos: 1,
        labelTemplate: {
          id: 5,
          code: 'producto-conforme',
          name: 'Producto conforme',
          htmlTemplate: '',
          css: '',
          isActive: true,
        },
        boms: [{ type: 'manufacture', lines: [] }],
      });

      const labels = explodeLabels(
        makeOrder([{ quantity: { toString: () => '3' } as never, product }]),
      );
      expect(labels.map((label) => label.orderUnitIndex)).toEqual([0, 1, 2]);
      expect(labels.every((label) => label.orderUnitTotal === 3)).toBe(true);
    });
  });

  describe('producto conforme papel', () => {
    it('usa EAN en QR SKU, bulto 1-1 y serial por cantidad de orden', () => {
      const product = makeProduct({
        internalRef: 'REF-VEL-CAPRI',
        ean: '7861214835924',
        name: 'VELADOR CAPRI C/HONEY WASH V3',
        numBultos: 1,
        labelTemplate: {
          id: 6,
          code: 'producto-conforme-papel',
          name: 'Producto conforme de papel',
          htmlTemplate: '',
          css: '',
          isActive: true,
        },
        boms: [{ type: 'manufacture', lines: [] }],
      });

      const order = makeOrder(
        [{ quantity: { toString: () => '54' } as never, product }],
        {
          name: 'PLCAJ/OPR/00083',
          lotNumber: 'LOTE CAJ-0618-CAPRI',
          productionDate: new Date('2026-06-18'),
          inspectorName: 'CHACA TENESACA VICENTE',
        },
      );

      const labels = explodeLabels(order);
      const summary = buildLabelSummary(order);

      expect(labels).toHaveLength(54);
      expect(labels.every((l) => l.bultoCurrent === 1 && l.bultoTotal === 1)).toBe(true);
      expect(labels[0].serialCurrent).toBe(1);
      expect(labels[0].serialTotal).toBe(54);
      expect(labels[53].serialCurrent).toBe(54);
      expect(labels[0].qrSku).toBe('7861214835924');
      expect(labels[0].lotNumber).toBe('LOTE CAJ-0618-CAPRI');
      expect(summary[0].orderQuantity).toBe(54);
      expect(summary[0].bultoDisplay).toBe('1-1');
      expect(summary[0].totalLabels).toBe(54);
    });
  });

  describe('carpinteria', () => {
    it('numera N/S por cantidad de orden y BULTO por bulto físico', () => {
      const product = makeProduct({
        internalRef: '0008300000001',
        ean: '7861214835924',
        name: 'VELADOR CAPRI C/HONEY WASH V3',
        numBultos: 1,
        labelTemplate: {
          id: 4,
          code: 'carpinteria',
          name: 'Producto conforme Carpenter',
          htmlTemplate: '',
          css: '',
          isActive: true,
        },
        boms: [{ type: 'manufacture', lines: [] }],
      });

      const order = makeOrder(
        [{ quantity: { toString: () => '54' } as never, product }],
        {
          name: 'PLCAJ/OPR/00084',
          lotNumber: 'LOTE CAJ-0618-CAPRI',
          productionDate: new Date('2026-06-18'),
          inspectorName: 'CHACA TENESACA VICENTE',
        },
      );

      const labels = explodeLabels(order);

      expect(labels).toHaveLength(54);
      expect(labels[0].serialCurrent).toBe(1);
      expect(labels[0].serialTotal).toBe(54);
      expect(labels[53].serialCurrent).toBe(54);
      expect(labels.every((l) => l.bultoCurrent === 1 && l.bultoTotal === 1)).toBe(true);
      expect(labels[0].madeIn).toBe('CUENCA - ECUADOR');
      expect(labels[0].qrSku).toBe('7861214835924');
    });
  });

  describe('carpenter-tela', () => {
    it('usa formato papel con datos Carpenter (N/S y madeIn)', () => {
      const product = makeProduct({
        internalRef: '0008300000001',
        ean: '7861214835924',
        name: 'SILLA TELA CARPENTER',
        numBultos: 1,
        labelTemplate: {
          id: 6,
          code: 'carpenter-tela',
          name: 'Carpenter tela',
          htmlTemplate: '',
          css: '',
          isActive: true,
        },
        boms: [{ type: 'manufacture', lines: [] }],
      });

      const order = makeOrder(
        [{ quantity: { toString: () => '3' } as never, product }],
        {
          name: 'PLTEL/OPR/00001',
          lotNumber: '',
          productionDate: new Date('2026-07-17'),
          inspectorName: 'INSPECTOR TELA',
        },
      );

      const labels = explodeLabels(order);

      expect(labels).toHaveLength(3);
      expect(labels[0].templateCode).toBe('carpenter-tela');
      expect(labels[0].serialCurrent).toBe(1);
      expect(labels[0].serialTotal).toBe(3);
      expect(labels[0].madeIn).toBe('CUENCA - ECUADOR');
      expect(labels[0].lotNumber).toBe('PLTEL/OPR/00001');
      expect(labels[0].qrLotNumber).toBe('PLTEL/OPR/00001');
      expect(labels[0].showInternalRefQr).toBe(false);
    });

    it('multi-bulto: mismo N/S (y serial de barcode) en todos los bultos de la unidad', () => {
      const product = makeProduct({
        internalRef: '0008300000001',
        ean: '7861214835924',
        name: 'SILLA TELA 3 BULTOS',
        numBultos: 3,
        labelTemplate: {
          id: 6,
          code: 'carpenter-tela',
          name: 'Carpenter tela',
          htmlTemplate: '',
          css: '',
          isActive: true,
        },
        boms: [{ type: 'manufacture', lines: [] }],
      });

      const order = makeOrder(
        [{ quantity: { toString: () => '2' } as never, product }],
        { name: 'PLTEL/OPR/00861' },
      );
      const labels = explodeLabels(order);
      expect(labels).toHaveLength(6);

      const unit1 = labels.filter((l) => l.serialCurrent === 1);
      const unit2 = labels.filter((l) => l.serialCurrent === 2);
      expect(unit1).toHaveLength(3);
      expect(unit2).toHaveLength(3);
      expect(unit1.map((l) => `${l.bultoCurrent}-${l.bultoTotal}`)).toEqual([
        '1-3',
        '2-3',
        '3-3',
      ]);
      // Mismo N/S en los 3 bultos de cada producto.
      expect(unit1.every((l) => l.serialCurrent === 1 && l.serialTotal === 2)).toBe(true);
      expect(unit2.every((l) => l.serialCurrent === 2 && l.serialTotal === 2)).toBe(true);
    });

    it('override a carpenter-tela sugiere stock conforme-papel vía extras Carpenter', () => {
      const product = makeProduct({
        internalRef: '0008300000001',
        ean: '7861214835924',
        name: 'SILLA TELA',
        numBultos: 1,
        labelTemplate: {
          id: 4,
          code: 'carpinteria',
          name: 'Carpenter',
          htmlTemplate: '',
          css: '',
          isActive: true,
        },
        boms: [{ type: 'manufacture', lines: [] }],
      });

      const order = makeOrder([
        { quantity: { toString: () => '1' } as never, product },
      ]);
      const labels = applyTemplateOverride(explodeLabels(order), 'carpenter-tela');
      expect(labels[0].templateCode).toBe('carpenter-tela');
      expect(labels[0].madeIn).toBe('CUENCA - ECUADOR');
    });
  });

  describe('modo dual PLSIL (2 uds/etiqueta)', () => {
    const silla = makeProduct({
      internalRef: 'PLSIL-SILLA',
      name: 'SILLA PLSIL',
      ean: '7861223900000',
      numBultos: 1,
      boms: [{ type: 'manufacture', lines: [] }],
    });

    it('12 unidades → 6 etiquetas con CANTIDAD 2 y BULTO 1-1', () => {
      const order = makeOrder(
        [{ quantity: { toString: () => '12' } as never, product: silla }],
        { name: 'PLSIL/OPR/00012' },
      );

      const labels = explodeLabels(order, { dualPacking: true });
      expect(labels).toHaveLength(6);
      expect(labels.every((l) => l.quantity === 2)).toBe(true);
      expect(labels.every((l) => l.bultoCurrent === 1 && l.bultoTotal === 1)).toBe(true);
      expect(labels[0].orderUnitIndex).toBe(0);
      expect(labels[5].orderUnitIndex).toBe(10);
    });

    it('11 unidades → 5×2 + 1×1, BULTO sigue 1-1', () => {
      const order = makeOrder(
        [{ quantity: { toString: () => '11' } as never, product: silla }],
        { name: 'PLSIL/OPR/00011' },
      );

      const labels = explodeLabels(order, { dualPacking: true });
      expect(labels).toHaveLength(6);
      expect(labels.slice(0, 5).every((l) => l.quantity === 2)).toBe(true);
      expect(labels[5].quantity).toBe(1);
      expect(labels.every((l) => l.bultoCurrent === 1 && l.bultoTotal === 1)).toBe(true);
    });

    it('sin dualPacking sigue 1 etiqueta por unidad', () => {
      const order = makeOrder(
        [{ quantity: { toString: () => '12' } as never, product: silla }],
        { name: 'PLSIL/OPR/00012' },
      );

      const labels = explodeLabels(order);
      expect(labels).toHaveLength(12);
      expect(labels.every((l) => l.quantity === 1)).toBe(true);
    });

    it('resumen y grupos reflejan conteo dual', () => {
      const order = makeOrder(
        [{ quantity: { toString: () => '12' } as never, product: silla }],
        { name: 'PLSIL/OPR/00012' },
      );

      expect(buildLabelSummary(order, { dualPacking: true })[0].totalLabels).toBe(6);
      expect(buildLabelGroups(order, { dualPacking: true })[0].labelCount).toBe(6);
    });
  });

  describe('modo dual producto-terminado-carpenter', () => {
    const sillaCarpenter = makeProduct({
      internalRef: 'SILLA-CARP',
      name: 'SILLA CARPENTER',
      ean: '7861223900000',
      numBultos: 1,
      labelTemplate: {
        id: 7,
        code: 'producto-terminado-carpenter',
        name: 'ADHESIVO - PRODUCTO TERMINADO CARPENTER',
        htmlTemplate: '',
        css: '',
        isActive: true,
      },
      boms: [{ type: 'manufacture', lines: [] }],
    });

    it('con dualPackingAnyOrder agrupa de a 2 aunque no sea PLSIL', () => {
      const order = makeOrder(
        [{ quantity: { toString: () => '10' } as never, product: sillaCarpenter }],
        { name: 'PLCAJ/OPR/00100' },
      );

      const labels = explodeLabels(order, {
        dualPacking: true,
        dualPackingAnyOrder: true,
      });
      expect(labels).toHaveLength(5);
      expect(labels.every((l) => l.quantity === 2)).toBe(true);
    });

    it('buildLabelPreview con override carpenter aplica dual', () => {
      const product = makeProduct({
        internalRef: 'SILLA-X',
        name: 'SILLA',
        ean: '7861223900000',
        numBultos: 1,
        labelTemplate: {
          id: 1,
          code: 'bulto-estandar',
          name: 'Producto terminado',
          htmlTemplate: '',
          css: '',
          isActive: true,
        },
        boms: [{ type: 'manufacture', lines: [] }],
      });
      const order = makeOrder(
        [{ quantity: { toString: () => '8' } as never, product }],
        { name: 'XXXX/OPR/00008' },
      );
      const preview = buildLabelPreview(order, 'producto-terminado-carpenter', {
        dualPacking: true,
      });
      expect(preview.totalLabels).toBe(4);
      expect(preview.labels.every((l) => l.quantity === 2)).toBe(true);
      expect(preview.labels.every((l) => l.templateCode === 'producto-terminado-carpenter')).toBe(
        true,
      );
    });
  });

  describe('reparto personalizado PLLEN', () => {
    const producto = makeProduct({
      internalRef: 'PLLEN-PROD',
      name: 'PRODUCTO LEN',
      ean: '7861223900111',
      numBultos: 1,
      boms: [{ type: 'manufacture', lines: [] }],
    });

    it('150 → 7×20 + 1×10: BULTO 1-7…7-7 y 1-1', () => {
      const order = makeOrder(
        [{ quantity: { toString: () => '150' } as never, product: producto }],
        { name: 'PLLEN/OPR/00166' },
      );

      const labels = explodeLabels(order, {
        customPacking: [
          { qty: 20, count: 7 },
          { qty: 10, count: 1 },
        ],
      });

      expect(labels).toHaveLength(8);
      expect(labels.slice(0, 7).every((l) => l.quantity === 20)).toBe(true);
      expect(labels[7].quantity).toBe(10);
      expect(labels.slice(0, 7).map((l) => `${l.bultoCurrent}-${l.bultoTotal}`)).toEqual([
        '1-7',
        '2-7',
        '3-7',
        '4-7',
        '5-7',
        '6-7',
        '7-7',
      ]);
      expect(`${labels[7].bultoCurrent}-${labels[7].bultoTotal}`).toBe('1-1');
    });

    it('permite suma diferente a la cantidad original de la orden', () => {
      const order = makeOrder(
        [{ quantity: { toString: () => '150' } as never, product: producto }],
        { name: 'PLLEN/OPR/00166' },
      );

      const labels = explodeLabels(order, {
        customPacking: [{ qty: 25, count: 4 }],
      });
      expect(labels).toHaveLength(4);
    });

    it('parseCustomPacking acepta 20x7,10x1', () => {
      expect(parseCustomPacking('20x7,10x1')).toEqual([
        { qty: 20, count: 7 },
        { qty: 10, count: 1 },
      ]);
    });

    it('resumen refleja el número de bultos del reparto', () => {
      const order = makeOrder(
        [{ quantity: { toString: () => '150' } as never, product: producto }],
        { name: 'PLLEN/OPR/00166' },
      );
      const opts = {
        customPacking: [
          { qty: 25, count: 4 },
          { qty: 50, count: 1 },
        ],
      };
      expect(buildLabelSummary(order, opts)[0].totalLabels).toBe(5);
      expect(buildLabelSummary(order, opts)[0].bultoDisplay).toBe('1-4, 1-1');
      expect(buildLabelGroups(order, opts)[0].labelCount).toBe(5);
    });

    it('funciona para cualquier orden (ej. 10 uds → 1 etiqueta con cantidad 10)', () => {
      const orderStd = makeOrder(
        [{ quantity: { toString: () => '10' } as never, product: producto }],
        { name: 'OPR/00999' },
      );
      const labels = explodeLabels(orderStd, {
        customPacking: [{ qty: 10, count: 1 }],
      });
      expect(labels).toHaveLength(1);
      expect(labels[0].quantity).toBe(10);
    });

    it('permite personalizar la cantidad de un bulto específico (ej. bulto 2-2 = 10)', () => {
      const p1 = makeProduct({
        internalRef: 'PROD-KIT',
        name: 'PRODUCTO TEST',
        numBultos: 2,
        boms: [{ type: 'manufacture', lines: [] }],
      });
      const order = makeOrder(
        [{ quantity: { toString: () => '1' } as never, product: p1 }],
        { name: 'OPR/00888' },
      );
      const labels = explodeLabels(order, {
        bultoQuantities: { '2-2': 10 },
      });
      expect(labels).toHaveLength(2);
      expect(labels[0].bultoCurrent).toBe(1);
      expect(labels[0].quantity).toBe(1);
      expect(labels[1].bultoCurrent).toBe(2);
      expect(labels[1].quantity).toBe(10);
    });

    it('orden de 6 unidades con bulto 1-2 fijado en 10 genera 1 sola etiqueta de bulto 1-2 con cantidad 10', () => {
      const p1 = makeProduct({
        internalRef: 'PROD-KIT-6',
        name: 'PRODUCTO TEST 6',
        numBultos: 2,
        boms: [{ type: 'manufacture', lines: [] }],
      });
      const order = makeOrder(
        [{ quantity: { toString: () => '6' } as never, product: p1 }],
        { name: 'OPR/01092' },
      );
      const labels = explodeLabels(order, {
        bultoQuantities: { '1-2': 10 },
      });
      const bulto1Labels = labels.filter((l) => l.bultoCurrent === 1);
      expect(bulto1Labels).toHaveLength(1);
      expect(bulto1Labels[0].quantity).toBe(10);
      expect(`${bulto1Labels[0].bultoCurrent}-${bulto1Labels[0].bultoTotal}`).toBe('1-2');
    });
  });
});
