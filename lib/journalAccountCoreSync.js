'use strict';

const cfg = require('./integrationConfig');
const { syncOneJournalToAccountCore, syncAllJournalsToAccountCore } = require('./syncJournalsToAccountCore');
const { ensureIntegrationSchema } = require('./ensureIntegrationSchema');
const { resolveCoreAccountConfig } = require('./resolveCoreAccountConfig');

/**
 * Fire-and-forget push after a journal is posted in HMS GL.
 */
function scheduleJournalSyncToAccountCore(pool, journalId, facilityId) {
  const jid = parseInt(String(journalId), 10) || 0;
  if (jid < 1) return;
  setImmediate(() => {
    pushJournalSyncToAccountCore(pool, jid, facilityId).catch((e) => {
      console.warn('[journal-core-sync]', jid, e.message || e);
    });
  });
}

async function pushJournalSyncToAccountCore(pool, journalId, facilityId) {
  const fid = parseInt(String(facilityId), 10) || cfg.facilityId();
  const core = await resolveCoreAccountConfig(pool, fid);
  if (!core.enabled) {
    return { ok: false, skipped: true, reason: 'CORE_ACCOUNT_SYNC_ENABLED is not 1 (and facility sync off)' };
  }

  await ensureIntegrationSchema(pool);

  const jid = parseInt(String(journalId), 10) || 0;

  if (jid < 1) return { ok: false, skipped: true, reason: 'invalid journal id' };

  const [[header]] = await pool
    .query(
      `SELECT id, facility_id, entry_date, reference, narration, journal_code, source_type, status
         FROM tbl_fin_journal_header
        WHERE id = ? AND facility_id = ?
        LIMIT 1`,
      [jid, fid]
    )
    .catch(() => [[null]]);

  if (!header) return { ok: false, skipped: true, reason: 'journal not found' };
  if (String(header.status) !== 'posted') return { ok: false, skipped: true, reason: 'not posted' };
  if (String(header.source_type) === 'account_core') {
    return { ok: false, skipped: true, reason: 'originated from Account_Core' };
  }

  // Cashier pipeline already pushes receipt/expense webhooks — avoid duplicate GL journal in Core.
  const [[cashierTxn]] = await pool
    .query(
      `SELECT external_sync_status FROM tbl_cashier_txn WHERE journal_header_id = ? LIMIT 1`,
      [jid]
    )
    .catch(() => [[null]]);
  if (cashierTxn && String(cashierTxn.external_sync_status) === 'sent') {
    await pool
      .query(
        `UPDATE tbl_fin_journal_header SET external_core_sync_status = 'sent', external_core_sync_at = NOW() WHERE id = ?`,
        [jid]
      )
      .catch(() => {});
    return { ok: true, skipped: true, reason: 'synced via cashier txn webhook' };
  }

  await pool
    .query(
      `UPDATE tbl_fin_journal_header
          SET external_core_sync_status = 'pending'
        WHERE id = ?
          AND (external_core_sync_status IS NULL OR external_core_sync_status IN ('pending','failed'))`,
      [jid]
    )
    .catch(() => {});

  const out = await syncOneJournalToAccountCore(pool, header, {});
  if (out.ok) {
    console.log('[journal-core-sync] sent journal', jid, out.duplicate ? '(duplicate)' : '');
  } else if (!out.skipped) {
    console.warn('[journal-core-sync] failed journal', jid, out.error || out.data?.error || `HTTP ${out.status || '?'}`);
  }
  return out;
}

/** Backfill journals that were posted before real-time sync existed. */
async function syncPendingJournalsOnStartup(pool, opts = {}) {
  const summary = await syncAllJournalsToAccountCore(pool, {
    limit: opts.limit || 500,
    onlyPending: true,
    facilityId: opts.facilityId,
  });
  if (summary.processed > 0) {
    console.log('[journal-core-sync] startup backfill:', JSON.stringify(summary));
  }
  return summary;
}

module.exports = {
  scheduleJournalSyncToAccountCore,
  pushJournalSyncToAccountCore,
  syncPendingJournalsOnStartup,
};
