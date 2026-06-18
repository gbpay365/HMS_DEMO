'use strict';

/**
 * When staff uses "Add Charge" (IPD running bill or Emergency visit) and picks
 * Laboratory / Radiology / Pharmacy, enqueue a clinical dept alert so lab/rad/pharm
 * see the same inbox + banners as consultation orders.
 *
 * Other charge sections (consultation, service, ward, misc) are ignored.
 */

const clinicalDeptAlerts = require('./clinicalDeptAlerts');

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} input
 * @param {string} [input.charge_type]
 * @param {string} [input.description]
 * @param {number} [input.facility_id]
 * @param {'er'|'ipd'} input.context
 * @param {string} [input.doctor_display]
 * @param {string} [input.patient_display]
 * @param {string} [input.ward_display]
 * @param {string} [input.bed_display]
 * @param {number} [input.patient_id]
 * @param {number|null} [input.opd_visit_id]
 * @param {number|null} [input.admission_id]
 * @param {number|null} [input.created_by]
 */
async function enqueueClinicalAlertFromCharge(pool, input) {
  const ct = String(input.charge_type || '').toLowerCase().trim();
  let targetDept = null;
  if (ct === 'laboratory') targetDept = 'laboratory';
  else if (ct === 'radiology') targetDept = 'radiology';
  else if (ct === 'pharmacy') targetDept = 'pharmacy';
  if (!targetDept) return;

  const desc = String(input.description || '').trim();
  if (!desc) return;

  await clinicalDeptAlerts.enqueueAlert(pool, {
    facility_id: input.facility_id != null ? Number(input.facility_id) || 1 : 1,
    target_dept: targetDept,
    context: input.context || null,
    doctor_display: input.doctor_display || 'Doctor',
    patient_display: input.patient_display || null,
    ward_display: input.ward_display || null,
    bed_display: input.bed_display || null,
    test_display: desc.slice(0, 600),
    patient_id: input.patient_id || null,
    opd_visit_id: input.opd_visit_id || null,
    admission_id: input.admission_id || null,
    consultation_id: null,
    opd_order_item_id: null,
    created_by: input.created_by || null,
  });
}

module.exports = { enqueueClinicalAlertFromCharge };
