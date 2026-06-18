const mysql = require('mysql2/promise');
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'hms_db'
};

async function run() {
  const pool = mysql.createPool(dbConfig);
  try {
    console.log('Adding columns to tbl_insurance_carrier...');
    try {
      await pool.query('ALTER TABLE tbl_insurance_carrier ADD COLUMN api_endpoint VARCHAR(500) NULL');
      console.log('Added api_endpoint');
    } catch(e) { console.log('api_endpoint already exists or error:', e.message); }

    try {
      await pool.query('ALTER TABLE tbl_insurance_carrier ADD COLUMN api_key_hint VARCHAR(200) NULL');
      console.log('Added api_key_hint');
    } catch(e) { console.log('api_key_hint already exists or error:', e.message); }

    console.log('Ensuring tbl_patient_insurance exists...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_patient_insurance (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        patient_id INT UNSIGNED NOT NULL,
        carrier_id INT UNSIGNED NOT NULL,
        policy_number VARCHAR(120) NULL,
        insurance_id_external VARCHAR(120) NULL,
        insurer_covered_percent TINYINT UNSIGNED NOT NULL DEFAULT 0,
        is_primary TINYINT(1) NOT NULL DEFAULT 1,
        effective_from DATE NULL,
        effective_to DATE NULL,
        api_source VARCHAR(100) NULL,
        api_last_fetched DATETIME NULL,
        notes TEXT NULL,
        created_by INT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pi_patient (patient_id),
        INDEX idx_pi_carrier (carrier_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Migration complete.');
  } catch(e) {
    console.error('Migration failed:', e);
  } finally {
    await pool.end();
  }
}

run();
