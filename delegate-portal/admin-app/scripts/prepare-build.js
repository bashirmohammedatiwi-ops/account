const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const PORTAL_SRC = path.join(ROOT, '..');
const EDARI_SRC = path.join(PORTAL_SRC, '..', 'edari-reader');
const OUT = path.join(ROOT, 'build-resources');
const PORTAL_OUT = path.join(OUT, 'portal');
const EDARI_OUT = path.join(OUT, 'edari-reader');
const NODE_OUT = path.join(OUT, 'node');

const PORTAL_COPY = [
  'server.js',
  'price-app-server.js',
  'package.json',
  'package-lock.json',
  'lib',
  'routes',
  'public',
  'sync-client'
];

function rimraf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (name === 'node_modules' || name === 'data') continue;
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: ${res.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function ensureNodePortable() {
  const nodeExe = path.join(NODE_OUT, 'node.exe');
  if (fs.existsSync(nodeExe)) {
    console.log('Node portable: موجود');
    return;
  }

  const version = process.version.replace('v', '');
  const major = version.split('.')[0];
  const zipName = `node-v${major}.win-x64.zip`;
  const url = `https://nodejs.org/dist/v${major}.0.0/${zipName}`;
  const zipPath = path.join(OUT, zipName);

  console.log(`جاري تنزيل Node ${major}.x للتضمين...`);
  fs.mkdirSync(OUT, { recursive: true });

  try {
    await download(url, zipPath);
  } catch {
    const fallback = `https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip`;
    console.log('محاولة رابط بديل...');
    await download(fallback, zipPath);
  }

  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${OUT}' -Force"`,
    { stdio: 'inherit' }
  );

  const extracted = fs.readdirSync(OUT).find((n) => n.startsWith('node-v') && fs.statSync(path.join(OUT, n)).isDirectory());
  if (!extracted) throw new Error('فشل فك ضغط Node');

  rimraf(NODE_OUT);
  fs.renameSync(path.join(OUT, extracted), NODE_OUT);
  fs.unlinkSync(zipPath);
  console.log('Node portable: جاهز');
}

function preparePortal() {
  console.log('نسخ ملفات البوابة...');
  rimraf(PORTAL_OUT);
  fs.mkdirSync(PORTAL_OUT, { recursive: true });

  for (const item of PORTAL_COPY) {
    const src = path.join(PORTAL_SRC, item);
    if (!fs.existsSync(src)) throw new Error(`Missing: ${src}`);
    copyRecursive(src, path.join(PORTAL_OUT, item));
  }

  const parentModules = path.join(PORTAL_SRC, 'node_modules');
  const outModules = path.join(PORTAL_OUT, 'node_modules');
  if (fs.existsSync(parentModules)) {
    console.log('نسخ node_modules من delegate-portal...');
    copyRecursive(parentModules, outModules);
  } else {
    console.log('تثبيت dependencies للبوابة...');
    execSync('npm ci --omit=dev', { cwd: PORTAL_OUT, stdio: 'inherit' });
  }
  rebuildPortalNativeModules();
}

function rebuildPortalNativeModules() {
  const nodeExe = path.join(NODE_OUT, 'node.exe');
  if (!fs.existsSync(nodeExe)) {
    console.log('تخطّي rebuild — Node portable غير موجود');
    return;
  }

  let target = '20.18.0';
  try {
    target = execSync(`"${nodeExe}" -p process.versions.node`, { encoding: 'utf8' }).trim();
  } catch { /* use default */ }

  console.log(`إعادة بناء better-sqlite3 لـ Node ${target}...`);
  try {
    execSync('npm rebuild better-sqlite3 --build-from-source', {
      cwd: PORTAL_OUT,
      env: {
        ...process.env,
        npm_config_target: target,
        npm_config_runtime: 'node',
        npm_config_arch: 'x64',
        npm_config_disturl: 'https://nodejs.org/dist'
      },
      stdio: 'inherit',
      shell: true
    });
    console.log('better-sqlite3: جاهز لـ Node المضمّن');
  } catch (err) {
    console.warn('تحذير: فشل rebuild better-sqlite3 —', err.message);
  }
}

function prepareEdariReader() {
  console.log('نسخ edari-reader/lib...');
  rimraf(EDARI_OUT);
  copyRecursive(path.join(EDARI_SRC, 'lib'), path.join(EDARI_OUT, 'lib'));
  copyRecursive(path.join(EDARI_SRC, 'scripts'), path.join(EDARI_OUT, 'scripts'));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  preparePortal();
  prepareEdariReader();
  await ensureNodePortable();
  console.log('\n✓ build-resources جاهزة');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
