'use strict';

const fs = require('fs');
const path = require('path');

const LOCAL_COA = path.join(__dirname, 'data', 'ohada_english_6digit_coa.json');
const CORE_COA = path.join('C:', 'Account_Core', 'Account', 'ComptabiliteAPI', 'Data', 'ohada_english_6digit_coa.json');

/**
 * Canonical OHADA 6-digit chart path — Account_Core is source of truth when present.
 * Override with OHADA_COA_PATH or ACCOUNT_CORE_COA_PATH.
 */
function resolveOhadaCoaPath() {
  const env = String(process.env.OHADA_COA_PATH || process.env.ACCOUNT_CORE_COA_PATH || '').trim();
  if (env && fs.existsSync(env)) return path.resolve(env);
  if (fs.existsSync(CORE_COA)) return CORE_COA;
  return LOCAL_COA;
}

function loadOhadaCoaPayload() {
  const coaPath = resolveOhadaCoaPath();
  const raw = fs.readFileSync(coaPath, 'utf8');
  return { coaPath, payload: JSON.parse(raw) };
}

module.exports = {
  LOCAL_COA,
  CORE_COA,
  resolveOhadaCoaPath,
  loadOhadaCoaPayload,
};
