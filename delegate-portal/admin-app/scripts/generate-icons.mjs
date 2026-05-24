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

async function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Missing icon source: ${SOURCE}`);
  }

  await sharp(SOURCE)
    .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toFile(PNG);

  const ico = await pngToIco(PNG);
  fs.writeFileSync(ICO, ico);

  fs.mkdirSync(path.dirname(BUILD_ICO), { recursive: true });
  fs.copyFileSync(PNG, BUILD_PNG);
  fs.writeFileSync(BUILD_ICO, ico);

  console.log('Icons ready:', ICO);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
