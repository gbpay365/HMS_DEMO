export function splitClinicalPipe(value) {
  return String(value || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function clinicalListMatches(selected, pipeValue) {
  const want = String(selected || '').trim().toLowerCase();
  if (!want) return true;
  return splitClinicalPipe(pipeValue).some((label) => String(label || '').trim().toLowerCase() === want);
}

export async function fetchBookingSlots(date, doctorId) {
  const qs = new URLSearchParams({ date, doctor_id: doctorId || '' });
  const res = await fetch(`/portal/api/booking/slots?${qs.toString()}`, { credentials: 'same-origin' });
  const data = await res.json();
  if (!data.ok) throw new Error(data.message || 'Could not load slots');
  return data;
}

export async function validateBookingPaymentCode(code, excludeAppointmentId) {
  const qs = new URLSearchParams({ code });
  if (excludeAppointmentId) qs.set('exclude_appointment_id', String(excludeAppointmentId));
  const res = await fetch(`/portal/api/booking/validate-payment?${qs.toString()}`, { credentials: 'same-origin' });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Invalid payment code');
  return data;
}
