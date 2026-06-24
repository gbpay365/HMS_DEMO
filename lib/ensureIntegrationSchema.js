'use strict';

async function columnExists(pool, table, col) {
  try {
    if (pool?.driver === 'postgres') {
      const [[r]] = await pool.query(
        `SELECT 1 AS ok FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2 LIMIT 1`,
        [table, col]
      );
      return !!(r && r.ok);
    }
    const [[r]] = await pool.query(
      `SELECT 1 AS ok FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, col]
    );
    return !!(r && r.ok);
  } catch (_) {
    return false;
  }
}

async function addColumn(pool, table, col, def) {
  if (await columnExists(pool, table, col)) return;
  try {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  } catch (_) {
    /* ignore */
  }
}

async function ensureIntegrationSchema(pool) {
  const pg = pool?.driver === 'postgres';

  if (pg) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_integration_outbox (
        id BIGSERIAL PRIMARY KEY,
        direction VARCHAR(16) NOT NULL DEFAULT 'outbound',
        event_type VARCHAR(64) NOT NULL,
        payload_json TEXT NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT NULL,
        next_retry_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP NULL
      )
    `).catch(() => {});
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_integration_entity_link (
        id BIGSERIAL PRIMARY KEY,
        facility_id INTEGER NOT NULL DEFAULT 1,
        source_system VARCHAR(32) NOT NULL DEFAULT 'ACCOUNT_CORE',
        entity_type VARCHAR(64) NOT NULL,
        external_id VARCHAR(128) NOT NULL,
        internal_id VARCHAR(128) NOT NULL,
        metadata_json TEXT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (facility_id, source_system, entity_type, external_id)
      )
    `).catch(() => {});
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_integration_outbox (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        direction VARCHAR(16) NOT NULL DEFAULT 'outbound',
        event_type VARCHAR(64) NOT NULL,
        payload_json LONGTEXT NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        attempts INT NOT NULL DEFAULT 0,
        last_error TEXT NULL,
        next_retry_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sent_at DATETIME NULL,
        KEY idx_status_retry (status, next_retry_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_integration_entity_link (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT NOT NULL DEFAULT 1,
        source_system VARCHAR(32) NOT NULL DEFAULT 'ACCOUNT_CORE',
        entity_type VARCHAR(64) NOT NULL,
        external_id VARCHAR(128) NOT NULL,
        internal_id VARCHAR(128) NOT NULL,
        metadata_json LONGTEXT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_link (facility_id, source_system, entity_type, external_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }

  await addColumn(pool, 'tbl_employee', 'external_core_sync_status', pg ? 'VARCHAR(16)' : 'VARCHAR(16) NULL');
  await addColumn(pool, 'tbl_employee', 'external_core_employee_id', pg ? 'VARCHAR(64)' : 'VARCHAR(64) NULL');
  await addColumn(pool, 'tbl_employee', 'external_core_sync_at', pg ? 'TIMESTAMP' : 'DATETIME NULL');
  await addColumn(pool, 'tbl_purchase_order', 'external_core_sync_status', pg ? 'VARCHAR(16)' : 'VARCHAR(16) NULL');
  await addColumn(pool, 'tbl_purchase_order', 'external_core_sync_at', pg ? 'TIMESTAMP' : 'DATETIME NULL');
  await addColumn(pool, 'tbl_fin_journal_header', 'external_core_sync_status', pg ? 'VARCHAR(16)' : 'VARCHAR(16) NULL');
  await addColumn(pool, 'tbl_fin_journal_header', 'external_core_sync_at', pg ? 'TIMESTAMP' : 'DATETIME NULL');
}

module.exports = { ensureIntegrationSchema };
