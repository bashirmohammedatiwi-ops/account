const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
  const { rcedit } = await import('rcedit');
  const projectDir = context.packager.projectDir;
  const icon = path.join(projectDir, 'icons', 'app-icon.ico');
  if (!fs.existsSync(icon)) {
    throw new Error(`Missing icon: ${icon}`);
  }

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exe = path.join(context.appOutDir, exeName);
  if (!fs.existsSync(exe)) {
    throw new Error(`Missing executable: ${exe}`);
  }

  await rcedit(exe, { icon });
  fs.copyFileSync(icon, path.join(context.appOutDir, 'app-icon.ico'));
  console.log(`✓ Icon applied: ${exeName}`);
};
