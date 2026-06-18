require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
    waitForConnections: true
  });
  const conn = await pool.getConnection();
  try {
    const [fks] = await conn.query(
      "SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME " +
      "FROM information_schema.KEY_COLUMN_USAGE " +
      "WHERE REFERENCED_TABLE_SCHEMA = DATABASE() " +
      "  AND REFERENCED_TABLE_NAME = 'tbl_patient' " +
      "ORDER BY TABLE_NAME"
    );
    console.log('=== FK constraints pointing at tbl_patient ===');
    if (!fks.length) console.log('  (none)');
    fks.forEach(r => console.log(' ', r.TABLE_NAME, '|', r.COLUMN_NAME, '|', r.CONSTRAINT_NAME));

    const [cols] = await conn.query(
      "SELECT TABLE_NAME FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'patient_id' " +
      "ORDER BY TABLE_NAME"
    );
    console.log('\n=== All tables with a patient_id column ===');
    cols.forEach(r => console.log(' ', r.TABLE_NAME));
  } finally {
    conn.release();
    pool.end();
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
