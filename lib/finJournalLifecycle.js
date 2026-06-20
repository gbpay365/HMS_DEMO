'use strict';

const ensureFinAccountingSchema = require('./ensureFinAccountingSchema');
const { journalPost, journalPostLastError } = require('./hmsFinJournalPost');
const { nextPieceNumber, isPeriodLocked, writeJournalAudit, resolveJournalMeta } = require('./finJournalCore');
const { finTablesOk } = require('./hmsFinGeneralLedger');

async function loadJournalHeader(pool, facilityId, journalId) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const jid = parseInt(journalId, 10) || 0;
  if (jid < 1) return null;
  const [[h]] = await pool.query(
    'SELECT * FROM tbl_fin_journal_header WHERE id = ? AND facility_id = ? LIMIT 1',
    [jid, fid]
  );
  return h || null;
}

async function loadJournalLines(pool, journalId) {
  const [rows] = await pool.query(
    `SELECT account_code, account_label, debit, credit, line_memo, tier_id, tva_rate, tva_amount
     FROM tbl_fin_journal_line WHERE journal_id = ? ORDER BY id ASC`,
    [journalId]
  );
  return rows || [];
}

async function reverseJournal(pool, facilityId, journalId, userId, reason) {
  await ensureFinAccountingSchema(pool);
  if (!(await finTablesOk(pool))) {
    return { ok: false, error: 'GL tables missing.' };
  }
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const uid = Math.max(0, parseInt(userId, 10) || 0);
  const header = await loadJournalHeader(pool, fid, journalId);
  if (!header) return { ok: false, error: 'Journal not found.' };
  if (String(header.status) !== 'posted') return { ok: false, error: 'Only posted entries can be reversed.' };
  if (header.reversed_by_id) return { ok: false, error: 'Entry already reversed.' };

  const ed = String(header.entry_date || '').slice(0, 10);
  if (await isPeriodLocked(pool, fid, ed)) {
    return { ok: false, error: 'Period is locked for this entry date.' };
  }

  const lines = await loadJournalLines(pool, journalId);
  if (!lines.length) return { ok: false, error: 'No lines to reverse.' };

  const revLines = lines.map((ln) => ({
    code: ln.account_code,
    label: ln.account_label,
    debit: Math.round((parseFloat(ln.credit) || 0) * 100) / 100,
    credit: Math.round((parseFloat(ln.debit) || 0) * 100) / 100,
    line_memo: ln.line_memo ? `REV: ${ln.line_memo}` : 'Reversal',
    tier_id: ln.tier_id,
    tva_rate: ln.tva_rate,
    tva_amount: ln.tva_amount,
  }));

  const revSid = Date.now() % 2000000000;
  const ref = `REV-${header.piece_number || header.id}`;
  const nar = `Reversal of ${header.piece_number || header.reference || header.id}${reason ? ` — ${reason}` : ''}`;

  const { journalPostExtended } = require('./hmsFinJournalPost');
  const r = await journalPostExtended(pool, {
    facilityId: fid,
    sourceType: 'reversal',
    sourceId: revSid,
    reference: ref,
    narration: nar.slice(0, 512),
    createdBy: uid,
    lines: revLines,
    entryDate: ed,
    journalCode: header.journal_code || 'OD',
    status: 'posted',
    reversalOfId: journalId,
  });

  if (!r.ok || !r.journalId) {
    return { ok: false, error: journalPostLastError() || 'Reverse failed.' };
  }

  await pool.query(
    `UPDATE tbl_fin_journal_header SET status = 'reversed', reversed_by_id = ? WHERE id = ? AND facility_id = ?`,
    [r.journalId, journalId, fid]
  ).catch(() => {});

  await writeJournalAudit(pool, journalId, fid, 'reversed', uid, { reversal_id: r.journalId, reason });
  await writeJournalAudit(pool, r.journalId, fid, 'posted', uid, { reversal_of: journalId });

  return { ok: true, journalId: r.journalId, error: '' };
}

async function reimputeLine(pool, facilityId, journalId, lineId, newAccountCode, newAccountLabel, userId) {
  await ensureFinAccountingSchema(pool);
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const uid = Math.max(0, parseInt(userId, 10) || 0);
  const header = await loadJournalHeader(pool, fid, journalId);
  if (!header || String(header.status) !== 'posted') {
    return { ok: false, error: 'Posted journal required.' };
  }
  const [[ln]] = await pool.query(
    'SELECT * FROM tbl_fin_journal_line WHERE id = ? AND journal_id = ? LIMIT 1',
    [lineId, journalId]
  );
  if (!ln) return { ok: false, error: 'Line not found.' };

  const amt = Math.round((parseFloat(ln.debit) || parseFloat(ln.credit) || 0) * 100) / 100;
  if (amt <= 0) return { ok: false, error: 'Line has no amount.' };

  const oldCode = String(ln.account_code || '');
  const newCode = String(newAccountCode || '').trim().slice(0, 32);
  const newLabel = String(newAccountLabel || newCode).trim().slice(0, 160);
  if (!newCode || newCode === oldCode) return { ok: false, error: 'Choose a different account.' };

  const isDebit = parseFloat(ln.debit) > 0;
  const adjLines = isDebit
    ? [
        { code: oldCode, label: ln.account_label, debit: 0, credit: amt, line_memo: `Réimputation → ${newCode}` },
        { code: newCode, label: newLabel, debit: amt, credit: 0, line_memo: `Réimputation from ${oldCode}` },
      ]
    : [
        { code: oldCode, label: ln.account_label, debit: amt, credit: 0, line_memo: `Réimputation → ${newCode}` },
        { code: newCode, label: newLabel, debit: 0, credit: amt, line_memo: `Réimputation from ${oldCode}` },
      ];

  const { journalPostExtended } = require('./hmsFinJournalPost');
  const r = await journalPostExtended(pool, {
    facilityId: fid,
    sourceType: 'reimputation',
    sourceId: Date.now() % 2000000000,
    reference: `REIMP-${header.piece_number || header.id}`,
    narration: `Réimputation ${oldCode} → ${newCode} (journal #${journalId})`,
    createdBy: uid,
    lines: adjLines,
    entryDate: String(header.entry_date || '').slice(0, 10),
    journalCode: 'OD',
    status: 'posted',
  });

  if (!r.ok) return { ok: false, error: journalPostLastError() || 'Réimputation failed.' };
  await writeJournalAudit(pool, journalId, fid, 'reimputed', uid, {
    line_id: lineId,
    from: oldCode,
    to: newCode,
    adjustment_id: r.journalId,
  });
  return { ok: true, journalId: r.journalId, error: '' };
}

async function postDraftJournal(pool, facilityId, journalId, userId) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const uid = Math.max(0, parseInt(userId, 10) || 0);
  const header = await loadJournalHeader(pool, fid, journalId);
  if (!header) return { ok: false, error: 'Not found.' };
  if (String(header.status) !== 'draft') return { ok: false, error: 'Not a draft.' };

  const ed = String(header.entry_date || '').slice(0, 10);
  if (await isPeriodLocked(pool, fid, ed)) {
    return { ok: false, error: 'Period locked.' };
  }

  const { journalCode } = resolveJournalMeta(header.source_type, ed);
  const piece = header.piece_number || (await nextPieceNumber(pool, fid, journalCode, ed));

  await pool.query(
    `UPDATE tbl_fin_journal_header
     SET status = 'posted', journal_code = ?, piece_number = ?, posted_at = NOW(), posted_by = ?
     WHERE id = ? AND facility_id = ?`,
    [journalCode, piece, uid, journalId, fid]
  );

  await writeJournalAudit(pool, journalId, fid, 'posted', uid, { piece_number: piece });
  return { ok: true, error: '' };
}

async function lockPeriod(pool, facilityId, year, month, userId, reason) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (!y || m < 1 || m > 12) return { ok: false, error: 'Invalid period.' };
  await ensureFinAccountingSchema(pool);
  const rs = String(reason || '').slice(0, 255);
  if (pool.driver === 'postgres') {
    await pool.query(
      `INSERT INTO tbl_fin_period_lock (facility_id, lock_year, lock_month, locked_by, reason)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (facility_id, lock_year, lock_month)
       DO UPDATE SET locked_at = NOW(), locked_by = EXCLUDED.locked_by, reason = EXCLUDED.reason`,
      [fid, y, m, userId, rs]
    );
  } else {
    await pool.query(
      `INSERT INTO tbl_fin_period_lock (facility_id, lock_year, lock_month, locked_by, reason)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE locked_at = NOW(), locked_by = VALUES(locked_by), reason = VALUES(reason)`,
      [fid, y, m, userId, rs]
    );
  }
  return { ok: true, error: '' };
}

module.exports = {
  loadJournalHeader,
  loadJournalLines,
  reverseJournal,
  reimputeLine,
  postDraftJournal,
  lockPeriod,
};
