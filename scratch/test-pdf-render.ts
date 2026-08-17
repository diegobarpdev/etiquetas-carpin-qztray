import { generateLabelsPdf } from '../server/services/pdf-generator.service';
import { renderPdfToPngPages } from '../print-agent/lib/render-pdf';
import fs from 'fs';
import path from 'path';

async function test() {
  const sampleLabel = {
    productName: 'COLCHON MILO KING 2.00 X 2.00',
    shortName: 'COLCHON MILO KING',
    ean: '7861000001234',
    internalRef: 'COL-MILO-KING',
    lotNumber: 'LOTE-2026-001',
    orderName: 'MO-2026-001',
    bultoCurrent: 1,
    bultoTotal: 1,
    quantity: 1,
    serialCurrent: 1,
    serialTotal: 1,
    weightKg: '35',
    productionDate: '2026-08-07',
    height: '30',
    width: '200',
    length: '200',
    volumeM3: '1.2',
    templateCode: 'producto-conforme-papel-colchones',
    conformeTitle: 'PRODUCTO CONFORME',
    conformeSubtitle: 'Este producto es conforme con las especificaciones de nuestra empresa.',
    madeIn: 'CUENCA - ECUADOR',
    showInternalRefQr: false,
    qrSku: '7861000001234',
    qrInternalRef: 'COL-MILO-KING',
    qrLotNumber: 'LOTE-2026-001',
    inspectorName: 'LOPEZ FAJARDO LUIS VICENTE',
    showKitSubproduct: false,
  };

  console.log('Generando PDF...');
  const pdfBuffer = await generateLabelsPdf([sampleLabel as any]);
  const outDir = path.join(process.cwd(), 'scratch');
  const pdfPath = path.join(outDir, 'test-colchon.pdf');
  fs.writeFileSync(pdfPath, pdfBuffer);
  console.log('PDF guardado en:', pdfPath);

  const pngs = await renderPdfToPngPages(pdfPath, outDir);
  console.log('PNG generado en:', pngs);
}

test().catch(console.error);
