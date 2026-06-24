'use strict';
require('../lib/loadEnv').loadEnv();
const { createDbPool } = require('../lib/dbPool');
const { resolvePrepayContext, issuePrepayTicket } = require('../lib/cashierPrepayIssue');

(async () => {
  const pool = createDbPool();
  const [pat] = await pool.query(
    `SELECT id, first_name, last_name, phone FROM tbl_patient
      WHERE phone LIKE '%699777289%' OR first_name ILIKE '%Djono%' LIMIT 5`
  );
  console.log('patients', pat);
  const pid = pat[0]?.id;
  if (pid) {
    const [w] = await pool.query(
      `SELECT id, patient_id, balance, status FROM tbl_patient_wallet WHERE patient_id = ?`,
      [pid]
    );
    console.log('wallets', w);
  }

  if (pid) {
    const [cat] = await pool.query(
      `SELECT id, name, price FROM tbl_service_catalog WHERE name ILIKE '%general consultation%' AND status=1 LIMIT 1`
    );
    console.log('catalog', cat[0]);
    const body = {
      prepay_patient_id: pid,
      prepay_payment_method: 'Wallet',
      prepay_lines: [{
        prepay_service_type: 'consultation',
        prepay_catalog_id: String(cat[0]?.id || '602'),
        prepay_quantity: '3',
        prepay_assigned_doctor_id: '1',
      }],
    };

    const ctx = await resolvePrepayContext(pool, body);
    console.log('ctx', { ok: ctx.ok, payMethod: ctx.payMethod, patientDue: ctx.patientDue, pid: ctx.pid, error: ctx.error });

    if (ctx.ok) {
      const result = await issuePrepayTicket(pool, ctx, { facilityId: 1, userId: 1 });
      console.log('issue', result);
    }
  }
  await pool.end?.();
})();
