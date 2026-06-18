import { formatDate, formatMoney } from './listUi';

/** Normalize cashier prescription payload for print UI (handles legacy + current API shapes). */
export function normalizeDoctorPrescription(raw = {}) {
  const d = raw || {};
  const sections = d.sections || {};
  const patient = d.patient || {};

  const laboratory = d.laboratory || d.lab || sections.laboratory?.items || [];
  const radiology = d.radiology || d.rad || sections.radiology?.items || [];
  const pharmacy = d.pharmacy || d.pha || d.meds || sections.pharmacy?.items || [];

  const codes = {
    laboratory: d.codes?.laboratory || sections.laboratory?.code || null,
    radiology: d.codes?.radiology || sections.radiology?.code || null,
    pharmacy: d.codes?.pharmacy || sections.pharmacy?.code || null};

  const doctorName =
    d.doctor_name ||
    d.referral_to ||
    d.doctor?.name ||
    (d.doctor?.first_name ? `Dr. ${d.doctor.first_name} ${d.doctor.last_name || ''}`.trim() : null) ||
    '—';

  const totalAmount =
    Number(d.total_amount) ||
    [...laboratory, ...radiology, ...pharmacy].reduce(
      (sum, it) => sum + (Number(it.unit_price) || 0) * (Number(it.quantity) || 1),
      0
    );

  return {
    consultation_id: d.consultation_id,
    consult_at: d.consult_at,
    chief_complaint: d.chief_complaint || '',
    notes: d.notes || '',
    diagnosis_code: d.diagnosis_code || '',
    patient: {
      name: patient.name || `${patient.first_name || ''} ${patient.last_name || ''}`.trim(),
      first_name: patient.first_name || '',
      last_name: patient.last_name || '',
      phone: patient.phone || '',
      gender: patient.gender || '',
      dob: patient.dob,
      age_years: patient.age_years},
    doctor_name: doctorName,
    doctor_department: d.doctor?.department || d.doctor_department || '',
    doctor_qualification: d.doctor?.qualification || d.doctor_qualification || '',
    codes,
    sections: [
      { key: 'laboratory', title: 'Laboratory', code: codes.laboratory, items: laboratory },
      { key: 'radiology', title: 'Radiology', code: codes.radiology, items: radiology },
      { key: 'pharmacy', title: 'Pharmacy', code: codes.pharmacy, items: pharmacy },
    ],
    item_count: laboratory.length + radiology.length + pharmacy.length,
    total_amount: totalAmount,
    consult_date_label: d.consult_at ? formatDate(d.consult_at) : '—',
    total_label: formatMoney(totalAmount)};
}

export function prescriptionItemLabel(it) {
  return it.description || it.name || it.item_name || it.drug_name || String(it);
}

export function prescriptionItemTotal(it) {
  return (Number(it.unit_price) || 0) * (Number(it.quantity) || 1);
}
