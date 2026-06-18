'use strict';

/** Map tbl_vital_sign row → display-friendly field names (all schema variants). */
function normalizeVitalSignRow(row) {
  if (!row || typeof row !== 'object') return row;
  const recordedAt = row.recorded_at ?? row.created_at ?? null;
  return {
    ...row,
    bp_systolic: row.bp_systolic ?? row.bp_sys ?? null,
    bp_diastolic: row.bp_diastolic ?? row.bp_dia ?? null,
    pulse: row.pulse ?? row.heart_rate ?? null,
    temp_celsius: row.temp_celsius ?? row.temp_c ?? row.temperature ?? null,
    respiratory_rate: row.respiratory_rate ?? row.rr ?? null,
    weight_kg: row.weight_kg ?? row.weight ?? null,
    height_cm: row.height_cm ?? row.height ?? null,
    recorded_at: recordedAt,
  };
}

function mapVitalSignRowsForDisplay(rows) {
  return (Array.isArray(rows) ? rows : []).map(normalizeVitalSignRow);
}

module.exports = { normalizeVitalSignRow, mapVitalSignRowsForDisplay };
