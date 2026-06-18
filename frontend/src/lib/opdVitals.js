/** Match visit id against server visitIdsWithVitals (number/string safe). */
export function visitIdInVitalsList(visitIdsWithVitals, visitId) {
  const want = parseInt(String(visitId ?? ''), 10) || 0;
  if (!want) return false;
  return (visitIdsWithVitals || []).some((x) => (parseInt(String(x ?? ''), 10) || 0) === want);
}

/** Show Consult when vitals exist but queue status was not advanced (legacy saves). */
export function opdStatusAllowsConsult(queueStatus, hasVitals) {
  const qs = queueStatus || 'registered';
  if (qs === 'triage' || qs === 'waiting_doctor' || qs === 'in_consultation') return true;
  if (qs === 'registered' && hasVitals) return true;
  return false;
}
