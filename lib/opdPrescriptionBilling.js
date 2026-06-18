'use strict';

const { prescriptionDoseTotal } = require('./prescriptionPricing');

/**
 * Keep tbl_opd_order_item (pending pharmacy lines) in sync with an OPD prescription.
 * Bill = unit_price × times_per_day × duration_days (quantity = total doses).
 */
async function syncOpdPrescriptionBill(pool, req, rx) {
  if (!rx || !rx.id || !rx.opd_visit_id) return null;
  const rid = parseInt(rx.id, 10) || 0;
  const vid = parseInt(rx.opd_visit_id, 10) || 0;
  const pid = parseInt(rx.patient_id, 10) || 0;
  if (rid < 1 || vid < 1) return null;

  const unit = parseFloat(rx.unit_price || 0) || 0;
  const tpd = Math.max(1, parseInt(rx.times_per_day, 10) || 1);
  const days = Math.max(1, parseInt(rx.duration_days, 10) || 1);
  const qty = tpd * days;
  const lineTotal = prescriptionDoseTotal(unit, tpd, days);

  const [[existing]] = await pool
    .query(
      `SELECT id, unit_price, quantity FROM tbl_opd_order_item
        WHERE source_module='opd_prescription' AND source_pk=? AND status='pending' LIMIT 1`,
      [rid]
    )
    .catch(() => [[null]]);

  if (lineTotal <= 0 && unit <= 0) {
    if (existing && existing.id) {
      await pool.query('DELETE FROM tbl_opd_order_item WHERE id=?', [existing.id]).catch(() => {});
    }
    return null;
  }

  const uid = parseInt(req?.session?.userId || req?.session?.user?.id || 0, 10) || 1;
  const fid = parseInt(req?.session?.facilityId || 1, 10) || 1;
  const drugName = String(rx.drug_name || 'Medication').slice(0, 255);

  if (existing && existing.id) {
    await pool
      .query(
        `UPDATE tbl_opd_order_item
            SET item_name=?, unit_price=?, quantity=?, opd_visit_id=?, patient_id=?
          WHERE id=? AND status='pending'`,
        [drugName, unit, qty, vid, pid, existing.id]
      )
      .catch(() => {});
    return existing.id;
  }

  const [ins] = await pool
    .query(
      `INSERT INTO tbl_opd_order_item
        (facility_id, patient_id, opd_visit_id, consultation_id, item_type, catalog_id,
         item_name, unit_price, quantity, status, source_module, source_pk, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?,?,NOW())`,
      [fid, pid, vid, null, 'pharmacy', null, drugName, unit, qty, 'opd_prescription', rid, uid]
    )
    .catch(() => [null]);
  return ins && ins.insertId ? ins.insertId : null;
}

async function removeOpdPrescriptionBill(pool, rx) {
  if (!rx || !rx.id) return;
  const rid = parseInt(rx.id, 10) || 0;
  if (rid < 1) return;
  await pool
    .query(
      `DELETE FROM tbl_opd_order_item
        WHERE source_module='opd_prescription' AND source_pk=? AND status='pending'`,
      [rid]
    )
    .catch(() => {});
}

module.exports = {
  syncOpdPrescriptionBill,
  removeOpdPrescriptionBill,
};
