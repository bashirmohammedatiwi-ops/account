const { execFile } = require('child_process');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

async function runLocalSync(serverUrl, syncKey) {
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

  const { stdout, stderr } = await execFileAsync(
    nodeBin,
    [script, '--server', serverUrl, '--key', syncKey],
    {
      env,
      maxBuffer: 20 * 1024 * 1024,
      timeout: 30 * 60 * 1000,
      cwd: path.join(__dirname, '..')
    }
  );

  const match = stdout.match(/(\d+) حساب، (\d+) حركة/);
  return {
    ok: true,
    accounts: match ? Number(match[1]) : 0,
    journal: match ? Number(match[2]) : 0,
    stdout,
    stderr
  };
}

module.exports = { runLocalSync };
