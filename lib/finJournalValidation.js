'use strict';

/**
 * Journal entry validation — Account_Core parity + HMS strict extensions.
 *
 * Core rules:
 *  - Double-entry balance (exact on create/draft, ±0.01 on post)
 *  - Minimum 2 lines, SYSCOHADA code format, postable leaf accounts
 *
 * Strict rules (finAccountingConfig.STRICT_JOURNAL_RULES):
 *  - Normal balance side per account type
 *  - At least one debit line AND one credit line
 *  - Manual entries: lines alternate debit/credit (D/C/D/C…)
 *  - No duplicate account on the same entry
 *  - Minimum line amount
 */

const { STRICT_JOURNAL_RULES } = require('./finAccountingConfig');

const BALANCE_TOLERANCE_POST = 0.01;
const NUMERIC_CODE = /^\d+$/;

function roundMoney(n) {
  return Math.round((parseFloat(n) || 0) * 100) / 100;
}

function lineSide(ln) {
  const dr = roundMoney(ln.debit);
  const cr = roundMoney(ln.credit);
  if (dr > 0 && cr <= 0) return 'debit';
  if (cr > 0 && dr <= 0) return 'credit';
  return null;
}

function strictRulesFor(sourceType) {
  const st = String(sourceType || '').trim();
  const cfg = STRICT_JOURNAL_RULES;
  if (!cfg.enabled) {
    return {
      enforceNormalBalance: false,
      requireDebitAndCreditLines: false,
      enforceLineAlternation: false,
      forbidDuplicateAccounts: false,
      minLineAmount: 0,
    };
  }
  const exempt = (cfg.exemptSourceTypes || []).includes(st);
  const exemptAlt = (cfg.exemptAlternationSourceTypes || []).includes(st);
  return {
    enforceNormalBalance: cfg.enforceNormalBalance && !exempt,
    requireDebitAndCreditLines: cfg.requireDebitAndCreditLines,
    enforceLineAlternation: cfg.enforceLineAlternation && !exemptAlt,
    forbidDuplicateAccounts: cfg.forbidDuplicateAccounts && !exempt,
    minLineAmount: cfg.minLineAmount || 0,
  };
}

/** Expected posting side from OHADA account type (Account_Core NormalBalance). */
function expectedNormalSide(accountType) {
  const t = String(accountType || '')
    .trim()
    .toLowerCase();
  if (t === 'asset' || t === 'expense' || t === 'cost') return 'debit';
  if (t === 'liability' || t === 'equity' || t === 'income' || t === 'revenue') return 'credit';
  return null;
}

function validateSyscohadaAccountCode(code) {
  const c = String(code || '').trim();
  if (!c) return { ok: false, error: 'Journal line missing account code.' };
  if (!NUMERIC_CODE.test(c)) {
    return { ok: false, error: `Invalid account code (numeric only): ${c}` };
  }
  const cls = parseInt(c[0], 10);
  if (!Number.isFinite(cls) || cls < 1 || cls > 9) {
    return { ok: false, error: `Invalid OHADA class for account ${c} (first digit must be 1–9).` };
  }
  if (c.length < 2 || c.length > 20) {
    return { ok: false, error: `Account code ${c} must be 2–20 digits (SYSCOHADA).` };
  }
  return { ok: true, error: '' };
}

function validateJournalLineAmounts(line, lineIndex, minAmount = 0) {
  const idx = lineIndex != null ? ` (line ${lineIndex})` : '';
  const dr = roundMoney(line.debit);
  const cr = roundMoney(line.credit);
  if (dr < 0 || cr < 0) {
    return { ok: false, error: `Negative amount not allowed${idx}.` };
  }
  if (dr <= 0 && cr <= 0) {
    return { ok: false, error: `Line must have a debit or credit amount${idx}.` };
  }
  if (dr > 0 && cr > 0) {
    return { ok: false, error: `Each line must be debit OR credit, not both${idx}.` };
  }
  const amt = Math.max(dr, cr);
  if (minAmount > 0 && amt < minAmount) {
    return { ok: false, error: `Line amount must be at least ${minAmount}${idx}.` };
  }
  return { ok: true, error: '', debit: dr, credit: cr };
}

function normalizeJournalLines(rawLines, minAmount = 0) {
  const out = [];
  let lineNo = 0;
  for (const ln of rawLines || []) {
    lineNo++;
    const code = String(ln.code ?? ln.account_code ?? '').trim().slice(0, 32);
    if (!code) continue;
    const amounts = validateJournalLineAmounts(ln, lineNo, minAmount);
    if (!amounts.ok) return { ok: false, error: amounts.error, lines: [] };
    out.push({
      code,
      label: String(ln.label ?? ln.account_label ?? '').trim().slice(0, 160),
      debit: amounts.debit,
      credit: amounts.credit,
      line_memo: ln.line_memo ?? ln.memo ?? null,
      tier_id: ln.tier_id ?? null,
      tva_rate: ln.tva_rate ?? null,
      tva_amount: ln.tva_amount ?? null,
    });
  }
  return { ok: true, error: '', lines: out };
}

function validateDoubleEntryBalance(lines, { mode = 'post' } = {}) {
  if (!lines || !lines.length) {
    return { ok: false, error: 'Journal entry has no lines.', totalDebit: 0, totalCredit: 0 };
  }
  let totalDebit = 0;
  let totalCredit = 0;
  for (const ln of lines) {
    totalDebit += roundMoney(ln.debit);
    totalCredit += roundMoney(ln.credit);
  }
  totalDebit = roundMoney(totalDebit);
  totalCredit = roundMoney(totalCredit);

  if (lines.length < 2) {
    return {
      ok: false,
      error: 'Double entry requires at least two lines (debit and credit sides).',
      totalDebit,
      totalCredit,
    };
  }

  const diff = Math.abs(totalDebit - totalCredit);
  const tolerance = mode === 'post' ? BALANCE_TOLERANCE_POST : 0;

  if (diff > tolerance || totalDebit <= 0) {
    const msg =
      mode === 'post'
        ? `Debits must equal credits within ${BALANCE_TOLERANCE_POST} (dr=${totalDebit} cr=${totalCredit}).`
        : `Invalid double entry: debits must equal credits and be greater than zero (dr=${totalDebit} cr=${totalCredit}).`;
    return { ok: false, error: msg, totalDebit, totalCredit };
  }

  return { ok: true, error: '', totalDebit, totalCredit };
}

/** Strict: at least one debit line and one credit line. */
function validateBothSidesPresent(lines) {
  let hasDebit = false;
  let hasCredit = false;
  for (const ln of lines) {
    if (roundMoney(ln.debit) > 0) hasDebit = true;
    if (roundMoney(ln.credit) > 0) hasCredit = true;
  }
  if (!hasDebit || !hasCredit) {
    return {
      ok: false,
      error: 'Entry must include at least one debit line and one credit line.',
    };
  }
  return { ok: true, error: '' };
}

/**
 * Strict: lines alternate debit/credit (after a credit, next line must be debit, and vice versa).
 * Applies to manual double-entry worksheets — not TVA multi-credit templates.
 */
function validateLineAlternation(lines) {
  if (lines.length < 2) return { ok: true, error: '' };
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lineSide(lines[i]);
    const b = lineSide(lines[i + 1]);
    if (!a || !b) {
      return { ok: false, error: `Line ${i + 1}: invalid debit/credit side.` };
    }
    if (a === b) {
      return {
        ok: false,
        error: `Line ${i + 2}: after a ${a}, the next line must be a ${a === 'debit' ? 'credit' : 'debit'} (strict alternation).`,
      };
    }
  }
  return { ok: true, error: '' };
}

/** Strict: no duplicate account code in the same entry. */
function validateNoDuplicateAccounts(lines) {
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const code = String(lines[i].code || '').trim();
    if (seen.has(code)) {
      return {
        ok: false,
        error: `Account ${code} appears more than once — use separate entries or a single net line.`,
      };
    }
    seen.add(code);
  }
  return { ok: true, error: '' };
}

/** Strict: post on the normal balance side (asset/expense → debit; liability/revenue → credit). */
function validateNormalBalanceSide(lines, accountsByCode) {
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const code = String(ln.code || '').trim();
    const acc = accountsByCode.get(code);
    if (!acc) continue;
    const expected = expectedNormalSide(acc.account_type);
    const actual = lineSide(ln);
    if (!expected || !actual) continue;
    if (expected !== actual) {
      const label = String(acc.label_en || acc.name || code).trim();
      return {
        ok: false,
        error: `Account ${code} (${label}) has normal balance ${expected} — cannot post ${actual} in a standard entry (use reversal for contra postings).`,
      };
    }
  }
  return { ok: true, error: '' };
}

async function loadAccountsByCode(pool, codes, facilityId) {
  const uniq = [...new Set(codes.map((c) => String(c || '').trim()).filter(Boolean))];
  if (!uniq.length) return new Map();

  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const placeholders = uniq.map(() => '?').join(',');
  const params = [...uniq, ...uniq, fid];

  const [rows] = await pool
    .query(
      `SELECT id, code, account_number, label_en, name, ohada_class, account_type, is_posting, active
       FROM tbl_fin_account
       WHERE (code IN (${placeholders}) OR account_number IN (${placeholders}))
         AND (facility_id = ? OR facility_id IS NULL OR facility_id = 0)
       ORDER BY active DESC, is_posting DESC, id ASC`,
      params
    )
    .catch(() => [[]]);

  const byCode = new Map();
  for (const row of rows || []) {
    const keys = [String(row.code || '').trim(), String(row.account_number || '').trim()].filter(Boolean);
    for (const k of keys) {
      if (!byCode.has(k)) byCode.set(k, row);
    }
  }
  return byCode;
}

async function validateJournalAccounts(pool, lines, facilityId) {
  const codes = lines.map((ln) => ln.code);
  const byCode = await loadAccountsByCode(pool, codes, facilityId);

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const code = String(ln.code || '').trim();
    const fmt = validateSyscohadaAccountCode(code);
    if (!fmt.ok) return { ok: false, error: fmt.error, accountsByCode: byCode };

    const acc = byCode.get(code);
    if (!acc) {
      return {
        ok: false,
        error: `Unknown or inactive account: ${code} (chart of accounts / SYSCOHADA).`,
        accountsByCode: byCode,
      };
    }
    if (parseInt(acc.active, 10) !== 1) {
      return { ok: false, error: `Inactive account: ${code}.`, accountsByCode: byCode };
    }
    if (parseInt(acc.is_posting, 10) !== 1) {
      return {
        ok: false,
        error: `Account ${code} is not a postable leaf account — use a 6-digit detail account.`,
        accountsByCode: byCode,
      };
    }
    if (!ln.label) {
      ln.label = String(acc.label_en || acc.name || code).trim().slice(0, 160);
    }
  }

  return { ok: true, error: '', accountsByCode: byCode };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ lines: Array, facilityId?: number, mode?: 'create'|'post', sourceType?: string, skipAccountLookup?: boolean }} opts
 */
async function validateJournalEntry(pool, opts = {}) {
  const mode = opts.mode === 'create' ? 'create' : 'post';
  const facilityId = Math.max(1, parseInt(opts.facilityId, 10) || 1);
  const strict = strictRulesFor(opts.sourceType);

  const normalized = normalizeJournalLines(opts.lines, strict.minLineAmount);
  if (!normalized.ok) return { ok: false, error: normalized.error, lines: [] };

  const lines = normalized.lines;
  if (!lines.length) {
    return { ok: false, error: 'Journal entry has no lines with account codes.', lines: [] };
  }

  const balance = validateDoubleEntryBalance(lines, { mode: mode === 'create' ? 'create' : 'post' });
  if (!balance.ok) return { ok: false, error: balance.error, lines: [] };

  if (strict.requireDebitAndCreditLines) {
    const sides = validateBothSidesPresent(lines);
    if (!sides.ok) return { ok: false, error: sides.error, lines: [] };
  }

  if (strict.forbidDuplicateAccounts) {
    const dup = validateNoDuplicateAccounts(lines);
    if (!dup.ok) return { ok: false, error: dup.error, lines: [] };
  }

  if (strict.enforceLineAlternation) {
    const alt = validateLineAlternation(lines);
    if (!alt.ok) return { ok: false, error: alt.error, lines: [] };
  }

  let accountsByCode = new Map();
  if (!opts.skipAccountLookup) {
    const accounts = await validateJournalAccounts(pool, lines, facilityId);
    if (!accounts.ok) return { ok: false, error: accounts.error, lines: [] };
    accountsByCode = accounts.accountsByCode || new Map();

    if (strict.enforceNormalBalance) {
      const nb = validateNormalBalanceSide(lines, accountsByCode);
      if (!nb.ok) return { ok: false, error: nb.error, lines: [] };
    }
  }

  return {
    ok: true,
    error: '',
    lines,
    totalDebit: balance.totalDebit,
    totalCredit: balance.totalCredit,
  };
}

module.exports = {
  BALANCE_TOLERANCE_POST,
  STRICT_JOURNAL_RULES,
  roundMoney,
  lineSide,
  expectedNormalSide,
  strictRulesFor,
  validateSyscohadaAccountCode,
  validateJournalLineAmounts,
  normalizeJournalLines,
  validateDoubleEntryBalance,
  validateBothSidesPresent,
  validateLineAlternation,
  validateNoDuplicateAccounts,
  validateNormalBalanceSide,
  validateJournalAccounts,
  validateJournalEntry,
};
