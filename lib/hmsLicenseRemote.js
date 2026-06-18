'use strict';

const crypto = require('crypto');
const hmsLicense = require('./hmsLicense');

const DEFAULT_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const MIN_SYNC_INTERVAL_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 30000;
const WEBHOOK_MAX_AGE_SEC = 300;

function getServerUrl() {
  return String(process.env.LICENSE_SERVER_URL || '').trim().replace(/\/+$/, '');
}

function isLicenseServerConfigured() {
  return !!getServerUrl();
}

function getSyncIntervalMs() {
  const n = Number(process.env.LICENSE_SERVER_SYNC_INTERVAL_MS || DEFAULT_SYNC_INTERVAL_MS);
  if (!Number.isFinite(n) || n < MIN_SYNC_INTERVAL_MS) return DEFAULT_SYNC_INTERVAL_MS;
  return n;
}

function getWebhookSecret() {
  return String(process.env.LICENSE_SERVER_WEBHOOK_SECRET || '').trim();
}

function getPushWebhookUrl() {
  const explicit = String(process.env.LICENSE_SERVER_PUSH_URL || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;
  const base = String(process.env.HMS_PUBLIC_URL || process.env.APP_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  return `${base}/api/hms/license-server/push`;
}

async function getRemoteSettings(pool) {
  const [rows] = await pool
    .query(
      'SELECT license_server_client_key, license_server_last_sync FROM tbl_app_settings WHERE id=1 LIMIT 1'
    )
    .catch(() => [[]]);
  const row = rows && rows[0];
  return {
    clientKey: row && row.license_server_client_key ? String(row.license_server_client_key) : '',
    lastSync: row && row.license_server_last_sync ? new Date(row.license_server_last_sync) : null,
  };
}

async function saveClientKey(pool, clientKey) {
  if (!clientKey) return;
  await pool.query('UPDATE tbl_app_settings SET license_server_client_key=? WHERE id=1', [clientKey]).catch(async () => {
    await pool.query(
      'INSERT INTO tbl_app_settings (id, license_server_client_key) VALUES (1, ?) ON DUPLICATE KEY UPDATE license_server_client_key = VALUES(license_server_client_key)',
      [clientKey]
    );
  });
}

async function touchLastSync(pool) {
  await pool.query('UPDATE tbl_app_settings SET license_server_last_sync=NOW() WHERE id=1').catch(() => {});
}

async function fetchJson(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `License server error (${res.status})`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function buildLicenseSnapshot(pool) {
  const dash = await hmsLicense.getSubscriptionDashboard(pool);
  const deployment = await hmsLicense.getLicensedDeploymentView(pool);
  return {
    installationId: dash.installationId,
    facilityName: dash.facilityName,
    defaultContactEmail: dash.defaultContactEmail,
    appVersion: process.env.npm_package_version || process.env.HMS_APP_VERSION || '1.0.0',
    productMode: deployment.enabled ? (deployment.slices && deployment.slices[0]) || 'hms' : null,
    productSlices: deployment.slices || [],
    pushWebhookUrl: getPushWebhookUrl(),
    licenses: dash.solutions
      .filter((s) => s.status && s.status !== 'inactive')
      .map((s) => ({
        solution_key: s.key,
        status: s.status,
        activated_at: s.activatedAt,
        expires_at: s.expiresAt,
        revoke_reason: s.revokeReason,
      })),
  };
}

function verifyLicenseServerPush(req) {
  const secret = getWebhookSecret();
  if (!secret) throw new Error('LICENSE_SERVER_WEBHOOK_SECRET is not configured on this installation.');

  const installationId = String(req.get('x-installation-id') || req.body.installation_id || '').trim();
  const timestamp = String(req.get('x-license-webhook-timestamp') || '').trim();
  const signature = String(req.get('x-license-webhook-signature') || '').trim();
  const event = String(req.get('x-license-webhook-event') || req.body.event || 'sync_now').trim();

  if (!installationId || !timestamp || !signature) {
    throw new Error('Missing webhook authentication headers.');
  }

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) throw new Error('Invalid webhook timestamp.');
  const age = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
  if (age > WEBHOOK_MAX_AGE_SEC) throw new Error('Webhook timestamp expired.');

  const expected = crypto.createHmac('sha256', secret).update(`${installationId}.${timestamp}.${event}`).digest('hex');
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Invalid webhook signature.');
  }

  return { installationId, event, reason: req.body.reason || null };
}

async function registerWithLicenseServer(pool) {
  const base = getServerUrl();
  if (!base) return { ok: false, skipped: true, reason: 'not_configured' };

  const snapshot = await buildLicenseSnapshot(pool);
  const remote = await getRemoteSettings(pool);

  const body = {
    installation_id: snapshot.installationId,
    facility_name: snapshot.facilityName,
    contact_email: snapshot.defaultContactEmail,
    app_version: snapshot.appVersion,
    client_key: remote.clientKey || undefined,
  };

  const data = await fetchJson(`${base}/api/v1/client/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });

  if (data.clientApiKey && data.clientApiKey !== remote.clientKey) {
    await saveClientKey(pool, data.clientApiKey);
  }
  return { ok: true, isNew: !!data.isNew, clientApiKey: data.clientApiKey };
}

async function applyRemoteCommand(pool, command, actorId) {
  const type = String(command.type || command.command_type || '').trim();
  const reason = String(command.reason || 'remote_license_server').slice(0, 500);
  const solutionKey = command.solutionKey || command.solution_key;

  if (type === 'revoke_solution') {
    await hmsLicense.deactivateSolutionLicense(pool, {
      solutionKey,
      actorId: actorId || null,
      reason: `[remote] ${reason}`,
    });
    return { type, solutionKey, applied: true };
  }

  if (type === 'revoke_all') {
    try {
      await hmsLicense.deactivateAllActiveLicenses(pool, {
        actorId: actorId || null,
        reason: `[remote] ${reason}`,
      });
    } catch (err) {
      if (!/No active or pending/i.test(err.message || '')) throw err;
    }
    return { type, applied: true };
  }

  if (type === 'deliver_serial') {
    const serial = command.payload && command.payload.serial;
    if (!serial) throw new Error('deliver_serial command missing serial payload.');
    await hmsLicense.activateSerial(pool, { serial, actorId: actorId || null });
    return { type, solutionKey, applied: true };
  }

  throw new Error(`Unknown remote command: ${type}`);
}

async function processRemoteCommands(pool, { commands, base, headers, actorId }) {
  const applied = [];
  const failures = [];

  for (const command of commands || []) {
    try {
      const result = await applyRemoteCommand(pool, command, actorId);
      applied.push(result);
      await fetchJson(`${base}/api/v1/client/commands/${command.id}/ack`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ok: true, message: JSON.stringify(result) }),
      });
    } catch (err) {
      failures.push({ commandId: command.id, type: command.type, error: err.message });
      try {
        await fetchJson(`${base}/api/v1/client/commands/${command.id}/ack`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ok: false, message: err.message }),
        });
      } catch (_) {
        /* ignore ack failure */
      }
    }
  }

  return { applied, failures };
}

async function syncWithLicenseServer(pool, { actorId = null, forceRegister = false } = {}) {
  const base = getServerUrl();
  if (!base) return { ok: false, skipped: true, reason: 'not_configured' };

  let remote = await getRemoteSettings(pool);
  if (!remote.clientKey || forceRegister) {
    await registerWithLicenseServer(pool);
    remote = await getRemoteSettings(pool);
  }
  if (!remote.clientKey) throw new Error('License server registration did not return a client API key.');

  const snapshot = await buildLicenseSnapshot(pool);
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Installation-Id': snapshot.installationId,
    'X-Client-Key': remote.clientKey,
  };

  const heartbeat = await fetchJson(`${base}/api/v1/client/heartbeat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      app_version: snapshot.appVersion,
      product_mode: snapshot.productMode,
      product_slices: snapshot.productSlices,
      push_webhook_url: snapshot.pushWebhookUrl || undefined,
      licenses: snapshot.licenses,
    }),
  });

  const { applied, failures } = await processRemoteCommands(pool, {
    commands: heartbeat.commands,
    base,
    headers,
    actorId,
  });

  await touchLastSync(pool);
  return {
    ok: true,
    serverTime: heartbeat.serverTime,
    commandsReceived: (heartbeat.commands || []).length,
    commandsApplied: applied.length,
    applied,
    failures,
  };
}

async function handleLicenseServerPush(pool, req) {
  const auth = verifyLicenseServerPush(req);
  const { installationId } = await hmsLicense.ensureInstallationId(pool);
  if (String(auth.installationId) !== String(installationId)) {
    throw new Error('Webhook installation ID does not match this server.');
  }
  const result = await syncWithLicenseServer(pool, { actorId: null, forceRegister: false });
  return { ...result, pushReason: auth.reason, event: auth.event };
}

async function submitRequestToLicenseServer(pool, requestResult) {
  const base = getServerUrl();
  if (!base || !requestResult) return { ok: false, skipped: true };

  let remote = await getRemoteSettings(pool);
  if (!remote.clientKey) {
    await registerWithLicenseServer(pool);
    remote = await getRemoteSettings(pool);
  }
  if (!remote.clientKey) return { ok: false, skipped: true, reason: 'no_client_key' };

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Installation-Id': requestResult.installationId,
    'X-Client-Key': remote.clientKey,
  };

  await fetchJson(`${base}/api/v1/client/request`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      solution_key: requestResult.solutionKey,
      request_code: requestResult.requestCode,
      request_expires_at: requestResult.requestExpiresAt,
      contact_email: requestResult.mailto ? requestResult.mailto : null,
      facility_name: requestResult.facilityName,
    }),
  });

  return { ok: true };
}

async function getRemoteSyncStatus(pool) {
  const base = getServerUrl();
  const remote = await getRemoteSettings(pool);
  const { installationId } = await hmsLicense.ensureInstallationId(pool);
  return {
    configured: !!base,
    serverUrl: base,
    registered: !!remote.clientKey,
    lastSync: remote.lastSync ? remote.lastSync.toISOString() : null,
    installationId,
    syncIntervalMs: getSyncIntervalMs(),
    pushWebhookUrl: getPushWebhookUrl(),
    pushWebhookConfigured: !!(getPushWebhookUrl() && getWebhookSecret()),
  };
}

let _syncTimer = null;

function startLicenseServerSync(pool) {
  if (!isLicenseServerConfigured() || !pool) return;
  if (_syncTimer) return;

  const run = async () => {
    try {
      await syncWithLicenseServer(pool);
    } catch (err) {
      console.warn('[LicenseServer] sync failed:', err.message || err);
    }
  };

  setTimeout(run, 5000);
  _syncTimer = setInterval(run, getSyncIntervalMs());
}

module.exports = {
  isLicenseServerConfigured,
  getServerUrl,
  getPushWebhookUrl,
  getWebhookSecret,
  getSyncIntervalMs,
  registerWithLicenseServer,
  syncWithLicenseServer,
  handleLicenseServerPush,
  submitRequestToLicenseServer,
  getRemoteSyncStatus,
  startLicenseServerSync,
};
