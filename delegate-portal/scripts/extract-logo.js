const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

async function main() {
  const pdfPath = path.join(__dirname, '..', 'public', 'm', 'assets', 'logo.pdf');
  const outPath = path.join(__dirname, '..', 'public', 'm', 'assets', 'logo.png');
  if (!fs.existsSync(pdfPath)) {
    console.error('logo.pdf not found');
    process.exit(1);
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 3 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
  console.log('Logo PNG:', outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
