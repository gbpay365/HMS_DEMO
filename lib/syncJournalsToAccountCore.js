'use strict';

const cfg = require('./integrationConfig');
const { finTablesOk } = require('./hmsFinGeneralLedger');
const { ensureIntegrationSchema } = require('./ensureIntegrationSchema');
const { toIsoDatePart } = require('./hmsFormatDate');
const { getSettings } = require('./facilityIntegrationSettings');

async function resolveCoreAccountTarget(pool, facilityId, opts = {}) {
  const fid = parseInt(String(facilityId || cfg.facilityId()), 10) || 1;
  const s = await getSettings(pool, fid);
  const enabled = !!(opts.force || s.core_account_sync_enabled || cfg.isIntegrationEnabled());
  const envUrl = cfg.coreAccountUrl();
  const envKey = cfg.coreAccountApiKey();
  // Railway / .env vars win over tbl_facility_integration (avoids stale super-admin keys).
  const url = String(envUrl || s.core_account_url || '').replace(/\/+$/, '');
  const key = String(envKey || s.core_account_api_key || '').trim();
  return { enabled, url, key, facilityId: fid };
}

async function postJson(url, body, headers) {
  if (typeof fetch !== 'function') {
    return { ok: false, status: 0, data: { error: 'fetch unavailable' } };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

function externalRef(facilityId, journalId) {
  return `hms_journal:${facilityId}:${journalId}`;
}

async function loadJournalLines(pool, journalId) {
  const [rows] = await pool
    .query(
      `SELECT account_code, account_label, line_memo, debit, credit
         FROM tbl_fin_journal_line
        WHERE journal_id = ?
        ORDER BY id ASC`,
      [journalId]
    )
    .catch(() => [[]]);
  return (rows || [])
    .map((ln) => ({
      account_code: String(ln.account_code || '').trim().slice(0, 32),
      debit: parseFloat(ln.debit) || 0,
      credit: parseFloat(ln.credit) || 0,
      line_description: String(ln.line_memo || ln.account_label || '').trim().slice(0, 255),
    }))
    .filter((ln) => /^\d{6}$/.test(ln.account_code) && (ln.debit > 0 || ln.credit > 0));
}

async function syncOneJournalToAccountCore(pool, header, opts = {}) {
  const dryRun = !!opts.dryRun;
  const fid = parseInt(String(header.facility_id || cfg.facilityId()), 10) || 1;
  const target = await resolveCoreAccountTarget(pool, fid, opts);
  if (!target.enabled) {
    return { ok: false, skipped: true, reason: 'CORE_ACCOUNT_SYNC_ENABLED is not set' };
  }
  const url = target.url;
  const key = target.key;
  if (!url || !key) return { ok: false, skipped: true, reason: 'missing CORE_ACCOUNT_URL or API key' };

  const jid = parseInt(String(header.id || 0), 10) || 0;
  if (jid < 1) return { ok: false, skipped: true, reason: 'invalid journal id' };

  const lines = await loadJournalLines(pool, jid);
  if (lines.length < 2) {
    return { ok: false, skipped: true, reason: 'insufficient lines', journalId: jid };
  }

  const entryDate = toIsoDatePart(header.entry_date) || new Date().toISOString().slice(0, 10);

  const body = {
    hms_journal_id: jid,
    external_reference: externalRef(fid, jid),
    entry_date: entryDate,
    reference: String(header.reference || `HMS-J${jid}`).slice(0, 64),
    description: String(header.narration || header.reference || `HMS journal ${jid}`).slice(0, 512),
    narration: String(header.narration || '').slice(0, 512),
    journal_type: String(header.journal_code || 'JNL').slice(0, 8),
    lines,
  };

  if (dryRun) {
    return { ok: true, dryRun: true, journalId: jid, lineCount: lines.length };
  }

  const headers = {
    'X-API-Key': key,
    'X-Facility-Id': String(fid),
  };

  try {
    const res = await postJson(`${url}/api/v1/integrations/journal-entry`, body, headers);
    const sent = res.ok || res.status === 409 || res.data?.status === 'duplicate';
    const status = sent ? 'sent' : 'failed';
    await pool
      .query(
        `UPDATE tbl_fin_journal_header
            SET external_core_sync_status = ?, external_core_sync_at = NOW()
          WHERE id = ?`,
        [status, jid]
      )
      .catch(() => {});
    return {
      ok: sent,
      journalId: jid,
      status: res.status,
      data: res.data,
      duplicate: res.status === 409 || res.data?.status === 'duplicate',
    };
  } catch (e) {
    await pool
      .query(
        `UPDATE tbl_fin_journal_header SET external_core_sync_status = 'failed', external_core_sync_at = NOW() WHERE id = ?`,
        [jid]
      )
      .catch(() => {});
    return { ok: false, journalId: jid, error: e.message || String(e) };
  }
}

/**
 * Push HMS GL journals (tbl_fin_journal_header) to Account_Core journal entries.
 * Skips journals already marked sent unless --force is used.
 */
async function syncAllJournalsToAccountCore(pool, opts = {}) {
  await ensureIntegrationSchema(pool);
  if (!(await finTablesOk(pool))) {
    return { ok: false, error: 'Financial tables not installed in HMS.' };
  }

  const facilityId = parseInt(String(opts.facilityId || cfg.facilityId()), 10) || 1;
  const limit = Math.min(10000, Math.max(1, parseInt(String(opts.limit || 5000), 10) || 5000));
  const force = !!opts.force;
  const dryRun = !!opts.dryRun;
  const onlyPending = opts.onlyPending !== false && !force;

  let where = `facility_id = ? AND source_type <> 'account_core' AND status = 'posted'`;
  const params = [facilityId];
  if (onlyPending) {
    where += ` AND (external_core_sync_status IS NULL OR external_core_sync_status IN ('pending','failed'))`;
  }

  const [headers] = await pool
    .query(
      `SELECT id, facility_id, entry_date, reference, narration, journal_code, source_type, source_id
         FROM tbl_fin_journal_header
        WHERE ${where}
        ORDER BY entry_date ASC, id ASC
        LIMIT ${limit}`,
      params
    )
    .catch(() => [[]]);

  const rows = Array.isArray(headers) ? headers : [];
  const summary = {
    processed: 0,
    sent: 0,
    duplicate: 0,
    failed: 0,
    skipped: 0,
    dryRun,
    facilityId,
    firstError: '',
  };

  for (const header of rows) {
    summary.processed += 1;
    const out = await syncOneJournalToAccountCore(pool, header, { dryRun });
    if (out.skipped) {
      summary.skipped += 1;
      if (!summary.firstError) summary.firstError = out.reason || 'skipped';
      continue;
    }
    if (out.ok) {
      if (out.duplicate) summary.duplicate += 1;
      else summary.sent += 1;
    } else {
      summary.failed += 1;
      if (!summary.firstError) {
        summary.firstError = out.error || out.data?.error || `HTTP ${out.status || '?'}`;
      }
    }
  }

  summary.ok = summary.failed === 0;
  return summary;
}

async function getJournalSyncStats(pool, facilityId = 1) {
  const fid = Math.max(1, parseInt(String(facilityId), 10) || 1);
  const [[row]] = await pool
    .query(
      `SELECT
         COUNT(*) AS total_posted,
         SUM(CASE WHEN external_core_sync_status = 'sent' THEN 1 ELSE 0 END) AS sent,
         SUM(CASE WHEN external_core_sync_status = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN external_core_sync_status IS NULL OR external_core_sync_status = 'pending' THEN 1 ELSE 0 END) AS pending
       FROM tbl_fin_journal_header
      WHERE facility_id = ? AND status = 'posted' AND source_type <> 'account_core'`,
      [fid]
    )
    .catch(() => [[{ total_posted: 0, sent: 0, failed: 0, pending: 0 }]]);
  const core = await resolveCoreAccountTarget(pool, fid);
  return {
    facilityId: fid,
    ...row,
    coreSyncEnabled: core.enabled,
    coreAccountUrl: core.url || null,
    hasApiKey: !!core.key,
  };
}

module.exports = {
  externalRef,
  resolveCoreAccountTarget,
  syncOneJournalToAccountCore,
  syncAllJournalsToAccountCore,
  getJournalSyncStats,
};
