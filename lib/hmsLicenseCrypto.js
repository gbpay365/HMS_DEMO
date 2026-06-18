'use strict';

const crypto = require('crypto');

const REQUEST_PREFIX = 'ZAI1-REQ-';
const SERIAL_PREFIX = 'ZAI1-LIC-';
const REQUEST_VALID_DAYS = 7;
const LICENSE_VALID_DAYS = 365;

function canonicalJson(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

function normalizePemFromEnv(pem) {
  let text = String(pem || '').trim();
  if (!text) return '';
  // Standard dotenv escaped newlines (setup-hms-license-env.js format)
  text = text.replace(/\\n/g, '\n');
  // Multi-line .env values folded with trailing backslashes
  text = text.replace(/\\\r?\n/g, '');

  const m = text.match(/(-----BEGIN [^-]+-----)\s*([\s\S]*?)\s*(-----END [^-]+-----)/);
  if (!m) return text.trim();

  // Strip whitespace and stray backslashes from folded .env PEM bodies
  const body = m[2].replace(/[\s\\]+/g, '');
  const lines = body.match(/.{1,64}/g) || [];
  return `${m[1]}\n${lines.join('\n')}\n${m[3]}`;
}

function parsePem(pem, label) {
  const text = normalizePemFromEnv(pem);
  if (!text) throw new Error(`${label} is not configured.`);
  return text;
}

function loadRsaPublicKey(pem) {
  return crypto.createPublicKey(parsePem(pem, 'LICENSE_RSA_PUBLIC_KEY_PEM'));
}

function loadRsaPrivateKey(pem) {
  return crypto.createPrivateKey(parsePem(pem, 'LICENSE_RSA_PRIVATE_KEY_PEM'));
}

function loadEd25519PublicKey(pem) {
  return crypto.createPublicKey(parsePem(pem, 'LICENSE_ED25519_PUBLIC_KEY_PEM'));
}

function loadEd25519PrivateKey(pem) {
  return crypto.createPrivateKey(parsePem(pem, 'LICENSE_ED25519_PRIVATE_KEY_PEM'));
}

function unixNow() {
  return Math.floor(Date.now() / 1000);
}

function buildRequestPayload({ installationId, solutionKey, facilityName, facilityId, contactEmail }) {
  const now = unixNow();
  return {
    v: 1,
    typ: 'req',
    iid: String(installationId),
    sid: String(solutionKey),
    fac: String(facilityName || '').slice(0, 250),
    fid: facilityId ? Number(facilityId) : null,
    email: contactEmail ? String(contactEmail).slice(0, 250) : null,
    ts: now,
    exp: now + REQUEST_VALID_DAYS * 86400,
    nonce: crypto.randomBytes(16).toString('hex'),
  };
}

function buildLicensePayload({ installationId, solutionKey, issuedAt, expiresAt }) {
  return {
    v: 1,
    typ: 'lic',
    iid: String(installationId),
    sid: String(solutionKey),
    iat: issuedAt,
    exp: expiresAt,
    nonce: crypto.randomBytes(12).toString('hex'),
  };
}

function encryptRequestCode(payload, rsaPublicKeyPem) {
  const pub = loadRsaPublicKey(rsaPublicKeyPem);
  const plaintext = Buffer.from(canonicalJson(payload), 'utf8');
  const encrypted = crypto.publicEncrypt(
    { key: pub, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    plaintext
  );
  return REQUEST_PREFIX + b64url(encrypted);
}

function decryptRequestCode(code, rsaPrivateKeyPem) {
  const raw = String(code || '').trim();
  if (!raw.startsWith(REQUEST_PREFIX)) throw new Error('Invalid request code prefix.');
  const encrypted = b64urlDecode(raw.slice(REQUEST_PREFIX.length));
  const priv = loadRsaPrivateKey(rsaPrivateKeyPem);
  const decrypted = crypto.privateDecrypt(
    { key: priv, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    encrypted
  );
  const payload = JSON.parse(decrypted.toString('utf8'));
  if (payload.typ !== 'req' || payload.v !== 1) throw new Error('Unsupported request payload.');
  if (!payload.iid || !payload.sid) throw new Error('Request payload is missing required fields.');
  if (Number(payload.exp) < unixNow()) throw new Error('Request code has expired.');
  return payload;
}

function signLicensePayload(payload, ed25519PrivateKeyPem) {
  const priv = loadEd25519PrivateKey(ed25519PrivateKeyPem);
  const body = canonicalJson(payload);
  const sig = crypto.sign(null, Buffer.from(body, 'utf8'), priv);
  return SERIAL_PREFIX + b64url(Buffer.from(body, 'utf8')) + '.' + b64url(sig);
}

function verifySerialNumber(serial, ed25519PublicKeyPem) {
  const raw = String(serial || '').trim();
  if (!raw.startsWith(SERIAL_PREFIX)) throw new Error('Invalid serial number prefix.');
  const rest = raw.slice(SERIAL_PREFIX.length);
  const dot = rest.lastIndexOf('.');
  if (dot <= 0) throw new Error('Serial number format is invalid.');
  const bodyBuf = b64urlDecode(rest.slice(0, dot));
  const sigBuf = b64urlDecode(rest.slice(dot + 1));
  const body = bodyBuf.toString('utf8');
  const pub = loadEd25519PublicKey(ed25519PublicKeyPem);
  const ok = crypto.verify(null, Buffer.from(body, 'utf8'), pub, sigBuf);
  if (!ok) throw new Error('Serial number signature is invalid.');
  const payload = JSON.parse(body);
  if (payload.typ !== 'lic' || payload.v !== 1) throw new Error('Unsupported license payload.');
  if (!payload.iid || !payload.sid) throw new Error('License payload is missing required fields.');
  return payload;
}

function hashSerial(serial) {
  return crypto.createHash('sha256').update(String(serial || '').trim()).digest('hex');
}

function generateInstallationId() {
  return crypto.randomUUID();
}

function generateKeyPairFiles() {
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 4096 });
  const ed = crypto.generateKeyPairSync('ed25519');
  return {
    rsaPublicKeyPem: rsa.publicKey.export({ type: 'spki', format: 'pem' }),
    rsaPrivateKeyPem: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    ed25519PublicKeyPem: ed.publicKey.export({ type: 'spki', format: 'pem' }),
    ed25519PrivateKeyPem: ed.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

module.exports = {
  REQUEST_PREFIX,
  SERIAL_PREFIX,
  REQUEST_VALID_DAYS,
  LICENSE_VALID_DAYS,
  buildRequestPayload,
  buildLicensePayload,
  encryptRequestCode,
  decryptRequestCode,
  signLicensePayload,
  verifySerialNumber,
  hashSerial,
  generateInstallationId,
  generateKeyPairFiles,
  normalizePemFromEnv,
  unixNow,
};
