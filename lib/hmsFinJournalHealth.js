/**
 * Journal / GL health snapshot — parity with PHP hms_fin_journal_health_snapshot
 * and hms_fin_journal_health_hint_message (financials_reports_data.php).
 */
const { finTablesOk, tableExists } = require('./hmsFinGeneralLedger');
const { getJournalLineFk, countOrphanJournalLines } = require('./ensureFinJournalLineFk');

function iso(d) {
 return /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? String(d).slice(0, 10) : null;
}

function fixedFacilityIdFromEnv() {
 const v = parseInt(process.env.HMS_FIXED_FACILITY_ID || '0', 10);
 return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * @returns {Promise<object>}
 */
async function journalHealthSnapshot(pool, facilityId, dateFrom, dateTo) {
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const d1 = iso(dateFrom);
 const d2 = iso(dateTo);
 const out = {
  fin_tables_ok: await finTablesOk(pool),
  facility_id: fid,
  fixed_facility_id: fixedFacilityIdFromEnv(),
  facility_row_ok: false,
  headers_facility_total: 0,
  headers_facility_period: 0,
  lines_facility_period: 0,
  headers_any_period: 0,
  receipt_docs_period: 0,
  billing_ok: false,
  facility_period_breakdown: '',
  last_sql_error: '',
  journal_entry_date_min: '',
  journal_entry_date_max: '',
  journal_line_fk_name: '',
  journal_line_fk_table: '',
  journal_line_orphans: 0
 };
 if (!out.fin_tables_ok) return out;

 try {
  const fk = await getJournalLineFk(pool);
  out.journal_line_fk_name = fk.name ? String(fk.name) : '';
  out.journal_line_fk_table = fk.refTable ? String(fk.refTable) : '(no FK)';
  out.journal_line_orphans = await countOrphanJournalLines(pool);
 } catch (e) {
  out.last_sql_error = String(e.message || e).slice(0, 500);
 }

 if (!d1 || !d2) return out;

 try {
  if (await tableExists(pool, 'tbl_facility')) {
   const [[r]] = await pool.query('SELECT COUNT(*) AS c FROM tbl_facility WHERE id = ?', [fid]);
   out.facility_row_ok = (parseInt(r?.c, 10) || 0) > 0;
  } else {
   out.facility_row_ok = true;
  }

  const [[hTot]] = await pool.query('SELECT COUNT(*) AS c FROM tbl_fin_journal_header WHERE facility_id = ?', [fid]);
  out.headers_facility_total = parseInt(hTot?.c, 10) || 0;

  const [[span]] = await pool.query(
   'SELECT MIN(entry_date) AS dmin, MAX(entry_date) AS dmax FROM tbl_fin_journal_header WHERE facility_id = ?',
   [fid]
  );
  out.journal_entry_date_min = String(span?.dmin ?? '').trim().slice(0, 10);
  out.journal_entry_date_max = String(span?.dmax ?? '').trim().slice(0, 10);

  const [[hPer]] = await pool.query(
   'SELECT COUNT(*) AS c FROM tbl_fin_journal_header WHERE facility_id = ? AND entry_date BETWEEN ? AND ?',
   [fid, d1, d2]
  );
  out.headers_facility_period = parseInt(hPer?.c, 10) || 0;

  const [[lPer]] = await pool.query(
   `SELECT COUNT(*) AS c FROM tbl_fin_journal_line jl
    INNER JOIN tbl_fin_journal_header h ON h.id = jl.journal_id
    WHERE h.facility_id = ? AND h.entry_date BETWEEN ? AND ?`,
   [fid, d1, d2]
  );
  out.lines_facility_period = parseInt(lPer?.c, 10) || 0;

  const [[hAny]] = await pool.query(
   'SELECT COUNT(*) AS c FROM tbl_fin_journal_header WHERE entry_date BETWEEN ? AND ?',
   [d1, d2]
  );
  out.headers_any_period = parseInt(hAny?.c, 10) || 0;

  const [brkRows] = await pool.query(
   'SELECT facility_id, COUNT(*) AS n FROM tbl_fin_journal_header WHERE entry_date BETWEEN ? AND ? GROUP BY facility_id ORDER BY facility_id ASC LIMIT 12',
   [d1, d2]
  );
  const parts = [];
  for (const row of brkRows || []) {
   const fi = parseInt(row.facility_id, 10) || 0;
   const n = parseInt(row.n, 10) || 0;
   if (fi > 0) parts.push(`#${fi}: ${n} hdr`);
  }
  out.facility_period_breakdown = parts.length ? parts.join('; ') : '';

  if ((await tableExists(pool, 'tbl_billing_document')) && (await tableExists(pool, 'tbl_billing_document_line'))) {
   out.billing_ok = true;
   const [[rec]] = await pool.query(
    `SELECT COUNT(*) AS c FROM tbl_billing_document
     WHERE facility_id = ? AND doc_type = 'receipt' AND total_amount > 0.005 AND DATE(created_at) BETWEEN ? AND ?`,
    [fid, d1, d2]
   );
   out.receipt_docs_period = parseInt(rec?.c, 10) || 0;
  }
 } catch (e) {
  out.last_sql_error = String(e.message || e);
 }

 return out;
}

/** Plain-language troubleshooting from snapshot (PHP hms_fin_journal_health_hint_message). */
function journalHealthHintMessage(snap, dateFrom, dateTo) {
 if (!snap.fin_tables_ok) return '';
 const fid = parseInt(snap.facility_id, 10) || 0;
 const fix = parseInt(snap.fixed_facility_id, 10) || 0;
 const lineCnt = parseInt(snap.lines_facility_period, 10) || 0;
 if (lineCnt > 0) return '';

 const msgs = [];
 if (!snap.facility_row_ok) {
  msgs.push(
   `CRITICAL: tbl_facility has no row for id ${fid}. Journal inserts fail the foreign key on tbl_fin_journal_header. ` +
    'Run database/migrations/001_multi_site_platform.sql (or insert MAIN site with that id), then retry Sync to GL.'
  );
 }

 const hdrTot = parseInt(snap.headers_facility_total, 10) || 0;
 const hdrPer = parseInt(snap.headers_facility_period, 10) || 0;
 const rec = parseInt(snap.receipt_docs_period, 10) || 0;
 const any = parseInt(snap.headers_any_period, 10) || 0;
 const brk = String(snap.facility_period_breakdown || '').trim();

 if (hdrPer > 0 && lineCnt === 0) {
  msgs.push(
   `Journal headers exist for site #${fid} in this period but journal lines are missing or not linked. ` +
    'Open Journal / GL diagnostics for schema/FK repair, or run migrations 019 / 031.'
  );
 }

 if (rec > 0 && hdrTot === 0 && snap.facility_row_ok) {
  msgs.push(
   `Billing shows ${rec} fiscal receipt document(s) in ${dateFrom}–${dateTo} for site #${fid}, ` +
    'but zero GL headers for this site. Open Sync to GL and post receipts for that range.'
  );
 }

 if (any > 0 && hdrPer === 0 && brk) {
  msgs.push(
   `In this period, journals exist only on other site(s): ${brk}. Active site is #${fid}` +
    (fix > 0 ? ` (HMS_FIXED_FACILITY_ID=${fix}).` : '.')
  );
 }

 if (any === 0 && hdrTot === 0 && rec === 0) {
  msgs.push(
   `No GL headers and no fiscal receipts in this range for site #${fid}. ` +
    'Widen From/To dates, create cashier activity, run the demo seed, or sync after posting.'
  );
 }

 if (any === 0 && hdrTot > 0 && hdrPer === 0) {
  const jmin = String(snap.journal_entry_date_min || '').trim();
  const jmax = String(snap.journal_entry_date_max || '').trim();
  if (jmin && jmax) {
   msgs.push(
    `This site has ${hdrTot} journal header(s). Stored entry_date runs from ${jmin} through ${jmax}. ` +
     `Your report range ${dateFrom}–${dateTo} does not overlap that span — widen From/To to include those dates.`
   );
  } else {
   msgs.push(
    `This site has ${hdrTot} journal header(s) in total, but none dated within ${dateFrom}–${dateTo}. Adjust the date range.`
   );
  }
 }

 const err = String(snap.last_sql_error || '').trim();
 if (err) msgs.push(`Last SQL error from a report query: ${err}`);

 return msgs.length ? msgs.join('\n\n') : '';
}

module.exports = { journalHealthSnapshot, journalHealthHintMessage, fixedFacilityIdFromEnv };
