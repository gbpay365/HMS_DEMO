'use strict';

const { prescriptionDoseTotal } = require('./prescriptionPricing');

/**
 * Keep tbl_ipd_charge + running_bill in sync with an IPD prescription line.
 * amount = unit_price × times_per_day × duration_days
 */
async function syncIpdPrescriptionCharge(pool, req, rx) {
  if (!rx || !rx.id || !rx.admission_id) return null;
  const amount = prescriptionDoseTotal(rx.unit_price, rx.times_per_day, rx.duration_days);
  const aid = parseInt(rx.admission_id, 10) || 0;
  const pid = parseInt(rx.patient_id, 10) || 0;
  const rid = parseInt(rx.id, 10) || 0;
  if (aid < 1) return null;

  const { admissionAcceptsNewCharges } = require('./ipdSettlementGuard');
  const guard = await admissionAcceptsNewCharges(pool, aid);
  if (!guard.ok && guard.reason === 'financially_settled') return null;

  const [[existing]] = await pool
    .query(
      `SELECT id, amount FROM tbl_ipd_charge
        WHERE source_module='ipd_prescription' AND source_pk=? LIMIT 1`,
      [rid]
    )
    .catch(() => [[null]]);

  const oldAmt = existing ? parseFloat(existing.amount || 0) || 0 : 0;

  if (amount <= 0) {
    if (existing && existing.id) {
      await pool.query('DELETE FROM tbl_ipd_charge WHERE id=?', [existing.id]).catch(() => {});
      if (oldAmt > 0) {
        await pool
          .query('UPDATE tbl_admission SET running_bill = GREATEST(0, COALESCE(running_bill,0) - ?) WHERE id=?', [
            oldAmt,
            aid,
          ])
          .catch(() => {});
      }
    }
    return null;
  }

  const uid = parseInt(req?.session?.userId || req?.session?.user?.id || 0, 10) || 1;
  const fid = parseInt(req?.session?.facilityId || 1, 10) || 1;
  const unit = parseFloat(rx.unit_price || 0) || 0;
  const tpd = parseInt(rx.times_per_day, 10) || 1;
  const days = parseInt(rx.duration_days, 10) || 1;
  const desc = `${rx.drug_name || 'Medication'} — ${tpd}×/d × ${days}d @ ${unit} FCFA/dose`;
  const clinical = JSON.stringify({
    drug_type: rx.drug_type || 'tablet',
    dosage: rx.dosage || '',
    route: rx.route || 'oral',
    frequency_label: rx.frequency_label || 'TDS',
    times_per_day: tpd,
    duration_days: days,
    unit_price: unit,
    treatment_start: rx.treatment_start || null,
    notes: rx.notes || '',
  });

  if (existing && existing.id) {
    await pool
      .query('UPDATE tbl_ipd_charge SET amount=?, description=?, clinical_detail=? WHERE id=?', [
        amount,
        desc,
        clinical,
        existing.id,
      ])
      .catch(() => {});
    const delta = amount - oldAmt;
    if (delta !== 0) {
      await pool
        .query('UPDATE tbl_admission SET running_bill = COALESCE(running_bill,0) + ? WHERE id=?', [delta, aid])
        .catch(() => {});
    }
    return existing.id;
  }

  const [ins] = await pool
    .query(
      `INSERT INTO tbl_ipd_charge
        (facility_id, admission_id, patient_id, charge_type, description, amount, added_by, source_module, source_pk, clinical_detail)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [fid, aid, pid, 'medication', desc, amount, uid, 'ipd_prescription', rid, clinical]
    )
    .catch(() => [null]);
  const chargeId = ins && ins.insertId ? ins.insertId : null;
  if (chargeId) {
    await pool
      .query('UPDATE tbl_admission SET running_bill = COALESCE(running_bill,0) + ? WHERE id=?', [amount, aid])
      .catch(() => {});
  }
  return chargeId;
}

async function removeIpdPrescriptionCharge(pool, rx) {
  if (!rx || !rx.id || !rx.admission_id) return;
  const rid = parseInt(rx.id, 10) || 0;
  const aid = parseInt(rx.admission_id, 10) || 0;
  const [[existing]] = await pool
    .query(
      `SELECT id, amount FROM tbl_ipd_charge
        WHERE source_module='ipd_prescription' AND source_pk=? LIMIT 1`,
      [rid]
    )
    .catch(() => [[null]]);
  if (!existing || !existing.id) return;
  const oldAmt = parseFloat(existing.amount || 0) || 0;
  await pool.query('DELETE FROM tbl_ipd_charge WHERE id=?', [existing.id]).catch(() => {});
  if (oldAmt > 0) {
    await pool
      .query('UPDATE tbl_admission SET running_bill = GREATEST(0, COALESCE(running_bill,0) - ?) WHERE id=?', [
        oldAmt,
        aid,
      ])
      .catch(() => {});
  }
}

async function ipdPrescriptionHasUpfrontCharge(pool, prescriptionId) {
  const rid = parseInt(prescriptionId, 10) || 0;
  if (rid < 1) return false;
  const [[row]] = await pool
    .query(
      `SELECT id FROM tbl_ipd_charge
        WHERE source_module='ipd_prescription' AND source_pk=? LIMIT 1`,
      [rid]
    )
    .catch(() => [[null]]);
  return !!(row && row.id);
}

module.exports = {
  syncIpdPrescriptionCharge,
  removeIpdPrescriptionCharge,
  ipdPrescriptionHasUpfrontCharge,
};
