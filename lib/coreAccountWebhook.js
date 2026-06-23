'use strict';

function isEnabled() {
  return String(process.env.CORE_ACCOUNT_SYNC_ENABLED || '0').trim() === '1';
}

function baseUrl() {
  return String(process.env.CORE_ACCOUNT_URL || '').trim().replace(/\/+$/, '');
}

function apiKey() {
  return String(process.env.CORE_ACCOUNT_WEBHOOK_KEY || process.env.CORE_ACCOUNT_API_KEY || '').trim();
}

async function postJson(url, body, headers) {
  if (typeof fetch === 'function') {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => '');
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = { raw: text };
    }
    return { ok: res.ok, status: res.status, data };
  }
  return { ok: false, status: 0, data: { error: 'fetch unavailable' } };
}

/**
 * Push one cashier txn to Core_Account (receipt or expense webhook).
 */
async function syncCashierTxnToCoreAccount(pool, txnId) {
  if (!isEnabled()) return { ok: false, skipped: true, reason: 'disabled' };
  const url = baseUrl();
  const key = apiKey();
  if (!url || !key) return { ok: false, skipped: true, reason: 'missing config' };

  const tid = parseInt(String(txnId || ''), 10) || 0;
  if (tid < 1) return { ok: false, skipped: true, reason: 'invalid txn id' };

  const [[row]] = await pool
    .query(
      `SELECT id, facility_id, txn_type, amount, payment_method, source_module, source_pk,
              billing_document_id, cashier_code, cashier_identity,
              opening_balance, debit_amount, credit_amount, closing_balance,
              gl_debit_account, gl_credit_account, narration, reference, external_sync_status
         FROM tbl_cashier_txn WHERE id = ? LIMIT 1`,
      [tid]
    )
    .catch(() => [[null]]);
  if (!row) return { ok: false, skipped: true, reason: 'txn not found' };
  if (String(row.external_sync_status || '') === 'sent') {
    return { ok: true, duplicate: true };
  }

  const facilityId = parseInt(String(row.facility_id || 1), 10) || 1;
  const isOutflow = ['refund', 'expense', 'payout'].includes(String(row.txn_type || '').toLowerCase());
  const endpoint = isOutflow ? '/api/v1/integrations/expense' : '/api/v1/integrations/receipt';
  const today = new Date().toISOString().slice(0, 10);

  const body = isOutflow
    ? {
        source_id: row.id,
        entry_date: today,
        reference: row.reference || `CD-${row.id}`,
        narration: `${row.cashier_code} ${row.cashier_identity} · ${row.narration || row.txn_type}`.slice(0, 500),
        amount_ttc: parseFloat(row.amount) || 0,
        payment_method: row.payment_method || 'Cash',
        category: row.txn_type === 'payout' ? 'general' : 'utilities',
        gl_debit_account: row.gl_debit_account || '',
        gl_credit_account: row.gl_credit_account || '',
        cashier_code: row.cashier_code,
        cashier_identity: row.cashier_identity,
        opening_balance: parseFloat(row.opening_balance) || 0,
        closing_balance: parseFloat(row.closing_balance) || 0,
        debit_amount: parseFloat(row.debit_amount) || 0,
        credit_amount: parseFloat(row.credit_amount) || 0,
      }
    : {
        source_id: row.id,
        entry_date: today,
        reference: row.reference || `RCP-${row.id}`,
        narration: `${row.cashier_code} ${row.cashier_identity} · ${row.narration || 'receipt'}`.slice(0, 500),
        amount_ttc: parseFloat(row.amount) || 0,
        payment_method: row.payment_method || 'Cash',
        service_key: 'default',
        gl_debit_account: row.gl_debit_account || '',
        gl_credit_account: row.gl_credit_account || '',
        cashier_code: row.cashier_code,
        cashier_identity: row.cashier_identity,
        opening_balance: parseFloat(row.opening_balance) || 0,
        closing_balance: parseFloat(row.closing_balance) || 0,
        debit_amount: parseFloat(row.debit_amount) || 0,
        credit_amount: parseFloat(row.credit_amount) || 0,
      };

  const headers = {
    'X-API-Key': key,
    'X-Facility-Id': String(facilityId),
  };

  try {
    const res = await postJson(`${url}${endpoint}`, body, headers);
    const status = res.ok || res.status === 409 || res.data?.status === 'duplicate' ? 'sent' : 'failed';
    await pool
      .query(
        `UPDATE tbl_cashier_txn SET external_sync_status = ?, external_sync_at = NOW() WHERE id = ?`,
        [status, tid]
      )
      .catch(() => {});
    return { ok: status === 'sent', status: res.status, data: res.data };
  } catch (e) {
    await pool
      .query(`UPDATE tbl_cashier_txn SET external_sync_status = 'failed', external_sync_at = NOW() WHERE id = ?`, [tid])
      .catch(() => {});
    return { ok: false, error: e.message || String(e) };
  }
}

async function retryFailedCoreAccountSync(pool, limit = 50) {
  const [rows] = await pool
    .query(
      `SELECT id FROM tbl_cashier_txn
        WHERE external_sync_status IN ('pending', 'failed')
        ORDER BY id ASC LIMIT ?`,
      [Math.min(500, Math.max(1, parseInt(String(limit), 10) || 50))]
    )
    .catch(() => [[]]);
  let sent = 0;
  let failed = 0;
  for (const r of rows || []) {
    const out = await syncCashierTxnToCoreAccount(pool, r.id);
    if (out.ok) sent += 1;
    else if (!out.skipped) failed += 1;
  }
  return { sent, failed, total: (rows || []).length };
}

module.exports = {
  isEnabled,
  syncCashierTxnToCoreAccount,
  retryFailedCoreAccountSync,
};
