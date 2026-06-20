'use strict';

const { fiscalYearForDate, journalCodeForSource } = require('./finAccountingConfig');

async function nextPieceNumber(pool, facilityId, journalCode, entryDate) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const jc = String(journalCode || 'OD').trim().slice(0, 8) || 'OD';
  const fy = fiscalYearForDate(entryDate);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (pool.driver === 'postgres') {
      await conn.query(
        `INSERT INTO tbl_fin_journal_piece_seq (facility_id, journal_code, fiscal_year, last_no)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (facility_id, journal_code, fiscal_year) DO NOTHING`,
        [fid, jc, fy]
      );
      const r = await conn.query(
        `UPDATE tbl_fin_journal_piece_seq SET last_no = last_no + 1
         WHERE facility_id = $1 AND journal_code = $2 AND fiscal_year = $3
         RETURNING last_no`,
        [fid, jc, fy]
      );
      const n = parseInt(r.rows?.[0]?.last_no, 10) || 1;
      await conn.commit();
      return `${jc}-${fy}-${String(n).padStart(6, '0')}`;
    }
    await conn.query(
      `INSERT IGNORE INTO tbl_fin_journal_piece_seq (facility_id, journal_code, fiscal_year, last_no)
       VALUES (?, ?, ?, 0)`,
      [fid, jc, fy]
    );
    await conn.query(
      `UPDATE tbl_fin_journal_piece_seq SET last_no = last_no + 1
       WHERE facility_id = ? AND journal_code = ? AND fiscal_year = ?`,
      [fid, jc, fy]
    );
    const [[row]] = await conn.query(
      `SELECT last_no FROM tbl_fin_journal_piece_seq
       WHERE facility_id = ? AND journal_code = ? AND fiscal_year = ? LIMIT 1`,
      [fid, jc, fy]
    );
    await conn.commit();
    const n = parseInt(row?.last_no, 10) || 1;
    return `${jc}-${fy}-${String(n).padStart(6, '0')}`;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function loadLockedMonthKeys(pool, facilityId) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  try {
    const [rows] = await pool.query(
      'SELECT lock_year, lock_month FROM tbl_fin_period_lock WHERE facility_id = ?',
      [fid]
    );
    return (rows || []).map((r) => {
      const y = parseInt(r.lock_year, 10);
      const m = parseInt(r.lock_month, 10);
      return `${y}-${String(m).padStart(2, '0')}`;
    });
  } catch (_) {
    return [];
  }
}

async function isPeriodLocked(pool, facilityId, entryDate) {
  const s = String(entryDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const key = s.slice(0, 7);
  const locked = await loadLockedMonthKeys(pool, facilityId);
  return locked.includes(key);
}

async function writeJournalAudit(pool, journalId, facilityId, action, userId, detail) {
  const payload = detail != null ? JSON.stringify(detail) : null;
  await pool.query(
    `INSERT INTO tbl_fin_journal_audit (journal_id, facility_id, action, user_id, detail_json)
     VALUES (?, ?, ?, ?, ?)`,
    [journalId, facilityId, action, userId, payload]
  ).catch(() => {});
}

function resolveJournalMeta(sourceType, entryDate) {
  const journalCode = journalCodeForSource(sourceType);
  return { journalCode, fiscalYear: fiscalYearForDate(entryDate) };
}

module.exports = {
  nextPieceNumber,
  loadLockedMonthKeys,
  isPeriodLocked,
  writeJournalAudit,
  resolveJournalMeta,
  journalCodeForSource,
};
