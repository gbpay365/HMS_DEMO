'use strict';

const { postDraftJournal } = require('./finJournalLifecycle');
const ensureFinAccountingSchema = require('./ensureFinAccountingSchema');

async function closeFiscalYear(pool, facilityId, fiscalYear, userId) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const fy = parseInt(fiscalYear, 10);
  if (!fy) return { ok: false, error: 'Invalid fiscal year.' };
  await ensureFinAccountingSchema(pool, { facilityId: fid });

  const [[open]] = await pool.query(
    'SELECT status FROM tbl_fin_fiscal_year WHERE facility_id = ? AND fiscal_year = ? LIMIT 1',
    [fid, fy]
  ).catch(() => [[null]]);
  if (open && open.status === 'closed') return { ok: false, error: 'Year already closed.' };

  if (pool.driver === 'postgres') {
    await pool.query(
      `INSERT INTO tbl_fin_fiscal_year (facility_id, fiscal_year, status, closed_at, closed_by)
       VALUES ($1,$2,'closed',NOW(),$3)
       ON CONFLICT (facility_id, fiscal_year) DO UPDATE SET status = 'closed', closed_at = NOW(), closed_by = EXCLUDED.closed_by`,
      [fid, fy, userId]
    );
  } else {
    await pool.query(
      `INSERT INTO tbl_fin_fiscal_year (facility_id, fiscal_year, status, closed_at, closed_by)
       VALUES (?,?,'closed',NOW(),?)
       ON DUPLICATE KEY UPDATE status = 'closed', closed_at = NOW(), closed_by = VALUES(closed_by)`,
      [fid, fy, userId]
    );
  }

  for (let m = 1; m <= 12; m++) {
    const { lockPeriod } = require('./finJournalLifecycle');
    await lockPeriod(pool, fid, fy, m, userId, `Fiscal year ${fy} close`);
  }

  return { ok: true, error: '' };
}

async function fiscalYearStatus(pool, facilityId, fiscalYear) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const fy = parseInt(fiscalYear, 10) || new Date().getFullYear();
  const [[r]] = await pool.query(
    'SELECT * FROM tbl_fin_fiscal_year WHERE facility_id = ? AND fiscal_year = ? LIMIT 1',
    [fid, fy]
  ).catch(() => [[null]]);
  return r || { fiscal_year: fy, status: 'open' };
}

module.exports = { closeFiscalYear, fiscalYearStatus, postDraftJournal };
