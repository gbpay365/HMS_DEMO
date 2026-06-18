'use strict';

const DEFAULT_WARD_NAMES = [
  'Medical Ward',
  'Surgical Ward',
  'ICU Ward',
  'Emergency Ward',
  'Male Ward',
  'Female Ward',
  'Pediatric Ward',
  'Maternity Ward',
  'General Surgery Ward',
  'Cardiology Ward',
];

const NOT_DISCHARGED =
  "(a.discharged_at IS NULL OR a.discharged_at = '0000-00-00 00:00:00' OR a.discharged_at = '0000-00-00')";

function resolveWardFacilityId(req) {
  const u = (req && req.session && req.session.user) || {};
  const fid = u.facility_id ?? u.facilityId ?? (req.session && req.session.facilityId);
  const n = parseInt(fid, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function groupBedsByWard(beds) {
  const grouped = {};
  for (const b of beds || []) {
    const ward = String(b.ward_name || 'Unassigned Ward').trim() || 'Unassigned Ward';
    if (!grouped[ward]) grouped[ward] = [];
    grouped[ward].push(b);
  }
  return grouped;
}

function mergeWardNames(dbNames) {
  const set = new Set(DEFAULT_WARD_NAMES);
  for (const n of dbNames || []) {
    const s = String(n || '').trim();
    if (s) set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} facilityId
 */
async function loadWardBoard(pool, facilityId) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);

  await pool
    .query('UPDATE tbl_bed SET facility_id = ? WHERE facility_id IS NULL OR facility_id = 0', [fid])
    .catch(() => {});

  const sqlFull = `
    SELECT
      b.*,
      a.id AS admission_id,
      a.patient_id AS adm_patient_id,
      a.ipd_status,
      a.admitting_department,
      a.maternity_labor_id,
      a.running_bill,
      a.deposit_amount,
      a.clinical_discharged_at,
      a.discharged_at,
      lr.status AS maternity_labor_status,
      p.first_name,
      p.last_name
    FROM tbl_bed b
    LEFT JOIN tbl_admission a
      ON a.bed_id = b.id AND ${NOT_DISCHARGED}
    LEFT JOIN labor_records lr ON lr.id = a.maternity_labor_id
    LEFT JOIN tbl_patient p
      ON p.id = a.patient_id
    WHERE b.facility_id = ?
    ORDER BY b.ward_name, b.bed_label`;

  const sqlSimple = `
    SELECT
      b.*,
      NULL AS admission_id,
      NULL AS adm_patient_id,
      NULL AS ipd_status,
      NULL AS admitting_department,
      NULL AS running_bill,
      NULL AS deposit_amount,
      NULL AS clinical_discharged_at,
      NULL AS discharged_at,
      NULL AS first_name,
      NULL AS last_name
    FROM tbl_bed b
    WHERE b.facility_id = ?
    ORDER BY b.ward_name, b.bed_label`;

  let beds = [];
  let queryMode = 'full';
  try {
    const [rows] = await pool.query(sqlFull, [fid]);
    beds = rows;
  } catch (err) {
    console.error('WARDS beds query (full):', err.message);
    queryMode = 'simple';
    const [rows] = await pool.query(sqlSimple, [fid]);
    beds = rows;
  }

  const [wardRows] = await pool
    .query(
      'SELECT DISTINCT ward_name FROM tbl_bed WHERE facility_id = ? ORDER BY ward_name',
      [fid]
    )
    .catch(() => [[]]);

  const wardNames = mergeWardNames((wardRows || []).map((r) => r.ward_name));

  return {
    beds,
    grouped: groupBedsByWard(beds),
    wardNames,
    facilityId: fid,
    queryMode,
  };
}

module.exports = {
  DEFAULT_WARD_NAMES,
  NOT_DISCHARGED,
  resolveWardFacilityId,
  groupBedsByWard,
  mergeWardNames,
  loadWardBoard,
};
