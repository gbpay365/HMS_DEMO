'use strict';

const { loadEnv } = require('../lib/loadEnv');
loadEnv();
const { createDbPool } = require('../lib/dbPool');
const { postWalletTopupJournal } = require('../lib/walletTopupJournal');

(async () => {
  const pool = createDbPool();
  const conn = await pool.getConnection();
  try {
    const [[w]] = await conn.query(
      "SELECT id FROM tbl_patient_wallet WHERE status='active' LIMIT 1"
    );
    if (!w) {
      console.log('SKIP: no active wallet');
      return;
    }
    await conn.beginTransaction();
    const [[wallet]] = await conn.query(
      "SELECT id, balance, patient_id FROM tbl_patient_wallet WHERE id=? AND status='active' FOR UPDATE",
      [w.id]
    );
    let patientLabel = '';
    if (wallet.patient_id) {
      const [[p]] = await conn.query(
        'SELECT first_name, last_name FROM tbl_patient WHERE id=? LIMIT 1',
        [wallet.patient_id]
      );
      patientLabel = [p?.first_name, p?.last_name].filter(Boolean).join(' ');
    }
    const amt = 100;
    const next = parseFloat(wallet.balance || 0) + amt;
    const ref = 'TEST-TOPUP-' + Date.now();
    await conn.query('UPDATE tbl_patient_wallet SET balance=?, updated_at=NOW() WHERE id=?', [next, wallet.id]);
    const [ins] = await conn.query(
      `INSERT INTO tbl_patient_wallet_txn
       (wallet_id, txn_type, direction, amount, balance_after, reference_id, notes, created_by)
       VALUES (?, 'deposit_cash', 'cr', ?, ?, ?, ?, ?)`,
      [wallet.id, amt, next, ref, 'test', 1]
    );
    await conn.commit();
    const txnId = ins.insertId;
    const jr = await postWalletTopupJournal(pool, {
      facilityId: 1,
      walletTxnId: txnId,
      amount: amt,
      createdBy: 1,
      patientLabel,
      reference: ref,
      paymentMethod: 'Cash',
    });
    console.log('OK', { walletId: wallet.id, txnId, journal: jr });
    await pool.query('UPDATE tbl_patient_wallet SET balance=balance-? WHERE id=?', [amt, wallet.id]);
    await pool.query('DELETE FROM tbl_patient_wallet_txn WHERE id=?', [txnId]);
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error('FAIL', e.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
})();
