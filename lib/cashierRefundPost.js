'use strict';

const { ensureCashierInvoiceSchema } = require('./ensureCashierInvoiceSchema');
const { resolvePaymentTicketForPrint } = require('./resolvePaymentTicketForPrint');
const { creditPatientWallet } = require('./opdOrderRefund');
const { nextReceiptNumber } = require('./receiptNumber');
const { nextInvoiceNumber } = require('./invoiceNumber');
const { recordRefundInTransaction, runCashierPostCommit } = require('./cashierTxnWire');
const { deriveServiceKey } = require('./cashierTransactionHub');
const { optionalInTransaction } = require('./pgTransaction');

function roundMoney(v) {
  return Math.round((parseFloat(v) || 0) * 100) / 100;
}

function paidOnTicket(ticket) {
  const total = parseFloat(ticket?.total_amount) || 0;
  const paid = parseFloat(ticket?.amount_paid) || 0;
  const st = String(ticket?.status || '').toLowerCase();
  if (paid > 0.005) return paid;
  if (st === 'paid') return total;
  return paid;
}

function parseTicketLines(ticket) {
  try {
    const lines = JSON.parse(ticket?.lines_json || '[]');
    return Array.isArray(lines) ? lines : [];
  } catch (_) {
    return [];
  }
}

async function loadTicketById(pool, ticketId) {
  const id = parseInt(String(ticketId), 10) || 0;
  if (id < 1) return null;
  const [[row]] = await pool
    .query('SELECT * FROM tbl_payment_ticket WHERE id = ? LIMIT 1', [id])
    .catch(() => [[]]);
  return row || null;
}

async function resolveRefundTicket(pool, ticketId, ticketCode) {
  const id = parseInt(String(ticketId), 10) || 0;
  if (id > 0) {
    const row = await loadTicketById(pool, id);
    if (row) return row;
  }
  const code = String(ticketCode || '').trim();
  if (!code) return null;
  const resolved = await resolvePaymentTicketForPrint(pool, code);
  if (!resolved?.ticket?.id) return null;
  return loadTicketById(pool, resolved.ticket.id);
}

async function sumRefundedOnTicket(pool, ticketId, excludeRequestId = 0, opts = {}) {
  const tid = parseInt(String(ticketId), 10) || 0;
  if (tid < 1) return 0;
  const exclude = parseInt(String(excludeRequestId), 10) || 0;
  const statuses = Array.isArray(opts.statuses) && opts.statuses.length
    ? opts.statuses
    : ['pending', 'paid'];
  const params = [tid];
  const placeholders = statuses.map(() => '?').join(', ');
  let sql = `SELECT COALESCE(SUM(amount), 0) AS total
               FROM tbl_cashier_refund_request
              WHERE ticket_id = ?
                AND status IN (${placeholders})`;
  params.push(...statuses);
  if (exclude > 0) {
    sql += ' AND id <> ?';
    params.push(exclude);
  }
  const [[row]] = await pool.query(sql, params).catch(() => [[{ total: 0 }]]);
  return roundMoney(row?.total);
}

function sumRefundLinesOnTicket(ticket) {
  return parseTicketLines(ticket)
    .filter((ln) => String(ln.kind || '').toLowerCase() === 'refund')
    .reduce((sum, ln) => sum + Math.abs(roundMoney(ln.unit_price ?? ln.amount ?? 0)), 0);
}

function grossCollectedOnTicket(ticket) {
  const total = parseFloat(ticket?.total_amount) || 0;
  const remaining = paidOnTicket(ticket);
  const lineRefunds = sumRefundLinesOnTicket(ticket);
  return roundMoney(Math.max(total, remaining + lineRefunds));
}

/**
 * Align amount_paid with approved refunds when legacy posting left the bill balance unchanged.
 * Only uses paid refund requests — pending/orphan line refunds are handled at approval time.
 */
async function syncTicketPaidWithRefundLines(pool, ticket) {
  const tid = parseInt(String(ticket?.id), 10) || 0;
  if (tid < 1) return ticket;

  const total = parseFloat(ticket.total_amount) || 0;
  const recordedPaid = parseFloat(ticket.amount_paid) || 0;
  const st = String(ticket.status || '').toLowerCase();

  const [[paidRow]] = await pool
    .query(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM tbl_cashier_refund_request
        WHERE ticket_id = ? AND status = 'paid'`,
      [tid]
    )
    .catch(() => [[{ total: 0 }]]);
  const refundsApplied = roundMoney(paidRow?.total);
  if (refundsApplied <= 0.005) return ticket;

  const baselinePaid =
    recordedPaid > 0.005 ? recordedPaid : st === 'paid' ? total : recordedPaid;
  const expectedPaid = roundMoney(Math.max(0, baselinePaid - refundsApplied));

  if (Math.abs(baselinePaid - expectedPaid) <= 0.005) return ticket;

  let newStatus = st || 'pending';
  if (expectedPaid <= 0.005) newStatus = 'pending';
  else if (expectedPaid >= total - 0.005) newStatus = 'paid';
  else newStatus = 'pending';

  const invoiceStatus = expectedPaid <= 0.005 && refundsApplied > 0.005
    ? 'refunded'
    : String(ticket.invoice_status || 'sent');

  await pool.query(
    'UPDATE tbl_payment_ticket SET amount_paid = ?, status = ?, invoice_status = ? WHERE id = ?',
    [expectedPaid, newStatus, invoiceStatus, tid]
  );

  await pool
    .query(
      `UPDATE tbl_billing_document
          SET status = ?
        WHERE source_module = 'payment_ticket'
          AND source_pk = ?
          AND doc_type IN ('receipt', 'invoice')`,
      [expectedPaid <= 0.005 ? 'refunded' : 'paid', tid]
    )
    .catch(() => {});

  return { ...ticket, amount_paid: expectedPaid, status: newStatus, invoice_status: invoiceStatus };
}

async function refundableAmountForTicket(pool, ticket, excludeRequestId = 0) {
  if (!excludeRequestId) {
    await syncTicketPaidWithRefundLines(pool, ticket);
  }
  const fresh = (await loadTicketById(pool, ticket.id)) || ticket;
  const lineRefunds = sumRefundLinesOnTicket(fresh);
  const paidRefunds = await sumRefundedOnTicket(pool, fresh.id, 0, { statuses: ['paid'] });
  const otherPending = await sumRefundedOnTicket(pool, fresh.id, excludeRequestId, {
    statuses: ['pending'],
  });
  const grossCollected = grossCollectedOnTicket(fresh);

  let available = roundMoney(Math.max(0, grossCollected - paidRefunds - otherPending - lineRefunds));

  const rid = parseInt(String(excludeRequestId), 10) || 0;
  if (rid > 0) {
    const [[req]] = await pool
      .query(
        `SELECT amount, status, refund_ref FROM tbl_cashier_refund_request WHERE id = ? LIMIT 1`,
        [rid]
      )
      .catch(() => [[null]]);
    if (req && String(req.status).toLowerCase() === 'pending') {
      const reqAmt = roundMoney(req.amount);
      const ref = String(req.refund_ref || '').trim();
      const lineForRequest = parseTicketLines(fresh).some(
        (ln) =>
          String(ln.kind || '').toLowerCase() === 'refund' &&
          (!ref || String(ln.refund_ref || '').trim() === ref)
      );
      if (lineForRequest && lineRefunds >= reqAmt - 0.005) {
        return reqAmt;
      }
      available = Math.max(available, roundMoney(grossCollected - paidRefunds - otherPending));
    }
  }

  return available;
}

async function paidRefundSummaryForTicket(pool, ticketId) {
  const tid = parseInt(String(ticketId), 10) || 0;
  if (tid < 1) return { total: 0, count: 0, refs: [] };
  const [rows] = await pool
    .query(
      `SELECT id, refund_ref, amount, approved_at
         FROM tbl_cashier_refund_request
        WHERE ticket_id = ? AND status = 'paid'
        ORDER BY approved_at DESC, id DESC`,
      [tid]
    )
    .catch(() => [[]]);
  const total = roundMoney((rows || []).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0));
  return {
    total,
    count: (rows || []).length,
    refs: (rows || []).map((r) => r.refund_ref).filter(Boolean),
  };
}

async function applyRefundToPaymentTicket(conn, ticket, opts) {
  const refundAmount = roundMoney(opts.refundAmount);
  const paid = paidOnTicket(ticket);
  const maxRefundable = roundMoney(opts.maxRefundable != null ? opts.maxRefundable : paid);
  if (refundAmount <= 0) return { ok: false, error: 'Refund amount must be greater than zero.' };
  if (refundAmount > maxRefundable + 0.005) {
    return { ok: false, error: `Refund cannot exceed refundable amount (${maxRefundable}).` };
  }

  const total = parseFloat(ticket.total_amount) || 0;
  const currentPaid = parseFloat(ticket.amount_paid) || paid;
  const newPaid = roundMoney(Math.max(0, currentPaid - refundAmount));
  let newStatus = String(ticket.status || 'pending');
  if (newPaid <= 0.005) newStatus = 'pending';
  else if (newPaid >= total - 0.005) newStatus = 'paid';
  else newStatus = 'pending';

  let lines = [];
  try {
    lines = JSON.parse(ticket.lines_json || '[]');
    if (!Array.isArray(lines)) lines = [];
  } catch (_) {
    lines = [];
  }

  const refundRef = String(opts.refundRef || '').trim();
  const existingRefundLine = lines.find(
    (ln) =>
      String(ln.kind || '').toLowerCase() === 'refund' &&
      (!refundRef || String(ln.refund_ref || '').trim() === refundRef)
  );
  if (existingRefundLine) {
    return {
      ok: true,
      newPaid: currentPaid,
      newStatus: String(ticket.status || 'pending'),
      balanceDue: roundMoney(Math.max(0, total - currentPaid)),
      already_applied: true,
    };
  }

  lines.push({
    kind: 'refund',
    description: `Refund — ${String(opts.reason || 'Cashier refund').trim()}`,
    unit_price: -refundAmount,
    quantity: 1,
    refund_method: opts.refundMethod || 'Cash',
    refund_ref: opts.refundRef || null,
  });

  const linesJson = JSON.stringify(lines);
  const invoiceStatus = newPaid <= 0.005 ? 'refunded' : String(ticket.invoice_status || 'sent');

  const runTicketUpdate = async (db) => {
    try {
      await db.query(
        `UPDATE tbl_payment_ticket
         SET amount_paid = ?, status = ?, lines_json = ?, invoice_status = ?
         WHERE id = ?`,
        [newPaid, newStatus, linesJson, invoiceStatus, ticket.id]
      );
    } catch (e) {
      const msg = String(e?.message || e);
      if (!/invoice_status|amount_paid/i.test(msg)) throw e;
      await db.query(
        `UPDATE tbl_payment_ticket
         SET status = ?, lines_json = ?
         WHERE id = ?`,
        [newStatus, linesJson, ticket.id]
      );
    }
  };

  await runTicketUpdate(conn);

  await optionalInTransaction(conn, 'refund_billing_doc', () =>
    conn.query(
      `UPDATE tbl_billing_document
        SET status = ?
      WHERE source_module = 'payment_ticket'
        AND source_pk = ?
        AND doc_type IN ('receipt', 'invoice')`,
      [newPaid <= 0.005 ? 'refunded' : 'paid', ticket.id]
    )
  );

  return { ok: true, newPaid, newStatus, balanceDue: roundMoney(Math.max(0, total - newPaid)) };
}

/**
 * Run schema/bootstrap DDL on the pool before opening a PG transaction.
 * DDL or failed ALTER inside a transaction aborts the whole block on PostgreSQL.
 */
async function prepareRefundPostSchemas(pool) {
  const { ensureCashierRefundSchema } = require('./ensureCashierRefundSchema');
  const { ensureCashierTxnSchema, syncCashierTxnIdSequence } = require('./ensureCashierTxnSchema');
  const { ensurePostgresReceiptInvoiceSeq } = require('./receiptNumber');
  const { ensureCashierIdentitySchema } = require('./ensureCashierIdentitySchema');
  await ensureCashierInvoiceSchema(pool).catch(() => {});
  await ensureCashierRefundSchema(pool).catch(() => {});
  await ensureCashierTxnSchema(pool).catch(() => {});
  await syncCashierTxnIdSequence(pool).catch(() => {});
  await ensurePostgresReceiptInvoiceSeq(pool).catch(() => {});
  await ensureCashierIdentitySchema(pool).catch(() => {});
}

async function findRefundBillingDocId(pool, requestId) {
  const rid = parseInt(String(requestId), 10) || 0;
  if (rid < 1) return null;
  const [[row]] = await pool
    .query(
      `SELECT id FROM tbl_billing_document
        WHERE source_module = 'cashier_refund' AND source_pk = ?
        LIMIT 1`,
      [rid]
    )
    .catch(() => [[null]]);
  return row?.id ? parseInt(String(row.id), 10) || null : null;
}

function refundAlreadyPaid(status) {
  const s = String(status || '').toLowerCase();
  return s === 'paid' || s === 'approved' || s === 'completed';
}

async function finishRefundPostCommit(pool, txnRow, ctx) {
  const txnId = parseInt(String(txnRow?.txnId || txnRow?.id || 0), 10) || 0;
  if (txnId < 1) return;
  await runCashierPostCommit(pool, {
    txnId,
    journalKind: 'refund',
    facilityId: ctx.fid,
    amount: ctx.refundAmount,
    paymentMethod: ctx.refundMethod,
    createdBy: ctx.userId,
    reference: ctx.refundRef,
    narration: ctx.reason,
    serviceKey: deriveServiceKey(parseTicketLines(ctx.ticket), ctx.ticket),
  }).catch(() => {});
}

/**
 * PostgreSQL: run refund approval as idempotent autocommit steps (no multi-statement txn).
 * Avoids "current transaction is aborted" when an intermediate statement fails.
 */
async function postCashierRefundRequestPg(pool, ctx) {
  const {
    row,
    ticket,
    refundAmount,
    refundMethod,
    reason,
    fid,
    userId,
    patientId,
    requestId,
    refundRef,
    precachedCashier,
    maxRefundable,
  } = ctx;

  const [[statusRow]] = await pool
    .query('SELECT status FROM tbl_cashier_refund_request WHERE id = ? LIMIT 1', [requestId])
    .catch(() => [[null]]);
  if (refundAlreadyPaid(statusRow?.status)) {
    return {
      ok: true,
      id: requestId,
      ticket_id: ticket.id,
      ticket_code: ticket.ticket_code,
      already_paid: true,
    };
  }

  const ticketApply = await applyRefundToPaymentTicket(pool, ticket, {
    refundAmount,
    refundMethod,
    reason,
    refundRef,
    maxRefundable,
  });
  if (!ticketApply.ok) return { ...ticketApply, status: 400 };

  if (refundMethod.toLowerCase().includes('wallet')) {
    await creditPatientWallet(pool, patientId, refundAmount, refundRef, reason, userId);
  }

  let billingDocumentId = await findRefundBillingDocId(pool, requestId);
  if (!billingDocumentId) {
    const receiptNo = await nextReceiptNumber(pool, fid);
    const invoiceNo = await nextInvoiceNumber(pool, fid);
    try {
      const [docIns] = await pool.query(
        `INSERT INTO tbl_billing_document
         (facility_id, patient_id, doc_type, doc_number, invoice_doc_number, total_amount, payment_method,
          status, source_module, source_pk, created_by, created_at)
         VALUES (?, ?, 'refund', ?, ?, ?, ?, 'paid', 'cashier_refund', ?, ?, NOW())`,
        [fid, patientId, receiptNo, invoiceNo, -refundAmount, refundMethod, requestId, userId]
      );
      billingDocumentId = docIns?.insertId || null;
    } catch (e) {
      const msg = String(e?.message || e);
      if (/duplicate|unique/i.test(msg)) {
        billingDocumentId = await findRefundBillingDocId(pool, requestId);
      } else {
        throw e;
      }
    }
  }

  let txnRow = null;
  const ticketLines = parseTicketLines(ticket);
  if (userId > 0) {
    txnRow = await recordRefundInTransaction(pool, {
      facilityId: fid,
      userId,
      sourcePk: requestId,
      amount: refundAmount,
      paymentMethod: refundMethod,
      billingDocumentId,
      patientId,
      lines: ticketLines,
      ticket,
      serviceKey: deriveServiceKey(ticketLines, ticket),
      reference: refundRef,
      narration: `${reason} · ${ticket.ticket_code || ''}`.trim(),
      skipSchemaEnsure: true,
      precachedCashier,
    });
  }

  await pool.query(
    `UPDATE tbl_cashier_refund_request
     SET status = 'paid',
         approved_by = ?,
         approved_at = NOW(),
         ticket_id = ?,
         ticket_code = ?
     WHERE id = ?`,
    [userId || null, ticket.id, ticket.ticket_code, requestId]
  );

  await finishRefundPostCommit(pool, txnRow, ctx);

  return {
    ok: true,
    id: requestId,
    ticket_id: ticket.id,
    ticket_code: ticket.ticket_code,
    new_balance: ticketApply.balanceDue,
    amount_paid: ticketApply.newPaid,
  };
}

/**
 * Process an approved cashier refund request — updates bill balance, wallet, billing doc, GL.
 */
async function postCashierRefundRequest(pool, row, session) {
  const refundAmount = roundMoney(row.amount);
  const refundMethod = String(row.refund_method || 'Cash').trim() || 'Cash';
  const reason = String(row.reason || '').trim();
  const fid = parseInt(String(row.facility_id || session?.facilityId || 1), 10) || 1;
  const userId = parseInt(String(session?.userId || 0), 10) || 0;
  const patientId = parseInt(String(row.patient_id), 10) || 0;
  const requestId = parseInt(String(row.id), 10) || 0;
  const refundRef = String(row.refund_ref || `RFD-${requestId}`).trim();

  const ticket = await resolveRefundTicket(pool, row.ticket_id, row.ticket_code);
  if (!ticket) {
    return { ok: false, error: 'Original bill not found for this refund.', status: 404 };
  }

  const maxRefundable = await refundableAmountForTicket(pool, ticket, requestId);
  if (refundAmount > maxRefundable + 0.005) {
    return {
      ok: false,
      error: `Refund exceeds refundable balance (${maxRefundable}).`,
      status: 400,
    };
  }

  await prepareRefundPostSchemas(pool);

  let precachedCashier = null;
  if (userId > 0) {
    const { resolveCashierForEmployee, syncCashierIdentities } = require('./cashierIdentity');
    await syncCashierIdentities(pool, { facilityId: fid }).catch(() => {});
    precachedCashier = await resolveCashierForEmployee(pool, userId, {
      facilityId: fid,
      forceAssign: true,
    });
    if (!precachedCashier) {
      return { ok: false, error: 'Cashier identity required to approve refunds.', status: 400 };
    }
  }

  const pgCtx = {
    row,
    ticket,
    refundAmount,
    refundMethod,
    reason,
    fid,
    userId,
    patientId,
    requestId,
    refundRef,
    precachedCashier,
    maxRefundable,
  };

  if (pool.driver === 'postgres') {
    try {
      return await postCashierRefundRequestPg(pool, pgCtx);
    } catch (e) {
      return { ok: false, error: e.message || 'Refund processing failed.', status: 500 };
    }
  }

  const conn = await pool.getConnection();
  let billingDocumentId = null;
  let txnRow = null;
  let ticketApply = null;
  try {
    await conn.beginTransaction();

    ticketApply = await applyRefundToPaymentTicket(conn, ticket, {
      refundAmount,
      refundMethod,
      reason,
      refundRef,
      maxRefundable,
    });
    if (!ticketApply.ok) {
      await conn.rollback();
      return { ...ticketApply, status: 400 };
    }

    if (refundMethod.toLowerCase().includes('wallet')) {
      await creditPatientWallet(
        conn,
        patientId,
        refundAmount,
        refundRef,
        reason,
        userId
      );
    }

    const receiptNo = await nextReceiptNumber(conn, fid);
    const invoiceNo = await nextInvoiceNumber(conn, fid);
    const [docIns] = await conn.query(
      `INSERT INTO tbl_billing_document
       (facility_id, patient_id, doc_type, doc_number, invoice_doc_number, total_amount, payment_method,
        status, source_module, source_pk, created_by, created_at)
       VALUES (?, ?, 'refund', ?, ?, ?, ?, 'paid', 'cashier_refund', ?, ?, NOW())`,
      [fid, patientId, receiptNo, invoiceNo, -refundAmount, refundMethod, requestId, userId]
    );
    billingDocumentId = docIns?.insertId || null;

    const ticketLines = parseTicketLines(ticket);
    if (userId > 0) {
      txnRow = await recordRefundInTransaction(conn, {
        facilityId: fid,
        userId,
        sourcePk: requestId,
        amount: refundAmount,
        paymentMethod: refundMethod,
        billingDocumentId,
        patientId,
        lines: ticketLines,
        ticket,
        serviceKey: deriveServiceKey(ticketLines, ticket),
        reference: refundRef,
        narration: `${reason} · ${ticket.ticket_code || ''}`.trim(),
        skipSchemaEnsure: true,
        precachedCashier,
      });
    }

    await conn.query(
      `UPDATE tbl_cashier_refund_request
       SET status = 'paid',
           approved_by = ?,
           approved_at = NOW(),
           ticket_id = ?,
           ticket_code = ?
       WHERE id = ?`,
      [userId || null, ticket.id, ticket.ticket_code, requestId]
    );

    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    return { ok: false, error: e.message || 'Refund processing failed.', status: 500 };
  } finally {
    conn.release();
  }

  await finishRefundPostCommit(pool, txnRow, pgCtx);

  return {
    ok: true,
    id: requestId,
    ticket_id: ticket.id,
    ticket_code: ticket.ticket_code,
    new_balance: ticketApply.balanceDue,
    amount_paid: ticketApply.newPaid,
  };
}

function refundAppliedOnTicket(ticket, refundRef) {
  const ref = String(refundRef || '').trim();
  if (!ref) return false;
  return parseTicketLines(ticket).some(
    (ln) => ln.kind === 'refund' && String(ln.refund_ref || '').trim() === ref
  );
}

/** Fix paid refunds that were approved before ticket balance posting existed. */
async function repairStalePaidCashierRefund(pool, row) {
  const ticket = await resolveRefundTicket(pool, row.ticket_id, row.ticket_code);
  if (!ticket) return { repaired: false };

  const refundRef = String(row.refund_ref || `RFD-${row.id}`).trim();
  const lineApplied = refundAppliedOnTicket(ticket, refundRef);
  if (lineApplied) {
    const synced = await syncTicketPaidWithRefundLines(pool, ticket);
    if (synced.amount_paid !== ticket.amount_paid || synced.status !== ticket.status) {
      return { repaired: true, ticket_id: ticket.id, synced: true };
    }
    return { repaired: false };
  }

  const refundAmount = roundMoney(row.amount);
  if (refundAmount <= 0) return { repaired: false };

  const conn = await pool.getConnection();
  try {
    await prepareRefundPostSchemas(pool);
    await conn.beginTransaction();
    const maxRefundable = await refundableAmountForTicket(pool, ticket, row.id);
    const ticketApply = await applyRefundToPaymentTicket(conn, ticket, {
      refundAmount,
      refundMethod: row.refund_method || 'Cash',
      reason: row.reason || 'Cashier refund',
      refundRef,
      maxRefundable,
    });
    if (!ticketApply.ok) {
      await conn.rollback();
      return { repaired: false, error: ticketApply.error };
    }

    const refundMethod = String(row.refund_method || 'Cash').trim();
    if (refundMethod.toLowerCase().includes('wallet')) {
      const patientId = parseInt(String(row.patient_id), 10) || 0;
      const userId = parseInt(String(row.approved_by || row.created_by || 0), 10) || 0;
      if (patientId > 0) {
        await creditPatientWallet(
          conn,
          patientId,
          refundAmount,
          refundRef,
          row.reason || 'Cashier refund',
          userId
        );
      }
    }

    if (!row.ticket_id || !row.ticket_code) {
      await conn.query(
        'UPDATE tbl_cashier_refund_request SET ticket_id = ?, ticket_code = ? WHERE id = ?',
        [ticket.id, ticket.ticket_code, row.id]
      );
    }

    await conn.commit();
    return { repaired: true, ticket_id: ticket.id, new_balance: ticketApply.balanceDue };
  } catch (e) {
    await conn.rollback().catch(() => {});
    return { repaired: false, error: e.message };
  } finally {
    conn.release();
  }
}

async function repairStalePaidCashierRefunds(pool, limit = 50) {
  const [rows] = await pool
    .query(
      `SELECT * FROM tbl_cashier_refund_request
        WHERE status = 'paid'
        ORDER BY COALESCE(approved_at, created_at) DESC
        LIMIT ?`,
      [Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)]
    )
    .catch(() => [[]]);

  let repaired = 0;
  for (const row of rows || []) {
    const out = await repairStalePaidCashierRefund(pool, row).catch(() => ({ repaired: false }));
    if (out.repaired) repaired += 1;
  }
  return { repaired };
}

module.exports = {
  roundMoney,
  paidOnTicket,
  grossCollectedOnTicket,
  sumRefundLinesOnTicket,
  syncTicketPaidWithRefundLines,
  resolveRefundTicket,
  refundableAmountForTicket,
  paidRefundSummaryForTicket,
  applyRefundToPaymentTicket,
  postCashierRefundRequest,
  repairStalePaidCashierRefund,
  repairStalePaidCashierRefunds,
};
