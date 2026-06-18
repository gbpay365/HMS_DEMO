'use strict';

const crypto = require('crypto');

function verifyUrl(req, token) {
  const base = `${req.protocol}://${req.get('host')}`;
  return `${base}/verify/consult/${token}`;
}

async function ensureConsultToken(pool, consultationId) {
  const id = parseInt(consultationId, 10) || 0;
  if (id < 1) return null;
  const [[row]] = await pool.query('SELECT verify_token FROM tbl_consultation WHERE id=? LIMIT 1', [id]);
  if (row && row.verify_token) return row.verify_token;
  const token = crypto.randomBytes(24).toString('hex');
  await pool.query(
    'UPDATE tbl_consultation SET verify_token=?, verify_token_at=NOW() WHERE id=?',
    [token, id]
  );
  return token;
}

async function loadByToken(pool, token) {
  const t = String(token || '').trim();
  if (!t || t.length < 16) return null;
  const [[c]] = await pool.query(
    `SELECT c.*, p.first_name, p.last_name, p.dob, p.gender, p.phone,
            e.first_name AS doc_fn, e.last_name AS doc_ln
     FROM tbl_consultation c
     JOIN tbl_patient p ON p.id = c.patient_id
     LEFT JOIN tbl_employee e ON e.id = c.created_by
     WHERE c.verify_token = ? LIMIT 1`,
    [t]
  );
  return c || null;
}

module.exports = {
  verifyUrl,
  ensureConsultToken,
  loadByToken,
};
