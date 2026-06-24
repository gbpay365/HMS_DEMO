'use strict';

/**
 * Hospital accounting policy — locked decisions (roadmap baseline).
 * Fiscal year Jan–Dec · Receipts → VTE · Expenses → ACH
 * Expert deliverables: PDF livre-journal + Sage/Excel import export.
 */
const FISCAL_YEAR_START_MONTH = 1; // January
const FISCAL_YEAR_END_MONTH = 12; // December

const JOURNAL_CODES = {
  VTE: { code: 'VTE', label: 'Sales / receipts', type: 'VTE' },
  ACH: { code: 'ACH', label: 'Purchases / expenses', type: 'ACH' },
  BQ: { code: 'BQ', label: 'Bank', type: 'BQ' },
  CA: { code: 'CA', label: 'Cash', type: 'CA' },
  OD: { code: 'OD', label: 'Miscellaneous operations', type: 'OD' },
};

/** Default journal code by operational source_type */
const SOURCE_JOURNAL_MAP = {
  billing_receipt: 'VTE',
  credit_payment: 'VTE',
  expense: 'ACH',
  purchase_order: 'ACH',
  cashier_disbursement: 'ACH',
  cashier_payout: 'ACH',
  cashier_refund: 'VTE',
  manual_import: 'OD',
  manual_od: 'OD',
  reversal: 'OD',
  reimputation: 'OD',
  recurring: 'OD',
  payroll_gl: 'OD',
};

const DEFAULT_TVA_RATE = 0.1925;
const TVA_COLLECTED_ACCOUNT = '445710';
const TVA_DEDUCTIBLE_ACCOUNT = '445660';

/** When true, receipt/expense auto-post splits HT + TVA lines (Cameroon 19.25% default). */
const APPLY_TVA_ON_SYNC = true;

/**
 * HMS stricter journal rules (beyond Account_Core).
 * Set HMS_STRICT_JOURNAL=0 to disable all strict checks.
 */
const STRICT_JOURNAL_RULES = {
  enabled: String(process.env.HMS_STRICT_JOURNAL ?? '1').trim() !== '0',
  /** Asset/expense → debit; liability/revenue/income → credit (reversals exempt). */
  enforceNormalBalance: true,
  /** At least one debit line and one credit line. */
  requireDebitAndCreditLines: true,
  /** Lines alternate D/C/D/C (manual & OD only; TVA 3-line auto-post exempt). */
  enforceLineAlternation: true,
  /** Same account code cannot appear twice in one entry. */
  forbidDuplicateAccounts: true,
  /** Minimum amount per line (FCFA). */
  minLineAmount: 0.01,
  /** source_type values that skip normal-balance and duplicate-account rules (automated GL templates). */
  exemptSourceTypes: [
    'reversal',
    'reimputation',
    'billing_receipt',
    'credit_payment',
    'expense',
    'purchase_order',
    'cashier_disbursement',
    'cashier_payout',
    'cashier_refund',
  ],
  /** source_type values that skip line alternation (multi-line TVA templates). */
  exemptAlternationSourceTypes: [
    'billing_receipt',
    'credit_payment',
    'expense',
    'purchase_order',
    'cashier_disbursement',
    'reversal',
    'reimputation',
    'recurring',
    'cashier_refund',
    'cashier_payout',
  ],
};

const EXPORT = {
  livreJournalPdf: true,
  livreJournalExcel: true,
  sageImportColumns: ['entry_date', 'journal_code', 'piece_number', 'account_code', 'account_label', 'debit', 'credit', 'narration', 'line_memo'],
};

function fiscalYearForDate(isoDate) {
  const s = String(isoDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date().getFullYear();
  return parseInt(s.slice(0, 4), 10);
}

function journalCodeForSource(sourceType) {
  const st = String(sourceType || '').trim();
  return SOURCE_JOURNAL_MAP[st] || 'OD';
}

function isDateInOpenPeriod(isoDate, lockedMonths) {
  const s = String(isoDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const key = s.slice(0, 7);
  return !(lockedMonths || []).includes(key);
}

module.exports = {
  FISCAL_YEAR_START_MONTH,
  FISCAL_YEAR_END_MONTH,
  JOURNAL_CODES,
  SOURCE_JOURNAL_MAP,
  DEFAULT_TVA_RATE,
  TVA_COLLECTED_ACCOUNT,
  TVA_DEDUCTIBLE_ACCOUNT,
  APPLY_TVA_ON_SYNC,
  STRICT_JOURNAL_RULES,
  EXPORT,
  fiscalYearForDate,
  journalCodeForSource,
  isDateInOpenPeriod,
};
