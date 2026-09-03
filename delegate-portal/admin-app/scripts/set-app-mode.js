const fs = require('fs');
const path = require('path');

const mode = process.argv[2] || 'default';
const out = path.join(__dirname, '..', 'electron', 'app-mode.js');
const body = mode === 'lan-server'
  ? `module.exports = { mode: 'lan-server' };\n`
  : mode === 'lan-client'
    ? `module.exports = { mode: 'lan-client' };\n`
    : `module.exports = { mode: 'default' };\n`;

fs.writeFileSync(out, body, 'utf8');
console.log(`app-mode: ${mode}`);
