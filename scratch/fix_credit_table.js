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
    console.log('Fixing tbl_credit_account schema...');
    
    // Add outstanding_balance
    try {
      await pool.query('ALTER TABLE tbl_credit_account ADD COLUMN outstanding_balance DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER status');
      console.log('Added outstanding_balance');
    } catch(e) { console.log('outstanding_balance check:', e.message); }

    // Add created_by
    try {
      await pool.query('ALTER TABLE tbl_credit_account ADD COLUMN created_by INT UNSIGNED NULL AFTER notes');
      console.log('Added created_by');
    } catch(e) { console.log('created_by check:', e.message); }

    // Add created_at (or ensure it exists)
    try {
      await pool.query('ALTER TABLE tbl_credit_account ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by');
      console.log('Added created_at');
    } catch(e) { console.log('created_at check:', e.message); }

    console.log('Schema alignment complete.');
  } catch(e) {
    console.error('Migration failed:', e);
  } finally {
    await pool.end();
  }
}

run();
