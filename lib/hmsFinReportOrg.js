'use strict';

const hmsBrand = require('./hmsBrand');
const { getFinSetting } = require('./hmsFinSettings');

function facilityIdFromReq(req, res) {
  return (
    Math.max(
      1,
      parseInt(
        res.locals.facilityId ||
          req.session?.facilityId ||
          req.session?.user?.facility_id ||
          1,
        10
      ) || 1
    ) || 1
  );
}

async function loadFacilityRow(pool, facilityId) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  try {
    const [[row]] = await pool.query(
      'SELECT id, name, code FROM tbl_facility WHERE id=? LIMIT 1',
      [fid]
    );
    return row || null;
  } catch (_) {
    return null;
  }
}

/** Company / legal entity name on OHADA financial reports. */
async function resolveFinReportOrg(pool, facilityId) {
  const legal = String(await getFinSetting(pool, 'company.legal_name', '')).trim();
  if (legal) return legal;

  const row = await loadFacilityRow(pool, facilityId);
  const facName = row && String(row.name || '').trim();
  if (facName) return facName;

  return hmsBrand.orgName || hmsBrand.facilityName || 'ZAIZENS';
}

/** Operating entity / site label (branch within the company). */
async function resolveFinReportEntity(pool, facilityId) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const row = await loadFacilityRow(pool, facilityId);
  if (row) {
    const name = String(row.name || '').trim();
    const code = String(row.code || '').trim();
    if (name && code) return `${name} (${code})`;
    if (name) return name;
    if (code) return `Site ${code}`;
  }
  return `Facility #${fid}`;
}

async function attachFinReportOrgLocals(pool, req, res) {
  const fid = facilityIdFromReq(req, res);
  res.locals.finReportFacilityId = fid;
  res.locals.finReportOrgName = await resolveFinReportOrg(pool, fid);
  res.locals.finReportEntityLabel = await resolveFinReportEntity(pool, fid);
}

module.exports = {
  facilityIdFromReq,
  loadFacilityRow,
  resolveFinReportOrg,
  resolveFinReportEntity,
  attachFinReportOrgLocals,
};
