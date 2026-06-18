'use strict';

const crypto = require('crypto');

function verifyUrl(req, token) {
  const base = `${req.protocol}://${req.get('host')}`;
  return `${base}/verify/rx/${token}`;
}

async function ensureRxToken(pool, prescriptionId) {
  const id = parseInt(prescriptionId, 10) || 0;
  if (id < 1) return null;
  const [[row]] = await pool.query('SELECT verify_token FROM tbl_prescription WHERE id=? LIMIT 1', [id]);
  if (row && row.verify_token) return row.verify_token;
  const token = crypto.randomBytes(24).toString('hex');
  await pool.query(
    'UPDATE tbl_prescription SET verify_token=?, verify_token_at=NOW() WHERE id=?',
    [token, id]
  );
  return token;
}

async function loadByToken(pool, token) {
  const t = String(token || '').trim();
  if (!t || t.length < 16) return null;
  const [[rx]] = await pool.query(
    `SELECT r.*, p.first_name, p.last_name, p.dob, p.gender,
            e.first_name AS doc_fn, e.last_name AS doc_ln
     FROM tbl_prescription r
     JOIN tbl_patient p ON p.id = r.patient_id
     LEFT JOIN tbl_employee e ON e.id = r.created_by
     WHERE r.verify_token = ? LIMIT 1`,
    [t]
  );
  return rx || null;
}

async function markVerified(pool, token, userId) {
  const rx = await loadByToken(pool, token);
  if (!rx) return { ok: false, error: 'Prescription not found' };
  if (rx.verified_at) return { ok: true, already: true, rx };
  await pool.query(
    'UPDATE tbl_prescription SET verified_at=NOW(), verified_by=? WHERE id=?',
    [userId || null, rx.id]
  );
  return { ok: true, rx };
}

module.exports = {
  verifyUrl,
  ensureRxToken,
  loadByToken,
  markVerified,
};
