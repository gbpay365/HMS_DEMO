'use strict';

const ensureFinJournal019 = require('./ensureFinJournal019');
const { JOURNAL_CODES } = require('./finAccountingConfig');

async function columnExists(pool, table, col) {
  try {
    if (pool.driver === 'postgres') {
      const [[r]] = await pool.query(
        `SELECT 1 AS ok FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
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

async function ensurePgBase(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_facility (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255),
      status SMALLINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(() => {});
  await pool.query(
    `INSERT INTO tbl_facility (id, name, status) VALUES (1, 'Default Facility', 1)
     ON CONFLICT (id) DO NOTHING`
  ).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_fin_journal_header (
      id SERIAL PRIMARY KEY,
      facility_id INTEGER NOT NULL DEFAULT 1,
      entry_date DATE NOT NULL,
      reference VARCHAR(64) NOT NULL DEFAULT '',
      narration VARCHAR(512) NOT NULL DEFAULT '',
      source_type VARCHAR(48) NOT NULL DEFAULT '',
      source_id INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (facility_id, source_type, source_id)
    )
  `).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_fin_journal_line (
      id SERIAL PRIMARY KEY,
      journal_id INTEGER NOT NULL REFERENCES tbl_fin_journal_header(id) ON DELETE CASCADE,
      account_code VARCHAR(32) NOT NULL DEFAULT '',
      account_label VARCHAR(160) NOT NULL DEFAULT '',
      debit DECIMAL(14,2) NOT NULL DEFAULT 0,
      credit DECIMAL(14,2) NOT NULL DEFAULT 0,
      account_id INTEGER,
      cost_center_id INTEGER,
      line_memo VARCHAR(255),
      tier_id INTEGER,
      tva_rate DECIMAL(8,4),
      tva_amount DECIMAL(14,2),
      letter_code VARCHAR(32)
    )
  `).catch(() => {});
}

async function ensureExtensionTables(pool) {
  const pg = pool.driver === 'postgres';

  if (pg) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_journal_code (
        id SERIAL PRIMARY KEY,
        facility_id INTEGER NOT NULL DEFAULT 1,
        code VARCHAR(8) NOT NULL,
        label VARCHAR(120) NOT NULL DEFAULT '',
        journal_type VARCHAR(8) NOT NULL DEFAULT 'OD',
        is_active SMALLINT NOT NULL DEFAULT 1,
        UNIQUE (facility_id, code)
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_journal_piece_seq (
        facility_id INTEGER NOT NULL,
        journal_code VARCHAR(8) NOT NULL,
        fiscal_year INTEGER NOT NULL,
        last_no INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (facility_id, journal_code, fiscal_year)
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_period_lock (
        id SERIAL PRIMARY KEY,
        facility_id INTEGER NOT NULL DEFAULT 1,
        lock_year INTEGER NOT NULL,
        lock_month INTEGER NOT NULL,
        locked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        locked_by INTEGER NOT NULL DEFAULT 0,
        reason VARCHAR(255) DEFAULT '',
        UNIQUE (facility_id, lock_year, lock_month)
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_journal_audit (
        id SERIAL PRIMARY KEY,
        journal_id INTEGER NOT NULL,
        facility_id INTEGER NOT NULL DEFAULT 1,
        action VARCHAR(32) NOT NULL,
        user_id INTEGER NOT NULL DEFAULT 0,
        detail_json TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_tier (
        id SERIAL PRIMARY KEY,
        facility_id INTEGER NOT NULL DEFAULT 1,
        tier_type VARCHAR(16) NOT NULL DEFAULT 'client',
        code VARCHAR(32) NOT NULL,
        name VARCHAR(255) NOT NULL DEFAULT '',
        gl_account_code VARCHAR(32) NOT NULL DEFAULT '411000',
        is_active SMALLINT NOT NULL DEFAULT 1,
        UNIQUE (facility_id, tier_type, code)
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_lettering (
        id SERIAL PRIMARY KEY,
        facility_id INTEGER NOT NULL DEFAULT 1,
        tier_id INTEGER NOT NULL,
        debit_line_id INTEGER,
        credit_line_id INTEGER,
        amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        letter_code VARCHAR(32) NOT NULL DEFAULT '',
        lettered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        lettered_by INTEGER NOT NULL DEFAULT 0
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_bank_statement_line (
        id SERIAL PRIMARY KEY,
        facility_id INTEGER NOT NULL DEFAULT 1,
        bank_account_code VARCHAR(32) NOT NULL DEFAULT '512000',
        stmt_date DATE NOT NULL,
        description VARCHAR(255) DEFAULT '',
        amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        reference VARCHAR(64) DEFAULT '',
        matched_journal_line_id INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_fiscal_year (
        id SERIAL PRIMARY KEY,
        facility_id INTEGER NOT NULL DEFAULT 1,
        fiscal_year INTEGER NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'open',
        closed_at TIMESTAMP,
        closed_by INTEGER,
        UNIQUE (facility_id, fiscal_year)
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_recurring_entry (
        id SERIAL PRIMARY KEY,
        facility_id INTEGER NOT NULL DEFAULT 1,
        label VARCHAR(120) NOT NULL,
        journal_code VARCHAR(8) NOT NULL DEFAULT 'OD',
        frequency VARCHAR(16) NOT NULL DEFAULT 'monthly',
        next_run_date DATE,
        lines_json TEXT NOT NULL,
        is_active SMALLINT NOT NULL DEFAULT 1,
        created_by INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_posting_template (
        id SERIAL PRIMARY KEY,
        facility_id INTEGER NOT NULL DEFAULT 1,
        source_key VARCHAR(64) NOT NULL,
        debit_account VARCHAR(32) NOT NULL,
        credit_account VARCHAR(32) NOT NULL,
        apply_tva SMALLINT NOT NULL DEFAULT 0,
        UNIQUE (facility_id, source_key)
      )
    `).catch(() => {});
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_journal_code (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT NOT NULL DEFAULT 1,
        code VARCHAR(8) NOT NULL,
        label VARCHAR(120) NOT NULL DEFAULT '',
        journal_type VARCHAR(8) NOT NULL DEFAULT 'OD',
        is_active TINYINT NOT NULL DEFAULT 1,
        UNIQUE KEY uq_fin_jcode (facility_id, code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_journal_piece_seq (
        facility_id INT NOT NULL,
        journal_code VARCHAR(8) NOT NULL,
        fiscal_year INT NOT NULL,
        last_no INT NOT NULL DEFAULT 0,
        PRIMARY KEY (facility_id, journal_code, fiscal_year)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_period_lock (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT NOT NULL DEFAULT 1,
        lock_year INT NOT NULL,
        lock_month INT NOT NULL,
        locked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        locked_by INT NOT NULL DEFAULT 0,
        reason VARCHAR(255) DEFAULT '',
        UNIQUE KEY uq_fin_period (facility_id, lock_year, lock_month)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_journal_audit (
        id INT AUTO_INCREMENT PRIMARY KEY,
        journal_id INT NOT NULL,
        facility_id INT NOT NULL DEFAULT 1,
        action VARCHAR(32) NOT NULL,
        user_id INT NOT NULL DEFAULT 0,
        detail_json TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_fin_audit_j (journal_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_tier (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT NOT NULL DEFAULT 1,
        tier_type VARCHAR(16) NOT NULL DEFAULT 'client',
        code VARCHAR(32) NOT NULL,
        name VARCHAR(255) NOT NULL DEFAULT '',
        gl_account_code VARCHAR(32) NOT NULL DEFAULT '411000',
        is_active TINYINT NOT NULL DEFAULT 1,
        UNIQUE KEY uq_fin_tier (facility_id, tier_type, code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_lettering (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT NOT NULL DEFAULT 1,
        tier_id INT NOT NULL,
        debit_line_id INT NULL,
        credit_line_id INT NULL,
        amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        letter_code VARCHAR(32) NOT NULL DEFAULT '',
        lettered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        lettered_by INT NOT NULL DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_bank_statement_line (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT NOT NULL DEFAULT 1,
        bank_account_code VARCHAR(32) NOT NULL DEFAULT '512000',
        stmt_date DATE NOT NULL,
        description VARCHAR(255) DEFAULT '',
        amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        reference VARCHAR(64) DEFAULT '',
        matched_journal_line_id INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_fiscal_year (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT NOT NULL DEFAULT 1,
        fiscal_year INT NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'open',
        closed_at TIMESTAMP NULL,
        closed_by INT NULL,
        UNIQUE KEY uq_fin_fy (facility_id, fiscal_year)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_recurring_entry (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT NOT NULL DEFAULT 1,
        label VARCHAR(120) NOT NULL,
        journal_code VARCHAR(8) NOT NULL DEFAULT 'OD',
        frequency VARCHAR(16) NOT NULL DEFAULT 'monthly',
        next_run_date DATE NULL,
        lines_json TEXT NOT NULL,
        is_active TINYINT NOT NULL DEFAULT 1,
        created_by INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_posting_template (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT NOT NULL DEFAULT 1,
        source_key VARCHAR(64) NOT NULL,
        debit_account VARCHAR(32) NOT NULL,
        credit_account VARCHAR(32) NOT NULL,
        apply_tva TINYINT NOT NULL DEFAULT 0,
        UNIQUE KEY uq_fin_ptpl (facility_id, source_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(() => {});
  }
}

async function ensureHeaderColumns(pool) {
  const cols = [
    ['journal_code', pool.driver === 'postgres' ? "VARCHAR(8) NOT NULL DEFAULT 'OD'" : "VARCHAR(8) NOT NULL DEFAULT 'OD'"],
    ['piece_number', pool.driver === 'postgres' ? 'VARCHAR(32) NOT NULL DEFAULT \'\'' : "VARCHAR(32) NOT NULL DEFAULT ''"],
    ['status', pool.driver === 'postgres' ? "VARCHAR(16) NOT NULL DEFAULT 'posted'" : "VARCHAR(16) NOT NULL DEFAULT 'posted'"],
    ['reversal_of_id', pool.driver === 'postgres' ? 'INTEGER' : 'INT NULL'],
    ['reversed_by_id', pool.driver === 'postgres' ? 'INTEGER' : 'INT NULL'],
    ['posted_at', pool.driver === 'postgres' ? 'TIMESTAMP' : 'TIMESTAMP NULL'],
    ['posted_by', pool.driver === 'postgres' ? 'INTEGER' : 'INT NULL'],
  ];
  for (const [col, def] of cols) {
    await addColumn(pool, 'tbl_fin_journal_header', col, def);
  }

  const lineCols = [
    ['tier_id', pool.driver === 'postgres' ? 'INTEGER' : 'INT NULL'],
    ['tva_rate', pool.driver === 'postgres' ? 'DECIMAL(8,4)' : 'DECIMAL(8,4) NULL'],
    ['tva_amount', pool.driver === 'postgres' ? 'DECIMAL(14,2)' : 'DECIMAL(14,2) NULL'],
    ['letter_code', pool.driver === 'postgres' ? 'VARCHAR(32)' : 'VARCHAR(32) NULL'],
  ];
  for (const [col, def] of lineCols) {
    await addColumn(pool, 'tbl_fin_journal_line', col, def);
  }
}

async function seedJournalCodes(pool, facilityId = 1) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  for (const j of Object.values(JOURNAL_CODES)) {
    if (pool.driver === 'postgres') {
      await pool.query(
        `INSERT INTO tbl_fin_journal_code (facility_id, code, label, journal_type, is_active)
         VALUES ($1, $2, $3, $4, 1)
         ON CONFLICT (facility_id, code) DO UPDATE SET label = EXCLUDED.label, journal_type = EXCLUDED.journal_type`,
        [fid, j.code, j.label, j.type]
      ).catch(() => {});
    } else {
      await pool.query(
        `INSERT INTO tbl_fin_journal_code (facility_id, code, label, journal_type, is_active)
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE label = VALUES(label), journal_type = VALUES(journal_type)`,
        [fid, j.code, j.label, j.type]
      ).catch(() => {});
    }
  }
}

async function ensureFinAccountingSchema(pool, options = {}) {
  if (!pool || !pool.query) return;
  if (pool.driver === 'postgres') {
    await ensurePgBase(pool);
  } else {
    await ensureFinJournal019(pool, options);
  }
  await ensureExtensionTables(pool);
  await ensureHeaderColumns(pool);
  if (options.seedJournalCodes !== false) {
    await seedJournalCodes(pool, options.facilityId || 1);
  }
  await backfillJournalHeaders(pool).catch(() => {});
}

async function backfillJournalHeaders(pool) {
  await pool.query(
    `UPDATE tbl_fin_journal_header SET status = 'posted'
     WHERE status IS NULL OR TRIM(status) = ''`
  ).catch(() => {});
  await pool.query(
    `UPDATE tbl_fin_journal_header SET journal_code = 'VTE'
     WHERE source_type IN ('billing_receipt','credit_payment')
       AND (journal_code IS NULL OR TRIM(journal_code) = '' OR journal_code = 'OD')`
  ).catch(() => {});
  await pool.query(
    `UPDATE tbl_fin_journal_header SET journal_code = 'ACH'
     WHERE source_type = 'expense'
       AND (journal_code IS NULL OR TRIM(journal_code) = '' OR journal_code = 'OD')`
  ).catch(() => {});
  await pool.query(
    `UPDATE tbl_fin_journal_header SET journal_code = 'OD'
     WHERE source_type = 'manual_import'
       AND (journal_code IS NULL OR TRIM(journal_code) = '')`
  ).catch(() => {});
}

module.exports = ensureFinAccountingSchema;
