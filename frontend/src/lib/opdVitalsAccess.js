import { hasPerm } from './listUi';

/** True when visit has a usable payment code (or emergency bypass). */
export function opdVisitPaymentValidForVitals(visit) {
  if (!visit) return false;
  const isEmerg =
    visit.is_emergency == 1 || visit.is_emergency === true || String(visit.is_emergency) === '1';
  if (isEmerg) return true;
  return !!(visit.payment_code && !visit.payment_code_blood_red);
}

/** Doctors must not record vitals; nurses / front desk with triage permission may. */
export function staffMayRecordOpdVitals(userPerms = [], staffRole = '', aclTriageVisible = false) {
  const role = String(staffRole || '');
  if (role === '2' || role === '100') return false;
  const hasNursing =
    hasPerm(userPerms, ['nursing.write', 'nursing.read']) || userPerms.includes('nursing.write');
  const hasOpd = hasPerm(userPerms, ['opd.write']);
  const hasClinicalOnly =
    hasPerm(userPerms, ['clinical.write', 'prescription.write']) && !hasNursing && !hasOpd;
  if (hasClinicalOnly) return false;
  return aclTriageVisible || hasNursing || hasOpd;
}

/** After nurse submits vitals, card actions are read-only until doctor completes visit. */
export function nurseOpdCardLocked(visit, hasVitals, userPerms = [], staffRole = '') {
  if (!staffMayRecordOpdVitals(userPerms, staffRole)) return false;
  if (!hasVitals || !visit) return false;
  const qs = visit.queue_status || 'registered';
  return qs === 'waiting_doctor' || qs === 'in_consultation';
}
