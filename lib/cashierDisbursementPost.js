'use strict';

const {
  normalizeDisbursementType,
  normalizeDisbursementCategory,
  normalizeDisbursementPaymentMethod,
  disbursementTypeLabel,
} = require('./cashierDisbursementOptions');
const { previewDisbursementPostingAccounts } = require('./cashierDisbursementJournal');
const { formatMoney: hmsFormatMoney } = require('./hmsMoneyFormat');

function parseDisbursementInput(body, session) {
  const { txnType, glKind } = normalizeDisbursementType(body.txn_type || body.txnType);
  const payment = normalizeDisbursementPaymentMethod(body.payment_method || body.paymentMethod);
  return {
    txnType,
    glKind,
    amount: parseFloat(body.amount) || 0,
    category: normalizeDisbursementCategory(body.category),
    paymentMethod: payment.value,
    paymentMethodError: payment.ok ? '' : payment.error,
    narration: String(body.narration || '').trim(),
    uid: parseInt(String(session.userId || session.user?.id || 0), 10) || 0,
    fid: parseInt(String(session.facilityId || 1), 10) || 1,
    autoCreateSubAccounts: Boolean(
      body.auto_create_sub_accounts === '1' ||
        body.auto_create_sub_accounts === 1 ||
        body.autoCreateSubAccounts ||
        body.autoCreate
    ),
  };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 */
async function executeCashierDisbursement(pool, input) {
  const {
    txnType,
    glKind,
    amount,
    category,
    paymentMethod,
    paymentMethodError,
    narration,
    uid,
    fid,
    autoCreateSubAccounts,
  } = input;

  if (paymentMethodError) {
    return { ok: false, error: paymentMethodError };
  }
  if (amount < 1) {
    return { ok: false, error: 'Enter a valid amount.' };
  }
  if (!narration) {
    return { ok: false, error: 'Description is required.' };
  }
  if (uid < 1) {
    return { ok: false, error: 'Access denied.' };
  }

  const journalKind = glKind === 'payout' ? 'payout' : 'expense';
  const previewOpts = {
    facilityId: fid,
    journalKind,
    glKind,
    disbursementType: txnType,
    expenseCategory: category,
    paymentMethod,
    narration,
    amount,
  };

  if (!autoCreateSubAccounts) {
    const preview = await previewDisbursementPostingAccounts(pool, previewOpts);
    if (!preview.ok) {
      return {
        ok: false,
        needsSubAccounts: Boolean(preview.needsSubAccounts),
        missing: preview.missing || [],
        error: preview.error || "Can't Post on Main Account , Please Create Sub Account and then Post the Transaction",
      };
    }
  }

  const conn = await pool.getConnection();
  try {
    const { ensureCashierDisbursementSchema } = require('./ensureCashierDisbursementSchema');
    await ensureCashierDisbursementSchema(conn);
    await conn.beginTransaction();

    const [ins] = await conn.query(
      `INSERT INTO tbl_cashier_disbursement
        (facility_id, txn_type, category, amount, payment_method, narration, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fid, txnType, category, amount, paymentMethod, narration.slice(0, 500), uid]
    );
    const disbursementId = parseInt(String(ins?.insertId || 0), 10) || 0;
    if (disbursementId < 1) throw new Error('Could not save disbursement.');

    const { recordDisbursementInTransaction } = require('./cashierTxnWire');
    const cashierTxnResult = await recordDisbursementInTransaction(conn, {
      facilityId: fid,
      userId: uid,
      disbursementId,
      glKind,
      amount,
      paymentMethod,
      expenseCategory: category,
      narration,
    });

    await conn.commit();
    conn.release();

    let journalResult = null;
    try {
      const { runCashierPostCommit } = require('./cashierTxnWire');
      journalResult = await runCashierPostCommit(pool, {
        txnId: cashierTxnResult?.txnId || null,
        journalKind,
        disbursementType: txnType,
        expenseId: disbursementId,
        disbursementId,
        amount,
        paymentMethod,
        expenseCategory: category,
        narration,
        createdBy: uid,
        facilityId: fid,
        cashierCode: cashierTxnResult?.cashierCode,
        cashierIdentity: cashierTxnResult?.cashierIdentity,
        reference: `CD-${disbursementId}`,
        autoCreateSubAccounts,
      });
    } catch (pipeErr) {
      console.error('cashier journal pipeline (disbursement):', pipeErr.message);
      journalResult = { error: pipeErr.message };
    }

    const journal = journalResult?.journal;
    if (journal && !journal.ok && !journal.duplicate && journal.needsSubAccounts) {
      return {
        ok: false,
        disbursementId,
        needsSubAccounts: true,
        missing: journal.missing || [],
        error: journal.error || "Can't Post on Main Account , Please Create Sub Account and then Post the Transaction",
      };
    }

    const typeLabel = disbursementTypeLabel(txnType);
    const createdAccounts = journal?.createdAccounts || [];
    const createdNote = createdAccounts.length
      ? ` Created sub-accounts: ${createdAccounts.map((a) => a.code).join(', ')}.`
      : '';
    const journalNote = journal?.ok || journal?.duplicate ? ' Till ledger and journal updated.' : '';
    const message = `${typeLabel} recorded: ${hmsFormatMoney(amount)} (${paymentMethod}). Cashier ${cashierTxnResult?.cashierCode || ''}.${journalNote}${createdNote}`;

    return {
      ok: true,
      disbursementId,
      reference: `CD-${disbursementId}`,
      message,
      journalHeaderId: journal?.journalHeaderId || null,
      createdAccounts,
      cashierCode: cashierTxnResult?.cashierCode || null,
    };
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    throw err;
  }
}

module.exports = {
  parseDisbursementInput,
  executeCashierDisbursement,
};
