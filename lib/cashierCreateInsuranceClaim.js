'use strict';

const { ensureCashierInsuranceClaimSchema } = require('./ensureCashierInsuranceClaimSchema');

const VALID_COVER_TYPES = new Set(['full_cover', 'partial_cover', 'copay', 'exclusion']);

function claimRefFromId(id, createdAt) {
  const y = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  return `CLM-${y}-${String(id).padStart(3, '0')}`;
}

async function resolvePatientId(pool, input) {
  const explicit = parseInt(String(input.patient_id), 10) || 0;
  if (explicit > 0) {
    const [[row]] = await pool.query('SELECT id FROM tbl_patient WHERE id = ? AND status = 1 LIMIT 1', [explicit]);
    if (row) return row.id;
  }

  const q = String(input.patient_query || input.patient_name || '').trim();
  if (!q) return 0;

  if (/^\d+$/.test(q)) {
    const id = parseInt(q, 10);
    const [[row]] = await pool.query('SELECT id FROM tbl_patient WHERE id = ? AND status = 1 LIMIT 1', [id]);
    if (row) return row.id;
  }

  const like = `%${q.replace(/[%_\\]/g, ' ').trim()}%`;
  const [rows] = await pool
    .query(
      `SELECT id FROM tbl_patient
       WHERE status = 1
         AND (
           LOWER(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))) LIKE LOWER(?)
           OR CAST(id AS CHAR) LIKE ?
         )
       ORDER BY id DESC
       LIMIT 1`,
      [like, like]
    )
    .catch(() => [[]]);
  return rows?.[0]?.id ? parseInt(rows[0].id, 10) : 0;
}

async function resolveTicketId(pool, ticketCode) {
  const code = String(ticketCode || '').trim();
  if (!code) return null;
  const [[row]] = await pool
    .query(
      `SELECT id FROM tbl_payment_ticket
       WHERE ticket_code = ? AND status NOT IN ('cancelled', 'canceled')
       LIMIT 1`,
      [code]
    )
    .catch(() => [[]]);
  return row?.id ? parseInt(row.id, 10) : null;
}

async function upsertPatientPolicy(pool, patientId, carrierId, policyNumber, coverType) {
  const policy = String(policyNumber || '').trim().slice(0, 120);
  if (!policy) return;

  let insurerPct = 100;
  if (coverType === 'partial_cover') insurerPct = 70;
  else if (coverType === 'copay') insurerPct = 80;
  else if (coverType === 'exclusion') insurerPct = 50;

  const [[existing]] = await pool
    .query(
      `SELECT id FROM tbl_patient_insurance
       WHERE patient_id = ? AND carrier_id = ?
       LIMIT 1`,
      [patientId, carrierId]
    )
    .catch(() => [[]]);

  if (existing?.id) {
    await pool
      .query(
        `UPDATE tbl_patient_insurance
         SET policy_number = ?, insurer_covered_percent = ?, is_primary = 1
         WHERE id = ?`,
        [policy, insurerPct, existing.id]
      )
      .catch(() => {});
    return;
  }

  await pool
    .query(
      `INSERT INTO tbl_patient_insurance
       (patient_id, carrier_id, policy_number, insurer_covered_percent, is_primary, created_at)
       VALUES (?, ?, ?, ?, 1, NOW())`,
      [patientId, carrierId, policy, insurerPct]
    )
    .catch(() => {});
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} input
 * @param {object} session
 */
async function createCashierInsuranceClaim(pool, input, session) {
  await ensureCashierInsuranceClaimSchema(pool);

  const fid = parseInt(String(session.facilityId || 1), 10) || 1;
  const carrierId = parseInt(String(input.carrier_id), 10) || 0;
  const policyNumber = String(input.policy_number || '').trim().slice(0, 120);
  const linkedBill = String(input.linked_ticket_code || input.linked_bill || '').trim().slice(0, 48);
  const diagnosis = String(input.diagnosis || '').trim().slice(0, 200);
  const billedAmount = parseFloat(input.billed_amount ?? input.claim_amount) || 0;
  let coverType = String(input.cover_type || 'full_cover').toLowerCase().trim();
  if (!VALID_COVER_TYPES.has(coverType)) coverType = 'full_cover';

  if (carrierId < 1) {
    return { ok: false, error: 'Insurance provider is required.', status: 400 };
  }
  if (!policyNumber) {
    return { ok: false, error: 'Policy number is required.', status: 400 };
  }
  if (billedAmount <= 0) {
    return { ok: false, error: 'Claim amount must be greater than zero.', status: 400 };
  }

  const patientId = await resolvePatientId(pool, input);
  if (patientId < 1) {
    return {
      ok: false,
      error: 'Select a registered patient from suggestions, or enter a valid patient ID.',
      status: 400,
    };
  }

  const [[carrier]] = await pool.query(
    'SELECT id FROM tbl_insurance_carrier WHERE id = ? AND status = 1 LIMIT 1',
    [carrierId]
  );
  if (!carrier) {
    return { ok: false, error: 'Insurance provider not found.', status: 400 };
  }

  let ticketId = null;
  if (linkedBill) {
    ticketId = await resolveTicketId(pool, linkedBill);
    if (!ticketId) {
      return { ok: false, error: 'Linked bill number was not found.', status: 400 };
    }
  }

  await upsertPatientPolicy(pool, patientId, carrierId, policyNumber, coverType);

  const [ins] = await pool.query(
    `INSERT INTO tbl_insurance_claim
     (facility_id, patient_id, carrier_id, diagnosis, billed_amount, status,
      policy_number, linked_ticket_code, ticket_id, cover_type, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, NOW())`,
    [
      fid,
      patientId,
      carrierId,
      diagnosis || null,
      billedAmount,
      policyNumber,
      linkedBill || null,
      ticketId,
      coverType,
    ]
  );

  const claimId = ins.insertId;
  const claimRef = claimRefFromId(claimId, new Date());

  if (ticketId) {
    await pool
      .query(
        `UPDATE tbl_payment_ticket SET claim_status = 'claimed' WHERE id = ? AND claim_status = 'not_claimed'`,
        [ticketId]
      )
      .catch(() => {});
  }

  return {
    ok: true,
    claim_id: claimId,
    claim_ref: claimRef,
    billed_amount: billedAmount,
  };
}

module.exports = { createCashierInsuranceClaim };
