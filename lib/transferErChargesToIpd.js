'use strict';

/**
 * Copy emergency visit charges onto a pending/admitted IPD admission as line items.
 * Prevents double collection at ER cashier by marking ER charges transferred.
 */

async function ensureAdmissionErColumns(pool) {
  await pool
    .query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS source_opd_visit_id INT NULL')
    .catch(() => {});
  await pool
    .query('ALTER TABLE tbl_emergency_charge ADD COLUMN IF NOT EXISTS transferred_to_admission_id INT NULL')
    .catch(() => {});
}

/**
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} db
 * @param {object} o
 * @param {number} o.visitId
 * @param {number} o.admissionId
 * @param {number} [o.addedBy]
 * @param {number} [o.facilityId]
 */
async function transferErChargesToIpd(db, o) {
  const visitId = parseInt(o.visitId, 10) || 0;
  const admissionId = parseInt(o.admissionId, 10) || 0;
  if (visitId < 1 || admissionId < 1) return { transferred: 0, total: 0 };

  await ensureAdmissionErColumns(db);

  const [[adm]] = await db
    .query('SELECT id, patient_id, facility_id FROM tbl_admission WHERE id=? LIMIT 1', [admissionId])
    .catch(() => [[null]]);
  if (!adm) return { transferred: 0, total: 0 };

  const fid = o.facilityId != null ? Number(o.facilityId) || 1 : Number(adm.facility_id) || 1;
  const uid = parseInt(o.addedBy, 10) || null;
  const patientId = parseInt(adm.patient_id, 10) || 0;

  const [charges] = await db
    .query(
      `SELECT * FROM tbl_emergency_charge
        WHERE visit_id = ?
          AND (transferred_to_admission_id IS NULL OR transferred_to_admission_id = 0)
        ORDER BY id ASC`,
      [visitId]
    )
    .catch(() => [[]]);

  let total = 0;
  let count = 0;
  for (const ch of charges || []) {
    const amt = parseFloat(ch.amount) || 0;
    const settled = parseInt(ch.settled, 10) === 1;
    const billAmount = settled ? 0 : amt;
    const baseDesc = String(ch.description || ch.charge_type || 'Emergency charge').trim();
    const desc = settled
      ? `Emergency (A&E, paid at ER): ${baseDesc}`
      : `Emergency (A&E): ${baseDesc}`;
    const ctype = 'misc';
    const detail = JSON.stringify({
      er_charge_id: ch.id,
      er_visit_id: visitId,
      er_charge_type: ch.charge_type || null,
      settled_at_er: settled,
      original_amount: amt,
    });

    await db
      .query(
        `INSERT INTO tbl_ipd_charge
          (facility_id, admission_id, patient_id, charge_type, description, amount,
           added_by, source_module, source_pk, clinical_detail)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [fid, admissionId, patientId, ctype, desc.slice(0, 300), billAmount, uid, 'emergency_transfer', ch.id, detail]
      )
      .catch(() => {});

    await db
      .query(
        `UPDATE tbl_emergency_charge
            SET transferred_to_admission_id=?, settled=1
          WHERE id=?`,
        [admissionId, ch.id]
      )
      .catch(() => {});

    total += billAmount;
    count += 1;
  }

  if (total > 0) {
    await db
      .query('UPDATE tbl_admission SET running_bill = COALESCE(running_bill,0) + ? WHERE id=?', [total, admissionId])
      .catch(() => {});
  }

  await db
    .query('UPDATE tbl_admission SET source_opd_visit_id=? WHERE id=? AND source_opd_visit_id IS NULL', [
      visitId,
      admissionId,
    ])
    .catch(() => {});

  return { transferred: count, total };
}

module.exports = {
  ensureAdmissionErColumns,
  transferErChargesToIpd,
};
