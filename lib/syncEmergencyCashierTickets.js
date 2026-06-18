/**
 * Keeps one pending cashier ticket per emergency visit that has unpaid ER charges.
 * Cashiers collect payment under "Emergency Payments" (ticket prefix EMG-).
 */
const { allocateUniquePaymentCode } = require('./paymentTicketCode');

module.exports = async function syncEmergencyCashierTickets(pool) {
  if (!pool || !pool.query) return;
  await pool.query(
    'ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS emergency_visit_id INT NULL DEFAULT NULL'
  ).catch(() => {});
  await pool.query(
    'ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS ticket_category VARCHAR(40) NULL DEFAULT NULL'
  ).catch(() => {});

  const [rows] = await pool.query(`
    SELECT v.id AS visit_id, v.patient_id,
           COALESCE(SUM(c.amount), 0) AS due_total
      FROM tbl_opd_visit v
      JOIN tbl_emergency_charge c ON c.visit_id = v.id AND c.settled = 0
     WHERE v.is_emergency = 1
       AND COALESCE(v.queue_status, '') NOT IN ('clinical_discharged', 'completed')
       AND COALESCE(v.er_status, '') NOT IN ('clinical_discharged', 'completed')
     GROUP BY v.id, v.patient_id
    HAVING due_total > 0
  `).catch(() => [[]]);

  const activeVisitIds = new Set((rows || []).map((r) => r.visit_id));

  const [staleTickets] = await pool.query(
    `SELECT id, emergency_visit_id
       FROM tbl_payment_ticket
      WHERE status = 'pending'
        AND emergency_visit_id IS NOT NULL
        AND (ticket_category = 'emergency_settlement' OR ticket_code LIKE 'EMG-%' OR ticket_code LIKE 'EMG-SET-%')`
  ).catch(() => [[]]);

  for (const t of staleTickets || []) {
    if (!t.emergency_visit_id) continue;
    if (activeVisitIds.has(t.emergency_visit_id)) continue;
    await pool
      .query(`UPDATE tbl_payment_ticket SET status = 'cancelled' WHERE id = ? AND status = 'pending'`, [t.id])
      .catch(() => {});
  }

  for (const r of rows || []) {
    const visitId = r.visit_id;
    const patientId = r.patient_id;
    const [chRows] = await pool.query(
      `SELECT id, description, amount FROM tbl_emergency_charge
        WHERE visit_id = ? AND settled = 0 ORDER BY id ASC`,
      [visitId]
    );
    const charges = Array.isArray(chRows) ? chRows : [];
    if (!charges.length) continue;

    const lines = charges.map((ch) => ({
      kind: 'emergency_charge',
      description: String(ch.description || 'Emergency charge').slice(0, 290),
      unit_price: parseFloat(ch.amount) || 0,
      quantity: 1,
      visit_id: visitId,
      source_module: 'emergency_charge',
      source_pk: ch.id,
    }));
    const total = lines.reduce((s, ln) => s + (parseFloat(ln.unit_price) || 0) * (parseFloat(ln.quantity) || 1), 0);
    if (total <= 0) continue;

    const [existing] = await pool.query(
      `SELECT id FROM tbl_payment_ticket
        WHERE status = 'pending' AND emergency_visit_id = ? LIMIT 1`,
      [visitId]
    );

    if (existing && existing.length) {
      await pool
        .query(
          `UPDATE tbl_payment_ticket
              SET total_amount = ?, lines_json = ?, ticket_category = 'emergency_settlement'
            WHERE id = ? AND status = 'pending'`,
          [total, JSON.stringify(lines), existing[0].id]
        )
        .catch(() => {});
      continue;
    }

    const ticketCode = await allocateUniquePaymentCode(pool, 'emergency');
    const facilityId = 1;
    const systemUid = 1;

    await pool
      .query(
        `INSERT INTO tbl_payment_ticket
          (facility_id, ticket_code, patient_id, total_amount, status, lines_json,
           created_by, created_at, emergency_visit_id, ticket_category)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, NOW(), ?, 'emergency_settlement')`,
        [facilityId, ticketCode, patientId, total, JSON.stringify(lines), systemUid, visitId]
      )
      .catch((e) => {
        console.warn('[syncEmergencyCashierTickets] insert failed:', e.message);
      });
  }
};
