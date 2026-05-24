const fs = require('fs');
const path = require('path');

const NX_MAGIC = Buffer.from('NX!2');

function isLocked(filePath) {
  try {
    const handle = fs.openSync(filePath, 'r+');
    fs.closeSync(handle);
    return false;
  } catch (err) {
    return err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES';
  }
}

function readNx1Header(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(64);
    fs.readSync(fd, buffer, 0, 64, 0);
    fs.closeSync(fd);

    const magicOk = buffer.subarray(0, 4).equals(NX_MAGIC);
    const tableNameLen = buffer.readUInt32LE(36);
    const tableName = buffer
      .subarray(40, 40 + Math.min(tableNameLen, 24))
      .toString('ascii')
      .replace(/\0/g, '')
      .trim();

    return {
      magic: buffer.subarray(0, 4).toString('ascii'),
      valid: magicOk,
      tableName: tableName || path.basename(filePath, '.nx1')
    };
  } catch {
    return { magic: null, valid: false, tableName: path.basename(filePath, '.nx1') };
  }
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function listDatabases(dataRoot) {
  if (!fs.existsSync(dataRoot)) return [];

  return fs
    .readdirSync(dataRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = path.join(dataRoot, entry.name);
      let nx1Count = 0;
      let totalSize = 0;

      try {
        for (const file of fs.readdirSync(fullPath)) {
          if (file.toLowerCase().endsWith('.nx1')) {
            nx1Count += 1;
            totalSize += fs.statSync(path.join(fullPath, file)).size;
          }
        }
      } catch {
        // ignore unreadable folders
      }

      return {
        name: entry.name,
        path: fullPath,
        tableCount: nx1Count,
        totalSize,
        totalSizeLabel: formatSize(totalSize)
      };
    })
    .filter((db) => db.tableCount > 0)
    .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
}

function listTables(dbPath) {
  if (!fs.existsSync(dbPath)) return [];

  return fs
    .readdirSync(dbPath)
    .filter((file) => file.toLowerCase().endsWith('.nx1'))
    .map((file) => {
      const fullPath = path.join(dbPath, file);
      const stat = fs.statSync(fullPath);
      const header = readNx1Header(fullPath);
      const tableName = path.basename(file, '.nx1');

      return {
        file,
        tableName,
        internalName: header.tableName,
        path: fullPath,
        size: stat.size,
        sizeLabel: formatSize(stat.size),
        modified: stat.mtime.toISOString(),
        locked: isLocked(fullPath),
        validNx1: header.valid
      };
    })
    .sort((a, b) => b.size - a.size);
}

function listTextExports(dbPath) {
  if (!fs.existsSync(dbPath)) return [];

  return fs
    .readdirSync(dbPath)
    .filter((file) => file.toLowerCase().endsWith('.txt'))
    .map((file) => {
      const fullPath = path.join(dbPath, file);
      const stat = fs.statSync(fullPath);
      return {
        file,
        path: fullPath,
        size: stat.size,
        sizeLabel: formatSize(stat.size),
        modified: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => b.size - a.size);
}

function readTextExport(filePath, maxLines = 500) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const truncated = lines.length > maxLines;

  return {
    lines: truncated ? lines.slice(0, maxLines) : lines,
    totalLines: lines.length,
    truncated
  };
}

module.exports = {
  listDatabases,
  listTables,
  listTextExports,
  readTextExport,
  formatSize,
  isLocked
};
