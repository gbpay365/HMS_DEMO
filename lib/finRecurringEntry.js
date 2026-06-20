'use strict';

const { journalPostExtended, journalPostLastError } = require('./hmsFinJournalPost');

async function listRecurring(pool, facilityId) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const [rows] = await pool.query(
    'SELECT * FROM tbl_fin_recurring_entry WHERE facility_id = ? ORDER BY id DESC LIMIT 200',
    [fid]
  ).catch(() => [[]]);
  return rows || [];
}

async function saveRecurring(pool, facilityId, data, userId) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const label = String(data.label || '').trim().slice(0, 120);
  const jc = String(data.journal_code || 'OD').slice(0, 8);
  const freq = String(data.frequency || 'monthly').slice(0, 16);
  const linesJson = JSON.stringify(data.lines || []);
  if (!label) return { ok: false, error: 'Label required.' };
  await pool.query(
    `INSERT INTO tbl_fin_recurring_entry (facility_id, label, journal_code, frequency, next_run_date, lines_json, is_active, created_by)
     VALUES (?,?,?,?,?,?,1,?)`,
    [fid, label, jc, freq, data.next_run_date || null, linesJson, userId]
  );
  return { ok: true, error: '' };
}

async function runDueRecurring(pool, facilityId, userId, asOfDate) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const d = String(asOfDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const [rows] = await pool.query(
    `SELECT * FROM tbl_fin_recurring_entry
     WHERE facility_id = ? AND is_active = 1 AND (next_run_date IS NULL OR next_run_date <= ?)
     LIMIT 50`,
    [fid, d]
  ).catch(() => [[]]);

  let posted = 0;
  for (const row of rows || []) {
    let lines = [];
    try {
      lines = JSON.parse(row.lines_json || '[]');
    } catch (_) {
      continue;
    }
    const sid = Date.now() % 2000000000 + posted;
    const r = await journalPostExtended(pool, {
      facilityId: fid,
      sourceType: 'recurring',
      sourceId: sid,
      reference: `ABN-${row.id}-${d}`,
      narration: row.label,
      createdBy: userId,
      lines,
      entryDate: d,
      journalCode: row.journal_code || 'OD',
      status: 'posted',
    });
    if (r.ok && r.code === 1) {
      posted++;
      const next = new Date(d);
      next.setMonth(next.getMonth() + 1);
      await pool.query('UPDATE tbl_fin_recurring_entry SET next_run_date = ? WHERE id = ?', [
        next.toISOString().slice(0, 10),
        row.id,
      ]).catch(() => {});
    }
  }
  return { ok: true, posted, error: posted ? '' : journalPostLastError() };
}

module.exports = { listRecurring, saveRecurring, runDueRecurring };
