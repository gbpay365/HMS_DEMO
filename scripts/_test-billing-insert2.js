require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');
const { adaptQuery } = require('../lib/pgSqlAdapter');

(async () => {
  const pool = createDbPool();
  const sql = `INSERT INTO tbl_billing_document
     (facility_id, patient_id, doc_type, doc_number, invoice_doc_number, total_amount, payment_method,
      status, source_module, source_pk, created_by, created_at)
     VALUES (?, ?, 'receipt', ?, ?, ?, ?, 'paid', 'payment_ticket', ?, ?, NOW())`;
  const params = [1, 1, 'RCT-TEST-001', 'INV-TEST-001', 100, 'Cash', 99999, 1];
  const { text, values } = adaptQuery(sql, params);
  console.log('Adapted SQL:\n', text);
  console.log('Values:', values);
  try {
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      const r = await conn.query(sql, params);
      console.log('Result:', JSON.stringify(r));
      await conn.rollback();
    } catch (e) {
      console.error('Query error:', e.message);
      await conn.rollback().catch(() => {});
    }
    conn.release();
  } catch (e) {
    console.error('Outer:', e.message);
  }
  await pool.end?.();
})();
