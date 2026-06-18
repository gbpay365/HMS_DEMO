'use strict';

/**
 * Ensures tbl_facility has a row for FK constraints (e.g. tbl_inventory_category.facility_id).
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').Connection} db
 * @param {number|string|null|undefined} facilityId
 * @returns {Promise<number>} resolved facility id that exists in tbl_facility (>= 1)
 */
module.exports = async function ensureFacilityRow(db, facilityId) {
  const requested = Math.max(1, parseInt(String(facilityId != null ? facilityId : 1), 10) || 1);

  async function facilityExists(fid) {
    try {
      const [[row]] = await db.query('SELECT id FROM tbl_facility WHERE id = ? LIMIT 1', [fid]);
      return !!(row && row.id);
    } catch (e) {
      return false;
    }
  }

  async function firstActiveFacilityId() {
    try {
      const [[row]] = await db.query(
        'SELECT id FROM tbl_facility WHERE status = 1 ORDER BY id ASC LIMIT 1'
      );
      if (row && row.id) return parseInt(row.id, 10) || 1;
    } catch (e) {
      /* table may be missing on greenfield installs */
    }
    return 1;
  }

  if (await facilityExists(requested)) return requested;

  const code = requested === 1 ? 'MAIN' : `SITE${requested}`;
  let name = requested === 1 ? 'Main Facility' : `Facility ${requested}`;
  if (requested === 1) {
    try {
      const hmsBrand = require('./hmsBrand');
      if (hmsBrand && hmsBrand.orgName) name = String(hmsBrand.orgName).slice(0, 250);
    } catch (e) {
      /* optional */
    }
  }

  try {
    await db.query(
      `INSERT INTO tbl_facility (id, code, name, status)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE name = VALUES(name), status = VALUES(status)`,
      [requested, String(code).slice(0, 32), String(name).slice(0, 250)]
    );
  } catch (e) {
    try {
      await db.query(
        `INSERT INTO tbl_facility (id, code, name, timezone, status)
         VALUES (?, ?, ?, 'UTC', 1)
         ON DUPLICATE KEY UPDATE id = id`,
        [requested, String(code).slice(0, 32), String(name).slice(0, 250)]
      );
    } catch (e2) {
      try {
        await db
          .query(
            `
          CREATE TABLE IF NOT EXISTS tbl_facility (
           id INT PRIMARY KEY,
           name VARCHAR(255) NULL,
           status TINYINT DEFAULT 1,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
         `
          )
          .catch(() => {});
        await db.query('INSERT IGNORE INTO tbl_facility (id, name, status) VALUES (?, ?, 1)', [
          requested,
          String(name).slice(0, 255),
        ]);
      } catch (e3) {
        /* fall through to existence check */
      }
    }
  }

  if (await facilityExists(requested)) return requested;

  const fallback = await firstActiveFacilityId();
  if (await facilityExists(fallback)) return fallback;
  return 1;
};
