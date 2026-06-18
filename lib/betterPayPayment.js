'use strict';

const https = require('https');
const http = require('http');

const PAID_STATUSES = new Set(['paid', 'success', 'successful', 'completed', 'complete']);
const TERMINAL_FAIL = new Set(['timeout', 'failed']);
const WAIT_TIMEOUT_SEC = 90;
const FAILED_RETENTION_HOURS = 24;

async function ensureSchema(pool) {
  await pool
    .query(
      `CREATE TABLE IF NOT EXISTS tbl_betterpay_payment (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ref VARCHAR(64) NOT NULL,
        patient_id INT NULL,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        external_id VARCHAR(128) NULL,
        meta_json TEXT NULL,
        waiting_started_at DATETIME NULL,
        paid_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_betterpay_ref (ref),
        KEY idx_betterpay_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    )
    .catch(() => {});
  await pool
    .query(
      'ALTER TABLE tbl_betterpay_payment ADD COLUMN IF NOT EXISTS waiting_started_at DATETIME NULL'
    )
    .catch(() => {});
}

function parseMeta(row) {
  if (!row || !row.meta_json) return {};
  try {
    return typeof row.meta_json === 'object' ? row.meta_json : JSON.parse(row.meta_json);
  } catch {
    return {};
  }
}

async function upsertPending(pool, { ref, patientId, amount, meta }) {
  await ensureSchema(pool);
  const refStr = String(ref || '').trim();
  if (!refStr) throw new Error('Missing payment reference');
  const amt = parseFloat(amount) || 0;
  const metaJson = meta ? JSON.stringify(meta) : null;
  await pool.query(
    `INSERT INTO tbl_betterpay_payment (ref, patient_id, amount, status, meta_json, waiting_started_at, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       patient_id = VALUES(patient_id),
       amount = VALUES(amount),
       status = IF(status = 'paid', 'paid', 'pending'),
       meta_json = COALESCE(VALUES(meta_json), meta_json),
       waiting_started_at = IF(status = 'paid', waiting_started_at, NOW()),
       updated_at = NOW()`,
    [refStr, patientId || null, amt, metaJson]
  );
  return refStr;
}

async function markPaid(pool, ref, externalId) {
  await ensureSchema(pool);
  const refStr = String(ref || '').trim();
  if (!refStr) return false;
  const [r] = await pool.query(
    `UPDATE tbl_betterpay_payment
     SET status = 'paid', paid_at = NOW(), external_id = COALESCE(?, external_id), updated_at = NOW()
     WHERE ref = ?`,
    [externalId || null, refStr]
  );
  return (r.affectedRows || 0) > 0;
}

async function markTimeout(pool, ref) {
  await ensureSchema(pool);
  const refStr = String(ref || '').trim();
  if (!refStr) return false;
  const [r] = await pool.query(
    `UPDATE tbl_betterpay_payment
     SET status = 'timeout', updated_at = NOW()
     WHERE ref = ? AND status = 'pending'`,
    [refStr]
  );
  if ((r.affectedRows || 0) > 0) purgeExpired(pool).catch(() => {});
  return (r.affectedRows || 0) > 0;
}

async function markFailed(pool, ref) {
  await ensureSchema(pool);
  const refStr = String(ref || '').trim();
  if (!refStr) return false;
  const [r] = await pool.query(
    `UPDATE tbl_betterpay_payment
     SET status = 'failed', updated_at = NOW()
     WHERE ref = ? AND status NOT IN ('paid')`,
    [refStr]
  );
  return (r.affectedRows || 0) > 0;
}

async function resetForRetry(pool, ref, metaPatch) {
  await ensureSchema(pool);
  const refStr = String(ref || '').trim();
  const row = await getRow(pool, refStr);
  if (!row) return null;
  const meta = { ...parseMeta(row), ...(metaPatch || {}) };
  await pool.query(
    `UPDATE tbl_betterpay_payment
     SET status = 'pending', waiting_started_at = NOW(), meta_json = ?, updated_at = NOW()
     WHERE ref = ? AND status IN ('timeout', 'failed', 'pending')`,
    [JSON.stringify(meta), refStr]
  );
  return getRow(pool, refStr);
}

async function getRow(pool, ref) {
  await ensureSchema(pool);
  const [rows] = await pool.query(
    `SELECT ref, patient_id, amount, status, paid_at, waiting_started_at, meta_json, created_at, updated_at
     FROM tbl_betterpay_payment WHERE ref = ? LIMIT 1`,
    [String(ref || '').trim()]
  );
  return rows && rows[0] ? rows[0] : null;
}

function isWaitExpired(row) {
  if (!row || String(row.status).toLowerCase() !== 'pending') return false;
  const started = row.waiting_started_at ? new Date(row.waiting_started_at).getTime() : 0;
  if (!started) return false;
  return Date.now() - started > WAIT_TIMEOUT_SEC * 1000;
}

function fetchJson(url, headers) {
  return new Promise((resolve, reject) => {
    const lib = String(url).startsWith('https') ? https : http;
    lib
      .get(url, { headers: headers || {} }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function responseIndicatesPaid(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.paid === true || data.success === true) return true;
  const st = String(data.status || data.state || data.payment_status || '').toLowerCase();
  return PAID_STATUSES.has(st);
}

async function checkRemoteStatus(pool, ref) {
  const betterPayConfig = require('./betterPayConfig');
  const cfg = await betterPayConfig.resolve(pool);
  const tpl = String(cfg.statusUrl || process.env.BETTERPAY_STATUS_URL || '').trim();
  if (!tpl) return false;
  const url = tpl.replace(/\{ref\}/g, encodeURIComponent(String(ref || '')));
  const headers = {};
  const key = String(cfg.apiKey || process.env.BETTERPAY_API_KEY || '').trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  try {
    const data = await fetchJson(url, headers);
    return responseIndicatesPaid(data);
  } catch (e) {
    console.warn('BetterPay remote status check failed:', e.message);
    return false;
  }
}

/**
 * @returns {Promise<{ paid: boolean, status: string, row: object|null, expired: boolean }>}
 */
async function getPaymentStatus(pool, ref) {
  let row = await getRow(pool, ref);
  if (!row) return { paid: false, status: 'missing', row: null, expired: false };

  const st = String(row.status || '').toLowerCase();
  if (st === 'paid') return { paid: true, status: 'paid', row, expired: false };

  if (TERMINAL_FAIL.has(st)) {
    return { paid: false, status: st, row, expired: false };
  }

  if (isWaitExpired(row)) {
    await markTimeout(pool, ref);
    row = await getRow(pool, ref);
    return { paid: false, status: 'timeout', row, expired: true };
  }

  const remotePaid = await checkRemoteStatus(pool, ref);
  if (remotePaid) {
    await markPaid(pool, ref, 'remote');
    const updated = await getRow(pool, ref);
    return { paid: true, status: 'paid', row: updated, expired: false };
  }

  return { paid: false, status: st || 'pending', row, expired: false };
}

async function assertPaidForAmount(pool, ref, expectedAmount) {
  const { paid, row } = await getPaymentStatus(pool, ref);
  if (!paid) return { ok: false, code: 'PAYMENT_NOT_RECEIVED' };
  const exp = parseFloat(expectedAmount) || 0;
  const got = parseFloat(row?.amount) || 0;
  if (exp > 0 && got > 0 && Math.abs(exp - got) > 1) {
    return { ok: false, code: 'AMOUNT_MISMATCH' };
  }
  return { ok: true, row };
}

/** Remove timeout BetterPay rows older than 24h and their pending tickets. */
async function purgeExpired(pool) {
  await ensureSchema(pool);
  const [rows] = await pool.query(
    `SELECT ref FROM tbl_betterpay_payment
     WHERE status = 'timeout'
       AND updated_at < DATE_SUB(NOW(), INTERVAL ? HOUR)`,
    [FAILED_RETENTION_HOURS]
  );
  for (const r of rows || []) {
    const ref = String(r.ref || '').trim();
    if (!ref) continue;
    await pool.query(
      `DELETE FROM tbl_payment_ticket WHERE ticket_code = ? AND status = 'pending'`,
      [ref]
    ).catch(() => {});
    await pool.query('DELETE FROM tbl_betterpay_payment WHERE ref = ?', [ref]).catch(() => {});
  }
  return (rows || []).length;
}

module.exports = {
  WAIT_TIMEOUT_SEC,
  FAILED_RETENTION_HOURS,
  ensureSchema,
  parseMeta,
  upsertPending,
  markPaid,
  markTimeout,
  markFailed,
  resetForRetry,
  getRow,
  getPaymentStatus,
  assertPaidForAmount,
  responseIndicatesPaid,
  purgeExpired,
  isWaitExpired,
};
