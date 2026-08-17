import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

const TEMPLATE_CATALOG = [
  { code: 'carpinteria', name: 'ADHESIVO - CARPENTER' },
  { code: 'producto-conforme', name: 'ADHESIVO - PRODUCTO CONFORME' },
  { code: 'bulto-estandar', name: 'ADHESIVO - PRODUCTO TERMINADO' },
  {
    code: 'producto-terminado-carpenter',
    name: 'ADHESIVO - PRODUCTO TERMINADO CARPENTER',
  },
  {
    code: 'colchon-v1',
    name: 'ADHESIVO - PRODUCTO TERMINADO COLCHONES HORIZONTAL',
  },
  {
    code: 'colchon-v2',
    name: 'ADHESIVO - PRODUCTO TERMINADO COLCHONES VERTICAL',
  },
  { code: 'carpenter-tela', name: 'TELA - CARPENTER' },
  { code: 'producto-conforme-papel', name: 'TELA - PRODUCTO CONFORME' },
  {
    code: 'producto-conforme-papel-colchones',
    name: 'TELA - PRODUCTO CONFORME COLCHONES',
  },
] as const;

const LEGACY_TEMPLATE_CODES = ['velador-simple', 'materia-prima'];

const INSPECTOR_PSTAB = 'LOPEZ FAJARDO LUIS VICENTE';
const INSPECTOR_PLDOR = 'GARCIA PEREZ MARIA ELENA';

/** Lote distinto al nombre de la orden (como en Odoo). */
const LOT_PLDOR_00564 = 'LOTE MO-2026-00564-A';
const LOT_PLDOR_00565 = 'LOTE COL-0620-MILO-KING';
const LOT_PSTAB_00859 = 'LOTE TAB-0620-001';
const LOT_PLCAJ_00083 = 'LOTE CAJ-0618-CAPRI';

const INSPECTOR_PLCAJ = 'CHACA TENESACA VICENTE';

function loadTemplate(code: string): { html: string; css: string } {
  const basePath = join(__dirname, '..', 'src', 'templates', 'labels', code);
  try {
    const html = readFileSync(join(basePath, 'template.hbs'), 'utf-8');
    const css = readFileSync(join(basePath, 'styles.css'), 'utf-8');
    return { html, css };
  } catch {
    return {
      html: '<div class="stub"><h1>{{productName}}</h1><p>Plantilla {{templateCode}} — pendiente de diseño</p></div>',
      css: '.stub { padding: 10mm; font-family: sans-serif; }',
    };
  }
}

async function main() {
  for (const template of TEMPLATE_CATALOG) {
    const files = loadTemplate(template.code);
    await prisma.labelTemplate.upsert({
      where: { code: template.code },
      update: {
        name: template.name,
        htmlTemplate: files.html,
        css: files.css,
        isActive: true,
      },
      create: {
        code: template.code,
        name: template.name,
        htmlTemplate: files.html,
        css: files.css,
        isActive: true,
      },
    });
  }

  for (const code of LEGACY_TEMPLATE_CODES) {
    await prisma.labelTemplate.updateMany({
      where: { code },
      data: { isActive: false },
    });
  }

  const bultoTemplate = await prisma.labelTemplate.findUniqueOrThrow({
    where: { code: 'bulto-estandar' },
  });
  const colchonV2Template = await prisma.labelTemplate.findUniqueOrThrow({
    where: { code: 'colchon-v2' },
  });
  const conformeTemplate = await prisma.labelTemplate.findUniqueOrThrow({
    where: { code: 'producto-conforme' },
  });
  const conformePapelTemplate = await prisma.labelTemplate.findUniqueOrThrow({
    where: { code: 'producto-conforme-papel' },
  });
  const carpinteriaTemplate = await prisma.labelTemplate.findUniqueOrThrow({
    where: { code: 'carpinteria' },
  });

  // Velador Capri — producto conforme papel (54 bultos)
  const veladorCapri = await prisma.product.upsert({
    where: { internalRef: '7861214835924' },
    update: {
      labelTemplateId: conformePapelTemplate.id,
      numBultos: 1,
    },
    create: {
      ean: '7861214835924',
      internalRef: '7861214835924',
      name: 'VELADOR CAPRI C/HONEY WASH V3',
      shortName: 'VELADOR CAPRI C/HONEY WASH V3',
      weightKg: 20.6,
      height: 55.0,
      width: 40.0,
      length: 40.0,
      volumeM3: 0.088,
      numBultos: 1,
      labelTemplateId: conformePapelTemplate.id,
    },
  });

  await prisma.billOfMaterials.upsert({
    where: { productId: veladorCapri.id },
    update: { type: 'manufacture' },
    create: {
      productId: veladorCapri.id,
      type: 'manufacture',
    },
  });

  // Velador Capri — etiqueta Carpenter (misma orden de referencia, ref. interna distinta al EAN)
  const veladorCapriCarpenter = await prisma.product.upsert({
    where: { internalRef: '0008300000001' },
    update: {
      labelTemplateId: carpinteriaTemplate.id,
      numBultos: 1,
    },
    create: {
      ean: '7861214835924',
      internalRef: '0008300000001',
      name: 'VELADOR CAPRI C/HONEY WASH V3',
      shortName: 'VELADOR CAPRI C/HONEY WASH V3',
      weightKg: 20.6,
      height: 55.0,
      width: 40.0,
      length: 40.0,
      volumeM3: 0.088,
      numBultos: 1,
      labelTemplateId: carpinteriaTemplate.id,
    },
  });

  await prisma.billOfMaterials.upsert({
    where: { productId: veladorCapriCarpenter.id },
    update: { type: 'manufacture' },
    create: {
      productId: veladorCapriCarpenter.id,
      type: 'manufacture',
    },
  });

  // Tableros — producto conforme (1 bulto por unidad)
  const tableros = await prisma.product.upsert({
    where: { internalRef: 'SMT01COL10400DI010' },
    update: {
      labelTemplateId: conformeTemplate.id,
      numBultos: 1,
    },
    create: {
      ean: 'SMT01COL10400DI010',
      internalRef: 'SMT01COL10400DI010',
      name: 'SEM TABLEROS SILLON AUX DIDI SUITE',
      shortName: 'SEM TABLEROS SILLON AUX DIDI SUITE',
      weightKg: 0,
      height: 0,
      width: 0,
      length: 0,
      volumeM3: 0,
      numBultos: 1,
      labelTemplateId: conformeTemplate.id,
    },
  });

  await prisma.billOfMaterials.upsert({
    where: { productId: tableros.id },
    update: { type: 'manufacture' },
    create: {
      productId: tableros.id,
      type: 'manufacture',
    },
  });

  // Colchón Dreams Milo Firm King (fabricar — sin kit)
  const colchonMilo = await prisma.product.upsert({
    where: { internalRef: '7861223917864' },
    update: {
      labelTemplateId: colchonV2Template.id,
      numBultos: 1,
    },
    create: {
      ean: '7861223917864',
      internalRef: '7861223917864',
      name: 'COLCHON COLINEAL DREAMS MILO FIRM KING 200X200',
      shortName: 'COLCHON COLINEAL DREAMS MILO FIRM KING 200X200',
      weightKg: 45.0,
      height: 20.0,
      width: 200.0,
      length: 200.0,
      volumeM3: 0.8,
      numBultos: 1,
      labelTemplateId: colchonV2Template.id,
    },
  });

  await prisma.billOfMaterials.upsert({
    where: { productId: colchonMilo.id },
    update: { type: 'manufacture' },
    create: {
      productId: colchonMilo.id,
      type: 'manufacture',
    },
  });

  // Velador simple
  const velador = await prisma.product.upsert({
    where: { internalRef: '7861223924572' },
    update: {
      labelTemplateId: bultoTemplate.id,
      numBultos: 1,
    },
    create: {
      ean: '7861223924572',
      internalRef: '7861223924572',
      name: 'VELADOR CALABRIA C/HONEY WASH&NEGRO V3',
      shortName: 'VELADOR CALABRIA C/HONEY WASH&NEGRO V3',
      weightKg: 18.5,
      height: 55.0,
      width: 40.0,
      length: 40.0,
      volumeM3: 0.088,
      numBultos: 1,
      labelTemplateId: bultoTemplate.id,
    },
  });

  await prisma.billOfMaterials.upsert({
    where: { productId: velador.id },
    update: {},
    create: {
      productId: velador.id,
      type: 'manufacture',
    },
  });

  // Componentes del kit cama
  const cab = await prisma.product.upsert({
    where: { internalRef: 'CAB7861223913996' },
    update: {},
    create: {
      ean: '7861223913996',
      internalRef: 'CAB7861223913996',
      name: 'CAB CAMA VARI III PLUS KING C/VELADORES C/HONEY WASH V8',
      shortName: 'CAB CAMA VARI III PLUS KING C/VELADORES C/HONEY WASH V8',
      weightKg: 41.3,
      height: 219.0,
      width: 131.0,
      length: 30.0,
      volumeM3: 0.8607,
      numBultos: 1,
      labelTemplateId: bultoTemplate.id,
    },
  });

  const lar = await prisma.product.upsert({
    where: { internalRef: 'LAR7861223913996' },
    update: {},
    create: {
      ean: '7861223913996',
      internalRef: 'LAR7861223913996',
      name: 'LARGUEROS/SOP CENTRAL CAMA VARI III PLUS KING C/VELADORES C/HONEY WASH V8',
      shortName: 'LARGUEROS/SOP CENTRAL CAMA VARI III PLUS KING C/VELADORES C/HONEY WASH V8',
      weightKg: 28.0,
      height: 15.0,
      width: 210.0,
      length: 25.0,
      volumeM3: 0.0788,
      numBultos: 1,
      labelTemplateId: bultoTemplate.id,
    },
  });

  const pie = await prisma.product.upsert({
    where: { internalRef: 'PIE7861223913996' },
    update: {},
    create: {
      ean: '7861223913996',
      internalRef: 'PIE7861223913996',
      name: 'PIECERO CAMA VARI III PLUS KING C/VELADORES C/HONEY WASH V8',
      shortName: 'PIECERO CAMA VARI III PLUS KING C/VELADORES C/HONEY WASH V8',
      weightKg: 22.5,
      height: 80.0,
      width: 210.0,
      length: 15.0,
      volumeM3: 0.252,
      numBultos: 1,
      labelTemplateId: bultoTemplate.id,
    },
  });

  const vel = await prisma.product.upsert({
    where: { internalRef: 'VEL7861223913996' },
    update: {},
    create: {
      ean: '7861223913996',
      internalRef: 'VEL7861223913996',
      name: 'VELADOR CAMA VARI III PLUS KING C/VELADORES C/HONEY WASH V8',
      shortName: 'VELADOR CAMA VARI III PLUS KING C/VELADORES C/HONEY WASH V8',
      weightKg: 12.0,
      height: 55.0,
      width: 40.0,
      length: 40.0,
      volumeM3: 0.088,
      numBultos: 1,
      labelTemplateId: bultoTemplate.id,
    },
  });

  // Kit cama principal
  const kitCama = await prisma.product.upsert({
    where: { internalRef: '7861223913996' },
    update: {},
    create: {
      ean: '7861223913996',
      internalRef: '7861223913996',
      name: 'CAMA VARI III PLUS KING C/VELADORES C/HONEY WASH',
      shortName: 'CAMA VARI III PLUS KING C/VELADORES C/HONEY WASH',
      weightKg: 115.8,
      height: 219.0,
      width: 210.0,
      length: 30.0,
      volumeM3: 1.3785,
      numBultos: 1,
      labelTemplateId: bultoTemplate.id,
    },
  });

  const kitBom = await prisma.billOfMaterials.upsert({
    where: { productId: kitCama.id },
    update: {},
    create: {
      productId: kitCama.id,
      type: 'kit',
    },
  });

  // Limpiar líneas existentes del BOM kit y recrear
  await prisma.bomLine.deleteMany({ where: { bomId: kitBom.id } });
  await prisma.bomLine.createMany({
    data: [
      { bomId: kitBom.id, componentProductId: cab.id, quantity: 1 },
      { bomId: kitBom.id, componentProductId: lar.id, quantity: 1 },
      { bomId: kitBom.id, componentProductId: pie.id, quantity: 1 },
      { bomId: kitBom.id, componentProductId: vel.id, quantity: 2 },
    ],
  });

  // BOM manufacture para CAB (materias primas - no se usa para etiquetas)
  await prisma.billOfMaterials.upsert({
    where: { productId: cab.id },
    update: {},
    create: {
      productId: cab.id,
      type: 'manufacture',
    },
  });

  // Orden de fabricación de ejemplo
  const order = await prisma.manufacturingOrder.upsert({
    where: { name: 'PLDOR/OPR/00564' },
    update: {
      lotNumber: LOT_PLDOR_00564,
      inspectorName: INSPECTOR_PLDOR,
    },
    create: {
      name: 'PLDOR/OPR/00564',
      lotNumber: LOT_PLDOR_00564,
      productionDate: new Date('2026-06-24'),
      state: 'confirmed',
      inspectorName: INSPECTOR_PLDOR,
    },
  });

  await prisma.manufacturingOrderLine.deleteMany({ where: { orderId: order.id } });
  await prisma.manufacturingOrderLine.createMany({
    data: [
      { orderId: order.id, productId: kitCama.id, quantity: 3 },
      { orderId: order.id, productId: velador.id, quantity: 1 },
    ],
  });

  const orderColchon = await prisma.manufacturingOrder.upsert({
    where: { name: 'PLDOR/OPR/00565' },
    update: {
      lotNumber: LOT_PLDOR_00565,
      productionDate: new Date('2026-06-20'),
      state: 'confirmed',
      inspectorName: INSPECTOR_PLDOR,
    },
    create: {
      name: 'PLDOR/OPR/00565',
      lotNumber: LOT_PLDOR_00565,
      productionDate: new Date('2026-06-20'),
      state: 'confirmed',
      inspectorName: INSPECTOR_PLDOR,
    },
  });

  await prisma.manufacturingOrderLine.deleteMany({ where: { orderId: orderColchon.id } });
  await prisma.manufacturingOrderLine.createMany({
    data: [{ orderId: orderColchon.id, productId: colchonMilo.id, quantity: 3 }],
  });

  const orderConforme = await prisma.manufacturingOrder.upsert({
    where: { name: 'PSTAB/OPR/00859' },
    update: {
      lotNumber: LOT_PSTAB_00859,
      productionDate: new Date('2026-06-20'),
      state: 'confirmed',
      inspectorName: INSPECTOR_PSTAB,
    },
    create: {
      name: 'PSTAB/OPR/00859',
      lotNumber: LOT_PSTAB_00859,
      productionDate: new Date('2026-06-20'),
      state: 'confirmed',
      inspectorName: INSPECTOR_PSTAB,
    },
  });

  await prisma.manufacturingOrderLine.deleteMany({ where: { orderId: orderConforme.id } });
  await prisma.manufacturingOrderLine.createMany({
    data: [{ orderId: orderConforme.id, productId: tableros.id, quantity: 1 }],
  });

  const orderConformePapel = await prisma.manufacturingOrder.upsert({
    where: { name: 'PLCAJ/OPR/00083' },
    update: {
      lotNumber: LOT_PLCAJ_00083,
      productionDate: new Date('2026-06-18'),
      state: 'confirmed',
      inspectorName: INSPECTOR_PLCAJ,
    },
    create: {
      name: 'PLCAJ/OPR/00083',
      lotNumber: LOT_PLCAJ_00083,
      productionDate: new Date('2026-06-18'),
      state: 'confirmed',
      inspectorName: INSPECTOR_PLCAJ,
    },
  });

  await prisma.manufacturingOrderLine.deleteMany({
    where: { orderId: orderConformePapel.id },
  });
  await prisma.manufacturingOrderLine.createMany({
    data: [{ orderId: orderConformePapel.id, productId: veladorCapri.id, quantity: 54 }],
  });

  const orderCarpinteria = await prisma.manufacturingOrder.upsert({
    where: { name: 'PLCAJ/OPR/00084' },
    update: {
      lotNumber: LOT_PLCAJ_00083,
      productionDate: new Date('2026-06-18'),
      state: 'confirmed',
      inspectorName: INSPECTOR_PLCAJ,
    },
    create: {
      name: 'PLCAJ/OPR/00084',
      lotNumber: LOT_PLCAJ_00083,
      productionDate: new Date('2026-06-18'),
      state: 'confirmed',
      inspectorName: INSPECTOR_PLCAJ,
    },
  });

  await prisma.manufacturingOrderLine.deleteMany({
    where: { orderId: orderCarpinteria.id },
  });
  await prisma.manufacturingOrderLine.createMany({
    data: [{ orderId: orderCarpinteria.id, productId: veladorCapriCarpenter.id, quantity: 54 }],
  });

  console.log('Seed completado:');
  console.log(`  - Orden muebles: ${order.name} → lote ${order.lotNumber}`);
  console.log(`  - Orden colchón: ${orderColchon.name} → lote ${orderColchon.lotNumber}`);
  console.log(
    `  - Orden conforme: ${orderConforme.name} → lote ${orderConforme.lotNumber}`,
  );
  console.log(
    `  - Orden conforme papel: ${orderConformePapel.name} → lote ${orderConformePapel.lotNumber} (54 uds → 54 etiquetas)`,
  );
  console.log(
    `  - Orden Carpenter: ${orderCarpinteria.name} → lote ${orderCarpinteria.lotNumber} (54 uds → 54 etiquetas)`,
  );
  console.log(
    `  - Plantillas activas: ${TEMPLATE_CATALOG.map((t) => t.code).join(', ')}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
