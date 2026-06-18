const { finTablesOk, tableExists } = require('./hmsFinGeneralLedger');
const { syncJournalFromReceipt, postExpenseToGl, journalPostLastError } = require('./hmsFinJournalPost');

async function billingDocumentTablesOk(pool) {
 return (await tableExists(pool, 'tbl_billing_document')) && (await tableExists(pool, 'tbl_billing_document_line'));
}

/**
 * @returns {Promise<{processed:number,inserted:number,duplicate:number,failed:number,first_error:string}>}
 */
async function backfillReceiptJournals(pool, facilityId, limit = 500) {
 const out = { processed: 0, inserted: 0, duplicate: 0, failed: 0, first_error: '' };
 if (!(await finTablesOk(pool)) || !(await billingDocumentTablesOk(pool))) return out;
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const lim = Math.max(1, Math.min(2000, parseInt(limit, 10) || 500));

 let rows = [];
 try {
  const [r] = await pool.query(
   `SELECT d.id, d.source_module, d.total_amount, d.payment_method, d.created_by, d.doc_number,
     (SELECT l.description FROM tbl_billing_document_line l WHERE l.document_id = d.id ORDER BY l.sort_order, l.id LIMIT 1) AS first_line
     FROM tbl_billing_document d
     WHERE d.facility_id = ? AND d.doc_type = 'receipt' AND d.total_amount > 0.005
     ORDER BY d.id ASC
     LIMIT ${lim}`,
   [fid]
  );
  rows = r || [];
 } catch (e) {
  return out;
 }

 for (const row of rows) {
  const code = await syncJournalFromReceipt(
   pool,
   fid,
   parseInt(row.id, 10) || 0,
   String(row.source_module || ''),
   parseFloat(row.total_amount) || 0,
   row.payment_method != null ? String(row.payment_method) : null,
   parseInt(row.created_by, 10) || 0,
   String(row.doc_number || ''),
   String(row.first_line || 'Payment')
  );
  if (code === 1) out.inserted++;
  else if (code === 2) out.duplicate++;
  else {
   out.failed++;
   if (!out.first_error) out.first_error = journalPostLastError();
  }
 }
 out.processed = rows.length;
 return out;
}

/**
 * @returns {Promise<{processed:number,inserted:number,duplicate:number,failed:number,first_error:string}>}
 */
async function backfillReceiptJournalsForDateRange(pool, facilityId, dateFrom, dateTo, limit = 3000) {
 const out = { processed: 0, inserted: 0, duplicate: 0, failed: 0, first_error: '' };
 const d1 = String(dateFrom || '').trim().slice(0, 10);
 const d2 = String(dateTo || '').trim().slice(0, 10);
 if (!/^\d{4}-\d{2}-\d{2}$/.test(d1) || !/^\d{4}-\d{2}-\d{2}$/.test(d2)) return out;
 if (!(await finTablesOk(pool)) || !(await billingDocumentTablesOk(pool))) return out;
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const lim = Math.max(1, Math.min(5000, parseInt(limit, 10) || 3000));

 let rows = [];
 try {
  const [r] = await pool.query(
   `SELECT d.id, d.source_module, d.total_amount, d.payment_method, d.created_by, d.doc_number,
     (SELECT l.description FROM tbl_billing_document_line l WHERE l.document_id = d.id ORDER BY l.sort_order, l.id LIMIT 1) AS first_line
     FROM tbl_billing_document d
     WHERE d.facility_id = ? AND d.doc_type = 'receipt' AND d.total_amount > 0.005
     AND DATE(d.created_at) BETWEEN ? AND ?
     ORDER BY d.id ASC
     LIMIT ${lim}`,
   [fid, d1, d2]
  );
  rows = r || [];
 } catch (e) {
  return out;
 }

 for (const row of rows) {
  const code = await syncJournalFromReceipt(
   pool,
   fid,
   parseInt(row.id, 10) || 0,
   String(row.source_module || ''),
   parseFloat(row.total_amount) || 0,
   row.payment_method != null ? String(row.payment_method) : null,
   parseInt(row.created_by, 10) || 0,
   String(row.doc_number || ''),
   String(row.first_line || 'Payment')
  );
  if (code === 1) out.inserted++;
  else if (code === 2) out.duplicate++;
  else {
   out.failed++;
   if (!out.first_error) out.first_error = journalPostLastError();
  }
 }
 out.processed = rows.length;
 return out;
}

/**
 * @returns {Promise<{processed:number,inserted:number,duplicate:number,failed:number,first_error:string}>}
 */
async function backfillExpenseJournals(pool, facilityId, limit = 500) {
 const out = { processed: 0, inserted: 0, duplicate: 0, failed: 0, first_error: '' };
 if (!(await finTablesOk(pool)) || !(await tableExists(pool, 'tbl_expense'))) return out;
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const lim = Math.max(1, Math.min(2000, parseInt(limit, 10) || 500));

 let rows = [];
 try {
  const [r] = await pool.query(
   `SELECT id, expense_date, amount_xaf, payment_method, category, description, created_by
    FROM tbl_expense WHERE facility_id = ? ORDER BY id ASC LIMIT ${lim}`,
   [fid]
  );
  rows = r || [];
 } catch (e) {
  return out;
 }

 for (const row of rows) {
  const code = await postExpenseToGl(
   pool,
   fid,
   parseInt(row.id, 10) || 0,
   String(row.expense_date || '').slice(0, 10),
   parseInt(row.amount_xaf, 10) || 0,
   row.payment_method != null ? String(row.payment_method) : null,
   String(row.category || ''),
   String(row.description || ''),
   parseInt(row.created_by, 10) || 0
  );
  if (code === 1) out.inserted++;
  else if (code === 2) out.duplicate++;
  else {
   out.failed++;
   if (!out.first_error) out.first_error = journalPostLastError();
  }
 }
 out.processed = rows.length;
 return out;
}

/**
 * @returns {Promise<{processed:number,inserted:number,duplicate:number,failed:number,first_error:string}>}
 */
async function backfillExpenseJournalsForDateRange(pool, facilityId, dateFrom, dateTo, limit = 3000) {
 const out = { processed: 0, inserted: 0, duplicate: 0, failed: 0, first_error: '' };
 const d1 = String(dateFrom || '').trim().slice(0, 10);
 const d2 = String(dateTo || '').trim().slice(0, 10);
 if (!/^\d{4}-\d{2}-\d{2}$/.test(d1) || !/^\d{4}-\d{2}-\d{2}$/.test(d2)) return out;
 if (!(await finTablesOk(pool)) || !(await tableExists(pool, 'tbl_expense'))) return out;
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const lim = Math.max(1, Math.min(5000, parseInt(limit, 10) || 3000));

 let rows = [];
 try {
  const [r] = await pool.query(
   `SELECT id, expense_date, amount_xaf, payment_method, category, description, created_by
    FROM tbl_expense WHERE facility_id = ? AND expense_date BETWEEN ? AND ?
    ORDER BY id ASC LIMIT ${lim}`,
   [fid, d1, d2]
  );
  rows = r || [];
 } catch (e) {
  return out;
 }

 for (const row of rows) {
  const code = await postExpenseToGl(
   pool,
   fid,
   parseInt(row.id, 10) || 0,
   String(row.expense_date || '').slice(0, 10),
   parseInt(row.amount_xaf, 10) || 0,
   row.payment_method != null ? String(row.payment_method) : null,
   String(row.category || ''),
   String(row.description || ''),
   parseInt(row.created_by, 10) || 0
  );
  if (code === 1) out.inserted++;
  else if (code === 2) out.duplicate++;
  else {
   out.failed++;
   if (!out.first_error) out.first_error = journalPostLastError();
  }
 }
 out.processed = rows.length;
 return out;
}

module.exports = {
 billingDocumentTablesOk,
 backfillReceiptJournals,
 backfillReceiptJournalsForDateRange,
 backfillExpenseJournals,
 backfillExpenseJournalsForDateRange
};
