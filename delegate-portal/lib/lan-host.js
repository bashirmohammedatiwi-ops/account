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

function isEthernetInterface(name) {
  const n = String(name || '').toLowerCase();
  if (/virtual|vmware|hyper-v|loopback|vpn|wireguard|tailscale|bluetooth|wsl|docker|vethernet/i.test(n)) {
    return false;
  }
  return /ethernet|eth\b|realtek|^\s*lan\b|gbe|2\.5g/i.test(n);
}

function listLanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4' && net.family !== 4) continue;
      if (net.internal) continue;
      if (!isPrivateIpv4(net.address)) continue;
      out.push({
        name,
        address: net.address,
        netmask: net.netmask || '',
        isEthernet: isEthernetInterface(name)
      });
    }
  }
  out.sort((a, b) => {
    if (a.isEthernet !== b.isEthernet) return a.isEthernet ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

function getEthernetLanAddress() {
  return listLanAddresses().find((row) => row.isEthernet)?.address || null;
}

function getPrimaryLanAddress() {
  return getEthernetLanAddress() || listLanAddresses()[0]?.address || null;
}

module.exports = {
  listLanAddresses,
  getEthernetLanAddress,
  getPrimaryLanAddress,
  isPrivateIpv4,
  isEthernetInterface
};
