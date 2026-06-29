'use strict';

const { glMaps } = require('./finGlAccountMaps');

async function listTiers(pool, facilityId, tierType) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const tt = String(tierType || '').trim();
  let sql = 'SELECT * FROM tbl_fin_tier WHERE facility_id = ? AND is_active = 1';
  const params = [fid];
  if (tt) {
    sql += ' AND tier_type = ?';
    params.push(tt);
  }
  sql += ' ORDER BY name ASC LIMIT 500';
  const [rows] = await pool.query(sql, params);
  return rows || [];
}

async function upsertTier(pool, facilityId, data) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const tierType = String(data.tier_type || 'client').slice(0, 16);
  const code = String(data.code || '').trim().slice(0, 32);
  const name = String(data.name || '').trim().slice(0, 255);
  const maps = glMaps();
  const gl = String(
    data.gl_account_code || (tierType === 'supplier' ? maps.supplierPayable : maps.receivable)
  ).slice(0, 32);
  if (!code || !name) return { ok: false, error: 'Code and name required.' };

  if (pool.driver === 'postgres') {
    await pool.query(
      `INSERT INTO tbl_fin_tier (facility_id, tier_type, code, name, gl_account_code, is_active)
       VALUES ($1,$2,$3,$4,$5,1)
       ON CONFLICT (facility_id, tier_type, code) DO UPDATE SET name = EXCLUDED.name, gl_account_code = EXCLUDED.gl_account_code`,
      [fid, tierType, code, name, gl]
    );
  } else {
    await pool.query(
      `INSERT INTO tbl_fin_tier (facility_id, tier_type, code, name, gl_account_code, is_active)
       VALUES (?,?,?,?,?,1)
       ON DUPLICATE KEY UPDATE name = VALUES(name), gl_account_code = VALUES(gl_account_code)`,
      [fid, tierType, code, name, gl]
    );
  }
  return { ok: true, error: '' };
}

async function letterLines(pool, facilityId, tierId, debitLineId, creditLineId, amount, userId) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
  if (amt <= 0) return { ok: false, error: 'Invalid amount.' };
  const code = `LTR-${Date.now().toString(36).toUpperCase()}`;
  await pool.query(
    `INSERT INTO tbl_fin_lettering (facility_id, tier_id, debit_line_id, credit_line_id, amount, letter_code, lettered_by)
     VALUES (?,?,?,?,?,?,?)`,
    [fid, tierId, debitLineId, creditLineId, amt, code, userId]
  );
  await pool.query('UPDATE tbl_fin_journal_line SET letter_code = ? WHERE id IN (?,?)', [
    code,
    debitLineId,
    creditLineId,
  ]).catch(() => {});
  return { ok: true, letterCode: code, error: '' };
}

async function tierStatement(pool, facilityId, tierId, from, to) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const [rows] = await pool.query(
    `SELECT h.entry_date, h.piece_number, h.narration, jl.debit, jl.credit, jl.letter_code
     FROM tbl_fin_journal_line jl
     JOIN tbl_fin_journal_header h ON h.id = jl.journal_id
     WHERE h.facility_id = ? AND jl.tier_id = ? AND h.entry_date >= ? AND h.entry_date <= ?
       AND h.status = 'posted'
     ORDER BY h.entry_date, h.id`,
    [fid, tierId, from, to]
  );
  return rows || [];
}

module.exports = { listTiers, upsertTier, letterLines, tierStatement };
