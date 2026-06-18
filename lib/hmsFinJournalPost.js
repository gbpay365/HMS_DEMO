/**
 * GL journal posting — parity with PHP includes/financials.php (journal_post, sync from receipt, expense GL).
 */
const ensureFinJournal019 = require('./ensureFinJournal019');
const { finTablesOk, tableExists } = require('./hmsFinGeneralLedger');
const { formatDisplayDate } = require('./hmsFormatDate');

let lastJournalPostError = '';
function journalPostLastError() {
 return lastJournalPostError;
}
function journalPostSetLastError(msg) {
 lastJournalPostError = String(msg || '');
}

async function ensureFacilityRowForJournal(pool, facilityId) {
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 try {
  const [[r]] = await pool.query('SELECT id FROM tbl_facility WHERE id = ? LIMIT 1', [fid]);
  if (r) return true;
 } catch (e) {
  return true;
 }
 const code = fid === 1 ? 'MAIN' : `AUTO${fid}`;
 const hmsBrand = require('./hmsBrand');
 const name = fid === 1 ? (hmsBrand.orgName || 'ZAIZENS') : `Hospital site #${fid}`;
 try {
  await pool.query(
   'INSERT INTO tbl_facility (id, code, name, status) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE name = VALUES(name)',
   [fid, String(code).slice(0, 32), String(name).slice(0, 250)]
  );
  return true;
 } catch (e) {
  try {
   await pool.query('INSERT INTO tbl_facility (id, name, status) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE name = VALUES(name)', [
    fid,
    String(name).slice(0, 255)
   ]);
   return true;
  } catch (e2) {
   journalPostSetLastError(`facility insert failed: ${e2.message || e2}`);
   return false;
  }
 }
}

/** @returns {Promise<-1|0|1>} -1 query error, 0 not found, 1 exists */
async function journalSourceLookup(pool, facilityId, sourceType, sourceId) {
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const sid = Math.max(0, parseInt(sourceId, 10) || 0);
 const st = String(sourceType || '').trim();
 if (fid < 1 || sid < 1 || !st) return 0;
 try {
  const [[r]] = await pool.query(
   'SELECT 1 AS x FROM tbl_fin_journal_header WHERE facility_id = ? AND source_type = ? AND source_id = ? LIMIT 1',
   [fid, st, sid]
  );
  return r ? 1 : 0;
 } catch (e) {
  journalPostSetLastError(`duplicate check query failed: ${e.message || e}`);
  return -1;
 }
}

async function nextManualSourceId(pool, facilityId) {
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 if (!(await finTablesOk(pool)) || fid < 1) return 1;
 try {
  const [[r]] = await pool.query(
   "SELECT COALESCE(MAX(source_id), 0) + 1 AS n FROM tbl_fin_journal_header WHERE facility_id = ? AND source_type = 'manual_import'",
   [fid]
  );
  const n = parseInt(r?.n, 10) || 1;
  return n > 0 ? n : 1;
 } catch (e) {
  return Math.floor(Date.now() % 2000000000) || 1;
 }
}

function cashLikeAccount(paymentMethod) {
 const m = String(paymentMethod || '').toLowerCase();
 if (
  m.includes('bank') ||
  m.includes('transfer') ||
  m.includes('wire') ||
  m.includes('card') ||
  m.includes('mobile') ||
  m.includes('momo') ||
  m === 'om' ||
  m.includes('orange') ||
  m.includes('betterpay') ||
  m.includes('qr')
 ) {
  return { code: '521000', label: 'Banks — patient collection' };
 }
 return { code: '571000', label: 'Cash — patient collection' };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} sourceType
 * @param {number} sourceId
 * @param {Array<{code:string,label:string,debit:number,credit:number}>} lines
 * @param {string|null} entryDate YYYY-MM-DD
 * @returns {Promise<0|1|2>} 0 fail, 1 inserted, 2 duplicate
 */
async function journalPost(
 pool,
 facilityId,
 sourceType,
 sourceId,
 reference,
 narration,
 createdBy,
 lines,
 entryDate = null
) {
 journalPostSetLastError('');
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const sid = Math.max(0, parseInt(sourceId, 10) || 0);
 const st = String(sourceType || '').trim();
 if (!(await finTablesOk(pool)) || fid < 1 || !st || sid < 1 || !lines || !lines.length) {
  journalPostSetLastError('validation: missing table, facility, source, or lines');
  return 0;
 }
 await ensureFinJournal019(pool).catch(() => {});
 if (!(await ensureFacilityRowForJournal(pool, fid))) return 0;

 const dup = await journalSourceLookup(pool, fid, st, sid);
 if (dup === -1) return 0;
 if (dup === 1) return 2;

 let sumDr = 0;
 let sumCr = 0;
 for (const ln of lines) {
  sumDr += Math.round((parseFloat(ln.debit) || 0) * 100) / 100;
  sumCr += Math.round((parseFloat(ln.credit) || 0) * 100) / 100;
 }
 if (Math.abs(sumDr - sumCr) > 0.02 || sumDr <= 0) {
  journalPostSetLastError(`validation: lines not balanced or zero amount (dr=${sumDr} cr=${sumCr})`);
  return 0;
 }

 const ref = String(reference || '').slice(0, 64);
 const nar = String(narration || '').slice(0, 512);
 const ed = /^\d{4}-\d{2}-\d{2}$/.test(String(entryDate || '').trim())
  ? String(entryDate).trim().slice(0, 10)
  : new Date().toISOString().slice(0, 10);
 const uid = Math.max(0, parseInt(createdBy, 10) || 0);

 const conn = await pool.getConnection();
 try {
  await conn.beginTransaction();

  const [hdrRes] = await conn.query(
   'INSERT INTO tbl_fin_journal_header (facility_id, entry_date, reference, narration, source_type, source_id, created_by) VALUES (?,?,?,?,?,?,?)',
   [fid, ed, ref, nar, st, sid, uid]
  );
  const jid = hdrRes.insertId;
  if (!jid || jid < 1) throw new Error('journal id missing');

  let lineInserts = 0;
  for (const ln of lines) {
   const code = String(ln.code ?? '').slice(0, 32);
   const lab = String(ln.label ?? '').slice(0, 160);
   const dr = Math.round((parseFloat(ln.debit) || 0) * 100) / 100;
   const cr = Math.round((parseFloat(ln.credit) || 0) * 100) / 100;
   if (!code) continue;
   await conn.query(
    'INSERT INTO tbl_fin_journal_line (journal_id, account_code, account_label, debit, credit) VALUES (?,?,?,?,?)',
    [jid, code, lab, dr, cr]
   );
   lineInserts++;
  }
  if (lineInserts < 1) throw new Error('no journal lines with account codes');

  await conn.commit();
  return 1;
 } catch (e) {
  await conn.rollback();
  journalPostSetLastError(String(e.message || e));
  return 0;
 } finally {
  conn.release();
 }
}

async function postCreditPaymentCollection(
 pool,
 facilityId,
 creditPaymentId,
 amount,
 paymentMethod,
 createdBy,
 docNumber,
 lineDescription,
 entryDate
) {
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const payId = Math.max(0, parseInt(creditPaymentId, 10) || 0);
 const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
 if (!(await finTablesOk(pool)) || fid < 1 || payId < 1 || amt <= 0) return 0;
 const cash = cashLikeAccount(paymentMethod);
 const ref = String(docNumber || '').trim() ? String(docNumber).trim().slice(0, 64) : `CR-PAY-${payId}`;
 const nar = `Patient AR collection · ${String(lineDescription || '').trim().slice(0, 400)}`;

 return journalPost(
  pool,
  fid,
  'credit_payment',
  payId,
  ref,
  nar,
  createdBy,
  [
   { code: cash.code, label: cash.label, debit: amt, credit: 0 },
   { code: '411000', label: 'Trade receivables — patients', debit: 0, credit: amt }
  ],
  entryDate
 );
}

/**
 * @returns {Promise<0|1|2>}
 */
async function syncJournalFromReceipt(
 pool,
 facilityId,
 billingDocumentId,
 sourceModule,
 grandTotal,
 paymentMethod,
 createdBy,
 docNumber,
 firstLineDescription
) {
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const bid = Math.max(0, parseInt(billingDocumentId, 10) || 0);
 if (!(await finTablesOk(pool)) || bid < 1 || (parseFloat(grandTotal) || 0) <= 0) return 0;

 let docRow = null;
 try {
  const [[r]] = await pool.query(
   'SELECT DATE(created_at) AS entry_d, source_module, source_pk FROM tbl_billing_document WHERE id = ? AND facility_id = ? LIMIT 1',
   [bid, fid]
  );
  docRow = r || null;
 } catch (e) {
  return 0;
 }
 if (!docRow) return 0;

 let receiptDate = String(docRow.entry_d || '').trim().slice(0, 10);
 if (!/^\d{4}-\d{2}-\d{2}$/.test(receiptDate)) receiptDate = new Date().toISOString().slice(0, 10);

 const mod = String(docRow.source_module ?? sourceModule ?? '');
 const srcMod = String(sourceModule || '');
 const isCreditDoc = mod === 'credit_payment' || srcMod === 'credit_payment';

 if (isCreditDoc && (await tableExists(pool, 'tbl_credit_payment'))) {
  try {
   const [[cp]] = await pool.query(
    'SELECT id, amount, payment_method FROM tbl_credit_payment WHERE id = (SELECT source_pk FROM tbl_billing_document WHERE id = ? AND facility_id = ? LIMIT 1) LIMIT 1',
    [bid, fid]
   );
   if (cp) {
    const payId = parseInt(cp.id, 10) || 0;
    const amt = parseFloat(cp.amount) || 0;
    const pm = String(cp.payment_method ?? paymentMethod ?? 'Cash');
    if (payId >= 1) {
     return postCreditPaymentCollection(
      pool,
      fid,
      payId,
      amt > 0 ? amt : grandTotal,
      pm,
      createdBy,
      docNumber,
      firstLineDescription,
      receiptDate
     );
    }
   }
  } catch (e) {
   /* fall through to revenue path */
  }
 }

 const amt = Math.round((parseFloat(grandTotal) || 0) * 100) / 100;
 const cash = cashLikeAccount(paymentMethod);
 const ref = String(docNumber || '').trim() ? String(docNumber).trim().slice(0, 64) : `RCP-${bid}`;
 let nar = `Patient receipt · ${String(firstLineDescription || '').trim().slice(0, 400)}`;
 if (isCreditDoc) {
  nar = `Patient receipt (cash/revenue; credit link missing or repaired) · ${String(firstLineDescription || '').trim().slice(0, 360)}`;
 }

 return journalPost(
  pool,
  fid,
  'billing_receipt',
  bid,
  ref,
  nar,
  createdBy,
  [
   { code: cash.code, label: cash.label, debit: amt, credit: 0 },
   { code: '706000', label: 'Healthcare services revenue', debit: 0, credit: amt }
  ],
  receiptDate
 );
}

/**
 * @returns {Promise<0|1|2>}
 */
async function postExpenseToGl(
 pool,
 facilityId,
 expenseId,
 expenseDate,
 amountXaf,
 paymentMethod,
 category,
 description,
 createdBy
) {
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const eid = Math.max(0, parseInt(expenseId, 10) || 0);
 const ax = parseInt(amountXaf, 10) || 0;
 if (!(await finTablesOk(pool)) || fid < 1 || eid < 1 || ax < 1) return 0;
 const ed = String(expenseDate || '').trim().slice(0, 10);
 if (!/^\d{4}-\d{2}-\d{2}$/.test(ed)) return 0;

 const amt = Math.round((parseFloat(ax) || 0) * 100) / 100;
 const cash = cashLikeAccount(paymentMethod);
 const cat = String(category || '').trim() ? String(category).trim().slice(0, 80) : 'General';
 const desc = String(description || '').trim().slice(0, 200);
 const nar = `Expense · ${cat}${desc ? ` — ${desc}` : ''}`;
 const ref = `EXP-${eid}`;

 return journalPost(
  pool,
  fid,
  'expense',
  eid,
  ref,
  nar.slice(0, 512),
  createdBy,
  [
   { code: '601000', label: `Operating expenses — ${cat}`, debit: amt, credit: 0 },
   { code: cash.code, label: cash.label, debit: 0, credit: amt }
  ],
  ed
 );
}

async function journalPostManual(pool, facilityId, entryDate, reference, narration, createdBy, lines) {
 const r = await journalPostManualWithResult(pool, facilityId, entryDate, reference, narration, createdBy, lines);
 return !!(r && r.ok);
}

/**
 * Same as journalPostManual but returns the new header id (manual_import + allocated source_id).
 * @returns {Promise<{ok:boolean,journalId:number,duplicate:boolean,error:string}>}
 */
async function journalPostManualWithResult(pool, facilityId, entryDate, reference, narration, createdBy, lines) {
 journalPostSetLastError('');
 if (!(await finTablesOk(pool)) || !lines || !lines.length) {
  journalPostSetLastError('Journal tables missing or no lines.');
  return { ok: false, journalId: 0, duplicate: false, error: journalPostLastError() };
 }
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const sid = await nextManualSourceId(pool, facilityId);
 const r = await journalPost(
  pool,
  fid,
  'manual_import',
  sid,
  reference,
  narration,
  createdBy,
  lines,
  entryDate
 );
 if (r === 1 || r === 2) {
  let journalId = 0;
  try {
   const [[row]] = await pool.query(
    'SELECT id FROM tbl_fin_journal_header WHERE facility_id = ? AND source_type = ? AND source_id = ? LIMIT 1',
    [fid, 'manual_import', sid]
   );
   journalId = parseInt(row && row.id, 10) || 0;
  } catch (_) {
   /* ignore */
  }
  return { ok: true, journalId, duplicate: r === 2, error: '' };
 }
 return { ok: false, journalId: 0, duplicate: false, error: journalPostLastError() || 'Post failed.' };
}

/**
 * @returns {Promise<Array<{id:number,entry_date:string,reference:string,narration:string,source_type:string,line_count:number}>>}
 */
async function finJournalRecentHeaders(pool, facilityId, limit = 80) {
 if (!(await finTablesOk(pool))) return [];
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const lim = Math.max(5, Math.min(200, parseInt(limit, 10) || 80));
 try {
  const [rows] = await pool.query(
   `SELECT h.id, h.entry_date, h.reference, h.narration, h.source_type,
     (SELECT COUNT(*) FROM tbl_fin_journal_line jl WHERE jl.journal_id = h.id) AS line_count
     FROM tbl_fin_journal_header h
     WHERE h.facility_id = ?
     ORDER BY h.entry_date DESC, h.id DESC
     LIMIT ${lim}`,
   [fid]
  );
  return (rows || []).map((row) => ({
   id: parseInt(row.id, 10) || 0,
   entry_date: formatDisplayDate(row.entry_date),
   reference: String(row.reference ?? ''),
   narration: String(row.narration ?? ''),
   source_type: String(row.source_type ?? ''),
   line_count: parseInt(row.line_count, 10) || 0
  }));
 } catch (e) {
  return [];
 }
}

module.exports = {
 journalPostLastError,
 journalPostSetLastError,
 cashLikeAccount,
 journalPost,
 syncJournalFromReceipt,
 postExpenseToGl,
 journalPostManual,
 journalPostManualWithResult,
 nextManualSourceId,
 finJournalRecentHeaders
};
