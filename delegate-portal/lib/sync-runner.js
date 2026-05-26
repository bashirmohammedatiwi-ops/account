const { spawn } = require('child_process');
const path = require('path');

function parseSyncResult(stdout) {
  const match = stdout.match(/(\d+) حساب، (\d+) حركة(?:، (\d+) فاتورة(?:، (\d+) بند)?)?/);
  return {
    ok: true,
    accounts: match ? Number(match[1]) : 0,
    journal: match ? Number(match[2]) : 0,
    invoices: match && match[3] ? Number(match[3]) : 0,
    invoiceLines: match && match[4] ? Number(match[4]) : 0
  };
}

async function runLocalSync(serverUrl, syncKey, onProgress) {
  const script = path.join(__dirname, '..', 'sync-client', 'sync.js');
  const env = {
    ...process.env,
    SYNC_SERVER: serverUrl,
    SYNC_API_KEY: syncKey,
    EDARI_READER_ROOT: process.env.EDARI_READER_ROOT
      || path.join(__dirname, '..', '..', 'edari-reader')
  };

  const nodeBin = process.env.NODE_BIN
    || (String(process.execPath).toLowerCase().includes('electron')
      ? (process.platform === 'win32' ? 'node.exe' : 'node')
      : process.execPath);

  return new Promise((resolve, reject) => {
    let stdout = '';
    const child = spawn(nodeBin, [script, '--server', serverUrl, '--key', syncKey], {
      env,
      cwd: path.join(__dirname, '..'),
      windowsHide: true
    });

    child.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      text.split(/\r?\n/).forEach((line) => {
        const trimmed = line.replace(/^\r+/, '').trim();
        if (trimmed && onProgress) onProgress(trimmed);
      });
    });

    child.stderr.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      text.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && onProgress) onProgress(trimmed);
      });
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(stdout.trim() || `Sync exit ${code}`));
      }
      resolve(parseSyncResult(stdout));
    });
  });
}

module.exports = { runLocalSync, parseSyncResult };
