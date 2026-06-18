'use strict';

const fs = require('fs');
const path = require('path');
const { generateKeyPairFiles } = require('../../lib/hmsLicenseCrypto');

const keys = generateKeyPairFiles();
const outDir = path.join(__dirname, '..', 'keys');
fs.mkdirSync(outDir, { recursive: true });

const files = {
  'rsa-public.pem': keys.rsaPublicKeyPem,
  'rsa-private.pem': keys.rsaPrivateKeyPem,
  'ed25519-public.pem': keys.ed25519PublicKeyPem,
  'ed25519-private.pem': keys.ed25519PrivateKeyPem,
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), content, 'utf8');
}

console.log('Generated key files in license-generator/keys/');
console.log('');
console.log('HMS client (.env) — PUBLIC keys only:');
console.log('LICENSE_RSA_PUBLIC_KEY_PEM="' + keys.rsaPublicKeyPem.replace(/\n/g, '\\n') + '"');
console.log('LICENSE_ED25519_PUBLIC_KEY_PEM="' + keys.ed25519PublicKeyPem.replace(/\n/g, '\\n') + '"');
console.log('');
console.log('License generator (.env) — PRIVATE keys (keep secret):');
console.log('LICENSE_RSA_PRIVATE_KEY_PEM="' + keys.rsaPrivateKeyPem.replace(/\n/g, '\\n') + '"');
console.log('LICENSE_ED25519_PRIVATE_KEY_PEM="' + keys.ed25519PrivateKeyPem.replace(/\n/g, '\\n') + '"');
console.log('');
console.log('Optional: LICENSE_GENERATOR_ADMIN_TOKEN=choose-a-long-random-token');
console.log('Optional on HMS: LICENSE_VENDOR_EMAIL=licensing@vendor.com');
