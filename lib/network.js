'use strict';

const os = require('node:os');
const { spawnSync } = require('node:child_process');

const PRIVATE_IPV4 = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
const LINK_LOCAL_IPV4 = /^169\.254\./;

function getNetworkServiceLabels() {
  if (process.platform !== 'darwin') return new Map();
  const result = spawnSync('networksetup', ['-listnetworkserviceorder'], {
    encoding: 'utf8',
    timeout: 3000
  });
  if (result.error || result.status !== 0) return new Map();
  const labels = new Map();
  let service = null;
  for (const line of result.stdout.split('\n')) {
    const serviceMatch = line.match(/^\((?:\*|\d+)\)\s+(.+)$/);
    if (serviceMatch) {
      service = serviceMatch[1].trim();
      continue;
    }
    const deviceMatch = line.match(/\(Hardware Port: .*?, Device: ([^)]+)\)/);
    if (deviceMatch && service) {
      const device = deviceMatch[1].trim();
      if (!labels.has(device)) labels.set(device, service);
      service = null;
    }
  }
  return labels;
}

function getLanAddresses() {
  const found = new Map();
  const labels = getNetworkServiceLabels();

  for (const [interfaceName, addresses] of Object.entries(os.networkInterfaces())) {
    for (const info of addresses || []) {
      const family = typeof info.family === 'string' ? info.family : `IPv${info.family}`;
      if (family !== 'IPv4' || info.internal) continue;
      if (!info.address || LINK_LOCAL_IPV4.test(info.address)) continue;
      if (!found.has(info.address)) {
        const serviceLabel = labels.get(interfaceName) || interfaceName;
        const bluetooth = /bluetooth|蓝牙|bnep/i.test(serviceLabel)
          || /^bnep/i.test(interfaceName)
          || /^172\.20\.10\./.test(info.address);
        found.set(info.address, {
          address: info.address,
          interface: interfaceName,
          label: serviceLabel,
          bluetooth
        });
      }
    }
  }

  return [...found.values()].sort((a, b) => {
    const aPrivate = PRIVATE_IPV4.test(a.address) ? 0 : 1;
    const bPrivate = PRIVATE_IPV4.test(b.address) ? 0 : 1;
    if (aPrivate !== bPrivate) return aPrivate - bPrivate;
    if (a.interface !== b.interface) return a.interface.localeCompare(b.interface);
    return a.address.localeCompare(b.address);
  });
}

function buildUrl(protocol, host, port) {
  const defaultPort = protocol === 'https' ? 443 : 80;
  const hostPart = host.includes(':') ? `[${host}]` : host;
  return `${protocol}://${hostPart}${Number(port) === defaultPort ? '' : `:${port}`}/`;
}

module.exports = { getLanAddresses, buildUrl };
