/**
 * Generate Android mipmap + PWA icons from source PNG (white bg + red logo).
 * Usage: node scripts/generate-emp-icons.js [source.png]
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = process.argv[2] || path.join(root, 'emp-mobile', 'assets', 'app_icon_source.png');

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error('Run: npm install sharp (in delegate-portal folder)');
    process.exit(1);
  }

  if (!fs.existsSync(source)) {
    console.error('Source not found:', source);
    process.exit(1);
  }

  const androidSizes = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192
  };

  const resRoot = path.join(root, 'emp-mobile', 'android', 'app', 'src', 'main', 'res');
  for (const [folder, size] of Object.entries(androidSizes)) {
    const dir = path.join(resRoot, folder);
    fs.mkdirSync(dir, { recursive: true });
  }

  const pwaDir = path.join(root, 'public', 'emp', 'icons');
  fs.mkdirSync(pwaDir, { recursive: true });

  const base = sharp(source).ensureAlpha();

  for (const [folder, size] of Object.entries(androidSizes)) {
    const out = path.join(resRoot, folder, 'ic_launcher.png');
    await base.clone().resize(size, size, { fit: 'contain', background: '#ffffff' }).png().toFile(out);
    console.log('wrote', out);
  }

  const pwaSizes = [
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icon-maskable-192.png', 192, true],
    ['icon-maskable-512.png', 512, true]
  ];

  for (const [name, size, maskable] of pwaSizes) {
    const out = path.join(pwaDir, name);
    if (maskable) {
      const inner = Math.round(size * 0.72);
      const logo = await base.clone().resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
      await sharp({
        create: { width: size, height: size, channels: 4, background: '#ffffff' }
      }).composite([{ input: logo, gravity: 'centre' }]).png().toFile(out);
    } else {
      await base.clone().resize(size, size, { fit: 'contain', background: '#ffffff' }).png().toFile(out);
    }
    console.log('wrote', out);
  }

  const assetsDir = path.join(root, 'emp-mobile', 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.copyFileSync(source, path.join(assetsDir, 'app_icon_source.png'));
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
