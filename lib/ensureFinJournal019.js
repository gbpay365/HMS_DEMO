/**
 * Ensures journal tables from PHP migration 019 exist (tbl_fin_journal_header / line).
 * Safe to call on every GL request; mirrors ensureHrPayrollSchema pattern.
 */
const { ensureFinJournalLineFkToHeader } = require('./ensureFinJournalLineFk');

async function ensureFinJournal019(pool, options = {}) {
 if (pool && pool.driver === 'postgres') return;
 const repairFk = options.repairFk === true;
 await pool.query(`
  CREATE TABLE IF NOT EXISTS tbl_facility (
   id INT PRIMARY KEY,
   name VARCHAR(255) NULL,
   status TINYINT DEFAULT 1,
   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
 `).catch(() => {});
 await pool.query('INSERT IGNORE INTO tbl_facility (id, name, status) VALUES (1, ?, 1)', ['Default Facility']).catch(() => {});

 await pool.query(`
  CREATE TABLE IF NOT EXISTS tbl_fin_journal_header (
   id INT NOT NULL AUTO_INCREMENT,
   facility_id INT NOT NULL,
   entry_date DATE NOT NULL,
   reference VARCHAR(64) NOT NULL DEFAULT '',
   narration VARCHAR(512) NOT NULL DEFAULT '',
   source_type VARCHAR(48) NOT NULL DEFAULT '' COMMENT 'credit_charge|credit_payment|receipt_sync|manual',
   source_id INT NOT NULL DEFAULT 0,
   created_by INT NOT NULL DEFAULT 0,
   created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY (id),
   UNIQUE KEY uq_fin_jrnl_src (facility_id, source_type, source_id),
   KEY idx_fin_jrnl_date (facility_id, entry_date),
   CONSTRAINT fk_fin_jh_fac FOREIGN KEY (facility_id) REFERENCES tbl_facility (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
 `).catch(() => {});

 await pool.query(`
  CREATE TABLE IF NOT EXISTS tbl_fin_journal_line (
   id INT NOT NULL AUTO_INCREMENT,
   journal_id INT NOT NULL,
   account_code VARCHAR(32) NOT NULL,
   account_label VARCHAR(160) NOT NULL DEFAULT '',
   debit DECIMAL(14,2) NOT NULL DEFAULT 0.00,
   credit DECIMAL(14,2) NOT NULL DEFAULT 0.00,
   PRIMARY KEY (id),
   KEY idx_fin_jl_j (journal_id),
   CONSTRAINT fk_fin_jl_j FOREIGN KEY (journal_id) REFERENCES tbl_fin_journal_header (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
 `).catch(() => {});

 try {
  await pool.query('ALTER TABLE tbl_fin_journal_line ADD COLUMN account_code VARCHAR(32) NOT NULL DEFAULT \'\'');
 } catch (e) {
  const m = String(e.message || '');
  if (!/Duplicate column/i.test(m) && e.errno !== 1060) {
   /* ignore */
  }
 }
 try {
  await pool.query('ALTER TABLE tbl_fin_journal_line ADD COLUMN account_label VARCHAR(160) NOT NULL DEFAULT \'\'');
 } catch (e) {
  const m = String(e.message || '');
  if (!/Duplicate column/i.test(m) && e.errno !== 1060) {
   /* ignore */
  }
 }

 const optionalCols = [
  ['account_id', 'INT NULL DEFAULT NULL'],
  ['cost_center_id', 'INT NULL DEFAULT NULL'],
  ['line_memo', 'VARCHAR(255) NULL DEFAULT NULL'],
 ];
 for (const [col, def] of optionalCols) {
  try {
   await pool.query(`ALTER TABLE tbl_fin_journal_line ADD COLUMN ${col} ${def}`);
  } catch (e) {
   if (!/Duplicate column/i.test(String(e.message || '')) && e.errno !== 1060) {
    /* ignore */
   }
  }
 }

 if (repairFk) {
  await ensureFinJournalLineFkToHeader(pool).catch(() => {});
 }
};

ensureFinJournal019.ensureFinJournalLineFkToHeader = ensureFinJournalLineFkToHeader;
module.exports = ensureFinJournal019;
