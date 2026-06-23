/**
 * Parse journal CSV (PHP hms_fin_parse_journal_csv — financials_import.php).
 * @returns {{ ok: boolean, batches: Array<{date:string,reference:string,narration:string,lines:Array<{code:string,label:string,debit:number,credit:number}>}>, errors: string[] }}
 */
const { validateDoubleEntryBalance } = require('./finJournalValidation');
function parseJournalCsv(raw) {
 const errors = [];
 let text = String(raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
 let lines = text
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l !== '');
 if (!lines.length) return { ok: false, batches: [], errors: ['Empty file.'] };

 if (lines.length) {
  const hLine = lines[0];
  const hDelim = (hLine.split(';').length >= hLine.split(',').length) ? ';' : ',';
  const hParts = parseCsvLine(hLine, hDelim);
  if (hParts.length >= 7 && !/^\d{4}-\d{2}-\d{2}$/.test(hParts[0].trim())) {
   const joined = hParts
    .slice(0, 7)
    .map((x) => String(x).trim().toLowerCase())
    .join(' ');
   if (joined.includes('date') && (joined.includes('ref') || joined.includes('réf'))) {
    lines = lines.slice(1);
   }
  }
 }

 if (!lines.length) return { ok: false, batches: [], errors: ['Empty file after header row.'] };

 const rows = [];
 let ln = 0;
 for (const line of lines) {
  ln++;
  const delim = line.split(';').length >= line.split(',').length ? ';' : ',';
  const parts = parseCsvLine(line, delim);
  if (parts.length < 7) {
   errors.push(`Line ${ln}: 7 columns expected (date, ref., narration, account, account label, debit, credit).`);
   continue;
  }
  const d = parts[0].trim();
  const ref = parts[1].trim();
  const nar = parts[2].trim();
  const code = parts[3].trim();
  const lab = parts[4].trim();
  const drS = parts[5].trim();
  const crS = parts[6].trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
   errors.push(`Line ${ln}: invalid date (${d}).`);
   continue;
  }
  if (!ref || !code) {
   errors.push(`Line ${ln}: reference and account code are required.`);
   continue;
  }
  let dr = parseAmount(drS);
  let cr = parseAmount(crS);
  if (dr < 0) dr = 0;
  if (cr < 0) cr = 0;
  dr = Math.round(dr * 100) / 100;
  cr = Math.round(cr * 100) / 100;
  if (dr > 0 && cr > 0) {
   errors.push(`Line ${ln}: enter debit OR credit, not both.`);
   continue;
  }
  if (dr <= 0 && cr <= 0) {
   errors.push(`Line ${ln}: zero amount.`);
   continue;
  }
  rows.push({
   date: d,
   ref: ref.slice(0, 64),
   narr: nar.slice(0, 512),
   code: code.slice(0, 32),
   label: lab.slice(0, 160),
   debit: dr,
   credit: cr
  });
 }

 if (errors.length) return { ok: false, batches: [], errors };

 const groups = {};
 for (const r of rows) {
  const k = `${r.date}|${r.ref}`;
  if (!groups[k]) {
   groups[k] = { date: r.date, reference: r.ref, narration: r.narr, lines: [] };
  }
  groups[k].lines.push({ code: r.code, label: r.label, debit: r.debit, credit: r.credit });
  if (r.narr) groups[k].narration = r.narr;
 }

 const batches = [];
 const batchErrors = [];
 for (const k of Object.keys(groups)) {
  const g = groups[k];
  const balance = validateDoubleEntryBalance(g.lines, { mode: 'post' });
  if (!balance.ok) {
   batchErrors.push(`Entry ${k}: ${balance.error}`);
   continue;
  }
  batches.push(g);
 }

 if (batchErrors.length) return { ok: false, batches: [], errors: batchErrors };
 return { ok: true, batches, errors: [] };
}

function parseCsvLine(line, delim) {
 const out = [];
 let cur = '';
 let inQ = false;
 for (let i = 0; i < line.length; i++) {
  const ch = line[i];
  if (ch === '"') {
   if (inQ && line[i + 1] === '"') {
    cur += '"';
    i++;
   } else {
    inQ = !inQ;
   }
  } else if (ch === delim && !inQ) {
   out.push(cur);
   cur = '';
  } else {
   cur += ch;
  }
 }
 out.push(cur);
 return out;
}

function parseAmount(s) {
 const x = String(s || '').replace(/\s/g, '').replace(',', '.');
 const n = parseFloat(x.replace(/[^\d.-]/g, ''));
 return Number.isFinite(n) ? n : 0;
}

module.exports = { parseJournalCsv };
