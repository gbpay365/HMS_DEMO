'use strict';

const { formatDisplayDate, toIsoDatePart } = require('./hmsFormatDate');
const { fmtMoney } = require('./cashierDailySummary');

function safeJsonLines(raw) {
  try {
    const a = JSON.parse(String(raw || '[]'));
    return Array.isArray(a) ? a : [];
  } catch (_) {
    return [];
  }
}

/**
 * Load journal header context: billing receipt, cashier txn, ticket lines.
 */
async function loadJournalDetailContext(pool, journalId, facilityId = 1) {
  const jid = parseInt(String(journalId || 0), 10) || 0;
  const fid = parseInt(String(facilityId || 1), 10) || 1;
  if (jid < 1) return null;

  const [[header]] = await pool
    .query('SELECT * FROM tbl_fin_journal_header WHERE id = ? AND facility_id = ? LIMIT 1', [jid, fid])
    .catch(() => [[null]]);
  if (!header) return null;

  const [lineRows] = await pool
    .query(
      `SELECT jl.id, jl.account_code AS acode, jl.account_label AS alabel,
              jl.debit, jl.credit, jl.line_memo
         FROM tbl_fin_journal_line jl
        WHERE jl.journal_id = ?
        ORDER BY jl.id ASC`,
      [jid]
    )
    .catch(() => [[]]);

  const lines = (lineRows || []).map((row) => ({
    ...row,
    line_memo: row.line_memo || '',
  }));

  let cashierTxn = null;
  let billing = null;
  let ticket = null;
  let patient = null;
  const sourceType = String(header.source_type || '');
  const sourceId = parseInt(header.source_id, 10) || 0;

  const [[txnByJournal]] = await pool
    .query('SELECT * FROM tbl_cashier_txn WHERE journal_header_id = ? LIMIT 1', [jid])
    .catch(() => [[null]]);
  cashierTxn = txnByJournal || null;

  if (sourceType === 'billing_receipt' && sourceId > 0) {
    const [[bill]] = await pool
      .query('SELECT * FROM tbl_billing_document WHERE id = ? LIMIT 1', [sourceId])
      .catch(() => [[null]]);
    billing = bill || null;

    if (!cashierTxn && bill) {
      const [[txnByBill]] = await pool
        .query('SELECT * FROM tbl_cashier_txn WHERE billing_document_id = ? LIMIT 1', [bill.id])
        .catch(() => [[null]]);
      cashierTxn = txnByBill || null;
    }

    if (bill?.patient_id) {
      const [[pat]] = await pool
        .query(
          'SELECT id, first_name, last_name, patient_code FROM tbl_patient WHERE id = ? LIMIT 1',
          [bill.patient_id]
        )
        .catch(() => [[null]]);
      patient = pat || null;
    }

    if (bill?.source_module === 'payment_ticket' && bill.source_pk) {
      const [[tkt]] = await pool
        .query('SELECT * FROM tbl_payment_ticket WHERE id = ? LIMIT 1', [bill.source_pk])
        .catch(() => [[null]]);
      if (tkt) {
        ticket = {
          ...tkt,
          lines: safeJsonLines(tkt.lines_json),
        };
      }
    }
  }

  if (sourceType === 'expense' || sourceType === 'cashier_payout' || sourceType === 'cashier_disbursement') {
    const [[disb]] = await pool
      .query('SELECT * FROM tbl_cashier_disbursement WHERE id = ? LIMIT 1', [sourceId])
      .catch(() => [[null]]);
    if (disb && !cashierTxn) {
      const [[txnDisb]] = await pool
        .query(
          'SELECT * FROM tbl_cashier_txn WHERE source_module = ? AND source_pk = ? LIMIT 1',
          ['cashier_disbursement', sourceId]
        )
        .catch(() => [[null]]);
      cashierTxn = txnDisb || null;
    }
    billing = disb
      ? {
          doc_type: disb.txn_type,
          total_amount: disb.amount,
          payment_method: disb.payment_method,
          narration: disb.narration,
          category: disb.category,
        }
      : billing;
  }

  if (sourceType === 'cashier_refund' && !cashierTxn) {
    const [[txnRef]] = await pool
      .query('SELECT * FROM tbl_cashier_txn WHERE id = ? LIMIT 1', [sourceId])
      .catch(() => [[null]]);
    cashierTxn = txnRef || null;
  }

  let purchaseOrder = null;
  if (sourceType === 'purchase_order' && sourceId > 0) {
    const [[poRow]] = await pool
      .query('SELECT * FROM tbl_purchase_order WHERE id = ? LIMIT 1', [sourceId])
      .catch(() => [[null]]);
    if (poRow) {
      const [poLines] = await pool
        .query(
          `SELECT l.*, i.name AS item_name
             FROM tbl_purchase_order_line l
             LEFT JOIN tbl_inventory_item i ON i.id = l.inventory_item_id
            WHERE l.purchase_order_id = ?
            ORDER BY l.id ASC`,
          [sourceId]
        )
        .catch(() => [[]]);
      purchaseOrder = {
        ...poRow,
        lines: (poLines || []).map((ln) => ({
          item_name: ln.item_name || ln.description || 'Item',
          quantity: parseFloat(ln.quantity) || 0,
          unit_price: parseFloat(ln.unit_price) || 0,
          line_total: (parseFloat(ln.quantity) || 0) * (parseFloat(ln.unit_price) || 0),
        })),
      };
    }
  }

  const entryIso = toIsoDatePart(header.entry_date);
  const enrichedHeader = {
    ...header,
    entry_date: formatDisplayDate(entryIso || header.entry_date),
    entry_date_iso: entryIso,
    created_at_display: formatDisplayDate(header.created_at),
  };

  const ticketLines = (ticket?.lines || []).map((ln) => ({
    description: ln.description || ln.kind || 'Service',
    quantity: parseFloat(ln.quantity || 1) || 1,
    unit_price: parseFloat(ln.unit_price || ln.amount || 0) || 0,
    patient_due: ln.patient_due != null ? parseFloat(ln.patient_due) : null,
  }));

  const context = {
    header: enrichedHeader,
    lines,
    cashierTxn: cashierTxn
      ? {
          id: cashierTxn.id,
          cashier_code: cashierTxn.cashier_code,
          cashier_identity: cashierTxn.cashier_identity,
          txn_type: cashierTxn.txn_type,
          payment_method: cashierTxn.payment_method,
          amount: parseFloat(cashierTxn.amount) || 0,
          amount_fmt: fmtMoney(cashierTxn.amount),
          opening_balance: parseFloat(cashierTxn.opening_balance) || 0,
          opening_balance_fmt: fmtMoney(cashierTxn.opening_balance),
          debit_amount: parseFloat(cashierTxn.debit_amount) || 0,
          debit_amount_fmt: fmtMoney(cashierTxn.debit_amount),
          credit_amount: parseFloat(cashierTxn.credit_amount) || 0,
          credit_amount_fmt: fmtMoney(cashierTxn.credit_amount),
          closing_balance: parseFloat(cashierTxn.closing_balance) || 0,
          closing_balance_fmt: fmtMoney(cashierTxn.closing_balance),
          gl_debit_account: cashierTxn.gl_debit_account,
          gl_credit_account: cashierTxn.gl_credit_account,
          reference: cashierTxn.reference,
          narration: cashierTxn.narration,
          created_at_fmt: formatDisplayDate(cashierTxn.created_at),
        }
      : null,
    billing: billing
      ? {
          id: billing.id,
          doc_type: billing.doc_type,
          doc_number: billing.doc_number,
          total_amount: parseFloat(billing.total_amount) || 0,
          total_amount_fmt: fmtMoney(billing.total_amount),
          payment_method: billing.payment_method,
          source_module: billing.source_module,
          category: billing.category,
          narration: billing.narration,
          created_at_fmt: formatDisplayDate(billing.created_at),
        }
      : null,
    patient: patient
      ? {
          id: patient.id,
          name: `${patient.first_name || ''} ${patient.last_name || ''}`.trim(),
          patient_code: patient.patient_code,
        }
      : null,
    ticket: ticket
      ? {
          id: ticket.id,
          ticket_code: ticket.ticket_code,
          payment_method: ticket.payment_method,
          total_amount_fmt: fmtMoney(ticket.total_amount),
        }
      : null,
    ticketLines,
    purchaseOrder: purchaseOrder
      ? {
          id: purchaseOrder.id,
          po_number: purchaseOrder.po_number,
          supplier_name: purchaseOrder.supplier_name,
          total_amount_fmt: fmtMoney(purchaseOrder.total_amount),
          status: purchaseOrder.status,
          lines: purchaseOrder.lines.map((ln) => ({
            ...ln,
            line_total_fmt: fmtMoney(ln.line_total),
          })),
        }
      : null,
  };

  return context;
}

module.exports = { loadJournalDetailContext };
