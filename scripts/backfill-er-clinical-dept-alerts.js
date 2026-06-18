#!/usr/bin/env node
'use strict';

/**
 * Backfill tbl_clinical_dept_alert from recent tbl_opd_order_item rows tied to
 * Emergency / A&E OPD visits (same rules as consultation + ER order alerts).
 *
 * Usage:
 *   node scripts/backfill-er-clinical-dept-alerts.js           # dry-run: count only
 *   node scripts/backfill-er-clinical-dept-alerts.js --execute # insert rows
 *   node scripts/backfill-er-clinical-dept-alerts.js --execute --days=180
 *
 * Requires .env with DB_* same as app.js (or pass MYSQL vars your pool uses).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const clinicalDeptAlerts = require('../lib/clinicalDeptAlerts');

function argDays() {
  const hit = process.argv.find((a) => /^--days=/.test(a));
  if (!hit) return 90;
  const n = parseInt(hit.split('=')[1], 10);
  return Number.isFinite(n) && n > 0 && n <= 3650 ? n : 90;
}

const EXECUTE = process.argv.includes('--execute');
const DAYS = argDays();

const insertSql = `
INSERT INTO tbl_clinical_dept_alert (
  facility_id, target_dept, context, doctor_display, patient_display,
  ward_display, bed_display, test_display,
  patient_id, opd_visit_id, admission_id, consultation_id, opd_order_item_id, created_by, created_at
)
SELECT
  COALESCE(oi.facility_id, v.facility_id, 1),
  CASE LOWER(TRIM(oi.item_type))
    WHEN 'radiology' THEN 'radiology'
    WHEN 'pharmacy' THEN 'pharmacy'
    ELSE 'laboratory'
  END,
  'er',
  CASE
    WHEN doc.id IS NULL THEN 'Doctor'
    ELSE LEFT(TRIM(CONCAT('Dr. ', COALESCE(doc.first_name, ''), ' ', COALESCE(doc.last_name, ''))), 255)
  END,
  CASE
    WHEN p.id IS NULL THEN CONCAT('Patient #', oi.patient_id)
    ELSE LEFT(TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))), 255)
  END,
  'Emergency / A&E',
  LEFT(COALESCE(NULLIF(TRIM(b.label), ''), NULLIF(TRIM(b.bed_code), ''), 'No bed assigned'), 160),
  LEFT(COALESCE(oi.item_name, CONCAT(oi.item_type, ' order')), 600),
  oi.patient_id,
  v.id,
  NULL,
  oi.consultation_id,
  oi.id,
  oi.created_by,
  COALESCE(oi.created_at, NOW())
FROM tbl_opd_order_item oi
LEFT JOIN tbl_consultation cn
  ON cn.id = oi.consultation_id AND cn.patient_id = oi.patient_id
INNER JOIN tbl_opd_visit v
  ON v.id = COALESCE(oi.opd_visit_id, cn.opd_visit_id) AND v.patient_id = oi.patient_id
LEFT JOIN tbl_patient p ON p.id = oi.patient_id
LEFT JOIN tbl_employee doc ON doc.id = oi.created_by
LEFT JOIN tbl_er_bed b ON b.id = v.er_bed_id
WHERE LOWER(TRIM(oi.item_type)) IN ('laboratory', 'radiology', 'pharmacy')
  AND COALESCE(oi.opd_visit_id, cn.opd_visit_id) IS NOT NULL
  AND (
    IFNULL(v.is_emergency, 0) = 1
    OR LOWER(COALESCE(v.department, '')) LIKE '%emergency%'
    OR LOWER(COALESCE(v.department, '')) LIKE '%a&e%'
    OR LOWER(COALESCE(v.department, '')) LIKE '%a and e%'
  )
  AND oi.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
  AND NOT EXISTS (SELECT 1 FROM tbl_clinical_dept_alert a WHERE a.opd_order_item_id = oi.id)
`;

const countSql = `
SELECT COUNT(*) AS c
FROM tbl_opd_order_item oi
LEFT JOIN tbl_consultation cn
  ON cn.id = oi.consultation_id AND cn.patient_id = oi.patient_id
INNER JOIN tbl_opd_visit v
  ON v.id = COALESCE(oi.opd_visit_id, cn.opd_visit_id) AND v.patient_id = oi.patient_id
WHERE LOWER(TRIM(oi.item_type)) IN ('laboratory', 'radiology', 'pharmacy')
  AND COALESCE(oi.opd_visit_id, cn.opd_visit_id) IS NOT NULL
  AND (
    IFNULL(v.is_emergency, 0) = 1
    OR LOWER(COALESCE(v.department, '')) LIKE '%emergency%'
    OR LOWER(COALESCE(v.department, '')) LIKE '%a&e%'
    OR LOWER(COALESCE(v.department, '')) LIKE '%a and e%'
  )
  AND oi.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
  AND NOT EXISTS (SELECT 1 FROM tbl_clinical_dept_alert a WHERE a.opd_order_item_id = oi.id)
`;

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 2,
  });

  try {
    await clinicalDeptAlerts.ensureSchema(pool);
    const [[cntRow]] = await pool.query(countSql, [DAYS]);
    const n = parseInt((cntRow && cntRow.c) || 0, 10) || 0;
    console.log(`[backfill-er-alerts] lookback=${DAYS}d rows_to_insert=${n} execute=${EXECUTE}`);

    if (!EXECUTE) {
      console.log('[backfill-er-alerts] dry-run only. Re-run with --execute to insert.');
      process.exit(0);
      return;
    }

    const [res] = await pool.query(insertSql, [DAYS]);
    const affected = res && typeof res.affectedRows === 'number' ? res.affectedRows : 0;
    console.log(`[backfill-er-alerts] inserted_rows=${affected}`);
    process.exit(0);
  } catch (e) {
    console.error('[backfill-er-alerts] failed:', e.message || e);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
}

main();
