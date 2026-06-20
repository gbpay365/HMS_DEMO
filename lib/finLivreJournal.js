'use strict';

const { EXPORT } = require('./finAccountingConfig');

async function fetchLivreJournalRows(pool, facilityId, from, to, journalCode) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const params = [fid, from, to];
  let jcFilter = '';
  if (journalCode && String(journalCode).trim() && String(journalCode).trim() !== 'all') {
    jcFilter = ' AND h.journal_code = ?';
    params.push(String(journalCode).trim().slice(0, 8));
  }
  const [rows] = await pool.query(
    `SELECT h.id AS journal_id, h.entry_date, h.journal_code, h.piece_number, h.reference,
            h.narration, h.status, h.source_type,
            jl.account_code, jl.account_label, jl.debit, jl.credit, jl.line_memo
     FROM tbl_fin_journal_header h
     JOIN tbl_fin_journal_line jl ON jl.journal_id = h.id
     WHERE h.facility_id = ? AND h.entry_date >= ? AND h.entry_date <= ?
       AND h.status = 'posted' ${jcFilter}
     ORDER BY h.entry_date ASC, h.piece_number ASC, h.id ASC, jl.id ASC`,
    params
  );
  return rows || [];
}

function rowsToSageExport(rows) {
  return (rows || []).map((r) => ({
    entry_date: String(r.entry_date || '').slice(0, 10),
    journal_code: r.journal_code || '',
    piece_number: r.piece_number || '',
    account_code: r.account_code || '',
    account_label: r.account_label || '',
    debit: Number(r.debit || 0),
    credit: Number(r.credit || 0),
    narration: r.narration || '',
    line_memo: r.line_memo || '',
    reference: r.reference || '',
  }));
}

function buildExcelBuffer(rows) {
  const XLSX = require('xlsx');
  const data = rowsToSageExport(rows);
  const sheet = XLSX.utils.json_to_sheet(data, { header: EXPORT.sageImportColumns.concat(['reference']) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'LivreJournal');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPrintHtml(rows, meta = {}) {
  const { facilityName = 'Hospital', from, to, journalCode = 'ALL' } = meta;
  const bodyRows = (rows || [])
    .map(
      (r) =>
        `<tr>
          <td>${escapeHtml(String(r.entry_date || '').slice(0, 10))}</td>
          <td>${escapeHtml(r.journal_code)}</td>
          <td>${escapeHtml(r.piece_number)}</td>
          <td class="mono">${escapeHtml(r.account_code)}</td>
          <td>${escapeHtml(r.account_label)}</td>
          <td class="num">${Number(r.debit || 0).toLocaleString('fr-FR')}</td>
          <td class="num">${Number(r.credit || 0).toLocaleString('fr-FR')}</td>
          <td>${escapeHtml(r.narration)}</td>
          <td>${escapeHtml(r.line_memo || '')}</td>
        </tr>`
    )
    .join('\n');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Livre-journal ${escapeHtml(from)} → ${escapeHtml(to)}</title>
<style>
  body{font-family:system-ui,sans-serif;font-size:11px;color:#111;margin:24px;}
  h1{font-size:18px;margin:0 0 4px;} .meta{color:#555;margin-bottom:16px;}
  table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ccc;padding:4px 6px;vertical-align:top;}
  th{background:#0f172a;color:#fff;font-size:10px;text-transform:uppercase;}
  .num{text-align:right;font-family:ui-monospace,monospace;} .mono{font-family:ui-monospace,monospace;}
  @media print{body{margin:12px;} button{display:none;}}
</style></head><body>
<h1>Livre-journal — ${escapeHtml(facilityName)}</h1>
<div class="meta">Period: ${escapeHtml(from)} → ${escapeHtml(to)} · Journal: ${escapeHtml(journalCode)} · Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</div>
<button onclick="window.print()">Print / Save PDF</button>
<table><thead><tr>
  <th>Date</th><th>Journal</th><th>Pièce</th><th>Compte</th><th>Libellé</th>
  <th>Débit</th><th>Crédit</th><th>Narration</th><th>Mémo ligne</th>
</tr></thead><tbody>${bodyRows || '<tr><td colspan="9">No posted entries in period.</td></tr>'}</tbody></table>
</body></html>`;
}

module.exports = {
  fetchLivreJournalRows,
  rowsToSageExport,
  buildExcelBuffer,
  buildPrintHtml,
};
