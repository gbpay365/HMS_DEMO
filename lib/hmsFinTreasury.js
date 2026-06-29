/**
 * Treasury overview — cash/bank position (OHADA class 5 vs Nigeria IFRS class 2 / 23xxxx).
 */
const {
 finTablesOk,
 finPrefixBalanceAsOf,
 finPrefixMovementPeriod,
 finAccountBalancesToDate,
 finAccountMovementsPeriod,
 finAccountBalanceCodeAsOf,
 finOhadaClassFromCode
} = require('./hmsFinGeneralLedger');

const { glMaps } = require('./finGlAccountMaps');
const hmsCountry = require('./hmsCountry');

/** Treasury skeleton — country-aware cash/bank/patient payment block. */
const CLASS5_SKELETON = glMaps().treasurySkeleton;
const DEFAULT_BANK_CODE = glMaps().treasurySkeleton.find((r) => /bank/i.test(r.label))?.code || '230300';

function treasuryAccountCodes() {
 return new Set(CLASS5_SKELETON.map((p) => p.code));
}

function isTreasuryGlRow(code) {
 const c = String(code ?? '').trim();
 if (!c) return false;
 if (treasuryAccountCodes().has(c)) return true;
 if (hmsCountry.isNigeria) return c.startsWith('23');
 return finOhadaClassFromCode(c) === 5;
}

function mergeTreasuryRows(glRows, includeZero = false) {
 const byCode = new Map();
 for (const p of CLASS5_SKELETON) {
  byCode.set(p.code, {
   account_code: p.code,
   account_label: p.label,
   balance: 0,
   period_movement: 0,
   from_skeleton: true
  });
 }
 for (const r of glRows || []) {
  const code = String(r.account_code ?? '').trim();
  if (!code || !isTreasuryGlRow(code)) continue;
  const lbl = String(r.account_label ?? '').trim();
  const prev = byCode.get(code);
  byCode.set(code, {
   account_code: code,
   account_label: lbl || prev?.account_label || code,
   balance: Math.round((parseFloat(r.balance) || 0) * 100) / 100,
   period_movement: prev?.period_movement ?? 0,
   from_skeleton: !!prev?.from_skeleton
  });
 }
 const out = [...byCode.values()].sort((a, b) => a.account_code.localeCompare(b.account_code));
 if (includeZero) return out;
 return out.filter((r) => Math.abs(r.balance) >= 0.005 || Math.abs(r.period_movement) >= 0.005);
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} facilityId
 * @param {{ asof: string, d1: string, d2: string, includeZero?: boolean }} opts
 */
async function finTreasuryOverview(pool, facilityId, opts) {
 const maps = glMaps();
 const treasuryPrefix = maps.treasuryPrefix || (hmsCountry.isNigeria ? '23' : '5');
 const asof = opts.asof;
 const d1 = opts.d1;
 const d2 = opts.d2;
 const includeZero = !!opts.includeZero;
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const finOk = await finTablesOk(pool);

 let class5Balance = 0;
 let class5Movement = 0;
 let defaultBankBalance = 0;
 let accounts = [];

 if (finOk) {
  class5Balance = await finPrefixBalanceAsOf(pool, fid, asof, treasuryPrefix);
  class5Movement = await finPrefixMovementPeriod(pool, fid, d1, d2, treasuryPrefix);
  defaultBankBalance = await finAccountBalanceCodeAsOf(pool, fid, asof, DEFAULT_BANK_CODE);

  const balances = await finAccountBalancesToDate(pool, fid, asof);
  const glTreasury = balances.filter((r) => isTreasuryGlRow(r.account_code));
  accounts = mergeTreasuryRows(glTreasury, includeZero);

  const movements = await finAccountMovementsPeriod(pool, fid, d1, d2);
  const movByCode = new Map();
  for (const m of movements) {
   if (!isTreasuryGlRow(m.account_code)) continue;
   movByCode.set(String(m.account_code ?? '').trim(), Math.round((parseFloat(m.balance) || 0) * 100) / 100);
  }
  accounts = accounts.map((row) => ({
   ...row,
   period_movement: movByCode.get(row.account_code) ?? 0
  }));
 }

 return {
  finOk,
  asof,
  d1,
  d2,
  defaultBankCode: DEFAULT_BANK_CODE,
  class5Balance,
  class5Movement,
  defaultBankBalance,
  accounts
 };
}

module.exports = {
 CLASS5_SKELETON,
 DEFAULT_BANK_CODE,
 finTreasuryOverview
};
