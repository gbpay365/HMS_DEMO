#!/usr/bin/env node
'use strict';

/**
 * Business-rule regression tests (no Jest — run via `npm run test:rules`).
 * Exercises server-side enforcement directly (bypasses UI gates).
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const clinicalBusinessRules = require('../lib/clinicalBusinessRules');
const followUpConsultation = require('../lib/followUpConsultation');
const { assertOrderLineAndTicketValid } = require('../lib/assertOrderLineAndTicketValid');
const { authorizeLabTest } = require('../lib/authorizeLabTest');
const paymentValidity = require('../lib/paymentValidity');
const { patientIdentityCompositeKey } = require('../lib/patientIdentityKey');
const { birthIdentityMatches } = require('../lib/patientDuplicate');

let passed = 0;
let failed = 0;

function assert(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });

  console.log('\nBusiness rules — unit / integration checks\n');

  // countVisitUsesForCode: follow-up visits count as extra registrations
  const uses = await paymentValidity.countVisitUsesForCode(pool, 'PAY-2099-NONE');
  assert('countVisitUsesForCode returns number for unknown code', typeof uses === 'number', String(uses));

  // Composite key stability
  const k1 = patientIdentityCompositeKey({
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '677123456',
    dob: '1990-01-15',
  });
  const k2 = patientIdentityCompositeKey({
    first_name: ' jane ',
    last_name: 'DOE',
    phone: '677123456',
    dob: '1990-01-15',
  });
  assert('patientIdentityCompositeKey normalizes names/phone', k1 === k2 && k1.length > 10);

  assert(
    'birthIdentityMatches age-only mode',
    birthIdentityMatches({ age_years: 40, age_only_registration: 1 }, null, 40, 1)
  );

  // ER prescription without consult → specific code
  const [[erPatient]] = await pool
    .query(
      `SELECT v.patient_id FROM tbl_opd_visit v
       WHERE COALESCE(v.is_emergency,0)=1 AND v.queue_status NOT IN ('completed','cancelled')
       ORDER BY v.id DESC LIMIT 1`
    )
    .catch(() => [[null]]);

  if (erPatient && erPatient.patient_id) {
    const [[hasConsult]] = await pool
      .query(
        `SELECT c.id FROM tbl_consultation c
         INNER JOIN tbl_opd_visit v ON v.id = c.opd_visit_id
         WHERE v.patient_id = ? AND COALESCE(v.is_emergency,0)=1
           AND v.queue_status NOT IN ('completed','cancelled')
         LIMIT 1`,
        [erPatient.patient_id]
      )
      .catch(() => [[null]]);
    const rxGate = await clinicalBusinessRules.assertOpdPrescriptionAllowed(pool, 1, erPatient.patient_id, 1);
    if (!hasConsult) {
      assert('ER without consult blocks Rx with er_no_consultation', rxGate.code === 'er_no_consultation');
    } else {
      assert('ER with consult allows Rx or alternate block', rxGate.ok || rxGate.code !== 'er_no_consultation');
    }
  } else {
    console.log('  ~ skip ER Rx test (no open ER visit in DB)');
  }

  // Follow-up blocked when anchor visit is ER (explicit rule)
  const [[erAnchor]] = await pool
    .query(
      `SELECT c.patient_id, c.created_by FROM tbl_consultation c
       INNER JOIN tbl_opd_visit v ON v.id = c.opd_visit_id
       WHERE COALESCE(v.is_emergency,0)=1
         AND c.observations_json LIKE '%followup_visit_requested%'
       ORDER BY c.id DESC LIMIT 1`
    )
    .catch(() => [[null]]);
  if (erAnchor && erAnchor.patient_id && erAnchor.created_by) {
    const fuEr = await followUpConsultation.assertFollowUpEligible(
      pool,
      1,
      erAnchor.patient_id,
      erAnchor.created_by
    );
    assert('Follow-up blocked when anchor visit is ER', !fuEr.ok && (fuEr.meta || {}).emergency === true);
  } else {
    console.log('  ~ skip ER follow-up anchor test (no ER consult with follow-up flag in DB)');
  }

  // Expired ticket + order line (synthetic if possible)
  const [[oiRow]] = await pool
    .query(
      `SELECT oi.* FROM tbl_opd_order_item oi
       WHERE oi.service_code LIKE 'LAB-%' AND oi.patient_id IS NOT NULL
       ORDER BY oi.id DESC LIMIT 1`
    )
    .catch(() => [[null]]);

  if (oiRow) {
    const chk = await assertOrderLineAndTicketValid(pool, oiRow, 1);
    assert(
      'assertOrderLineAndTicketValid returns structured result',
      typeof chk.ok === 'boolean' && (chk.ticketLinked === true || chk.ticketLinked === false)
    );
    const auth = await authorizeLabTest(pool, {
      patientId: oiRow.patient_id,
      facilityId: 1,
      dept: 'laboratory',
      serviceCode: oiRow.service_code,
      opdOrderItemId: oiRow.id,
    });
    assert('authorizeLabTest returns source when order line valid', auth.ok === false || !!auth.source || auth.code);
  } else {
    console.log('  ~ skip order-line ticket test (no LAB order in DB)');
  }

  // Alert-only tier: charge alert without order should not pass diagnostic gate for IPD/ER-only path
  const alertOnly = await clinicalBusinessRules.patientHasIpdOrEmergencyDeptRequest(pool, -99999, 'laboratory');
  assert('Unknown patient has no IPD/ER request', !alertOnly.ok && !alertOnly.alertOnly);

  // Server path independent of UI — assertDiagnosticNewTestAllowed API shape
  const noPat = await clinicalBusinessRules.assertDiagnosticNewTestAllowed(pool, 0, 'laboratory', 1);
  assert('assertDiagnosticNewTestAllowed no_patient code', noPat.code === 'no_patient');

  await pool.end();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
