'use strict';
require('../lib/loadEnv').loadEnv();
const { createDbPool } = require('../lib/dbPool');
const matInt = require('../lib/maternityIntegration');
const matBill = require('../lib/maternityBilling');
const { NOT_DISCHARGED } = require('../lib/ipdHospitalization');

async function main() {
  const pool = createDbPool();
  const id = 1;
  try {
    await matInt.ensureMaternityIntegrationSchema(pool);
    const [[patient]] = await pool.query(
      `SELECT mp.*, p.first_name, p.last_name, p.phone FROM maternity_patients mp
       JOIN tbl_patient p ON p.id = mp.patient_id WHERE mp.id = ?`,
      [id]
    );
    console.log('patient', patient?.id, patient?.antenatal_number);

    const [laborRows] = await pool.query(
      `SELECT lr.*, dr.id AS delivery_id, dr.delivery_type, dr.delivery_date_time, dr.outcome,
              a.id AS ipd_admission_id, a.ipd_status, a.bed_id, a.hos_payment_deferred,
              a.clinical_discharged_at, a.discharged_at,
              b.ward_name AS ipd_ward_name, b.bed_label AS ipd_bed_label
       FROM labor_records lr
       LEFT JOIN delivery_records dr ON dr.labor_record_id = lr.id
       LEFT JOIN tbl_admission a ON a.id = lr.admission_id
         AND ${NOT_DISCHARGED}
       LEFT JOIN tbl_bed b ON b.id = a.bed_id
       WHERE lr.maternity_patient_id = ?
       ORDER BY lr.admission_date DESC LIMIT 1`,
      [id]
    );
    console.log('labor rows', laborRows.length);

    const summary = {
      patient,
      antenatal_visits: [],
      labor_delivery: laborRows[0] || null,
      postnatal_visits: [],
      newborns: [],
    };
    const billing = await matBill.buildBillingSnapshot(pool, summary);
    console.log('billing ok', billing.tickets?.length, billing.suggestions?.length);
  } catch (e) {
    console.error('ERR:', e.message);
    console.error(e.stack);
    process.exitCode = 1;
  } finally {
    await pool.end?.().catch(() => {});
  }
}

main();
