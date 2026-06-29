'use strict';

/**
 * Post-commit hooks after cashier payment collection (must not roll back the receipt).
 */
async function runCashierCollectSideEffects(pool, opts) {
  const ticket = opts.ticket;
  const ticketId = opts.ticketId;
  const userId = opts.userId;
  const facilityId = opts.facilityId || 1;
  const totalAmount = opts.totalAmount;
  const paymentMethod = opts.paymentMethod;
  const receiptNo = opts.receiptNo;
  const billingDocId = opts.billingDocId;
  const lines = opts.lines || [];

  let cashierTxnResult = null;

  // Lab walk-in queue finalized after payment
  try {
    if (String(ticket.source_module || '') === 'lab_walkin') {
      const { finalizeWalkinAfterCollect } = require('./labWalkinCashier');
      await finalizeWalkinAfterCollect(pool, ticket);
    }
  } catch (e) {
    console.error('lab walk-in post-collect:', e.message);
  }

  // Radiology walk-in queue finalized after payment
  try {
    if (String(ticket.source_module || '') === 'rad_walkin') {
      const { finalizeWalkinAfterCollect } = require('./radWalkinCashier');
      await finalizeWalkinAfterCollect(pool, ticket);
    }
  } catch (e) {
    console.error('radiology walk-in post-collect:', e.message);
  }

  // OPD order items → paid + lab/rad requests
  try {
    let parsedLines = [];
    try {
      parsedLines = JSON.parse(ticket.lines_json || '[]');
    } catch (_) {
      parsedLines = [];
    }
    const srcLines = Array.isArray(parsedLines)
      ? parsedLines.filter((ln) => ln && ln.source_module === 'opd_order_item' && ln.source_pk)
      : [];
    if (srcLines.length) {
      const { ensureOpdOrderItemsSchema } = require('./ensureOpdOrderItemsSchema');
      const { ensureFacilityRow } = require('./ensureFacilityRow');
      await ensureOpdOrderItemsSchema(pool);
      const itemIds = srcLines.map((ln) => parseInt(ln.source_pk, 10)).filter((n) => Number.isFinite(n) && n > 0);
      for (const oid of itemIds) {
        const [[oi]] = await pool.query('SELECT * FROM tbl_opd_order_item WHERE id=? LIMIT 1', [oid]);
        if (!oi || String(oi.status) !== 'pending') continue;
        await pool.query(
          "UPDATE tbl_opd_order_item SET status='paid', ticket_id=?, paid_at=NOW() WHERE id=?",
          [ticketId, oid]
        );
        const tname = String(oi.item_name || '').trim();
        if (!tname) continue;
        const appt = new Date().toISOString().split('T')[0];
        if (String(oi.item_type) === 'laboratory') {
          const [[exists]] = await pool.query('SELECT id FROM tbl_lab_result WHERE opd_order_item_id=? LIMIT 1', [oid]);
          if (!exists) {
            const lf = await ensureFacilityRow(pool, oi.facility_id || 1);
            await pool.query(
              `INSERT INTO tbl_lab_result
               (facility_id, patient_id, test_name, referred_by_id, appointment_date, notes, status, created_at, opd_order_item_id)
               VALUES (?, ?, ?, NULL, ?, NULL, 'pending', NOW(), ?)`,
              [lf, oi.patient_id, tname, appt, oid]
            );
          }
        } else if (String(oi.item_type) === 'radiology') {
          const [[exists]] = await pool.query(
            'SELECT id FROM tbl_radiology_result WHERE opd_order_item_id=? LIMIT 1',
            [oid]
          );
          if (!exists) {
            await pool.query(
              `INSERT INTO tbl_radiology_result
               (patient_id, exam_name, modality, body_part, referred_by_id, appointment_date, notes, status, created_at, opd_order_item_id)
               VALUES (?, ?, 'X-Ray', '', NULL, ?, NULL, 'pending', NOW(), ?)`,
              [oi.patient_id, tname, appt, oid]
            );
          }
        }
      }
    }
  } catch (e) {
    console.error('OPD order post-collect hook:', e.message);
  }

  // Emergency charges
  try {
    let erLines = [];
    try {
      erLines = JSON.parse(ticket.lines_json || '[]');
    } catch (_) {
      erLines = [];
    }
    const visitIds = new Set();
    if (ticket.emergency_visit_id) {
      const ev = parseInt(ticket.emergency_visit_id, 10);
      if (Number.isFinite(ev) && ev > 0) visitIds.add(ev);
    }
    if (Array.isArray(erLines)) {
      for (const ln of erLines) {
        if (ln && ln.visit_id) {
          const ev = parseInt(ln.visit_id, 10);
          if (Number.isFinite(ev) && ev > 0) visitIds.add(ev);
        }
        if (ln && ln.source_module === 'emergency_charge' && ln.source_pk) {
          const cid = parseInt(ln.source_pk, 10);
          if (Number.isFinite(cid) && cid > 0) {
            await pool.query('UPDATE tbl_emergency_charge SET settled = 1 WHERE id = ?', [cid]);
          }
        }
      }
    }
    for (const vid of visitIds) {
      await pool.query('UPDATE tbl_emergency_charge SET settled = 1 WHERE visit_id = ? AND settled = 0', [vid]);
      try {
        const { ensureErDischargeCodeAfterCollect } = require('./erCashierSettlement');
        await ensureErDischargeCodeAfterCollect(pool, vid, userId);
      } catch (erCodeErr) {
        console.error('ER discharge code after collect:', erCodeErr.message);
      }
    }
  } catch (e) {
    console.error('Emergency settlement post-collect hook:', e.message);
  }

  // Cashier till ledger row (own short transaction)
  const conn2 = await pool.getConnection();
  try {
    await conn2.beginTransaction();
    const { recordReceiptInTransaction } = require('./cashierTxnWire');
    cashierTxnResult = await recordReceiptInTransaction(conn2, {
      facilityId,
      userId,
      sourceModule: 'payment_ticket',
      sourcePk: ticketId,
      amount: totalAmount,
      paymentMethod,
      billingDocumentId: billingDocId,
      patientId: ticket.patient_id,
      lines,
      ticket,
      reference: receiptNo,
      narration: `Payment ticket ${ticket.ticket_code || ticketId}`,
    });
    await conn2.commit();
  } catch (txnErr) {
    await conn2.rollback().catch(() => {});
    console.error('cashier txn (collect):', txnErr.message);
  } finally {
    conn2.release();
  }

  try {
    const { runCashierPostCommit } = require('./cashierTxnWire');
    await runCashierPostCommit(pool, {
      txnId: cashierTxnResult?.txnId || null,
      journalKind: 'receipt',
      facilityId,
      billingDocumentId: billingDocId,
      grandTotal: totalAmount,
      paymentMethod,
      createdBy: userId,
      docNumber: receiptNo,
      firstLineDescription: (lines[0] && lines[0].description) || ticket.ticket_code || '',
      sourceModule: 'payment_ticket',
    });
  } catch (pipeErr) {
    console.error('cashier journal pipeline (collect):', pipeErr.message);
  }

  try {
    const hmsCommission = require('./hmsCommission');
    const ensureHmsExtendedSchema = require('./ensureHmsExtendedSchema');
    await ensureHmsExtendedSchema(pool).catch(() => {});
    await hmsCommission.accrueFromPaymentSettlement(pool, {
      ticketId,
      patientId: ticket.patient_id,
      lines,
      consultationId: ticket.consultation_id,
    });
  } catch (commErr) {
    console.warn('Commission accrual after collect:', commErr.message);
  }

  return { cashierTxnResult };
}

module.exports = { runCashierCollectSideEffects };
