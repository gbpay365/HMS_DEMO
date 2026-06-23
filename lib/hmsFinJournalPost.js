/**
 * GL journal posting — parity with PHP includes/financials.php (journal_post, sync from receipt, expense GL).
 */
const ensureFinAccountingSchema = require('./ensureFinAccountingSchema');
const ensureFinJournal019 = require('./ensureFinJournal019');
const { finTablesOk, tableExists } = require('./hmsFinGeneralLedger');
const { formatDisplayDate, toIsoDatePart } = require('./hmsFormatDate');
const { journalCodeForSource } = require('./finAccountingConfig');
const {
  nextPieceNumber,
  isPeriodLocked,
  writeJournalAudit,
} = require('./finJournalCore');
const {
  loadTvaRate,
  buildReceiptLines,
  buildExpenseLines,
} = require('./finPostingTemplates');
const { glAccountForPaymentMethod } = require('./paymentMethodGlAccounts');
const { APPLY_TVA_ON_SYNC } = require('./finAccountingConfig');
const { validateJournalEntry } = require('./finJournalValidation');

function serviceKeyFromSourceModule(sourceModule) {
 const m = String(sourceModule || '').toLowerCase();
 if (m.includes('consult')) return 'consultation';
 if (m.includes('lab')) return 'laboratory';
 if (m.includes('rad') || m.includes('imaging')) return 'radiology';
 if (m.includes('pharm')) return 'pharmacy';
 if (m.includes('hospital') || m.includes('ipd') || m.includes('admission')) return 'hospitalisation';
 if (m.includes('emergency') || m.includes('emg')) return 'emergency';
 if (m.includes('charge')) return 'charge';
 return 'default';
}

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
 return glAccountForPaymentMethod(paymentMethod);
}

/**
 * Extended journal post with journal codes, piece numbers, draft/posted, line memos, TVA fields.
 * @returns {Promise<{ok:boolean,journalId:number,duplicate:boolean,code:number}>}
 */
async function journalPostExtended(pool, opts) {
  journalPostSetLastError('');
  const {
    facilityId,
    sourceType,
    sourceId,
    reference,
    narration,
    createdBy,
    lines,
    entryDate = null,
    journalCode = null,
    status = 'posted',
    reversalOfId = null,
    pieceNumber = null,
  } = opts || {};

  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const sid = Math.max(0, parseInt(sourceId, 10) || 0);
  const st = String(sourceType || '').trim();
  if (!(await finTablesOk(pool)) || fid < 1 || !st || sid < 1 || !lines || !lines.length) {
    journalPostSetLastError('validation: missing table, facility, source, or lines');
    return { ok: false, journalId: 0, duplicate: false, code: 0 };
  }

  await ensureFinAccountingSchema(pool, { facilityId: fid });

  const ed = /^\d{4}-\d{2}-\d{2}$/.test(String(entryDate || '').trim())
    ? String(entryDate).trim().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  if (status === 'posted' && (await isPeriodLocked(pool, fid, ed))) {
    journalPostSetLastError('validation: accounting period is locked');
    return { ok: false, journalId: 0, duplicate: false, code: 0 };
  }

  if (!(await ensureFacilityRowForJournal(pool, fid))) {
    return { ok: false, journalId: 0, duplicate: false, code: 0 };
  }

  const dup = await journalSourceLookup(pool, fid, st, sid);
  if (dup === -1) return { ok: false, journalId: 0, duplicate: false, code: 0 };
  if (dup === 1) return { ok: true, journalId: 0, duplicate: true, code: 2 };

  const postStatus = String(status || 'posted') === 'draft' ? 'draft' : 'posted';
  const validationMode = postStatus === 'draft' ? 'create' : 'post';
  const validated = await validateJournalEntry(pool, {
    lines,
    facilityId: fid,
    mode: validationMode,
    sourceType: st,
  });
  if (!validated.ok) {
    journalPostSetLastError(`validation: ${validated.error}`);
    return { ok: false, journalId: 0, duplicate: false, code: 0 };
  }
  const normLines = validated.lines;

  const ref = String(reference || '').slice(0, 64);
  const nar = String(narration || '').slice(0, 512);
  const uid = Math.max(0, parseInt(createdBy, 10) || 0);
  const jc = String(journalCode || journalCodeForSource(st)).trim().slice(0, 8) || 'OD';
  let piece = String(pieceNumber || '').trim().slice(0, 32);
  if (postStatus === 'posted' && !piece) {
    piece = await nextPieceNumber(pool, fid, jc, ed);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const hdrCols = [
      'facility_id', 'entry_date', 'reference', 'narration', 'source_type', 'source_id', 'created_by',
      'journal_code', 'piece_number', 'status', 'reversal_of_id', 'posted_at', 'posted_by',
    ];
    const postedAt = postStatus === 'posted' ? new Date() : null;
    const hdrVals = [
      fid, ed, ref, nar, st, sid, uid, jc, piece, postStatus,
      reversalOfId ? parseInt(reversalOfId, 10) : null,
      postedAt, postStatus === 'posted' ? uid : null,
    ];

    const placeholders = hdrCols.map(() => '?').join(',');
    const [hdrRes] = await conn.query(
      `INSERT INTO tbl_fin_journal_header (${hdrCols.join(', ')}) VALUES (${placeholders})`,
      hdrVals
    );
    const jid = hdrRes.insertId;
    if (!jid || jid < 1) throw new Error('journal id missing');

    let lineInserts = 0;
    for (const ln of normLines) {
      const code = String(ln.code ?? '').slice(0, 32);
      const lab = String(ln.label ?? '').slice(0, 160);
      const dr = Math.round((parseFloat(ln.debit) || 0) * 100) / 100;
      const cr = Math.round((parseFloat(ln.credit) || 0) * 100) / 100;
      if (!code) continue;
      const memo = ln.line_memo != null ? String(ln.line_memo).slice(0, 255) : null;
      const tierId = ln.tier_id != null ? parseInt(ln.tier_id, 10) || null : null;
      const tvaRate = ln.tva_rate != null ? parseFloat(ln.tva_rate) : null;
      const tvaAmt = ln.tva_amount != null ? parseFloat(ln.tva_amount) : null;
      await conn.query(
        `INSERT INTO tbl_fin_journal_line
         (journal_id, account_code, account_label, debit, credit, line_memo, tier_id, tva_rate, tva_amount)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [jid, code, lab, dr, cr, memo, tierId, tvaRate, tvaAmt]
      );
      lineInserts++;
    }
    if (lineInserts < 1) throw new Error('no journal lines with account codes');

    await conn.commit();

    if (postStatus === 'posted') {
      await writeJournalAudit(pool, jid, fid, reversalOfId ? 'posted_reversal' : 'posted', uid, {
        piece_number: piece,
        journal_code: jc,
        source_type: st,
      });
    } else {
      await writeJournalAudit(pool, jid, fid, 'draft_created', uid, { journal_code: jc });
    }

    return { ok: true, journalId: jid, duplicate: false, code: 1 };
  } catch (e) {
    await conn.rollback();
    journalPostSetLastError(String(e.message || e));
    return { ok: false, journalId: 0, duplicate: false, code: 0 };
  } finally {
    conn.release();
  }
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
  const r = await journalPostExtended(pool, {
    facilityId,
    sourceType,
    sourceId,
    reference,
    narration,
    createdBy,
    lines,
    entryDate,
    status: 'posted',
  });
  if (r.duplicate) return 2;
  return r.code === 1 ? 1 : 0;
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

 return journalPostExtended(pool, {
  facilityId: fid,
  sourceType: 'credit_payment',
  sourceId: payId,
  reference: ref,
  narration: nar,
  createdBy,
  lines: [
   { code: cash.code, label: cash.label, debit: amt, credit: 0 },
   { code: '411000', label: 'Trade receivables — patients', debit: 0, credit: amt },
  ],
  entryDate,
  journalCode: 'VTE',
  status: 'posted',
 }).then((r) => (r.duplicate ? 2 : r.code === 1 ? 1 : 0));
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

 let receiptDate = toIsoDatePart(docRow.entry_d);
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
 const tvaRate = await loadTvaRate(pool, fid);
 const glLines = buildReceiptLines(amt, paymentMethod, cashLikeAccount, serviceKeyFromSourceModule(mod), tvaRate, APPLY_TVA_ON_SYNC);
 const ref = String(docNumber || '').trim() ? String(docNumber).trim().slice(0, 64) : `RCP-${bid}`;
 let nar = `Patient receipt · ${String(firstLineDescription || '').trim().slice(0, 400)}`;
 if (isCreditDoc) {
  nar = `Patient receipt (cash/revenue; credit link missing or repaired) · ${String(firstLineDescription || '').trim().slice(0, 360)}`;
 }

 const r = await journalPostExtended(pool, {
  facilityId: fid,
  sourceType: 'billing_receipt',
  sourceId: bid,
  reference: ref,
  narration: nar,
  createdBy,
  lines: glLines,
  entryDate: receiptDate,
  journalCode: 'VTE',
  status: 'posted',
 });
 if (r.duplicate) return 2;
 return r.code === 1 ? 1 : 0;
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

 const cat = String(category || '').trim() ? String(category).trim().slice(0, 80) : 'General';
 const desc = String(description || '').trim().slice(0, 200);
 const nar = `Expense · ${cat}${desc ? ` — ${desc}` : ''}`;
 const amt = Math.round((parseFloat(ax) || 0) * 100) / 100;
 const tvaRate = await loadTvaRate(pool, fid);
 const glLines = buildExpenseLines(amt, paymentMethod, cashLikeAccount, cat, tvaRate, APPLY_TVA_ON_SYNC);
 const ref = `EXP-${eid}`;

 const r = await journalPostExtended(pool, {
  facilityId: fid,
  sourceType: 'expense',
  sourceId: eid,
  reference: ref,
  narration: nar.slice(0, 512),
  createdBy,
  lines: glLines,
  entryDate: ed,
  journalCode: 'ACH',
  status: 'posted',
 });
 if (r.duplicate) return 2;
 return r.code === 1 ? 1 : 0;
}

async function journalPostManual(pool, facilityId, entryDate, reference, narration, createdBy, lines) {
 const r = await journalPostManualWithResult(pool, facilityId, entryDate, reference, narration, createdBy, lines);
 return !!(r && r.ok);
}

/**
 * Same as journalPostManual but returns the new header id (manual_import + allocated source_id).
 * @returns {Promise<{ok:boolean,journalId:number,duplicate:boolean,error:string}>}
 */
async function journalPostManualWithResult(pool, facilityId, entryDate, reference, narration, createdBy, lines, options = {}) {
 journalPostSetLastError('');
 if (!(await finTablesOk(pool)) || !lines || !lines.length) {
  journalPostSetLastError('Journal tables missing or no lines.');
  return { ok: false, journalId: 0, duplicate: false, error: journalPostLastError() };
 }
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const sid = await nextManualSourceId(pool, facilityId);
 const asDraft = options.asDraft === true;
 const glLines = lines.map((ln) => ({
  code: ln.code,
  label: ln.label,
  debit: ln.debit,
  credit: ln.credit,
  line_memo: ln.line_memo || ln.memo || '',
 }));

 const r = await journalPostExtended(pool, {
  facilityId: fid,
  sourceType: 'manual_import',
  sourceId: sid,
  reference,
  narration,
  createdBy,
  lines: glLines,
  entryDate,
  journalCode: options.journalCode || 'OD',
  status: asDraft ? 'draft' : 'posted',
 });

 if (r.ok && (r.code === 1 || r.duplicate)) {
  let journalId = r.journalId;
  if (!journalId) {
   try {
    const [[row]] = await pool.query(
     'SELECT id FROM tbl_fin_journal_header WHERE facility_id = ? AND source_type = ? AND source_id = ? LIMIT 1',
     [fid, 'manual_import', sid]
    );
    journalId = parseInt(row && row.id, 10) || 0;
   } catch (_) {
    /* ignore */
   }
  }
  return { ok: true, journalId, duplicate: r.duplicate, error: '' };
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
 journalPostExtended,
 syncJournalFromReceipt,
 postExpenseToGl,
 journalPostManual,
 journalPostManualWithResult,
 nextManualSourceId,
 finJournalRecentHeaders
};
