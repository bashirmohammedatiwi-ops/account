const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const OUT = path.join(__dirname, '..', 'public', 'emp', 'icons');

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawIcon(size, maskable = false) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const pad = maskable ? size * 0.18 : 0;

  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#134e4a');
  bg.addColorStop(1, '#0f766e');
  ctx.fillStyle = bg;
  if (maskable) {
    ctx.fillRect(0, 0, size, size);
    roundRect(ctx, pad, pad, size - pad * 2, size - pad * 2, size * 0.18);
    ctx.fill();
  } else {
    roundRect(ctx, 0, 0, size, size, size * 0.22);
    ctx.fill();
  }

  const cx = size / 2;
  const cy = size / 2;
  const box = size * (maskable ? 0.34 : 0.38);
  const bx = cx - box / 2;
  const by = cy - box / 2 + size * 0.02;

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.045;
  ctx.lineJoin = 'round';
  roundRect(ctx, bx, by, box, box * 0.72, size * 0.08);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(bx + box * 0.22, by + box * 0.36);
  ctx.lineTo(cx, by + box * 0.58);
  ctx.lineTo(bx + box * 0.78, by + box * 0.36);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `800 ${size * 0.11}px Cairo, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('تجهيز', cx, by + box * 0.9);

  return canvas;
}

fs.mkdirSync(OUT, { recursive: true });

const files = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-192.png', 192, true],
  ['icon-maskable-512.png', 512, true]
];

for (const [name, size, maskable] of files) {
  const out = path.join(OUT, name);
  const buf = drawIcon(size, maskable).toBuffer('image/png');
  fs.writeFileSync(out, buf);
  console.log('Wrote', out);
}
