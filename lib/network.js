'use strict';

const os = require('node:os');

const PRIVATE_IPV4 = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
const LINK_LOCAL_IPV4 = /^169\.254\./;

function getLanAddresses() {
  const found = new Map();

  for (const [interfaceName, addresses] of Object.entries(os.networkInterfaces())) {
    for (const info of addresses || []) {
      const family = typeof info.family === 'string' ? info.family : `IPv${info.family}`;
      if (family !== 'IPv4' || info.internal) continue;
      if (!info.address || LINK_LOCAL_IPV4.test(info.address)) continue;
      if (!found.has(info.address)) {
        found.set(info.address, { address: info.address, interface: interfaceName });
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
