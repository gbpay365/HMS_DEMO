'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [[pay]] = await pool.query(
    'SELECT COALESCE(SUM(gross_salary),0) AS total, COUNT(*) AS cnt FROM tbl_hms_payroll_record WHERE year=2026 AND month=6'
  );
  console.log('Payroll Jun 2026 (tbl_hms_payroll_record):', pay);
  const [dept] = await pool.query(
    `SELECT COALESCE(NULLIF(TRIM(e.primary_department), ''), 'General') AS dept,
            SUM(pr.gross_salary) AS amt, COUNT(*) AS cnt
       FROM tbl_hms_payroll_record pr
       JOIN tbl_employee e ON e.id = pr.employee_id
      WHERE pr.year = 2026 AND pr.month = 6
      GROUP BY dept ORDER BY amt DESC`
  );
  console.log('By department:', dept);
  try {
    const [[exp]] = await pool.query(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount_xaf),0) AS total
         FROM tbl_expense WHERE expense_date BETWEEN '2026-06-01' AND '2026-06-30'`
    );
    console.log('Expenses Jun 2026 (tbl_expense):', exp);
  } catch (e) {
    console.log('tbl_expense:', e.message);
  }
  await pool.end();
}

main().catch(console.error);
