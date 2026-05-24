const config = require('./config');

async function fetchAliases() {
  const response = await fetch(`${config.nexusAdminUrl}/index.nxscript?index=1`);
  if (!response.ok) {
    throw new Error(`NexusDB admin returned ${response.status}`);
  }

  const html = await response.text();
  const aliases = [];
  const rowPattern =
    /<td id="DynamicRowIdentifier_(\d+)">([^<]+)<\/td>\s*<td id="DynamicRowValue_\1">([^<]+)<\/td>/gi;

  let match;
  while ((match = rowPattern.exec(html)) !== null) {
    aliases.push({
      name: match[2].trim(),
      path: match[3].trim()
    });
  }

  if (aliases.length === 0) {
    const hiddenMatch = html.match(/value="#NXADO_System=[^"]*;([^"]+)"/i);
    if (hiddenMatch) {
      for (const part of hiddenMatch[1].split(';')) {
        const eq = part.indexOf('=');
        if (eq > 0) {
          aliases.push({
            name: part.slice(0, eq).trim(),
            path: part.slice(eq + 1).trim()
          });
        }
      }
    }
  }

  return aliases.filter((item) => item.name && !item.name.startsWith('#'));
}

async function getServerStatus() {
  try {
    const response = await fetch(config.nexusAdminUrl, { signal: AbortSignal.timeout(3000) });
    const html = await response.text();
    const versionMatch = html.match(/Server Version:\s*([^<]+)/i);
    return {
      online: response.ok,
      version: versionMatch ? versionMatch[1].trim() : null,
      adminUrl: config.nexusAdminUrl
    };
  } catch {
    return { online: false, version: null, adminUrl: config.nexusAdminUrl };
  }
}

module.exports = {
  fetchAliases,
  getServerStatus
};
