'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { getLanAddresses } = require('./network');

const CERT_LIFETIME_DAYS = 825;
const META_FILE = 'meta.json';

function certificateIsUsable(certPath, keyPath) {
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) return false;
  const check = spawnSync(
    'openssl',
    ['x509', '-checkend', '86400', '-noout', '-in', certPath],
    { encoding: 'utf8' }
  );
  return !check.error && check.status === 0;
}

function certificateCoversAddresses(certPath, addresses) {
  if (addresses.length === 0) return true;
  const result = spawnSync(
    'openssl',
    ['x509', '-in', certPath, '-noout', '-text'],
    { encoding: 'utf8' }
  );
  if (result.error || result.status !== 0) return false;
  return addresses.every((address) => result.stdout.includes(`IP Address:${address}`));
}

function hasOpenSsl() {
  const result = spawnSync('openssl', ['version'], { encoding: 'utf8', timeout: 5000 });
  return !result.error && result.status === 0;
}

function readMeta(certDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(certDir, META_FILE), 'utf8'));
  } catch {
    return null;
  }
}

function writeMeta(certDir, meta) {
  try {
    fs.writeFileSync(
      path.join(certDir, META_FILE),
      `${JSON.stringify(meta, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 }
    );
  } catch {
    // Metadata only avoids regenerating the certificate; HTTPS still works.
  }
}

function metaMatches(meta, addresses) {
  if (!meta || !Array.isArray(meta.addresses)) return false;
  if (Number(meta.expiresAt) <= Date.now() + 24 * 60 * 60 * 1000) return false;
  return addresses.every((address) => meta.addresses.includes(address));
}

function buildAltNames(addresses) {
  const names = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' }
  ];
  for (const address of addresses) {
    names.push({ type: 7, ip: address });
  }
  return names;
}

async function generateSelfSigned(certPath, keyPath, addresses) {
  const selfsigned = require('selfsigned');
  const notBefore = new Date();
  const notAfter = new Date(notBefore.getTime() + CERT_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
  const pems = await selfsigned.generate(
    [
      { name: 'commonName', value: 'Remote Bridge Local' },
      { name: 'organizationName', value: 'Remote Bridge' }
    ],
    {
      keySize: 2048,
      algorithm: 'sha256',
      notBeforeDate: notBefore,
      notAfterDate: notAfter,
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true },
        { name: 'subjectAltName', altNames: buildAltNames(addresses) }
      ]
    }
  );
  fs.writeFileSync(certPath, pems.cert, { encoding: 'utf8', mode: 0o600 });
  fs.writeFileSync(keyPath, pems.private, { encoding: 'utf8', mode: 0o600 });
  return notAfter.getTime();
}

function generateWithOpenSsl(certDir, certPath, keyPath, addresses) {
  const altNames = ['IP.1 = 127.0.0.1', 'DNS.1 = localhost'];
  let ipIndex = 2;
  for (const address of addresses) {
    altNames.push(`IP.${ipIndex} = ${address}`);
    ipIndex += 1;
  }

  const opensslConfig = [
    '[req]',
    'prompt = no',
    'distinguished_name = req_distinguished_name',
    'x509_extensions = v3_req',
    '',
    '[req_distinguished_name]',
    'CN = Remote Bridge Local',
    'O = Remote Bridge',
    '',
    '[v3_req]',
    'basicConstraints = critical, CA:FALSE',
    'keyUsage = critical, digitalSignature, keyEncipherment',
    'extendedKeyUsage = serverAuth',
    'subjectAltName = @alt_names',
    '',
    '[alt_names]',
    ...altNames,
    ''
  ].join('\n');

  const configPath = path.join(certDir, 'openssl.cnf');
  fs.writeFileSync(configPath, opensslConfig, { encoding: 'utf8', mode: 0o600 });

  const result = spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      '-days',
      String(CERT_LIFETIME_DAYS),
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-config',
      configPath,
      '-extensions',
      'v3_req'
    ],
    { encoding: 'utf8', timeout: 20_000 }
  );

  if (result.error || result.status !== 0) {
    const detail = result.error
      ? result.error.message
      : (result.stderr || result.stdout || '未知错误').trim();
    return { ok: false, detail };
  }

  try {
    fs.chmodSync(keyPath, 0o600);
  } catch {
    // Permissions are best-effort on non-POSIX platforms.
  }

  return { ok: true };
}

/**
 * Creates a self-signed certificate for the LAN IPs when no certificate is
 * supplied. Prefers the system `openssl`; on Windows, or when OpenSSL is not
 * installed, falls back to the pure-JavaScript `selfsigned` package so HTTPS
 * (and therefore phone microphone access) works without extra tools.
 */
async function ensureHttpsCertificate({
  certDir,
  logger = console,
  preferOpenSsl = true
} = {}) {
  const certPath = path.join(certDir, 'cert.pem');
  const keyPath = path.join(certDir, 'key.pem');

  const addresses = getLanAddresses().map((item) => item.address);
  const meta = readMeta(certDir);
  const openssl = preferOpenSsl && hasOpenSsl();

  const usable = openssl
    ? certificateIsUsable(certPath, keyPath)
    : fs.existsSync(certPath) && fs.existsSync(keyPath) && metaMatches(meta, addresses);
  const covers = openssl
    ? certificateCoversAddresses(certPath, addresses)
    : metaMatches(meta, addresses);
  if (usable && covers) {
    return { certPath, keyPath, created: false };
  }

  fs.mkdirSync(certDir, { recursive: true });
  const expiresAt = Date.now() + CERT_LIFETIME_DAYS * 24 * 60 * 60 * 1000;

  if (openssl) {
    const result = generateWithOpenSsl(certDir, certPath, keyPath, addresses);
    if (result.ok) {
      writeMeta(certDir, {
        source: 'openssl',
        addresses,
        expiresAt,
        createdAt: Date.now()
      });
      return { certPath, keyPath, created: true };
    }
    logger.warn(`[https] openssl 生成证书失败，改用内置生成器：${result.detail}`);
  } else if (preferOpenSsl) {
    logger.warn('[https] 未找到 openssl，使用内置证书生成器');
  }

  try {
    const actualExpiresAt = await generateSelfSigned(certPath, keyPath, addresses);
    writeMeta(certDir, {
      source: 'selfsigned',
      addresses,
      expiresAt: actualExpiresAt,
      createdAt: Date.now()
    });
    return { certPath, keyPath, created: true };
  } catch (error) {
    logger.warn(`[https] 自动生成证书失败，语音将无法在手机上使用：${error.message}`);
    return null;
  }
}

module.exports = {
  ensureHttpsCertificate,
  certificateIsUsable,
  certificateCoversAddresses
};
