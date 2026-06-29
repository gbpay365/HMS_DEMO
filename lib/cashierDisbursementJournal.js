'use strict';

/**
 * Preview / resolve GL accounts for cashier disbursements (mother → sub-account).
 */

const { glAccountForPaymentMethod } = require('./paymentMethodGlAccounts');
const { buildExpenseLines, loadTvaRate, TVA_DEDUCTIBLE_ACCOUNT, resolveExpenseCategoryKey, EXPENSE_CATEGORY_ACCOUNTS } = require('./finPostingTemplates');
const { APPLY_TVA_ON_SYNC } = require('./finAccountingConfig');
const { resolveJournalMotherAccounts } = require('./finCoaSubAccount');
const { payoutGlMotherForType } = require('./cashierDisbursementOptions');

function roundMoney(v) {
  return Math.round((parseFloat(v) || 0) * 100) / 100;
}

function expenseMotherCode(category) {
  const key = resolveExpenseCategoryKey(category);
  return EXPENSE_CATEGORY_ACCOUNTS[key] || EXPENSE_CATEGORY_ACCOUNTS.general;
}

function debitMotherForDisbursement(opts) {
  const kind = String(opts.journalKind || opts.glKind || 'expense').toLowerCase();
  if (kind === 'payout') {
    return payoutGlMotherForType(opts.disbursementType || opts.txnType);
  }
  return expenseMotherCode(opts.expenseCategory || opts.category || 'general');
}

async function previewDisbursementPostingAccounts(pool, opts) {
  const cashGl = glAccountForPaymentMethod(opts.paymentMethod || 'Cash');
  const debitMother = debitMotherForDisbursement(opts);
  const facilityId = parseInt(String(opts.facilityId || 1), 10) || 1;

  return resolveJournalMotherAccounts(pool, {
    facilityId,
    autoCreate: false,
    sides: [
      {
        role: 'debit',
        motherCode: debitMother,
        labelSuffix: String(opts.narration || opts.disbursementType || 'debit').slice(0, 80),
      },
      {
        role: 'credit',
        motherCode: cashGl.code,
        labelSuffix: String(opts.paymentMethod || 'Cash').slice(0, 40),
      },
    ],
  });
}

async function buildResolvedDisbursementLines(pool, opts) {
  const amt = roundMoney(opts.amount);
  const facilityId = parseInt(String(opts.facilityId || 1), 10) || 1;
  const kind = String(opts.journalKind || opts.glKind || 'expense').toLowerCase();
  const cashGl = glAccountForPaymentMethod(opts.paymentMethod || 'Cash');
  const debitMother = debitMotherForDisbursement(opts);

  const resolved = await resolveJournalMotherAccounts(pool, {
    facilityId,
    autoCreate: Boolean(opts.autoCreateSubAccounts),
    sides: [
      {
        role: 'debit',
        motherCode: debitMother,
        labelSuffix: String(opts.narration || opts.disbursementType || 'debit').slice(0, 80),
      },
      {
        role: 'credit',
        motherCode: cashGl.code,
        labelSuffix: String(opts.paymentMethod || 'Cash').slice(0, 40),
      },
    ],
  });

  if (!resolved.ok) {
    return { ok: false, ...resolved, lines: [] };
  }

  const credit = resolved.resolved.credit;
  const debit = resolved.resolved.debit;

  if (kind === 'payout') {
    return {
      ok: true,
      lines: [
        { code: debit.code, label: debit.label, debit: amt, credit: 0 },
        { code: credit.code, label: credit.label, debit: 0, credit: amt },
      ],
      created: resolved.created || [],
      resolved: resolved.resolved,
    };
  }

  const tvaRate = await loadTvaRate(pool, facilityId);
  const category = opts.expenseCategory || opts.category || 'general';
  const glLines = buildExpenseLines(
    amt,
    opts.paymentMethod || 'Cash',
    () => ({ code: credit.code, label: credit.label }),
    category,
    tvaRate,
    APPLY_TVA_ON_SYNC
  );

  for (const ln of glLines) {
    if (ln.debit > 0 && String(ln.code) !== String(TVA_DEDUCTIBLE_ACCOUNT)) {
      ln.code = debit.code;
      ln.label = debit.label;
    }
  }

  return {
    ok: true,
    lines: glLines,
    created: resolved.created || [],
    resolved: resolved.resolved,
  };
}

module.exports = {
  debitMotherForDisbursement,
  previewDisbursementPostingAccounts,
  buildResolvedDisbursementLines,
};
