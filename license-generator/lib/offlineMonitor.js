'use strict';

const mailer = require('./mailer');

function offlineThresholdMinutes() {
  const n = Number(process.env.LICENSE_SERVER_OFFLINE_MINUTES || 45);
  return Number.isFinite(n) && n >= 5 ? n : 45;
}

function monitorIntervalMs() {
  const n = Number(process.env.LICENSE_SERVER_OFFLINE_CHECK_MS || 300000);
  return Number.isFinite(n) && n >= 60000 ? n : 300000;
}

function isInstallationOffline(row, thresholdMinutes) {
  if (!row.last_heartbeat_at) return false;
  if (String(row.status) === 'suspended') return false;
  const last = new Date(row.last_heartbeat_at).getTime();
  if (Number.isNaN(last)) return false;
  const ageMs = Date.now() - last;
  return ageMs > thresholdMinutes * 60 * 1000;
}

function runOfflineCheck(dbModule) {
  const db = dbModule.getDb();
  const threshold = offlineThresholdMinutes();
  const rows = db
    .prepare(
      `SELECT installation_id, facility_name, contact_email, last_heartbeat_at, last_ip,
              offline_alert_sent_at, connectivity_status, status
         FROM installations
        WHERE last_heartbeat_at IS NOT NULL`
    )
    .all();

  let alertsSent = 0;
  let recovered = 0;

  for (const row of rows) {
    const offline = isInstallationOffline(row, threshold);

    if (offline && !row.offline_alert_sent_at) {
      mailer.sendOfflineAlert(row).then((result) => {
        if (result.sent) {
          db.prepare(
            `UPDATE installations
                SET offline_alert_sent_at = ?, connectivity_status = 'offline'
              WHERE installation_id = ?`
          ).run(new Date().toISOString(), row.installation_id);
          dbModule.audit(db, 'client_offline_alert', row.installation_id, {
            lastHeartbeat: row.last_heartbeat_at,
            thresholdMinutes: threshold,
          });
        }
      }).catch((err) => {
        console.warn('[LicenseServer] offline alert failed:', err.message || err);
      });
      alertsSent += 1;
      continue;
    }

    if (!offline && row.offline_alert_sent_at) {
      db.prepare(
        `UPDATE installations
            SET offline_alert_sent_at = NULL, connectivity_status = 'online'
          WHERE installation_id = ?`
      ).run(row.installation_id);
      mailer.sendOnlineRecoveryAlert({
        ...row,
        last_heartbeat_at: row.last_heartbeat_at,
      }).catch(() => {});
      dbModule.audit(db, 'client_online_recovery', row.installation_id, {});
      recovered += 1;
    } else if (!offline && row.connectivity_status !== 'online') {
      db.prepare(`UPDATE installations SET connectivity_status = 'online' WHERE installation_id = ?`).run(
        row.installation_id
      );
    }
  }

  return { checked: rows.length, alertsSent, recovered, thresholdMinutes: threshold };
}

function startOfflineMonitor(dbModule) {
  if (!mailer.alertRecipients().length) {
    console.warn('[LicenseServer] Offline email alerts disabled — set LICENSE_SERVER_ALERT_EMAIL');
  }

  const tick = () => {
    try {
      runOfflineCheck(dbModule);
    } catch (err) {
      console.warn('[LicenseServer] offline monitor:', err.message || err);
    }
  };

  setTimeout(tick, 15000);
  setInterval(tick, monitorIntervalMs());
  console.log(`[LicenseServer] Offline monitor every ${monitorIntervalMs() / 1000}s (threshold ${offlineThresholdMinutes()} min)`);
}

module.exports = {
  offlineThresholdMinutes,
  runOfflineCheck,
  startOfflineMonitor,
};
