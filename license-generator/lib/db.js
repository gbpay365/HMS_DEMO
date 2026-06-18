'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let Database;
try {
  Database = require('better-sqlite3');
} catch (_) {
  Database = null;
}

const DB_PATH = process.env.LICENSE_SERVER_DB_PATH || path.join(__dirname, '..', 'data', 'license-server.db');

function nowIso() {
  return new Date().toISOString();
}

function generateClientKey() {
  return crypto.randomBytes(32).toString('hex');
}

function openDb() {
  if (!Database) {
    throw new Error('better-sqlite3 is not installed. Run: cd license-generator && npm install');
  }
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS installations (
      installation_id TEXT PRIMARY KEY,
      client_api_key TEXT NOT NULL,
      facility_name TEXT,
      contact_email TEXT,
      app_version TEXT,
      product_mode TEXT,
      product_slices TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      first_seen_at TEXT NOT NULL,
      last_heartbeat_at TEXT,
      last_ip TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS license_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      installation_id TEXT NOT NULL,
      solution_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'inactive',
      serial_hash TEXT,
      request_code TEXT,
      request_expires_at TEXT,
      activated_at TEXT,
      expires_at TEXT,
      revoke_reason TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(installation_id, solution_key),
      FOREIGN KEY (installation_id) REFERENCES installations(installation_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS remote_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      installation_id TEXT NOT NULL,
      command_type TEXT NOT NULL,
      solution_key TEXT,
      payload_json TEXT,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      acked_at TEXT,
      ack_detail TEXT,
      FOREIGN KEY (installation_id) REFERENCES installations(installation_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS server_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      installation_id TEXT,
      detail_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_license_records_installation ON license_records(installation_id);
    CREATE INDEX IF NOT EXISTS idx_remote_commands_pending ON remote_commands(installation_id, status);
    CREATE INDEX IF NOT EXISTS idx_server_audit_created ON server_audit(created_at);
  `);

  ensureColumn(db, 'installations', 'push_webhook_url', 'TEXT');
  ensureColumn(db, 'installations', 'offline_alert_sent_at', 'TEXT');
  ensureColumn(db, 'installations', 'connectivity_status', "TEXT NOT NULL DEFAULT 'unknown'");
}

function ensureColumn(db, table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
}

function audit(db, action, installationId, detail) {
  db.prepare(
    'INSERT INTO server_audit (action, installation_id, detail_json, created_at) VALUES (?, ?, ?, ?)'
  ).run(action, installationId || null, detail ? JSON.stringify(detail) : null, nowIso());
}

function registerInstallation(db, { installationId, facilityName, contactEmail, appVersion, clientIp }) {
  const iid = String(installationId || '').trim();
  if (!iid) throw new Error('installation_id is required.');

  const existing = db.prepare('SELECT * FROM installations WHERE installation_id = ?').get(iid);
  if (existing) {
    db.prepare(
      `UPDATE installations
          SET facility_name = COALESCE(?, facility_name),
              contact_email = COALESCE(?, contact_email),
              app_version = COALESCE(?, app_version),
              last_heartbeat_at = ?,
              last_ip = ?
        WHERE installation_id = ?`
    ).run(facilityName || null, contactEmail || null, appVersion || null, nowIso(), clientIp || null, iid);
    audit(db, 'installation_seen', iid, { facilityName, appVersion });
    return { installationId: iid, clientApiKey: existing.client_api_key, isNew: false };
  }

  const clientApiKey = generateClientKey();
  db.prepare(
    `INSERT INTO installations
       (installation_id, client_api_key, facility_name, contact_email, app_version, first_seen_at, last_heartbeat_at, last_ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    iid,
    clientApiKey,
    facilityName || null,
    contactEmail || null,
    appVersion || null,
    nowIso(),
    nowIso(),
    clientIp || null
  );
  audit(db, 'installation_registered', iid, { facilityName, appVersion });
  return { installationId: iid, clientApiKey, isNew: true };
}

function verifyClient(db, installationId, clientKey) {
  const row = db.prepare('SELECT client_api_key, status FROM installations WHERE installation_id = ?').get(
    String(installationId || '').trim()
  );
  if (!row) return { ok: false, error: 'Unknown installation.' };
  if (String(row.client_api_key) !== String(clientKey || '').trim()) {
    return { ok: false, error: 'Invalid client API key.' };
  }
  if (row.status === 'suspended') return { ok: false, error: 'Installation is suspended.' };
  return { ok: true };
}

function upsertLicenseSnapshot(db, installationId, licenses) {
  const upsert = db.prepare(
    `INSERT INTO license_records
       (installation_id, solution_key, status, serial_hash, activated_at, expires_at, revoke_reason, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(installation_id, solution_key) DO UPDATE SET
       status = excluded.status,
       serial_hash = COALESCE(excluded.serial_hash, license_records.serial_hash),
       activated_at = COALESCE(excluded.activated_at, license_records.activated_at),
       expires_at = COALESCE(excluded.expires_at, license_records.expires_at),
       revoke_reason = CASE
         WHEN excluded.status = 'revoked' THEN COALESCE(excluded.revoke_reason, license_records.revoke_reason)
         ELSE license_records.revoke_reason
       END,
       updated_at = excluded.updated_at`
  );
  const tx = db.transaction((items) => {
    for (const lic of items || []) {
      const key = String(lic.solution_key || lic.solutionKey || '').trim();
      if (!key) continue;
      upsert.run(
        installationId,
        key,
        String(lic.status || 'inactive'),
        lic.serial_hash || lic.serialHash || null,
        lic.activated_at || lic.activatedAt || null,
        lic.expires_at || lic.expiresAt || null,
        lic.revoke_reason || lic.revokeReason || null,
        nowIso()
      );
    }
  });
  tx(licenses || []);
}

function recordSubscriptionRequest(db, installationId, { solutionKey, requestCode, requestExpiresAt, contactEmail, facilityName }) {
  const key = String(solutionKey || '').trim();
  if (!key) throw new Error('solution_key is required.');
  db.prepare(
    `INSERT INTO license_records
       (installation_id, solution_key, status, request_code, request_expires_at, updated_at)
     VALUES (?, ?, 'pending', ?, ?, ?)
     ON CONFLICT(installation_id, solution_key) DO UPDATE SET
       status = 'pending',
       request_code = excluded.request_code,
       request_expires_at = excluded.request_expires_at,
       updated_at = excluded.updated_at`
  ).run(installationId, key, requestCode || null, requestExpiresAt || null, nowIso());

  db.prepare(
    `UPDATE installations
        SET facility_name = COALESCE(?, facility_name),
            contact_email = COALESCE(?, contact_email)
      WHERE installation_id = ?`
  ).run(facilityName || null, contactEmail || null, installationId);

  audit(db, 'subscription_request', installationId, { solutionKey: key, requestExpiresAt });
}

function queueCommand(db, installationId, { commandType, solutionKey, reason, payload }) {
  const result = db.prepare(
    `INSERT INTO remote_commands
       (installation_id, command_type, solution_key, payload_json, reason, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`
  ).run(
    installationId,
    commandType,
    solutionKey || null,
    payload ? JSON.stringify(payload) : null,
    reason || null,
    nowIso()
  );
  audit(db, 'command_queued', installationId, { commandType, solutionKey, reason, commandId: result.lastInsertRowid });
  return Number(result.lastInsertRowid);
}

function getPendingCommands(db, installationId) {
  return db
    .prepare(
      `SELECT id, command_type, solution_key, payload_json, reason, created_at
         FROM remote_commands
        WHERE installation_id = ? AND status = 'pending'
        ORDER BY id ASC`
    )
    .all(installationId)
    .map((row) => ({
      id: row.id,
      type: row.command_type,
      solutionKey: row.solution_key,
      reason: row.reason,
      payload: row.payload_json ? JSON.parse(row.payload_json) : null,
      createdAt: row.created_at,
    }));
}

function ackCommand(db, installationId, commandId, { ok, message }) {
  const row = db
    .prepare('SELECT id FROM remote_commands WHERE id = ? AND installation_id = ? AND status = ?')
    .get(Number(commandId), installationId, 'pending');
  if (!row) throw new Error('Command not found or already acknowledged.');
  db.prepare(
    `UPDATE remote_commands
        SET status = ?, acked_at = ?, ack_detail = ?
      WHERE id = ?`
  ).run(ok ? 'acked' : 'failed', nowIso(), message || null, Number(commandId));
  audit(db, ok ? 'command_acked' : 'command_failed', installationId, { commandId, message });
}

function updateHeartbeat(db, installationId, { appVersion, productMode, productSlices, clientIp, licenses, pushWebhookUrl }) {
  const row = db.prepare('SELECT offline_alert_sent_at FROM installations WHERE installation_id = ?').get(installationId);
  const wasOffline = !!(row && row.offline_alert_sent_at);

  db.prepare(
    `UPDATE installations
        SET app_version = COALESCE(?, app_version),
            product_mode = ?,
            product_slices = ?,
            last_heartbeat_at = ?,
            last_ip = ?,
            push_webhook_url = COALESCE(?, push_webhook_url),
            connectivity_status = 'online',
            offline_alert_sent_at = NULL
      WHERE installation_id = ?`
  ).run(
    appVersion || null,
    productMode || null,
    productSlices ? JSON.stringify(productSlices) : null,
    nowIso(),
    clientIp || null,
    pushWebhookUrl || null,
    installationId
  );
  upsertLicenseSnapshot(db, installationId, licenses);
  return { wasOffline };
}

function listInstallations(db) {
  return db
    .prepare(
      `SELECT i.*,
              (SELECT COUNT(*) FROM license_records lr WHERE lr.installation_id = i.installation_id AND lr.status = 'active') AS active_licenses,
              (SELECT COUNT(*) FROM license_records lr WHERE lr.installation_id = i.installation_id AND lr.status = 'pending') AS pending_licenses,
              (SELECT COUNT(*) FROM remote_commands rc WHERE rc.installation_id = i.installation_id AND rc.status = 'pending') AS pending_commands
         FROM installations i
        ORDER BY datetime(i.last_heartbeat_at) DESC, i.facility_name ASC`
    )
    .all();
}

function getInstallationDetail(db, installationId) {
  const installation = db.prepare('SELECT * FROM installations WHERE installation_id = ?').get(installationId);
  if (!installation) return null;
  const licenses = db
    .prepare(
      `SELECT * FROM license_records WHERE installation_id = ? ORDER BY solution_key`
    )
    .all(installationId);
  const commands = db
    .prepare(
      `SELECT id, command_type, solution_key, reason, status, created_at, acked_at, ack_detail
         FROM remote_commands
        WHERE installation_id = ?
        ORDER BY id DESC
        LIMIT 50`
    )
    .all(installationId);
  const auditLog = db
    .prepare(
      `SELECT action, detail_json, created_at FROM server_audit
        WHERE installation_id = ?
        ORDER BY id DESC
        LIMIT 30`
    )
    .all(installationId);
  return {
    installation,
    licenses,
    commands,
    auditLog,
  };
}

function markLicenseRevokedOnServer(db, installationId, solutionKey, reason) {
  db.prepare(
    `UPDATE license_records
        SET status = 'revoked', revoke_reason = ?, updated_at = ?
      WHERE installation_id = ? AND solution_key = ?`
  ).run(reason || null, nowIso(), installationId, solutionKey);
}

function markAllLicensesRevokedOnServer(db, installationId, reason) {
  db.prepare(
    `UPDATE license_records
        SET status = 'revoked', revoke_reason = ?, updated_at = ?
      WHERE installation_id = ? AND status IN ('active', 'pending', 'expired')`
  ).run(reason || null, nowIso(), installationId);
}

function storeIssuedSerial(db, installationId, { solutionKey, serialHash, activatedAt, expiresAt }) {
  db.prepare(
    `INSERT INTO license_records
       (installation_id, solution_key, status, serial_hash, activated_at, expires_at, updated_at)
     VALUES (?, ?, 'active', ?, ?, ?, ?)
     ON CONFLICT(installation_id, solution_key) DO UPDATE SET
       status = 'active',
       serial_hash = excluded.serial_hash,
       activated_at = excluded.activated_at,
       expires_at = excluded.expires_at,
       request_code = NULL,
       request_expires_at = NULL,
       revoke_reason = NULL,
       updated_at = excluded.updated_at`
  ).run(installationId, solutionKey, serialHash || null, activatedAt || null, expiresAt || null, nowIso());
}

function getInstallation(db, installationId) {
  return db.prepare('SELECT * FROM installations WHERE installation_id = ?').get(installationId);
}

function getDashboardStats(db) {
  const installations = db.prepare('SELECT COUNT(*) AS c FROM installations').get().c;
  const activeLicenses = db.prepare("SELECT COUNT(*) AS c FROM license_records WHERE status = 'active'").get().c;
  const pendingRequests = db.prepare("SELECT COUNT(*) AS c FROM license_records WHERE status = 'pending'").get().c;
  const pendingCommands = db.prepare("SELECT COUNT(*) AS c FROM remote_commands WHERE status = 'pending'").get().c;
  const recent = db
    .prepare(
      `SELECT installation_id, facility_name, last_heartbeat_at
         FROM installations
        ORDER BY datetime(last_heartbeat_at) DESC
        LIMIT 5`
    )
    .all();
  return { installations, activeLicenses, pendingRequests, pendingCommands, recentHeartbeats: recent };
}

let _db = null;

function getDb() {
  if (!_db) _db = openDb();
  return _db;
}

module.exports = {
  DB_PATH,
  getDb,
  audit,
  registerInstallation,
  verifyClient,
  recordSubscriptionRequest,
  queueCommand,
  getPendingCommands,
  ackCommand,
  updateHeartbeat,
  listInstallations,
  getInstallationDetail,
  markLicenseRevokedOnServer,
  markAllLicensesRevokedOnServer,
  storeIssuedSerial,
  getInstallation,
  getDashboardStats,
};
