'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { ensureHttpsCertificate } = require('../lib/certificate');

test('generates and reuses a self-signed HTTPS certificate without OpenSSL', async (t) => {
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-bridge-cert-'));
  t.after(() => fs.rmSync(certDir, { recursive: true, force: true }));

  const logger = { warn() {}, info() {} };
  const first = await ensureHttpsCertificate({
    certDir,
    logger,
    preferOpenSsl: false
  });
  assert.ok(first);
  assert.equal(first.created, true);

  const certPem = fs.readFileSync(first.certPath, 'utf8');
  const keyPem = fs.readFileSync(first.keyPath, 'utf8');
  assert.match(certPem, /BEGIN CERTIFICATE/);
  assert.match(keyPem, /BEGIN PRIVATE KEY/);

  const certificate = new crypto.X509Certificate(certPem);
  assert.equal(certificate.checkHost('localhost'), 'localhost');
  assert.equal(certificate.checkIP('127.0.0.1'), '127.0.0.1');

  const meta = JSON.parse(fs.readFileSync(path.join(certDir, 'meta.json'), 'utf8'));
  assert.equal(meta.source, 'selfsigned');
  assert.ok(Array.isArray(meta.addresses));
  assert.ok(meta.expiresAt > Date.now());

  const second = await ensureHttpsCertificate({
    certDir,
    logger,
    preferOpenSsl: false
  });
  assert.equal(second.created, false);
});
