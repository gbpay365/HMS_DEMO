'use strict';

/**
 * In-app alerts for Laboratory / Radiology / Pharmacy when clinicians order
 * tests or meds for inpatients (IPD) or emergency patients.
 */

const CLINICAL_ALERT_DEPTS = new Set(['laboratory', 'radiology', 'pharmacy']);

let _schemaPromise = null;

function ensureSchema(pool) {
  if (!_schemaPromise) {
    _schemaPromise = (async () => {
      await pool
        .query(
          `CREATE TABLE IF NOT EXISTS tbl_clinical_dept_alert (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            facility_id INT DEFAULT 1,
            target_dept VARCHAR(24) NOT NULL,
            context VARCHAR(12) DEFAULT NULL,
            doctor_display VARCHAR(255) NULL,
            patient_display VARCHAR(255) NULL,
            ward_display VARCHAR(255) NULL,
            bed_display VARCHAR(160) NULL,
            test_display VARCHAR(600) NULL,
            patient_id INT NULL,
            opd_visit_id INT NULL,
            admission_id INT NULL,
            consultation_id INT NULL,
            opd_order_item_id BIGINT NULL,
            created_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            KEY idx_dept_created (target_dept, created_at),
            KEY idx_patient (patient_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
        )
        .catch(() => {});
      await pool
        .query(
          `CREATE TABLE IF NOT EXISTS tbl_clinical_dept_alert_ack (
            alert_id BIGINT NOT NULL,
            user_id INT NOT NULL,
            acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (alert_id, user_id),
            KEY idx_user (user_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
        )
        .catch(() => {});
    })();
  }
  return _schemaPromise;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} o
 */
async function enqueueAlert(pool, o) {
  await ensureSchema(pool);
  const fid = o.facility_id != null ? Number(o.facility_id) || 1 : 1;
  const dept = String(o.target_dept || '').toLowerCase();
  if (!CLINICAL_ALERT_DEPTS.has(dept)) return;
  await pool
    .query(
      `INSERT INTO tbl_clinical_dept_alert
        (facility_id, target_dept, context, doctor_display, patient_display, ward_display, bed_display, test_display,
         patient_id, opd_visit_id, admission_id, consultation_id, opd_order_item_id, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [
        fid,
        dept,
        o.context || null,
        (o.doctor_display || '').slice(0, 255) || null,
        (o.patient_display || '').slice(0, 255) || null,
        (o.ward_display || '').slice(0, 255) || null,
        (o.bed_display || '').slice(0, 160) || null,
        (o.test_display || '').slice(0, 600) || null,
        o.patient_id || null,
        o.opd_visit_id || null,
        o.admission_id || null,
        o.consultation_id || null,
        o.opd_order_item_id || null,
        o.created_by || null,
      ]
    )
    .catch((e) => console.warn('[clinicalDeptAlerts] enqueue', e.message));
}

async function listUnacked(pool, dept, userId, limit = 40) {
  await ensureSchema(pool);
  const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 40));
  const uid = parseInt(userId, 10) || 0;
  if (uid < 1) return [];
  const d = String(dept || '').toLowerCase();
  if (!CLINICAL_ALERT_DEPTS.has(d)) return [];
  const [rows] = await pool
    .query(
      `SELECT a.*
         FROM tbl_clinical_dept_alert a
         LEFT JOIN tbl_clinical_dept_alert_ack k
           ON k.alert_id = a.id AND k.user_id = ?
        WHERE a.target_dept = ?
          AND k.alert_id IS NULL
        ORDER BY a.id DESC
        LIMIT ?`,
      [uid, d, lim]
    )
    .catch(() => [[]]);
  return Array.isArray(rows) ? rows : [];
}

async function listAllRecent(pool, dept, limit = 100) {
  await ensureSchema(pool);
  const lim = Math.min(300, Math.max(1, parseInt(limit, 10) || 100));
  const d = String(dept || '').toLowerCase();
  if (!CLINICAL_ALERT_DEPTS.has(d)) return [];
  const [rows] = await pool
    .query(
      `SELECT a.* FROM tbl_clinical_dept_alert a
        WHERE a.target_dept = ?
        ORDER BY a.id DESC
        LIMIT ?`,
      [d, lim]
    )
    .catch(() => [[]]);
  return Array.isArray(rows) ? rows : [];
}

async function acknowledge(pool, alertId, userId) {
  await ensureSchema(pool);
  const aid = parseInt(alertId, 10) || 0;
  const uid = parseInt(userId, 10) || 0;
  if (aid < 1 || uid < 1) return false;
  await pool
    .query(
      `INSERT IGNORE INTO tbl_clinical_dept_alert_ack (alert_id, user_id, acknowledged_at) VALUES (?,?,NOW())`,
      [aid, uid]
    )
    .catch(() => {});
  return true;
}

module.exports = {
  ensureSchema,
  enqueueAlert,
  listUnacked,
  listAllRecent,
  acknowledge,
  CLINICAL_ALERT_DEPTS,
};
