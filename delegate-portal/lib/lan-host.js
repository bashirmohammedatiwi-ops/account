const os = require('os');

function isPrivateIpv4(ip) {
  if (!ip || ip.startsWith('127.')) return false;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function listLanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      if (!isPrivateIpv4(net.address)) continue;
      out.push({
        name,
        address: net.address,
        netmask: net.netmask || ''
      });
    }
  }
  return out;
}

function getPrimaryLanAddress() {
  const addrs = listLanAddresses();
  return addrs[0]?.address || null;
}

module.exports = {
  listLanAddresses,
  getPrimaryLanAddress,
  isPrivateIpv4
};
