'use strict';

const { journalPostExtended } = require('./hmsFinJournalPost');
const { glAccountForPaymentMethod } = require('./paymentMethodGlAccounts');

const WALLET_LIABILITY = glAccountForPaymentMethod('Wallet');

/**
 * Post GL for a patient wallet top-up (cash or MoMo received → wallet liability).
 */
async function postWalletTopupJournal(pool, opts) {
  const facilityId = parseInt(String(opts.facilityId || 1), 10) || 1;
  const txnId = parseInt(String(opts.walletTxnId || 0), 10) || 0;
  const amount = parseFloat(opts.amount) || 0;
  const userId = parseInt(String(opts.createdBy || 0), 10) || 0;
  if (txnId < 1 || amount <= 0) {
    return { ok: false, journalId: 0, skipped: true, reason: 'missing txn or amount' };
  }

  const treasuryGl = glAccountForPaymentMethod(opts.paymentMethod || 'Cash');
  const patientLabel = String(opts.patientLabel || '').trim();
  const ref = String(opts.reference || `WLT-${txnId}`).slice(0, 64);
  const note = String(opts.notes || '').trim();
  const narration = ['Wallet top-up', patientLabel || null, note || null].filter(Boolean).join(' · ').slice(0, 512);

  const r = await journalPostExtended(pool, {
    facilityId,
    sourceType: 'wallet_topup',
    sourceId: txnId,
    reference: ref,
    narration,
    createdBy: userId,
    lines: [
      { code: treasuryGl.code, label: treasuryGl.label, debit: amount, credit: 0 },
      { code: WALLET_LIABILITY.code, label: WALLET_LIABILITY.label, debit: 0, credit: amount },
    ],
    journalCode: 'CA',
    status: 'posted',
  });

  return {
    ok: !!(r.ok || r.duplicate),
    journalId: r.journalId || 0,
    duplicate: !!r.duplicate,
  };
}

module.exports = { postWalletTopupJournal };
