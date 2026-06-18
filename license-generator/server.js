'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');
const {
  decryptRequestCode,
  buildLicensePayload,
  signLicensePayload,
  hashSerial,
  LICENSE_VALID_DAYS,
  unixNow,
} = require('../lib/hmsLicenseCrypto');
const { getSolution, isValidSolutionKey } = require('../lib/hmsLicenseCatalog');
const db = require('./lib/db');
const pushWebhook = require('./lib/pushWebhook');
const offlineMonitor = require('./lib/offlineMonitor');
const mailer = require('./lib/mailer');

const app = express();
const PORT = Number(process.env.PORT || 5055);
const ADMIN_TOKEN = String(process.env.LICENSE_GENERATOR_ADMIN_TOKEN || '').trim();

app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return next();
  const token = String(req.get('x-admin-token') || req.body.admin_token || req.query.token || '').trim();
  if (token === ADMIN_TOKEN) return next();
  return res.status(401).json({ ok: false, error: 'Invalid admin token.' });
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

function requireClient(req, res, next) {
  const installationId = String(req.get('x-installation-id') || req.body.installation_id || '').trim();
  const clientKey = String(req.get('x-client-key') || req.body.client_key || '').trim();
  if (!installationId || !clientKey) {
    return res.status(401).json({ ok: false, error: 'Missing X-Installation-Id or X-Client-Key.' });
  }
  const check = db.verifyClient(db.getDb(), installationId, clientKey);
  if (!check.ok) return res.status(401).json({ ok: false, error: check.error });
  req.installationId = installationId;
  req.clientKey = clientKey;
  return next();
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ZAIZENS License Server',
    keysConfigured: !!(process.env.LICENSE_RSA_PRIVATE_KEY_PEM && process.env.LICENSE_ED25519_PRIVATE_KEY_PEM),
    dbPath: db.DB_PATH,
  });
});

// ── Legacy generator API ─────────────────────────────────────────────────────

app.post('/api/decode-request', requireAdmin, (req, res) => {
  try {
    const code = String(req.body.request_code || req.body.code || '').trim();
    const rsaPrivate = process.env.LICENSE_RSA_PRIVATE_KEY_PEM;
    if (!rsaPrivate) throw new Error('LICENSE_RSA_PRIVATE_KEY_PEM is not configured on this server.');
    const payload = decryptRequestCode(code, rsaPrivate);
    const solution = getSolution(payload.sid);
    res.json({
      ok: true,
      payload,
      solution: solution
        ? { key: solution.key, label: solution.label, desc: solution.desc }
        : { key: payload.sid, label: payload.sid },
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Could not decode request code.' });
  }
});

app.post('/api/generate-serial', requireAdmin, (req, res) => {
  try {
    const result = generateSerialFromRequest(req.body.request_code || req.body.code);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Could not generate serial number.' });
  }
});

function generateSerialFromRequest(codeRaw, { queueDelivery = false, reason = null } = {}) {
  const code = String(codeRaw || '').trim();
  const rsaPrivate = process.env.LICENSE_RSA_PRIVATE_KEY_PEM;
  const edPrivate = process.env.LICENSE_ED25519_PRIVATE_KEY_PEM;
  if (!rsaPrivate || !edPrivate) {
    throw new Error('License signing keys are not configured on this server.');
  }

  const request = decryptRequestCode(code, rsaPrivate);
  if (!isValidSolutionKey(request.sid)) {
    throw new Error('Request refers to an unknown solution: ' + request.sid);
  }

  const now = unixNow();
  const expiresAt = now + LICENSE_VALID_DAYS * 86400;
  const payload = buildLicensePayload({
    installationId: request.iid,
    solutionKey: request.sid,
    issuedAt: now,
    expiresAt,
  });
  const serial = signLicensePayload(payload, edPrivate);
  const solution = getSolution(request.sid);
  const serialHash = hashSerial(serial);
  const activatedAtIso = new Date(payload.iat * 1000).toISOString();
  const expiresAtIso = new Date(payload.exp * 1000).toISOString();

  const sqlite = db.getDb();
  db.registerInstallation(sqlite, {
    installationId: request.iid,
    facilityName: request.fac,
    contactEmail: request.email,
    appVersion: null,
    clientIp: null,
  });
  db.storeIssuedSerial(sqlite, request.iid, {
    solutionKey: request.sid,
    serialHash,
    activatedAt: activatedAtIso,
    expiresAt: expiresAtIso,
  });

  if (queueDelivery) {
    db.queueCommand(sqlite, request.iid, {
      commandType: 'deliver_serial',
      solutionKey: request.sid,
      reason: reason || 'vendor_issued',
      payload: { serial },
    });
  }

  db.audit(sqlite, 'serial_generated', request.iid, {
    solutionKey: request.sid,
    facility: request.fac,
    expiresAt: expiresAtIso,
    queued: !!queueDelivery,
  });

  return {
    serial,
    solution: { key: solution.key, label: solution.label },
    facility: request.fac,
    installationId: request.iid,
    issuedAt: activatedAtIso,
    expiresAt: expiresAtIso,
    validDays: LICENSE_VALID_DAYS,
    queuedForDelivery: !!queueDelivery,
  };
}

async function queueAndPush(sqlite, installationId, commandOpts, { pushReason } = {}) {
  const commandId = db.queueCommand(sqlite, installationId, commandOpts);
  const push = await pushWebhook.pushSyncNow(sqlite, installationId, { reason: pushReason || commandOpts.reason });
  return { commandId, push };
}

// ── Client API (hospital installations) ────────────────────────────────────

app.post('/api/v1/client/register', (req, res) => {
  try {
    const installationId = String(req.body.installation_id || '').trim();
    if (!installationId) throw new Error('installation_id is required.');
    const sqlite = db.getDb();
    const existing = sqlite.prepare('SELECT client_api_key FROM installations WHERE installation_id = ?').get(installationId);
    const sentKey = String(req.body.client_key || req.get('x-client-key') || '').trim();
    if (existing) {
      if (!sentKey || sentKey !== existing.client_api_key) {
        return res.status(401).json({
          ok: false,
          error: 'Installation already registered. Provide a valid client API key.',
        });
      }
      db.registerInstallation(sqlite, {
        installationId,
        facilityName: req.body.facility_name,
        contactEmail: req.body.contact_email,
        appVersion: req.body.app_version,
        clientIp: clientIp(req),
      });
      return res.json({ ok: true, installationId, clientApiKey: existing.client_api_key, isNew: false });
    }
    const result = db.registerInstallation(sqlite, {
      installationId,
      facilityName: req.body.facility_name,
      contactEmail: req.body.contact_email,
      appVersion: req.body.app_version,
      clientIp: clientIp(req),
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Registration failed.' });
  }
});

app.post('/api/v1/client/heartbeat', requireClient, async (req, res) => {
  try {
    const sqlite = db.getDb();
    const hb = db.updateHeartbeat(sqlite, req.installationId, {
      appVersion: req.body.app_version,
      productMode: req.body.product_mode,
      productSlices: req.body.product_slices,
      clientIp: clientIp(req),
      licenses: req.body.licenses,
      pushWebhookUrl: String(req.body.push_webhook_url || '').trim() || null,
    });
    if (hb.wasOffline) {
      const row = db.getInstallation(sqlite, req.installationId);
      mailer.sendOnlineRecoveryAlert(row).catch(() => {});
      db.audit(sqlite, 'client_online_recovery', req.installationId, { via: 'heartbeat' });
    }
    const commands = db.getPendingCommands(sqlite, req.installationId);
    res.json({ ok: true, serverTime: new Date().toISOString(), commands });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Heartbeat failed.' });
  }
});

app.post('/api/v1/client/request', requireClient, (req, res) => {
  try {
    const solutionKey = String(req.body.solution_key || '').trim();
    if (!isValidSolutionKey(solutionKey)) throw new Error('Unknown solution.');
    db.recordSubscriptionRequest(db.getDb(), req.installationId, {
      solutionKey,
      requestCode: req.body.request_code,
      requestExpiresAt: req.body.request_expires_at,
      contactEmail: req.body.contact_email,
      facilityName: req.body.facility_name,
    });
    res.json({ ok: true, solutionKey });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Could not record request.' });
  }
});

app.post('/api/v1/client/commands/:id/ack', requireClient, (req, res) => {
  try {
    db.ackCommand(db.getDb(), req.installationId, req.params.id, {
      ok: !!req.body.ok,
      message: req.body.message || null,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Ack failed.' });
  }
});

// ── Admin API (vendor dashboard) ─────────────────────────────────────────────

app.get('/api/admin/stats', requireAdmin, (_req, res) => {
  try {
    res.json({ ok: true, stats: db.getDashboardStats(db.getDb()) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/admin/installations', requireAdmin, (_req, res) => {
  try {
    const rows = db.listInstallations(db.getDb()).map((row) => ({
      installationId: row.installation_id,
      facilityName: row.facility_name,
      contactEmail: row.contact_email,
      appVersion: row.app_version,
      productMode: row.product_mode,
      productSlices: row.product_slices ? JSON.parse(row.product_slices) : [],
      status: row.status,
      firstSeenAt: row.first_seen_at,
      lastHeartbeatAt: row.last_heartbeat_at,
      lastIp: row.last_ip,
      pushWebhookUrl: row.push_webhook_url,
      connectivityStatus: row.connectivity_status,
      offlineAlertSentAt: row.offline_alert_sent_at,
      activeLicenses: row.active_licenses,
      pendingLicenses: row.pending_licenses,
      pendingCommands: row.pending_commands,
    }));
    res.json({ ok: true, installations: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/admin/installations/:installationId', requireAdmin, (req, res) => {
  try {
    const detail = db.getInstallationDetail(db.getDb(), req.params.installationId);
    if (!detail) return res.status(404).json({ ok: false, error: 'Installation not found.' });
    res.json({ ok: true, ...detail });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/installations/:installationId/revoke-solution', requireAdmin, async (req, res) => {
  try {
    const installationId = req.params.installationId;
    const solutionKey = String(req.body.solution_key || '').trim();
    const reason = String(req.body.reason || 'remote_revocation').trim();
    if (!isValidSolutionKey(solutionKey)) throw new Error('Unknown solution.');
    const sqlite = db.getDb();
    db.markLicenseRevokedOnServer(sqlite, installationId, solutionKey, reason);
    const { commandId, push } = await queueAndPush(sqlite, installationId, {
      commandType: 'revoke_solution',
      solutionKey,
      reason,
    }, { pushReason: `revoke_solution:${solutionKey}` });
    const pushNote = push.pushed ? ' Push sent — client should apply immediately.' : ' Client will apply on next sync.';
    res.json({ ok: true, commandId, push, message: `Revocation queued for ${solutionKey}.${pushNote}` });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/installations/:installationId/revoke-all', requireAdmin, async (req, res) => {
  try {
    const installationId = req.params.installationId;
    const reason = String(req.body.reason || 'remote_bulk_revocation').trim();
    const sqlite = db.getDb();
    db.markAllLicensesRevokedOnServer(sqlite, installationId, reason);
    const { commandId, push } = await queueAndPush(sqlite, installationId, {
      commandType: 'revoke_all',
      reason,
    }, { pushReason: 'revoke_all' });
    const pushNote = push.pushed ? ' Push sent — client should apply immediately.' : ' Client will apply on next sync.';
    res.json({ ok: true, commandId, push, message: `Bulk revocation queued.${pushNote}` });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/installations/:installationId/generate-serial', requireAdmin, async (req, res) => {
  try {
    const installationId = req.params.installationId;
    let requestCode = String(req.body.request_code || '').trim();
    if (!requestCode) {
      const sqlite = db.getDb();
      const solutionKey = String(req.body.solution_key || '').trim();
      const row = sqlite
        .prepare(
          `SELECT request_code FROM license_records
            WHERE installation_id = ? AND solution_key = ? AND status = 'pending'
            ORDER BY updated_at DESC LIMIT 1`
        )
        .get(installationId, solutionKey);
      requestCode = row && row.request_code ? String(row.request_code) : '';
    }
    if (!requestCode) throw new Error('No pending request code found. Paste a request code or select a pending solution.');
    const queueDelivery = req.body.queue_delivery !== false;
    const result = generateSerialFromRequest(requestCode, { queueDelivery, reason: 'vendor_dashboard' });
    if (String(result.installationId) !== String(installationId)) {
      throw new Error('Request code belongs to a different installation ID.');
    }
    let push = { pushed: false, reason: 'not_queued' };
    if (queueDelivery) {
      push = await pushWebhook.pushSyncNow(db.getDb(), installationId, { reason: 'serial_delivery' });
    }
    res.json({ ok: true, ...result, push });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/installations/:installationId/suspend', requireAdmin, (req, res) => {
  try {
    const sqlite = db.getDb();
    sqlite
      .prepare('UPDATE installations SET status = ?, notes = ? WHERE installation_id = ?')
      .run('suspended', req.body.reason || null, req.params.installationId);
    db.audit(sqlite, 'installation_suspended', req.params.installationId, { reason: req.body.reason || null });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/installations/:installationId/unsuspend', requireAdmin, (req, res) => {
  try {
    const sqlite = db.getDb();
    sqlite.prepare('UPDATE installations SET status = ? WHERE installation_id = ?').run('active', req.params.installationId);
    db.audit(sqlite, 'installation_unsuspended', req.params.installationId, {});
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/installations/:installationId/push-now', requireAdmin, async (req, res) => {
  try {
    const installationId = req.params.installationId;
    const sqlite = db.getDb();
    if (!db.getInstallation(sqlite, installationId)) {
      return res.status(404).json({ ok: false, error: 'Installation not found.' });
    }
    const push = await pushWebhook.pushSyncNow(sqlite, installationId, {
      reason: req.body.reason || 'admin_push_now',
    });
    db.audit(sqlite, 'admin_push_now', installationId, push);
    if (!push.pushed) {
      return res.status(400).json({ ok: false, error: push.reason || 'Push failed.', push });
    }
    res.json({ ok: true, push, message: 'Push webhook sent. Client should sync immediately.' });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.listen(PORT, () => {
  console.log(`ZAIZENS License Server listening on http://localhost:${PORT}`);
  console.log(`  Generator:  http://localhost:${PORT}/`);
  console.log(`  Dashboard:  http://localhost:${PORT}/dashboard`);
  if (!process.env.LICENSE_RSA_PRIVATE_KEY_PEM || !process.env.LICENSE_ED25519_PRIVATE_KEY_PEM) {
    console.warn('WARNING: Private keys are missing. Run npm run generate-keys and configure .env');
  }
  try {
    db.getDb();
    console.log(`  Database:   ${db.DB_PATH}`);
    offlineMonitor.startOfflineMonitor(db);
    if (pushWebhook.webhookSecret()) {
      console.log('  Push webhook: enabled (LICENSE_SERVER_WEBHOOK_SECRET set)');
    } else {
      console.warn('WARNING: LICENSE_SERVER_WEBHOOK_SECRET not set — instant push disabled');
    }
    if (mailer.alertRecipients().length) {
      console.log(`  Offline alerts: ${mailer.alertRecipients().join(', ')}`);
    }
  } catch (err) {
    console.warn('WARNING: Database not ready:', err.message);
  }
});
