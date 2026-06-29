'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  });
  const [[today]] = await pool.query(
    `SELECT COALESCE(SUM(total_amount),0) AS t FROM tbl_payment_ticket
      WHERE LOWER(TRIM(COALESCE(status,'')))='paid'
        AND DATE(COALESCE(paid_at,created_at))=CURDATE()`
  );
  const [[month]] = await pool.query(
    `SELECT COALESCE(SUM(total_amount),0) AS t FROM tbl_payment_ticket
      WHERE LOWER(TRIM(COALESCE(status,'')))='paid'
        AND DATE(COALESCE(paid_at,created_at)) BETWEEN DATE_FORMAT(CURDATE(),'%Y-%m-01') AND LAST_DAY(CURDATE())`
  );
  const [byPaidBy] = await pool.query(
    `SELECT paid_by, COUNT(*) c, SUM(total_amount) s FROM tbl_payment_ticket
      WHERE LOWER(TRIM(COALESCE(status,'')))='paid' AND DATE(paid_at)=CURDATE()
      GROUP BY paid_by`
  );
  const { fetchCashierReports } = require('../lib/cashierReports');
  const all = await fetchCashierReports(pool, { periodKey: 'this_month', scope: { allCashiers: true, paidBy: 0 } });
  const scoped = await fetchCashierReports(pool, { periodKey: 'this_month', scope: { allCashiers: false, paidBy: 11 } });
  console.log('today all', today);
  console.log('month all', month);
  console.log('by paid_by today', byPaidBy);
  console.log('reports allCashiers revenue', all.kpi?.total_revenue_net);
  console.log('reports scoped paidBy=11 revenue', scoped.kpi?.total_revenue_net);
  const [dailyRows] = await pool.query(
    `SELECT DATE(paid_at) d, SUM(total_amount) t FROM tbl_payment_ticket
      WHERE status='paid' AND paid_at IS NOT NULL
        AND paid_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY DATE(paid_at) ORDER BY d`
  );
  console.log('daily sql rows', dailyRows);
  console.log('all.daily sample', all.daily_revenue?.slice(-5));
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
