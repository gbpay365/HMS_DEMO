/** Client-side vital row normalization (matches lib/normalizeVitalSignRow.js). */
export function normalizeVitalRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: raw.id,
    bpSys: raw.bp_systolic ?? raw.bp_sys ?? '',
    bpDia: raw.bp_diastolic ?? raw.bp_dia ?? '',
    pulse: raw.pulse ?? raw.heart_rate ?? '',
    temp: raw.temp_celsius ?? raw.temp_c ?? raw.temperature ?? '',
    spo2: raw.spo2 ?? '',
    rr: raw.respiratory_rate ?? raw.rr ?? '',
    weight: raw.weight_kg ?? raw.weight ?? '',
    height: raw.height_cm ?? raw.height ?? '',
    recordedAt: raw.recorded_at ?? raw.created_at ?? null,
    recordedByName: raw.recorded_by_name || '',
    sourceStation: raw.source_station || '',
    doctorSignedAt: raw.doctor_signed_at || null,
    doctorSignedByName: raw.doctor_signed_by_name || ''};
}

export function formatBp(v) {
  const sys = v?.bpSys != null && String(v.bpSys).trim() !== '' ? v.bpSys : null;
  const dia = v?.bpDia != null && String(v.bpDia).trim() !== '' ? v.bpDia : null;
  if (sys != null && dia != null) return `${sys}/${dia}`;
  if (sys != null) return String(sys);
  if (dia != null) return String(dia);
  return '—';
}

export function displayVital(value) {
  if (value == null || value === '') return '—';
  return String(value);
}
