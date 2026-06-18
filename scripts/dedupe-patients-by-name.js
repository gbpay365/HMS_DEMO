#!/usr/bin/env node
'use strict';

/**
 * Report (and optionally remove) duplicate patients using the same 4-field composite
 * as registration: first_name + last_name + phone + DOB/age.
 *
 * Default: write CSV report only — admin confirms before any delete.
 *
 * Usage:
 *   node scripts/dedupe-patients-by-name.js
 *   node scripts/dedupe-patients-by-name.js --out tmp/patient-dupes.csv
 *   node scripts/dedupe-patients-by-name.js --apply
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { patientIdentityCompositeKey, groupPatientsByIdentityKey } = require('../lib/patientIdentityKey');
const { parseDobIso } = require('../lib/patientDuplicate');
const { normalizePatientPhone } = require('../lib/patientAge');

const APPLY = process.argv.includes('--apply');
const outIdx = process.argv.indexOf('--out');
const OUT_PATH =
  outIdx >= 0 && process.argv[outIdx + 1]
    ? process.argv[outIdx + 1]
    : path.join('tmp', `patient-duplicate-candidates-${Date.now()}.csv`);

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function purgePatientRelatedRows(conn, patientId) {
  const pid = patientId;
  const safe = (sql) => conn.query(sql, [pid]).catch(() => {});

  await conn
    .query(
      'DELETE wt FROM tbl_patient_wallet_txn wt INNER JOIN tbl_patient_wallet w ON w.id = wt.wallet_id WHERE w.patient_id = ?',
      [pid]
    )
    .catch(() => {});

  await safe('DELETE FROM tbl_vital_sign WHERE patient_id = ?');
  await safe('DELETE FROM tbl_prescription WHERE patient_id = ?');
  await safe('DELETE FROM tbl_problem WHERE patient_id = ?');
  await safe('DELETE FROM tbl_patient_identifier WHERE patient_id = ?');
  await safe('DELETE FROM tbl_patient_external_document WHERE patient_id = ?');
  await safe('DELETE FROM tbl_patient_insurance WHERE patient_id = ?');
  await safe('DELETE FROM tbl_patient_medication WHERE patient_id = ?');
  await safe('DELETE FROM tbl_patient_allergy WHERE patient_id = ?');
  await safe('DELETE FROM tbl_medical_result WHERE patient_id = ?');
  await safe('DELETE FROM tbl_lab_result WHERE patient_id = ?');
  await safe('DELETE FROM tbl_consent WHERE patient_id = ?');
  await safe('DELETE FROM tbl_clinical_order WHERE patient_id = ?');
  await safe('DELETE FROM tbl_encounter WHERE patient_id = ?');
  await conn
    .query(
      'DELETE il FROM tbl_invoice_line il INNER JOIN tbl_invoice i ON i.id = il.invoice_id WHERE i.patient_id = ?',
      [pid]
    )
    .catch(() => {});
  await safe('DELETE FROM tbl_invoice WHERE patient_id = ?');
  await safe('DELETE FROM tbl_charge WHERE patient_id = ?');
  await safe('DELETE FROM tbl_ipd_charge WHERE patient_id = ?');
  await conn
    .query(
      'DELETE c FROM tbl_ipd_charge c INNER JOIN tbl_admission a ON a.id = c.admission_id WHERE a.patient_id = ?',
      [pid]
    )
    .catch(() => {});
  await conn
    .query(
      'DELETE ack FROM tbl_clinical_dept_alert_ack ack INNER JOIN tbl_clinical_dept_alert ca ON ca.id = ack.alert_id WHERE ca.patient_id = ?',
      [pid]
    )
    .catch(() => {});
  await safe('DELETE FROM tbl_clinical_dept_alert WHERE patient_id = ?');
  await safe('DELETE FROM tbl_opd_order_item WHERE patient_id = ?');
  await safe('DELETE FROM tbl_consultation WHERE patient_id = ?');
  await safe('DELETE FROM tbl_opd_visit WHERE patient_id = ?');
  await safe('DELETE FROM tbl_facility_admission WHERE patient_id = ?');
  await safe('DELETE FROM tbl_admission WHERE patient_id = ?');
  await safe('DELETE FROM tbl_payment_ticket WHERE patient_id = ?');
  await safe('DELETE FROM tbl_billing_document WHERE patient_id = ?');
  await conn
    .query(
      'DELETE ct FROM tbl_credit_transaction ct INNER JOIN tbl_credit_account ca ON ca.id = ct.account_id WHERE ca.patient_id = ?',
      [pid]
    )
    .catch(() => {});
  await safe('DELETE FROM tbl_credit_account WHERE patient_id = ?');
  await safe('DELETE FROM tbl_patient_wallet WHERE patient_id = ?');
  await safe('DELETE FROM tbl_appointment WHERE patient_id = ?');
  await safe('DELETE FROM tbl_radiology_result WHERE patient_id = ?');
  await safe('DELETE FROM tbl_patient_vitals WHERE patient_id = ?');
  await safe('DELETE FROM tbl_lab_order WHERE patient_id = ?');
  await safe('DELETE FROM tbl_radiology_order WHERE patient_id = ?');
  await safe('DELETE FROM tbl_ipd_ward_note WHERE patient_id = ?');
  await safe('DELETE FROM tbl_insurance_claim WHERE patient_id = ?');
  await safe('DELETE FROM tbl_notification_queue WHERE patient_id = ?');
  await safe('DELETE FROM tbl_result_shared_notice WHERE patient_id = ?');
  await safe('DELETE FROM tbl_transaction WHERE patient_id = ?');
  await safe('DELETE FROM tbl_patient_portal WHERE patient_id = ?');
  await safe('UPDATE tbl_bed SET patient_id = NULL WHERE patient_id = ?');
  await safe('DELETE FROM maternity_patients WHERE patient_id = ?');
}

async function hasOpenAdmission(conn, patientId) {
  const nd = "(discharged_at IS NULL OR discharged_at = '0000-00-00 00:00:00' OR discharged_at = '0000-00-00')";
  const [rows] = await conn.query(
    `SELECT id FROM tbl_admission WHERE patient_id=? AND ${nd} LIMIT 1`,
    [patientId]
  );
  return !!(rows && rows[0] && rows[0].id);
}

async function deletePatient(conn, patientId) {
  if (await hasOpenAdmission(conn, patientId)) {
    return { ok: false, reason: 'active IPD admission' };
  }
  await purgePatientRelatedRows(conn, patientId);
  const [delResult] = await conn.query('DELETE FROM tbl_patient WHERE id = ? LIMIT 1', [patientId]);
  if (delResult && delResult.affectedRows) return { ok: true };
  await conn.query('SET FOREIGN_KEY_CHECKS=0').catch(() => {});
  try {
    const [del2] = await conn.query('DELETE FROM tbl_patient WHERE id = ? LIMIT 1', [patientId]);
    if (del2 && del2.affectedRows) return { ok: true };
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS=1').catch(() => {});
  }
  return { ok: false, reason: 'delete failed' };
}

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });

  const [rows] = await pool.query(
    `SELECT id, first_name, last_name, phone, dob, age_years, age_only_registration,
            patient_code, created_at
     FROM tbl_patient WHERE status = 1 ORDER BY id ASC`
  );

  const groups = groupPatientsByIdentityKey(rows);
  const duplicateGroups = [...groups.entries()].filter(([, members]) => members.length > 1);

  const csvLines = [
    'group_key,keep_id,duplicate_id,first_name,last_name,phone,dob_or_age,patient_code,created_at,action',
  ];
  const toDelete = [];

  for (const [key, members] of duplicateGroups) {
    const sorted = [...members].sort((a, b) => a.id - b.id);
    const keep = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const dup = sorted[i];
      const dobOrAge =
        dup.age_only_registration == 1
          ? `age:${dup.age_years}`
          : parseDobIso(dup.dob) || dup.dob || '';
      csvLines.push(
        [
          key.slice(0, 16),
          keep.id,
          dup.id,
          dup.first_name,
          dup.last_name,
          normalizePatientPhone(dup.phone),
          dobOrAge,
          dup.patient_code || '',
          dup.created_at || '',
          APPLY ? 'delete_if_ok' : 'review',
        ]
          .map(csvEscape)
          .join(',')
      );
      toDelete.push({ ...dup, keepId: keep.id, groupKey: key });
    }
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, csvLines.join('\n') + '\n', 'utf8');

  console.log(`Duplicate identity groups (4-field match): ${duplicateGroups.length}`);
  console.log(`Candidate duplicate rows: ${toDelete.length}`);
  console.log(`CSV report: ${OUT_PATH}`);
  if (!APPLY) {
    console.log('No rows deleted. Re-run with --apply after admin review.');
    const [[rem]] = await pool.query('SELECT COUNT(*) AS n FROM tbl_patient WHERE status = 1');
    console.log('Active patients:', rem.n);
    await pool.end();
    return;
  }

  const deleted = [];
  const skipped = [];
  for (const row of toDelete) {
    const label = `#${row.id} ${row.first_name} ${row.last_name} (keep #${row.keepId})`;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const out = await deletePatient(conn, row.id);
      if (!out.ok) {
        await conn.rollback();
        skipped.push({ label, reason: out.reason });
        continue;
      }
      await conn.commit();
      deleted.push(label);
    } catch (e) {
      await conn.rollback().catch(() => {});
      skipped.push({ label, reason: e.message });
    } finally {
      conn.release();
    }
  }

  deleted.forEach((d) => console.log(' deleted:', d));
  if (skipped.length) {
    console.log('Skipped:');
    skipped.forEach((s) => console.log(`  ${s.label}: ${s.reason}`));
  }

  const [[rem]] = await pool.query('SELECT COUNT(*) AS n FROM tbl_patient WHERE status = 1');
  console.log('Active patients:', rem.n);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
