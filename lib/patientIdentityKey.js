'use strict';

const crypto = require('crypto');
const { normalizePatientPhone, isAgeOnlyPatient } = require('./patientAge');

function normalizeNamePart(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** @returns {string|null} YYYY-MM-DD when parseable */
function parseDobIso(dob) {
  if (dob == null || dob === '') return null;
  const s = String(dob).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const slash = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (slash) {
    return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function normalizeNamePart(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Birth segment for composite identity (DOB ISO or age-only marker).
 * @param {{ dob?: unknown, age_years?: unknown, age_only_registration?: unknown }} row
 */
function birthSegmentForRow(row) {
  if (!row) return '';
  if (isAgeOnlyPatient(row)) {
    const a = parseInt(row.age_years, 10);
    return Number.isFinite(a) ? `age:${a}` : 'age:';
  }
  const iso = parseDobIso(row.dob);
  return iso ? `dob:${iso}` : 'dob:';
}

/**
 * Stable composite key: first + last + phone + DOB/age (matches registration duplicate check).
 * @param {{ first_name?: string, last_name?: string, phone?: string, dob?: unknown, age_years?: unknown, age_only_registration?: unknown }} row
 */
function patientIdentityCompositeKey(row) {
  const fn = normalizeNamePart(row.first_name);
  const ln = normalizeNamePart(row.last_name);
  const phone = normalizePatientPhone(row.phone);
  if (!fn || !ln || !phone) return '';
  const birth = birthSegmentForRow(row);
  const raw = `${fn}|${ln}|${phone}|${birth}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 64);
}

/**
 * Group active patients by composite identity key.
 * @param {Array<object>} rows
 * @returns {Map<string, object[]>}
 */
function groupPatientsByIdentityKey(rows) {
  const groups = new Map();
  for (const r of rows || []) {
    const k = patientIdentityCompositeKey(r);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return groups;
}

module.exports = {
  normalizeNamePart,
  birthSegmentForRow,
  patientIdentityCompositeKey,
  groupPatientsByIdentityKey,
  parseDobIso,
};
