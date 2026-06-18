'use strict';

const crypto = require('crypto');

const PUSH_TIMEOUT_MS = 15000;

function webhookSecret() {
  return String(process.env.LICENSE_SERVER_WEBHOOK_SECRET || '').trim();
}

function buildSignature(installationId, timestamp, event) {
  const secret = webhookSecret();
  if (!secret) return '';
  return crypto
    .createHmac('sha256', secret)
    .update(`${installationId}.${timestamp}.${event}`)
    .digest('hex');
}

function getInstallationPushTarget(db, installationId) {
  return db
    .prepare('SELECT installation_id, push_webhook_url, facility_name FROM installations WHERE installation_id = ?')
    .get(installationId);
}

async function pushSyncNow(db, installationId, { reason, event = 'sync_now' } = {}) {
  const secret = webhookSecret();
  if (!secret) {
    return { pushed: false, reason: 'webhook_secret_not_configured' };
  }

  const row = getInstallationPushTarget(db, installationId);
  if (!row || !row.push_webhook_url) {
    return { pushed: false, reason: 'no_push_webhook_url' };
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = buildSignature(installationId, timestamp, event);
  const body = JSON.stringify({
    event,
    installation_id: installationId,
    reason: reason || 'vendor_push',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS);

  try {
    const res = await fetch(row.push_webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Installation-Id': installationId,
        'X-License-Webhook-Timestamp': timestamp,
        'X-License-Webhook-Signature': signature,
        'X-License-Webhook-Event': event,
      },
      body,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return {
        pushed: false,
        reason: data.error || `HTTP ${res.status}`,
        status: res.status,
      };
    }
    return {
      pushed: true,
      status: res.status,
      commandsApplied: data.commandsApplied ?? null,
    };
  } catch (err) {
    return { pushed: false, reason: err.message || 'push_failed' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  webhookSecret,
  buildSignature,
  pushSyncNow,
};
