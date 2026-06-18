'use strict';

const { tableExists } = require('./hmsFinGeneralLedger');

/**
 * Postable OHADA accounts for manual journal lines (PHP: hms_fin_posting_accounts).
 * @returns {Promise<Array<{id:number,code:string,label_en:string}>>}
 */
async function loadPostingAccounts(pool) {
 if (!(await tableExists(pool, 'tbl_fin_account'))) return [];
 try {
  const [rows] = await pool.query(
   `SELECT id, code, label_en AS label_en, sort_order
    FROM tbl_fin_account
    WHERE active = 1 AND is_posting = 1
    ORDER BY sort_order ASC, code ASC`
  );
  return Array.isArray(rows) ? rows : [];
 } catch (_) {
  try {
   const [rows2] = await pool.query(
    'SELECT id, code, CONCAT(code, " — account") AS label_en, 0 AS sort_order FROM tbl_fin_account ORDER BY id ASC LIMIT 500'
   );
   return Array.isArray(rows2) ? rows2 : [];
  } catch (_) {
   return [];
  }
 }
}

/**
 * Typeahead search for journal / register account picker.
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} query
 * @param {number} [limit]
 */
async function searchPostingAccounts(pool, query, limit = 40) {
 const lim = Math.min(100, Math.max(5, parseInt(limit, 10) || 40));
 if (!(await tableExists(pool, 'tbl_fin_account'))) return [];
 const q = String(query || '').trim();
 const like = `%${q.replace(/[%_]/g, '')}%`;
 try {
  if (!q) {
   const [rows] = await pool.query(
    `SELECT id, code, label_en AS label_en
     FROM tbl_fin_account
     WHERE active = 1 AND is_posting = 1
     ORDER BY sort_order ASC, code ASC
     LIMIT ?`,
    [lim]
   );
   return Array.isArray(rows) ? rows : [];
  }
  const [rows] = await pool.query(
   `SELECT id, code, label_en AS label_en
    FROM tbl_fin_account
    WHERE active = 1 AND is_posting = 1
      AND (code LIKE ? OR label_en LIKE ?)
    ORDER BY code ASC
    LIMIT ?`,
   [like, like, lim]
  );
  return Array.isArray(rows) ? rows : [];
 } catch (_) {
  return loadPostingAccounts(pool).then((all) => {
   if (!q) return all.slice(0, lim);
   const low = q.toLowerCase();
   return all
    .filter(
     (a) =>
      String(a.code || '').toLowerCase().includes(low) ||
      String(a.label_en || '').toLowerCase().includes(low)
    )
    .slice(0, lim);
  });
 }
}

module.exports = { loadPostingAccounts, searchPostingAccounts };
