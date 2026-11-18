'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { getLanAddresses } = require('./network');

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

/**
 * Creates a self-signed certificate for the LAN IPs when no certificate is
 * supplied. A self-signed certificate is enough for microphone permission once
 * the certificate warning has been accepted, but the phone will still show a
 * warning. The README explains how to use mkcert for a fully trusted setup.
 */
function ensureHttpsCertificate({ certDir, logger = console }) {
  const certPath = path.join(certDir, 'cert.pem');
  const keyPath = path.join(certDir, 'key.pem');

  const addresses = getLanAddresses().map((item) => item.address);
  if (
    certificateIsUsable(certPath, keyPath)
    && certificateCoversAddresses(certPath, addresses)
  ) {
    return { certPath, keyPath, created: false };
  }

  fs.mkdirSync(certDir, { recursive: true });
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
      '825',
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
    logger.warn(`[https] 自动生成证书失败，语音将无法在手机上使用：${detail}`);
    return null;
  }

  try {
    fs.chmodSync(keyPath, 0o600);
  } catch {
    // Permissions are best-effort on non-POSIX platforms.
  }

  return { certPath, keyPath, created: true };
}

module.exports = { ensureHttpsCertificate, certificateIsUsable };
