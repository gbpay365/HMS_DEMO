'use strict';

const { tableExists } = require('./hmsFinGeneralLedger');

/**
 * Ensures tbl_fin_journal_line.journal_id references tbl_fin_journal_header (PHP 031 parity).
 * Legacy DBs may reference tbl_fin_journal or have no FK.
 */

async function getJournalLineFk(pool) {
 const [rows] = await pool.query(
  `SELECT CONSTRAINT_NAME AS name, REFERENCED_TABLE_NAME AS refTable
   FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'tbl_fin_journal_line'
     AND COLUMN_NAME = 'journal_id'
     AND REFERENCED_TABLE_NAME IS NOT NULL
   LIMIT 1`
 );
 return rows[0] || { name: null, refTable: null };
}

async function countOrphanJournalLines(pool) {
 const [[r]] = await pool.query(
  `SELECT COUNT(*) AS c FROM tbl_fin_journal_line jl
   LEFT JOIN tbl_fin_journal_header h ON h.id = jl.journal_id
   WHERE h.id IS NULL`
 );
 return parseInt(r?.c, 10) || 0;
}

/**
 * @returns {Promise<{ ok: boolean, action: string, fkName?: string, refTable?: string, orphanCount?: number, message?: string }>}
 */
async function ensureFinJournalLineFkToHeader(pool) {
 const fk = await getJournalLineFk(pool);
 const refTable = fk.refTable ? String(fk.refTable) : '';

 if (refTable === 'tbl_fin_journal_header') {
  return {
   ok: true,
   action: 'already_ok',
   fkName: fk.name,
   refTable,
   message: 'journal_id already references tbl_fin_journal_header.',
  };
 }

 if (fk.name) {
  await pool.query(`ALTER TABLE tbl_fin_journal_line DROP FOREIGN KEY \`${fk.name}\``);
 }

 const orphans = await countOrphanJournalLines(pool);
 if (orphans > 0) {
  return {
   ok: false,
   action: 'orphans',
   orphanCount: orphans,
   refTable: refTable || '(none)',
   message:
    `${orphans} journal line(s) have journal_id with no matching tbl_fin_journal_header row. Fix or delete orphans before adding the foreign key.`,
  };
 }

 const fkName = 'fk_fin_jl_j';
 try {
  await pool.query(
   `ALTER TABLE tbl_fin_journal_line
    ADD CONSTRAINT ${fkName}
    FOREIGN KEY (journal_id) REFERENCES tbl_fin_journal_header (id) ON DELETE CASCADE`
  );
  return {
   ok: true,
   action: refTable === 'tbl_fin_journal' ? 'replaced_legacy' : 'added',
   fkName,
   refTable: 'tbl_fin_journal_header',
   message:
    refTable === 'tbl_fin_journal'
     ? 'Replaced legacy FK (tbl_fin_journal) with tbl_fin_journal_header.'
     : 'Added FK journal_id → tbl_fin_journal_header.',
  };
 } catch (e) {
  const msg = String(e.message || e);
  if (/Duplicate foreign key|errno 1826|already exists/i.test(msg)) {
   const again = await getJournalLineFk(pool);
   if (again.refTable === 'tbl_fin_journal_header') {
    return { ok: true, action: 'already_ok', fkName: again.name, refTable: again.refTable, message: 'FK already present.' };
   }
  }
  throw e;
 }
}

/**
 * Relink lines whose journal_id points at missing headers (usually legacy tbl_fin_journal.id).
 * @returns {Promise<{ fixed: number, headersCreated: number, linesDeleted: number, failed: number, remaining: number, details: string[] }>}
 */
async function repairOrphanJournalLines(pool, facilityId = 1) {
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const hasLegacyJournal = await tableExists(pool, 'tbl_fin_journal');
 const details = [];
 let fixed = 0;
 let headersCreated = 0;
 let linesDeleted = 0;
 let failed = 0;

 const [groups] = await pool.query(
  `SELECT jl.journal_id AS legacy_id, COUNT(*) AS line_count
   FROM tbl_fin_journal_line jl
   LEFT JOIN tbl_fin_journal_header h ON h.id = jl.journal_id
   WHERE h.id IS NULL
   GROUP BY jl.journal_id
   ORDER BY jl.journal_id ASC`
 );

 for (const g of groups || []) {
  const legacyId = parseInt(g.legacy_id, 10) || 0;
  if (legacyId < 1) continue;

  let headerId = 0;
  let sourceType = 'manual_import';
  let sourceId = legacyId;
  let entryDate = new Date().toISOString().slice(0, 10);
  let reference = `LEGACY-${legacyId}`;
  let narration = 'Relinked from legacy journal lines';
  let headerFac = fid;

  if (hasLegacyJournal) {
   const [[lj]] = await pool.query('SELECT * FROM tbl_fin_journal WHERE id = ? LIMIT 1', [legacyId]);
   if (lj) {
    headerFac = Math.max(1, parseInt(lj.facility_id, 10) || fid);
    entryDate = String(lj.journal_date || lj.posted_at || entryDate).slice(0, 10);
    reference = String(lj.reference || lj.journal_no || reference).slice(0, 64);
    narration = String(lj.description || narration).slice(0, 512);
    const bid = parseInt(lj.billing_document_id, 10) || 0;
    const eid = parseInt(lj.expense_id, 10) || 0;
    if (bid > 0) {
     sourceType = 'billing_receipt';
     sourceId = bid;
    } else if (eid > 0) {
     sourceType = 'expense';
     sourceId = eid;
    }
   }
  }

  if (!headerId && sourceType === 'billing_receipt' && sourceId > 0) {
   const [[h]] = await pool.query(
    'SELECT id FROM tbl_fin_journal_header WHERE facility_id = ? AND source_type = ? AND source_id = ? LIMIT 1',
    [headerFac, sourceType, sourceId]
   );
   if (h) headerId = parseInt(h.id, 10) || 0;
  }
  if (!headerId && sourceType === 'expense' && sourceId > 0) {
   const [[h]] = await pool.query(
    'SELECT id FROM tbl_fin_journal_header WHERE facility_id = ? AND source_type = ? AND source_id = ? LIMIT 1',
    [headerFac, sourceType, sourceId]
   );
   if (h) headerId = parseInt(h.id, 10) || 0;
  }

  if (!headerId) {
   try {
    const [ins] = await pool.query(
     `INSERT INTO tbl_fin_journal_header
      (facility_id, entry_date, reference, narration, source_type, source_id, created_by)
      VALUES (?,?,?,?,?,?,0)`,
     [headerFac, entryDate, reference, narration, sourceType, sourceId]
    );
    headerId = parseInt(ins.insertId, 10) || 0;
    if (headerId > 0) {
     headersCreated++;
     details.push(`Created header #${headerId} for legacy journal_id ${legacyId} (${sourceType}:${sourceId}).`);
    }
   } catch (e) {
    failed++;
    details.push(`Could not create header for journal_id ${legacyId}: ${e.message || e}`);
    continue;
   }
  } else {
   details.push(`Matched journal_id ${legacyId} → header #${headerId}.`);
  }

  if (headerId < 1) {
   failed++;
   continue;
  }

  const [orphanLines] = await pool.query(
   `SELECT id, account_code, debit, credit FROM tbl_fin_journal_line WHERE journal_id = ?`,
   [legacyId]
  );

  for (const ln of orphanLines || []) {
   const lineId = parseInt(ln.id, 10) || 0;
   const code = String(ln.account_code || '');
   const dr = Number(ln.debit) || 0;
   const cr = Number(ln.credit) || 0;

   const [[dup]] = await pool.query(
    `SELECT id FROM tbl_fin_journal_line
     WHERE journal_id = ? AND account_code = ? AND debit = ? AND credit = ?
     LIMIT 1`,
    [headerId, code, dr, cr]
   );
   if (dup && dup.id) {
    await pool.query('DELETE FROM tbl_fin_journal_line WHERE id = ?', [lineId]);
    linesDeleted++;
    continue;
   }

   await pool.query('UPDATE tbl_fin_journal_line SET journal_id = ? WHERE id = ?', [headerId, lineId]);
   fixed++;
  }
 }

 const remaining = await countOrphanJournalLines(pool);
 if (fixed || linesDeleted || headersCreated) {
  details.push(`Done: ${fixed} line(s) relinked, ${linesDeleted} duplicate(s) removed, ${headersCreated} header(s) created.`);
 }
 if (remaining > 0) {
  details.push(`${remaining} line(s) still orphan — review manually or delete.`);
 }

 return { fixed, headersCreated, linesDeleted, failed, remaining, details };
}

module.exports = {
 getJournalLineFk,
 countOrphanJournalLines,
 ensureFinJournalLineFkToHeader,
 repairOrphanJournalLines,
};
