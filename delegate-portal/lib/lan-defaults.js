/** Defaults for LAN client discovery — Ethernet-first shop network. */
const LAN_PORTS = [4100, 5005];
const LAN_PREFER_SUBNETS = ['192.168.75', '192.168.1', '192.168.0', '10.0.0'];

function quickProbeIps(subnets = LAN_PREFER_SUBNETS) {
  const ips = [];
  for (const prefix of subnets) {
    for (const host of [1, 10, 100, 254]) {
      ips.push(`${prefix}.${host}`);
    }
  }
  return [...new Set(ips)];
}

function defaultPrefillUrl(subnets = LAN_PREFER_SUBNETS, port = LAN_PORTS[0]) {
  return `http://${subnets[0]}.1:${port}`;
}

function buildProbeUrls(ips, ports = LAN_PORTS) {
  const urls = [];
  for (const ip of ips) {
    for (const port of ports) {
      urls.push(`http://${ip}:${port}`);
    }
  }
  return urls;
}

module.exports = {
  LAN_PORTS,
  LAN_PREFER_SUBNETS,
  quickProbeIps,
  defaultPrefillUrl,
  buildProbeUrls
};
