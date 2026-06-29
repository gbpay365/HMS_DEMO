'use strict';

const fs = require('fs');
const path = require('path');
const hmsCountry = require('./hmsCountry');

const LOCAL_OHADA_COA = path.join(__dirname, 'data', 'ohada_english_6digit_coa.json');
const LOCAL_NIGERIA_COA = path.join(__dirname, 'data', 'nigeria_ifrs_coa.json');
const CORE_OHADA_COA = path.join('C:', 'Account_Core', 'Account', 'ComptabiliteAPI', 'Data', 'ohada_english_6digit_coa.json');

/**
 * Chart-of-accounts JSON path — driven by active country profile.
 */
function resolveCoaPath() {
  const profile = hmsCountry.profileService.getActiveProfile();
  const rel = profile?.chartOfAccounts?.dataFile;
  if (rel) {
    const local = path.isAbsolute(rel) ? rel : path.join(__dirname, '..', rel);
    if (fs.existsSync(local)) return local;
  }

  if (profile?.chartOfAccounts?.template === 'NIGERIA_IFRS' || profile?.chartOfAccounts?.template === 'IFRS_HOSPITAL') {
    const env = String(process.env.NIGERIA_COA_PATH || process.env.COA_PATH || '').trim();
    if (env && fs.existsSync(env)) return path.resolve(env);
    return LOCAL_NIGERIA_COA;
  }

  const env = String(process.env.OHADA_COA_PATH || process.env.ACCOUNT_CORE_COA_PATH || process.env.COA_PATH || '').trim();
  if (env && fs.existsSync(env)) return path.resolve(env);
  if (fs.existsSync(CORE_OHADA_COA)) return CORE_OHADA_COA;
  return LOCAL_OHADA_COA;
}

function loadCoaPayload() {
  const coaPath = resolveCoaPath();
  const raw = fs.readFileSync(coaPath, 'utf8');
  return { coaPath, payload: JSON.parse(raw) };
}

/** @deprecated Use resolveCoaPath — kept for OHADA-named imports */
function resolveOhadaCoaPath() {
  return resolveCoaPath();
}

module.exports = {
  LOCAL_OHADA_COA,
  LOCAL_NIGERIA_COA,
  CORE_OHADA_COA,
  resolveCoaPath,
  resolveOhadaCoaPath,
  loadCoaPayload,
};
