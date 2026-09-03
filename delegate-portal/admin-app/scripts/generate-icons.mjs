import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = path.join(__dirname, '..', 'icons');
const SOURCE = path.join(ICONS_DIR, 'app-icon.png');
const PNG = path.join(ICONS_DIR, 'app-icon-256.png');
const ICO = path.join(ICONS_DIR, 'app-icon.ico');
const BUILD_ICO = path.join(__dirname, '..', 'build-resources', 'icon.ico');
const BUILD_PNG = path.join(__dirname, '..', 'build-resources', 'icon.png');
const ICO_SIZES = [16, 32, 48, 64, 128, 256];

/** Make near-black background transparent so the icon looks like a clean PNG on desktop. */
async function toTransparentIcon(inputPath) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data);
  const channels = info.channels || 4;
  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const isDark = max < 42;
    const isNeutral = max - min < 18;
    if (isDark && isNeutral) {
      pixels[i + 3] = 0;
      continue;
    }
    if (max < 72 && isNeutral) {
      pixels[i + 3] = Math.min(pixels[i + 3], Math.round(((max - 42) / 30) * 255));
    }
  }

  return sharp(pixels, {
    raw: { width: info.width, height: info.height, channels }
  }).png();
}

async function renderSquarePng(pipeline, size) {
  return pipeline
    .clone()
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Missing icon source: ${SOURCE}`);
  }

  const base = await toTransparentIcon(SOURCE);

  const png256 = await renderSquarePng(base, 256);
  fs.writeFileSync(PNG, png256);

  const icoBuffers = [];
  for (const size of ICO_SIZES) {
    icoBuffers.push(await renderSquarePng(base, size));
  }
  const ico = await pngToIco(icoBuffers);
  fs.writeFileSync(ICO, ico);

  fs.mkdirSync(path.dirname(BUILD_ICO), { recursive: true });
  fs.copyFileSync(PNG, BUILD_PNG);
  fs.writeFileSync(BUILD_ICO, ico);

  console.log('Icons ready:', ICO);
  console.log('PNG (transparent):', PNG);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
