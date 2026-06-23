'use strict';

async function findLink(pool, facilityId, sourceSystem, entityType, externalId) {
  const [[row]] = await pool
    .query(
      `SELECT * FROM tbl_integration_entity_link
        WHERE facility_id=? AND source_system=? AND entity_type=? AND external_id=?
        LIMIT 1`,
      [facilityId, sourceSystem, entityType, String(externalId)]
    )
    .catch(() => [[null]]);
  return row || null;
}

async function upsertLink(pool, facilityId, sourceSystem, entityType, externalId, internalId, metadata) {
  const meta = metadata ? JSON.stringify(metadata) : null;
  await pool.query(
    `INSERT INTO tbl_integration_entity_link
      (facility_id, source_system, entity_type, external_id, internal_id, metadata_json)
     VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE internal_id=VALUES(internal_id), metadata_json=VALUES(metadata_json), updated_at=NOW()`,
    [facilityId, sourceSystem, entityType, String(externalId), String(internalId), meta]
  );
}

module.exports = { findLink, upsertLink };
