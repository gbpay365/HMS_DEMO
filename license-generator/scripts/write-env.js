'use strict';

const fs = require('fs');
const path = require('path');

const keysDir = path.join(__dirname, '..', 'keys');
const rsa = fs.readFileSync(path.join(keysDir, 'rsa-private.pem'), 'utf8').trim();
const ed = fs.readFileSync(path.join(keysDir, 'ed25519-private.pem'), 'utf8').trim();

const env = [
  'PORT=5055',
  `LICENSE_RSA_PRIVATE_KEY_PEM="${rsa.replace(/\n/g, '\\n')}"`,
  `LICENSE_ED25519_PRIVATE_KEY_PEM="${ed.replace(/\n/g, '\\n')}"`,
  '',
].join('\n');

fs.writeFileSync(path.join(__dirname, '..', '.env'), env, 'utf8');
console.log('Wrote license-generator/.env');
