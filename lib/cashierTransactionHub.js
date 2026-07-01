'use strict';

const { ensureCashierTxnSchema, syncCashierTxnIdSequence } = require('./ensureCashierTxnSchema');
const { resolveCashierForEmployee, syncCashierIdentities } = require('./cashierIdentity');
const { glAccountForPaymentMethod } = require('./paymentMethodGlAccounts');
const { revenueAccountForCategory } = require('./hospitalServiceRevenueAccounts');
const { EXPENSE_CATEGORY_ACCOUNTS, resolveExpenseCategoryKey } = require('./finPostingTemplates');
const { payoutGlMotherForType } = require('./cashierDisbursementOptions');

/** OHADA mother templates for payout GL (require sub-accounts for posting). */
const PAYOUT_GL_DEFAULT = '421100';

function roundMoney(v) {
  return Math.round((parseFloat(v) || 0) * 100) / 100;
}

function deriveServiceKey(lines, ticket) {
  const list = Array.isArray(lines) ? lines : [];
  for (const ln of list) {
    const mod = String(ln?.source_module || ln?.category || ln?.kind || '').toLowerCase();
    if (mod.includes('lab')) return 'laboratory';
    if (mod.includes('rad') || mod.includes('imaging')) return 'radiology';
    if (mod.includes('pharm')) return 'pharmacy';
    if (mod.includes('consult')) return 'consultation';
    if (mod.includes('ipd') || mod.includes('admission') || mod.includes('hospital')) return 'hospitalisation';
    if (mod.includes('emergency') || mod.includes('emg')) return 'emergency';
    if (mod.includes('maternity') || mod.includes('mat')) return 'consultation';
  }
  const cat = String(ticket?.ticket_category || '').toLowerCase();
  if (cat === 'pharmacy') return 'pharmacy';
  if (cat === 'service') return 'consultation';
  const code = String(ticket?.ticket_code || '').toUpperCase();
  if (code.startsWith('LAB-')) return 'laboratory';
  if (code.startsWith('RAD-')) return 'radiology';
  if (code.startsWith('PHA-')) return 'pharmacy';
  if (code.startsWith('EMG-')) return 'emergency';
  if (code.startsWith('IPD-')) return 'hospitalisation';
  return 'default';
}

function txnAmounts(txnType, amount) {
  const amt = roundMoney(amount);
  if (amt <= 0) return null;
  const t = String(txnType || 'receipt').toLowerCase();
  if (t === 'receipt') {
    return { debit_amount: 0, credit_amount: amt, amount: amt };
  }
  return { debit_amount: amt, credit_amount: 0, amount: amt };
}

function expenseGlCode(category) {
  const key = resolveExpenseCategoryKey(category);
  return EXPENSE_CATEGORY_ACCOUNTS[key] || EXPENSE_CATEGORY_ACCOUNTS.general;
}

function mapGlAccounts(txnType, paymentMethod, serviceKey, expenseCategory) {
  const cashGl = glAccountForPaymentMethod(paymentMethod);
  const revCode = revenueAccountForCategory(serviceKey);
  const t = String(txnType || 'receipt').toLowerCase();
  if (t === 'receipt') {
    return { gl_debit_account: cashGl.code, gl_credit_account: revCode };
  }
  if (t === 'payout') {
    return { gl_debit_account: payoutGlMotherForType(expenseCategory), gl_credit_account: cashGl.code };
  }
  if (t === 'refund') {
    return { gl_debit_account: revCode, gl_credit_account: cashGl.code };
  }
  const exp = expenseGlCode(expenseCategory);
  return { gl_debit_account: exp, gl_credit_account: cashGl.code };
}

async function findExistingCashierTxn(db, sourceModule, sourcePk) {
  const mod = String(sourceModule || '').trim();
  const pk = parseInt(String(sourcePk || ''), 10) || 0;
  if (!mod || pk < 1) return null;
  const [[row]] = await db
    .query(
      `SELECT id, journal_header_id, cashier_code, cashier_identity,
              opening_balance, debit_amount, credit_amount, closing_balance
         FROM tbl_cashier_txn
        WHERE source_module = ? AND source_pk = ?
        LIMIT 1`,
      [mod, pk]
    )
    .catch(() => [[null]]);
  return row || null;
}

async function lastClosingBalance(db, facilityId, cashierId, paymentMethod) {
  const [[row]] = await db
    .query(
      `SELECT closing_balance
         FROM tbl_cashier_txn
        WHERE facility_id = ? AND cashier_id = ? AND payment_method = ?
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`,
      [facilityId, cashierId, paymentMethod]
    )
    .catch(() => [[null]]);
  return roundMoney(row?.closing_balance || 0);
}

function isCashierTxnPrimaryKeyConflict(err) {
  const msg = String(err?.message || err || '');
  return /tbl_cashier_txn_pkey|duplicate key.*tbl_cashier_txn/i.test(msg);
}

async function insertCashierTxnRow(db, params) {
  const sql = `INSERT INTO tbl_cashier_txn (
       facility_id, cashier_id, cashier_code, cashier_identity, employee_id,
       opening_balance, debit_amount, credit_amount, closing_balance,
       txn_type, payment_method, amount,
       gl_debit_account, gl_credit_account,
       source_module, source_pk, billing_document_id, patient_id,
       reference, narration, created_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  try {
    return await db.query(sql, params);
  } catch (err) {
    if (db?.driver === 'postgres' && isCashierTxnPrimaryKeyConflict(err)) {
      await syncCashierTxnIdSequence(db);
      return db.query(sql, params);
    }
    throw err;
  }
}

async function recordCashierTransaction(db, ctx) {
  if (!ctx.skipSchemaEnsure) {
    await ensureCashierTxnSchema(db);
  }
  const facilityId = parseInt(String(ctx.facilityId || 1), 10) || 1;
  const employeeId = parseInt(String(ctx.employeeId || ctx.createdBy || 0), 10) || 0;
  const sourceModule = String(ctx.sourceModule || '').trim();
  const sourcePk = parseInt(String(ctx.sourcePk || 0), 10) || 0;
  const paymentMethod = String(ctx.paymentMethod || 'Cash').trim() || 'Cash';
  const txnType = String(ctx.txnType || 'receipt').trim() || 'receipt';

  if (!sourceModule || sourcePk < 1 || employeeId < 1) {
    throw new Error('cashier txn: missing source or employee');
  }

  const existing = await findExistingCashierTxn(db, sourceModule, sourcePk);
  if (existing) {
    return {
      txnId: existing.id,
      duplicate: true,
      journalHeaderId: existing.journal_header_id || null,
      cashierCode: existing.cashier_code,
      cashierIdentity: existing.cashier_identity,
      openingBalance: roundMoney(existing.opening_balance),
      debitAmount: roundMoney(existing.debit_amount),
      creditAmount: roundMoney(existing.credit_amount),
      closingBalance: roundMoney(existing.closing_balance),
    };
  }

  const amounts = txnAmounts(txnType, ctx.amount);
  if (!amounts) throw new Error('cashier txn: invalid amount');

  if (ctx.forceCashierAssign && !ctx.skipSchemaEnsure) {
    await syncCashierIdentities(db, { facilityId });
  }
  const cashier = await resolveCashierForEmployee(db, employeeId, {
    facilityId,
    forceAssign: !!ctx.forceCashierAssign,
    skipSchemaEnsure: !!ctx.skipSchemaEnsure,
  });
  if (!cashier) {
    throw new Error('cashier txn: no cashier identity for employee #' + employeeId);
  }

  const serviceKey = ctx.serviceKey || deriveServiceKey(ctx.lines, ctx.ticket);
  const { gl_debit_account, gl_credit_account } = mapGlAccounts(
    txnType,
    paymentMethod,
    serviceKey,
    ctx.expenseCategory
  );

  const opening_balance = await lastClosingBalance(db, facilityId, cashier.id, paymentMethod);
  const closing_balance = roundMoney(opening_balance + amounts.credit_amount - amounts.debit_amount);

  const [ins] = await insertCashierTxnRow(db, [
      facilityId,
      cashier.id,
      cashier.cashier_code,
      cashier.cashier_identity,
      employeeId,
      opening_balance,
      amounts.debit_amount,
      amounts.credit_amount,
      closing_balance,
      txnType,
      paymentMethod,
      amounts.amount,
      gl_debit_account,
      gl_credit_account,
      sourceModule,
      sourcePk,
      ctx.billingDocumentId ? parseInt(ctx.billingDocumentId, 10) : null,
      ctx.patientId ? parseInt(ctx.patientId, 10) : null,
      ctx.reference ? String(ctx.reference).slice(0, 64) : null,
      ctx.narration ? String(ctx.narration).slice(0, 500) : null,
      employeeId,
    ]);

  return {
    txnId: ins?.insertId || null,
    duplicate: false,
    journalHeaderId: null,
    cashierCode: cashier.cashier_code,
    cashierIdentity: cashier.cashier_identity,
    openingBalance: opening_balance,
    debitAmount: amounts.debit_amount,
    creditAmount: amounts.credit_amount,
    closingBalance: closing_balance,
    glDebitAccount: gl_debit_account,
    glCreditAccount: gl_credit_account,
    serviceKey,
  };
}

async function linkCashierTxnJournal(db, txnId, journalHeaderId) {
  const tid = parseInt(String(txnId || ''), 10) || 0;
  const jid = parseInt(String(journalHeaderId || ''), 10) || 0;
  if (tid < 1 || jid < 1) return false;
  await db.query(
    'UPDATE tbl_cashier_txn SET journal_header_id = ? WHERE id = ? AND (journal_header_id IS NULL OR journal_header_id = 0)',
    [jid, tid]
  );
  return true;
}

async function findJournalHeaderId(db, facilityId, sourceType, sourceId) {
  const fid = parseInt(String(facilityId || 1), 10) || 1;
  const sid = parseInt(String(sourceId || 0), 10) || 0;
  if (sid < 1) return null;
  const [[row]] = await db
    .query(
      `SELECT id FROM tbl_fin_journal_header
        WHERE facility_id = ? AND source_type = ? AND source_id = ?
        LIMIT 1`,
      [fid, sourceType, sid]
    )
    .catch(() => [[null]]);
  return row?.id || null;
}

async function findBillingReceiptJournalId(db, facilityId, billingDocumentId) {
  return findJournalHeaderId(db, facilityId, 'billing_receipt', billingDocumentId);
}

async function syncReceiptJournalAfterCollect(pool, opts) {
  const { syncJournalFromReceipt } = require('./hmsFinJournalPost');
  const facilityId = parseInt(String(opts.facilityId || 1), 10) || 1;
  const billingDocumentId = parseInt(String(opts.billingDocumentId || 0), 10) || 0;
  const grandTotal = roundMoney(opts.grandTotal);
  if (billingDocumentId < 1 || grandTotal <= 0) {
    return { ok: false, journalCode: 0, journalHeaderId: null };
  }

  const journalCode = await syncJournalFromReceipt(
    pool,
    facilityId,
    billingDocumentId,
    opts.sourceModule || 'payment_ticket',
    grandTotal,
    opts.paymentMethod || 'Cash',
    opts.createdBy || 0,
    opts.docNumber || '',
    opts.firstLineDescription || ''
  );

  const journalHeaderId = await findBillingReceiptJournalId(pool, facilityId, billingDocumentId);
  if (opts.txnId && journalHeaderId) {
    await linkCashierTxnJournal(pool, opts.txnId, journalHeaderId);
  }

  return {
    ok: journalCode === 1 || journalCode === 2,
    journalCode,
    journalHeaderId,
    duplicate: journalCode === 2,
  };
}

async function syncRefundJournalAfterCashier(pool, opts) {
  const { journalPostExtended } = require('./hmsFinJournalPost');
  const facilityId = parseInt(String(opts.facilityId || 1), 10) || 1;
  const txnId = parseInt(String(opts.txnId || 0), 10) || 0;
  const amt = roundMoney(opts.amount);
  if (txnId < 1 || amt <= 0) return { ok: false, journalHeaderId: null };

  const serviceKey = opts.serviceKey || 'default';
  const cashGl = glAccountForPaymentMethod(opts.paymentMethod || 'Cash');
  const revCode = revenueAccountForCategory(serviceKey);
  const label = `${opts.cashierCode || ''} ${opts.cashierIdentity || ''}`.trim();

  const r = await journalPostExtended(pool, {
    facilityId,
    sourceType: 'cashier_refund',
    sourceId: txnId,
    reference: String(opts.reference || `REF-${txnId}`).slice(0, 64),
    narration: `Cashier refund · ${label} · ${String(opts.narration || '').slice(0, 400)}`,
    createdBy: opts.createdBy || 0,
    lines: [
      { code: revCode, label: 'Revenue reversal', debit: amt, credit: 0 },
      { code: cashGl.code, label: cashGl.label, debit: 0, credit: amt },
    ],
    journalCode: 'VTE',
    status: 'posted',
  });

  const journalHeaderId = r.journalId || (await findJournalHeaderId(pool, facilityId, 'cashier_refund', txnId));
  if (txnId && journalHeaderId) await linkCashierTxnJournal(pool, txnId, journalHeaderId);
  return { ok: r.ok || r.duplicate, journalHeaderId, duplicate: r.duplicate };
}

async function syncDisbursementExpenseJournal(pool, opts) {
  const { journalPostExtended, journalPostLastError } = require('./hmsFinJournalPost');
  const { buildResolvedDisbursementLines } = require('./cashierDisbursementJournal');
  const facilityId = parseInt(String(opts.facilityId || 1), 10) || 1;
  const disbursementId = parseInt(String(opts.expenseId || opts.disbursementId || 0), 10) || 0;
  const amt = roundMoney(opts.amount);
  if (disbursementId < 1 || amt <= 0) return { ok: false, journalHeaderId: null };

  const built = await buildResolvedDisbursementLines(pool, {
    ...opts,
    journalKind: 'expense',
    facilityId,
    amount: amt,
  });
  if (!built.ok) {
    return {
      ok: false,
      journalHeaderId: null,
      needsSubAccounts: built.needsSubAccounts,
      missing: built.missing,
      error: built.error,
    };
  }

  const label = `${opts.cashierCode || ''} ${opts.cashierIdentity || ''}`.trim();
  const desc = String(opts.narration || 'Cashier disbursement').slice(0, 400);

  const r = await journalPostExtended(pool, {
    facilityId,
    sourceType: 'cashier_disbursement',
    sourceId: disbursementId,
    reference: String(opts.reference || `CD-${disbursementId}`).slice(0, 64),
    narration: `Cashier expense · ${label}${label ? ' · ' : ''}${desc}`.slice(0, 512),
    createdBy: opts.createdBy || 0,
    lines: built.lines,
    entryDate: opts.expenseDate || new Date().toISOString().slice(0, 10),
    journalCode: 'ACH',
    status: 'posted',
  });

  if (!r.ok && !r.duplicate) {
    const err = journalPostLastError();
    if (err) console.warn('cashier expense journal post failed:', err);
  }

  const journalHeaderId = r.journalId || (await findJournalHeaderId(pool, facilityId, 'cashier_disbursement', disbursementId));
  if (opts.txnId && journalHeaderId) await linkCashierTxnJournal(pool, opts.txnId, journalHeaderId);
  return {
    ok: r.ok || r.duplicate,
    journalHeaderId,
    duplicate: r.duplicate,
    createdAccounts: built.created || [],
  };
}

async function syncExpenseJournalAfterCashier(pool, opts) {
  return syncDisbursementExpenseJournal(pool, opts);
}

async function syncPayoutJournalAfterCashier(pool, opts) {
  const { journalPostExtended, journalPostLastError } = require('./hmsFinJournalPost');
  const { buildResolvedDisbursementLines } = require('./cashierDisbursementJournal');
  const facilityId = parseInt(String(opts.facilityId || 1), 10) || 1;
  const disbursementId =
    parseInt(String(opts.disbursementId || opts.expenseId || 0), 10) || 0;
  const amt = roundMoney(opts.amount);
  if (disbursementId < 1 || amt <= 0) return { ok: false, journalHeaderId: null };

  const built = await buildResolvedDisbursementLines(pool, {
    ...opts,
    journalKind: 'payout',
    facilityId,
    amount: amt,
  });
  if (!built.ok) {
    return {
      ok: false,
      journalHeaderId: null,
      needsSubAccounts: built.needsSubAccounts,
      missing: built.missing,
      error: built.error,
    };
  }

  const label = `${opts.cashierCode || ''} ${opts.cashierIdentity || ''}`.trim();

  const r = await journalPostExtended(pool, {
    facilityId,
    sourceType: 'cashier_disbursement',
    sourceId: disbursementId,
    reference: String(opts.reference || `CD-${disbursementId}`).slice(0, 64),
    narration: `Cashier payout · ${label} · ${String(opts.narration || '').slice(0, 400)}`,
    createdBy: opts.createdBy || 0,
    entryDate: opts.expenseDate || new Date().toISOString().slice(0, 10),
    lines: built.lines,
    journalCode: 'ACH',
    status: 'posted',
  });

  if (!r.ok && !r.duplicate) {
    const err = journalPostLastError();
    if (err) console.warn('cashier payout journal post failed:', err);
  }

  const journalHeaderId =
    r.journalId ||
    (await findJournalHeaderId(pool, facilityId, 'cashier_disbursement', disbursementId));
  if (opts.txnId && journalHeaderId) await linkCashierTxnJournal(pool, opts.txnId, journalHeaderId);
  return {
    ok: r.ok || r.duplicate,
    journalHeaderId,
    duplicate: r.duplicate,
    createdAccounts: built.created || [],
  };
}

/**
 * After DB commit: post journal + optional Core_Account sync.
 */
async function afterCommitCashierPipeline(pool, opts) {
  let journal = null;
  const kind = String(opts.journalKind || 'receipt').toLowerCase();

  if (!opts.journalHeaderId) {
    if (kind === 'receipt') {
      journal = await syncReceiptJournalAfterCollect(pool, opts);
    } else if (kind === 'refund') {
      journal = await syncRefundJournalAfterCashier(pool, opts);
    } else if (kind === 'payout') {
      journal = await syncPayoutJournalAfterCashier(pool, opts);
    } else if (kind === 'expense') {
      journal = await syncDisbursementExpenseJournal(pool, opts);
    }
    if (journal && !journal.ok && !journal.duplicate) {
      const { journalPostLastError } = require('./hmsFinJournalPost');
      const err = journalPostLastError();
      if (err) console.warn(`cashier journal (${kind}):`, err);
    }
  }

  let external = null;
  if (opts?.txnId) {
    try {
      const { syncCashierTxnToCoreAccount } = require('./coreAccountWebhook');
      external = await syncCashierTxnToCoreAccount(pool, opts.txnId);
    } catch (_) {
      external = { ok: false };
    }
  }

  return { journal, external };
}

module.exports = {
  ensureCashierTxnSchema,
  deriveServiceKey,
  recordCashierTransaction,
  linkCashierTxnJournal,
  syncReceiptJournalAfterCollect,
  syncRefundJournalAfterCashier,
  syncDisbursementExpenseJournal,
  syncExpenseJournalAfterCashier,
  syncPayoutJournalAfterCashier,
  afterCommitCashierPipeline,
  findBillingReceiptJournalId,
  findJournalHeaderId,
};
