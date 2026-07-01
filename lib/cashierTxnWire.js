'use strict';

const {
  recordCashierTransaction,
  afterCommitCashierPipeline,
  syncReceiptJournalAfterCollect,
} = require('./cashierTransactionHub');

/**
 * Record a patient receipt inside an open DB transaction (before commit).
 * @returns {Promise<object|null>}
 */
async function recordReceiptInTransaction(conn, opts) {
  const amount = parseFloat(opts.amount) || 0;
  const sourcePk = parseInt(String(opts.sourcePk || 0), 10) || 0;
  const userId = parseInt(String(opts.userId || 0), 10) || 0;
  if (!conn || sourcePk < 1 || userId < 1 || amount <= 0) return null;

  return recordCashierTransaction(conn, {
    facilityId: opts.facilityId || 1,
    employeeId: userId,
    createdBy: userId,
    sourceModule: opts.sourceModule || 'payment_ticket',
    sourcePk,
    txnType: 'receipt',
    amount,
    paymentMethod: opts.paymentMethod || 'Cash',
    billingDocumentId: opts.billingDocumentId || null,
    patientId: opts.patientId || null,
    lines: opts.lines || [],
    ticket: opts.ticket || null,
    reference: opts.reference || null,
    narration: opts.narration || null,
    forceCashierAssign: true,
  });
}

/**
 * Record a cash/payment refund inside an open DB transaction.
 */
async function recordRefundInTransaction(conn, opts) {
  const amount = parseFloat(opts.amount) || 0;
  const sourcePk = parseInt(String(opts.sourcePk || 0), 10) || 0;
  const userId = parseInt(String(opts.userId || 0), 10) || 0;
  if (!conn || sourcePk < 1 || userId < 1 || amount <= 0) return null;

  return recordCashierTransaction(conn, {
    facilityId: opts.facilityId || 1,
    employeeId: userId,
    createdBy: userId,
    sourceModule: opts.sourceModule || 'cashier_refund',
    sourcePk,
    txnType: 'refund',
    amount,
    paymentMethod: opts.paymentMethod || 'Cash',
    billingDocumentId: opts.billingDocumentId || null,
    patientId: opts.patientId || null,
    lines: opts.lines || [],
    ticket: opts.ticket || null,
    serviceKey: opts.serviceKey || 'default',
    reference: opts.reference || null,
    narration: opts.narration || null,
    forceCashierAssign: true,
    skipSchemaEnsure: !!opts.skipSchemaEnsure,
    precachedCashier: opts.precachedCashier || null,
  });
}

/**
 * Record expense or admin payout from the cashier desk.
 */
async function recordDisbursementInTransaction(conn, opts) {
  const amount = parseFloat(opts.amount) || 0;
  const disbursementId = parseInt(String(opts.disbursementId || 0), 10) || 0;
  const userId = parseInt(String(opts.userId || 0), 10) || 0;
  const glKind = String(opts.glKind || opts.txnType || 'expense').toLowerCase() === 'payout' ? 'payout' : 'expense';
  if (!conn || disbursementId < 1 || userId < 1 || amount <= 0) return null;

  return recordCashierTransaction(conn, {
    facilityId: opts.facilityId || 1,
    employeeId: userId,
    createdBy: userId,
    sourceModule: 'cashier_disbursement',
    sourcePk: disbursementId,
    txnType: glKind,
    amount,
    paymentMethod: opts.paymentMethod || 'Cash',
    expenseCategory: opts.expenseCategory || 'general',
    reference: opts.reference || `CD-${disbursementId}`,
    narration: opts.narration || null,
    forceCashierAssign: true,
  });
}

/**
 * Post GL journal for a receipt billing document (works with or without cashier txn row).
 */
async function postReceiptJournal(pool, opts) {
  const billingDocumentId = parseInt(String(opts.billingDocumentId || 0), 10) || 0;
  const grandTotal = parseFloat(opts.grandTotal) || 0;
  if (billingDocumentId < 1 || grandTotal <= 0) {
    return { ok: false, journalHeaderId: null, skipped: true, reason: 'missing billing doc or amount' };
  }

  const ensureFinJournal019 = require('./ensureFinJournal019');
  await ensureFinJournal019(pool).catch(() => {});

  const journal = await syncReceiptJournalAfterCollect(pool, {
    txnId: opts.txnId || null,
    facilityId: opts.facilityId || 1,
    billingDocumentId,
    grandTotal,
    paymentMethod: opts.paymentMethod || 'Cash',
    createdBy: opts.createdBy || 0,
    docNumber: opts.docNumber || '',
    firstLineDescription: opts.firstLineDescription || '',
    sourceModule: opts.sourceModule || 'payment_ticket',
  });

  if (!journal?.ok) {
    const { journalPostLastError } = require('./hmsFinJournalPost');
    const err = journalPostLastError();
    console.warn('cashier receipt journal post failed:', err || 'unknown');
    return { ...journal, error: err || 'journal post failed' };
  }
  return journal;
}

/**
 * After DB commit: post GL journal + optional Core Account sync.
 * Journal posting runs even when txnId is missing (fallback from billing document).
 */
async function runCashierPostCommit(pool, opts) {
  try {
    const kind = String(opts?.journalKind || 'receipt').toLowerCase();
    if (kind === 'receipt' && !opts?.txnId && opts?.billingDocumentId) {
      const journal = await postReceiptJournal(pool, opts);
      return { journal, external: null };
    }
    if (opts?.txnId || ['expense', 'payout', 'refund', 'receipt'].includes(kind)) {
      return await afterCommitCashierPipeline(pool, opts);
    }
    return { journal: null, external: null };
  } catch (e) {
    console.warn('cashier post-commit pipeline:', e.message);
    return { journal: null, external: null, error: e.message };
  }
}

module.exports = {
  recordReceiptInTransaction,
  recordRefundInTransaction,
  recordDisbursementInTransaction,
  postReceiptJournal,
  runCashierPostCommit,
};
