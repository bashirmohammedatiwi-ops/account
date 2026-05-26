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

function parseTreesResult(stdout) {
  const line = stdout.split(/\r?\n/).reverse().find((row) => row.startsWith('@TREES|'));
  if (!line) throw new Error('تعذّر قراءة الشجرات من EdariNX');
  return JSON.parse(line.slice('@TREES|'.length));
}

function spawnScript(args, { onProgress } = {}) {
  const script = path.join(__dirname, '..', 'sync-client', 'sync.js');
  const env = {
    ...process.env,
    EDARI_READER_ROOT: process.env.EDARI_READER_ROOT
      || path.join(__dirname, '..', '..', 'edari-reader')
  };

  const nodeBin = process.env.NODE_BIN
    || (String(process.execPath).toLowerCase().includes('electron')
      ? (process.platform === 'win32' ? 'node.exe' : 'node')
      : process.execPath);

  return new Promise((resolve, reject) => {
    let stdout = '';
    const child = spawn(nodeBin, [script, ...args], {
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
      resolve(stdout);
    });
  });
}

async function listEdariTrees() {
  const stdout = await spawnScript(['--list-trees']);
  return parseTreesResult(stdout);
}

async function runLocalSync(serverUrl, syncKey, treeSeqs = [], onProgress) {
  if (!Array.isArray(treeSeqs) || !treeSeqs.length) {
    throw new Error('حدد شجرة واحدة على الأقل للرفع');
  }

  const args = ['--server', serverUrl, '--key', syncKey, '--trees', treeSeqs.join(',')];
  const stdout = await spawnScript(args, { onProgress });
  return parseSyncResult(stdout);
}

module.exports = { runLocalSync, listEdariTrees, parseSyncResult };
