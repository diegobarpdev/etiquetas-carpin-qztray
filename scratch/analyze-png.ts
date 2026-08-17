import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';

const pngPath = path.join(process.cwd(), 'scratch', 'page-001.png');
const buffer = fs.readFileSync(pngPath);
const png = PNG.sync.read(buffer);

console.log(`PNG Dimensions: ${png.width} x ${png.height} px`);
const dpi = 203;
const widthMm = (png.width / dpi) * 25.4;
const heightMm = (png.height / dpi) * 25.4;
console.log(`Physical Dimensions @ ${dpi} DPI: ${widthMm.toFixed(2)} mm x ${heightMm.toFixed(2)} mm`);

let minY = png.height;
let maxY = 0;
let minX = png.width;
let maxX = 0;

for (let y = 0; y < png.height; y++) {
  for (let x = 0; x < png.width; x++) {
    const idx = (png.width * y + x) << 2;
    const r = png.data[idx];
    const g = png.data[idx + 1];
    const b = png.data[idx + 2];
    const a = png.data[idx + 3];

    // If pixel is dark (black border / text)
    if (a > 128 && r < 100 && g < 100 && b < 100) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
}

const topMarginMm = (minY / dpi) * 25.4;
const bottomMarginMm = ((png.height - maxY) / dpi) * 25.4;
const leftMarginMm = (minX / dpi) * 25.4;
const rightMarginMm = ((png.width - maxX) / dpi) * 25.4;
const contentHeightMm = ((maxY - minY) / dpi) * 25.4;
const contentWidthMm = ((maxX - minX) / dpi) * 25.4;

console.log('--- ANALYSIS OF PRINTED PIXELS ---');
console.log(`Top blank space (inicio de la etiqueta): ${topMarginMm.toFixed(2)} mm (${(topMarginMm / 10).toFixed(2)} cm)`);
console.log(`Content height: ${contentHeightMm.toFixed(2)} mm (${(contentHeightMm / 10).toFixed(2)} cm)`);
console.log(`Bottom blank space: ${bottomMarginMm.toFixed(2)} mm (${(bottomMarginMm / 10).toFixed(2)} cm)`);
console.log(`Left blank space: ${leftMarginMm.toFixed(2)} mm`);
console.log(`Right blank space: ${rightMarginMm.toFixed(2)} mm`);
