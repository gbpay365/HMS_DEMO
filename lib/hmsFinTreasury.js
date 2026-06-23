/**
 * Treasury overview — GL class 5 position and bank/cash accounts (PHP financials.php section 2).
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

/** SYSCOHADA class 5 skeleton — Core_Account 6-digit COA (5526xx patient payment block). */
const CLASS5_SKELETON = [
 { code: '512000', label: 'Bank — main operating account' },
 { code: '531000', label: 'Cash on hand (tills)' },
 { code: '552600', label: 'Treasury — Patient payment methods' },
 { code: '552601', label: 'Cash — patient receipts' },
 { code: '552602', label: 'Orange Money (OM) — patient receipts' },
 { code: '552603', label: 'MTN Mobile Money (MOMO) — patient receipts' },
 { code: '552604', label: 'Bank — patient receipts' },
 { code: '552605', label: 'BetterPay — patient receipts' },
 { code: '552606', label: 'Patient wallet — patient receipts' },
];

const DEFAULT_BANK_CODE = '512000';

function mergeClass5Rows(glRows, includeZero = false) {
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
  if (!code || finOhadaClassFromCode(code) !== 5) continue;
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
  class5Balance = await finPrefixBalanceAsOf(pool, fid, asof, '5');
  class5Movement = await finPrefixMovementPeriod(pool, fid, d1, d2, '5');
  defaultBankBalance = await finAccountBalanceCodeAsOf(pool, fid, asof, DEFAULT_BANK_CODE);

  const balances = await finAccountBalancesToDate(pool, fid, asof);
  const gl5 = balances.filter((r) => r.class === 5);
  accounts = mergeClass5Rows(gl5, includeZero);

  const movements = await finAccountMovementsPeriod(pool, fid, d1, d2);
  const movByCode = new Map();
  for (const m of movements) {
   if (m.class !== 5) continue;
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
