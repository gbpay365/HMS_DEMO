'use strict';

const { finAccountBalanceCodeAsOf } = require('./hmsFinGeneralLedger');

async function buildBalanceSheetFromGl(pool, facilityId, asof) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const d = String(asof || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return { byClass: {}, asof: d, ok: false, message: 'Invalid as-of date.' };
  }

  let accounts = [];
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT jl.account_code AS code, MAX(jl.account_label) AS label
       FROM tbl_fin_journal_line jl
       JOIN tbl_fin_journal_header h ON h.id = jl.journal_id
       WHERE h.facility_id = ? AND h.status = 'posted' AND h.entry_date <= ?
       GROUP BY jl.account_code
       ORDER BY jl.account_code`,
      [fid, d]
    );
    accounts = rows || [];
  } catch (e) {
    return { byClass: {}, asof: d, ok: false, message: e.message || 'GL query failed.' };
  }

  if (!accounts.length) {
    return {
      byClass: {},
      asof: d,
      ok: false,
      message: 'No posted GL balances yet. Post journals or run Sync to GL.',
    };
  }

  const byClass = {};
  for (const acct of accounts) {
    const code = String(acct.code || '').trim();
    if (!code) continue;
    const cls = parseInt(code.charAt(0), 10);
    if (!cls || cls < 1 || cls > 8) continue;
    const bal = await finAccountBalanceCodeAsOf(pool, fid, d, code);
    if (Math.abs(bal) < 0.01) continue;
    if (!byClass[cls]) byClass[cls] = [];
    byClass[cls].push({
      account_code: code,
      account_label: acct.label || code,
      balance: bal,
    });
  }

  return { byClass, asof: d, ok: true, message: '' };
}

module.exports = { buildBalanceSheetFromGl };
