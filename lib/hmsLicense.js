'use strict';

const deploymentConfig = require('./deploymentConfig');
const { listSolutions, getSolution, slicesForSolution, isValidSolutionKey } = require('./hmsLicenseCatalog');
const {
  buildRequestPayload,
  encryptRequestCode,
  verifySerialNumber,
  hashSerial,
  generateInstallationId,
  unixNow,
  LICENSE_VALID_DAYS,
} = require('./hmsLicenseCrypto');

const LICENSE_MANAGER_ROLES = Object.freeze(['1', '99', '100']);

function canManageLicenses(role) {
  return LICENSE_MANAGER_ROLES.includes(String(role || '').trim());
}

function getPublicKeyPem() {
  return process.env.LICENSE_ED25519_PUBLIC_KEY_PEM || '';
}

function getRsaPublicKeyPem() {
  return process.env.LICENSE_RSA_PUBLIC_KEY_PEM || '';
}

function licenseKeysConfigured() {
  return !!(getPublicKeyPem() && getRsaPublicKeyPem());
}

async function audit(pool, action, solutionKey, actorId, detail) {
  await pool.query(
    'INSERT INTO tbl_hms_license_audit (action, solution_key, actor_employee_id, detail_json) VALUES (?, ?, ?, ?)',
    [action, solutionKey || null, actorId || null, detail ? JSON.stringify(detail) : null]
  ).catch(() => {});
}

async function ensureInstallationId(pool) {
  const [rows] = await pool.query(
    'SELECT license_installation_id, license_contact_email FROM tbl_app_settings WHERE id=1 LIMIT 1'
  ).catch(() => [[]]);
  let iid = rows && rows[0] && rows[0].license_installation_id;
  if (!iid) {
    iid = generateInstallationId();
    const { isLicenseDeploymentEnabled } = require('./hmsLicenseDeploymentGuard');
    const initialSlices = isLicenseDeploymentEnabled() ? JSON.stringify([]) : JSON.stringify(['full']);
    const initialMode = isLicenseDeploymentEnabled() ? 'hms' : 'full';
    await pool.query(
      'INSERT INTO tbl_app_settings (id, product_mode, product_slices, license_installation_id) VALUES (1, ?, ?, ?) ON DUPLICATE KEY UPDATE license_installation_id = VALUES(license_installation_id)',
      [initialMode, initialSlices, iid]
    ).catch(async () => {
      await pool.query('UPDATE tbl_app_settings SET license_installation_id=? WHERE id=1', [iid]);
    });
  }
  return {
    installationId: iid,
    contactEmail: rows && rows[0] ? rows[0].license_contact_email : null,
  };
}

async function getPrimaryFacility(pool) {
  const [rows] = await pool.query('SELECT id, name FROM tbl_facility ORDER BY id LIMIT 1').catch(() => [[]]);
  if (rows && rows[0]) return rows[0];
  const legal = process.env.HMS_FACILITY_NAME || process.env.HMS_FACILITY_LEGAL_NAME || 'ZAIZENS Hospital';
  return { id: 1, name: legal };
}

async function listLicenseRows(pool) {
  const [rows] = await pool.query(
    `SELECT id, solution_key, status, request_code_expires_at, activated_at, expires_at,
            contact_email, notes, created_at, updated_at
       FROM tbl_hms_solution_license
      ORDER BY solution_key`
  ).catch(() => [[]]);
  return rows || [];
}

async function markExpiredLicenses(pool) {
  await pool.query(
    `UPDATE tbl_hms_solution_license
        SET status='expired'
      WHERE status='active' AND expires_at IS NOT NULL AND expires_at < NOW()`
  ).catch(() => {});
}

async function getActiveLicensedSlices(pool) {
  await markExpiredLicenses(pool);
  const [rows] = await pool.query(
    `SELECT solution_key FROM tbl_hms_solution_license
      WHERE status='active' AND (expires_at IS NULL OR expires_at >= NOW())`
  ).catch(() => [[]]);
  if (!rows || !rows.length) return [];
  const set = new Set();
  for (const r of rows) {
    for (const s of slicesForSolution(r.solution_key)) set.add(s);
  }
  if (set.has('full')) return ['full'];
  return [...set];
}

async function getActiveSolutionKeys(pool) {
  await markExpiredLicenses(pool);
  const [rows] = await pool.query(
    `SELECT solution_key FROM tbl_hms_solution_license
      WHERE status='active' AND (expires_at IS NULL OR expires_at >= NOW())
      ORDER BY solution_key`
  ).catch(() => [[]]);
  return (rows || []).map((r) => String(r.solution_key));
}

async function profileIdsForSolutionKeys(pool, solutionKeys) {
  const keys = [...new Set((solutionKeys || []).map(String))];
  if (keys.includes('full')) {
    const [rows] = await pool.query(
      "SELECT id FROM tbl_hms_deployment_profile WHERE name='Full Suite' LIMIT 1"
    ).catch(() => [[]]);
    if (rows && rows[0]) return [Number(rows[0].id)];
  }
  const ids = [];
  for (const key of keys) {
    if (key === 'full') continue;
    const sol = getSolution(key);
    if (!sol || !sol.profileName) continue;
    const [rows] = await pool.query(
      'SELECT id FROM tbl_hms_deployment_profile WHERE name=? LIMIT 1',
      [sol.profileName]
    ).catch(() => [[]]);
    if (rows && rows[0]) ids.push(Number(rows[0].id));
  }
  return [...new Set(ids.filter((n) => n > 0))];
}

async function applyEmptyLicensedDeployment(pool) {
  await pool.query(
    `UPDATE tbl_app_settings
        SET product_mode = ?,
            product_slices = ?,
            active_deployment_profile_id = NULL,
            active_deployment_profile_ids = NULL,
            legacy_modules_json = NULL
      WHERE id = 1`,
    ['hms', JSON.stringify([])]
  ).catch(() => {});
  await deploymentConfig.loadDeployment(pool);
  return [];
}

async function applyLicensedSlices(pool, slices) {
  const list = Array.isArray(slices) ? slices : [];
  const mode = list.includes('full') ? 'full' : list[0] || 'hms';
  await pool.query(
    `UPDATE tbl_app_settings SET product_mode = ?, product_slices = ? WHERE id = 1`,
    [mode, JSON.stringify(list)]
  ).catch(() => {});
  await deploymentConfig.loadDeployment(pool);
  return list;
}

/** Push active subscriptions into hospital-wide deployment + named profiles. */
async function syncLicensedDeployment(pool) {
  const { isLicenseDeploymentEnabled } = require('./hmsLicenseDeploymentGuard');
  if (!isLicenseDeploymentEnabled()) return null;

  const activeKeys = await getActiveSolutionKeys(pool);
  if (!activeKeys.length) {
    return applyEmptyLicensedDeployment(pool);
  }

  const mergedSlices = await getActiveLicensedSlices(pool);
  const profileIds = await profileIdsForSolutionKeys(pool, activeKeys);

  if (profileIds.length) {
    await deploymentConfig.activateProfiles(pool, profileIds);
    const current = deploymentConfig.getDeployment();
    const currentSlices = JSON.stringify(current.slices || []);
    const targetSlices = JSON.stringify(mergedSlices);
    if (currentSlices !== targetSlices) {
      await applyLicensedSlices(pool, mergedSlices);
    }
  } else {
    await pool.query(
      `UPDATE tbl_app_settings
          SET active_deployment_profile_id = NULL,
              active_deployment_profile_ids = NULL,
              legacy_modules_json = NULL
        WHERE id = 1`
    ).catch(() => {});
    await applyLicensedSlices(pool, mergedSlices);
  }

  try {
    const aclLayout = require('./aclLayout');
    await aclLayout.refresh();
  } catch (_) { /* optional */ }

  return mergedSlices;
}

async function getLicensedDeploymentView(pool) {
  const { isLicenseDeploymentEnabled } = require('./hmsLicenseDeploymentGuard');
  const enabled = isLicenseDeploymentEnabled();
  const activeKeys = enabled ? await getActiveSolutionKeys(pool) : [];
  const slices = enabled ? await getActiveLicensedSlices(pool) : [];
  const profileIds = enabled ? await profileIdsForSolutionKeys(pool, activeKeys) : [];
  let profileNames = [];
  if (profileIds.length) {
    const placeholders = profileIds.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT name FROM tbl_hms_deployment_profile WHERE id IN (${placeholders}) ORDER BY name`,
      profileIds
    ).catch(() => [[]]);
    profileNames = (rows || []).map((r) => r.name);
  }
  const dash = await getSubscriptionDashboard(pool);
  return {
    enabled,
    activeKeys,
    slices,
    profileIds,
    profileNames,
    activeSolutions: dash.active,
    pendingSolutions: dash.pending,
  };
}

function formatLicenseRow(row, solution) {
  const now = Date.now();
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
  const requestExpires = row.request_code_expires_at ? new Date(row.request_code_expires_at).getTime() : null;
  let status = row.status;
  if (status === 'active' && expiresAt && expiresAt < now) status = 'expired';
  const daysLeft =
    status === 'active' && expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 86400000)) : null;
  return {
    key: solution.key,
    label: solution.label,
    desc: solution.desc,
    icon: solution.icon,
    color: solution.color,
    status,
    subscribed: status === 'active',
    pending: status === 'pending',
    revoked: status === 'revoked',
    expiresAt: row.expires_at,
    activatedAt: row.activated_at,
    revokedAt: status === 'revoked' ? row.updated_at : null,
    revokeReason: status === 'revoked' ? row.notes || null : null,
    daysLeft,
    requestExpiresAt: row.request_code_expires_at,
    hasPendingRequest: status === 'pending' && requestExpires && requestExpires > now,
    contactEmail: row.contact_email || null,
  };
}

async function getSubscriptionDashboard(pool) {
  await markExpiredLicenses(pool);
  const { installationId, contactEmail } = await ensureInstallationId(pool);
  const facility = await getPrimaryFacility(pool);
  const rows = await listLicenseRows(pool);
  const byKey = new Map(rows.map((r) => [r.solution_key, r]));
  const solutions = listSolutions().map((sol) => {
    const row = byKey.get(sol.key);
    if (!row) {
      return {
        key: sol.key,
        label: sol.label,
        desc: sol.desc,
        icon: sol.icon,
        color: sol.color,
        status: 'inactive',
        subscribed: false,
        pending: false,
        expiresAt: null,
        activatedAt: null,
        daysLeft: null,
        requestExpiresAt: null,
        hasPendingRequest: false,
        contactEmail: null,
        revoked: false,
        revokedAt: null,
        revokeReason: null,
      };
    }
    return formatLicenseRow(row, sol);
  });
  const active = solutions.filter((s) => s.subscribed);
  const revoked = solutions.filter((s) => s.revoked);
  const inactive = solutions.filter((s) => !s.subscribed && !s.pending && !s.revoked);
  const pending = solutions.filter((s) => (s.pending || s.hasPendingRequest) && !s.revoked);
  return {
    installationId,
    defaultContactEmail: contactEmail,
    facilityName: facility.name,
    facilityId: facility.id,
    solutions,
    active,
    inactive,
    pending,
    revoked,
    hasLicenseEnforcement: rows.length > 0,
    licenseDeploymentEnabled: require('./hmsLicenseDeploymentGuard').isLicenseDeploymentEnabled(),
  };
}

async function saveContactEmail(pool, email) {
  const val = String(email || '').trim().slice(0, 250) || null;
  await pool.query('UPDATE tbl_app_settings SET license_contact_email=? WHERE id=1', [val]);
  return val;
}

async function createSubscriptionRequest(pool, { solutionKey, contactEmail, actorId }) {
  if (!isValidSolutionKey(solutionKey)) throw new Error('Unknown solution.');
  const rsaPublic = getRsaPublicKeyPem();
  if (!rsaPublic) {
    throw new Error('License public key is not configured. Contact your system vendor.');
  }
  const { installationId } = await ensureInstallationId(pool);
  const facility = await getPrimaryFacility(pool);
  const email = String(contactEmail || '').trim().slice(0, 250) || null;
  if (email) await saveContactEmail(pool, email);

  const payload = buildRequestPayload({
    installationId,
    solutionKey,
    facilityName: facility.name,
    facilityId: facility.id,
    contactEmail: email,
  });
  const requestCode = encryptRequestCode(payload, rsaPublic);
  const requestExpires = new Date(payload.exp * 1000);

  await pool.query(
    `INSERT INTO tbl_hms_solution_license
       (solution_key, status, request_code, request_code_expires_at, requested_by, contact_email)
     VALUES (?, 'pending', ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status='pending',
       request_code=VALUES(request_code),
       request_code_expires_at=VALUES(request_code_expires_at),
       requested_by=VALUES(requested_by),
       contact_email=VALUES(contact_email),
       serial_hash=NULL,
       activated_at=NULL,
       expires_at=NULL`,
    [solutionKey, requestCode, requestExpires, actorId || null, email]
  );

  await audit(pool, 'request_created', solutionKey, actorId, {
    facility: facility.name,
    requestExpires: requestExpires.toISOString(),
  });

  const solution = getSolution(solutionKey);
  let emailResult = { sent: false, reason: 'not_attempted' };
  try {
    const { sendSubscriptionRequestEmail, smtpConfigured } = require('./hmsMailer');
    if (smtpConfigured()) {
      emailResult = await sendSubscriptionRequestEmail({
        vendorEmail: process.env.LICENSE_VENDOR_EMAIL,
        hospitalEmail: email,
        solutionLabel: solution.label,
        facilityName: facility.name,
        installationId,
        requestCode,
        requestExpiresAt: requestExpires.toISOString(),
      });
      await audit(pool, emailResult.sent ? 'request_emailed' : 'request_email_skipped', solutionKey, actorId, {
        reason: emailResult.reason || null,
        vendor: process.env.LICENSE_VENDOR_EMAIL || null,
      });
    } else {
      emailResult = { sent: false, reason: 'smtp_not_configured' };
    }
  } catch (err) {
    emailResult = { sent: false, reason: err.message || 'email_failed' };
    await audit(pool, 'request_email_failed', solutionKey, actorId, { error: err.message });
  }

  return {
    requestCode,
    requestExpiresAt: requestExpires.toISOString(),
    solutionKey,
    facilityName: facility.name,
    installationId,
    emailSent: !!emailResult.sent,
    emailReason: emailResult.reason || null,
    vendorEmail: process.env.LICENSE_VENDOR_EMAIL || '',
    mailto: email
      ? `mailto:${encodeURIComponent(process.env.LICENSE_VENDOR_EMAIL || '')}?subject=${encodeURIComponent('ZAIZENS subscription request: ' + solution.label)}&body=${encodeURIComponent('Request code:\n\n' + requestCode)}`
      : null,
  };
}

async function activateSerial(pool, { serial, actorId }) {
  const pub = getPublicKeyPem();
  if (!pub) throw new Error('License verification key is not configured.');
  const trimmed = String(serial || '').trim();
  if (!trimmed) throw new Error('Enter a serial number.');

  const payload = verifySerialNumber(trimmed, pub);
  const now = unixNow();
  if (Number(payload.exp) < now) throw new Error('This serial number has expired. Request a new subscription code.');
  if (!isValidSolutionKey(payload.sid)) throw new Error('Serial number refers to an unknown solution.');

  const { installationId } = await ensureInstallationId(pool);
  if (String(payload.iid) !== String(installationId)) {
    throw new Error('This serial number is not issued for this hospital installation.');
  }

  const serialHash = hashSerial(trimmed);

  const [existingRow] = await pool.query(
    `SELECT status, serial_hash FROM tbl_hms_solution_license WHERE solution_key=? LIMIT 1`,
    [payload.sid]
  ).catch(() => [[]]);
  const existing = existingRow && existingRow[0];
  if (existing && String(existing.status) === 'revoked') {
    if (existing.serial_hash && existing.serial_hash === serialHash) {
      throw new Error(
        'This serial was deactivated for security reasons and cannot be reactivated. Request a new code from your vendor.'
      );
    }
  }

  const [dup] = await pool.query(
    'SELECT id, solution_key FROM tbl_hms_solution_license WHERE serial_hash=? AND solution_key<>? LIMIT 1',
    [serialHash, payload.sid]
  ).catch(() => [[]]);
  if (dup && dup.length) throw new Error('This serial number has already been used for another solution.');

  const activatedAt = new Date(Number(payload.iat) * 1000);
  const expiresAt = new Date(Number(payload.exp) * 1000);

  await pool.query(
    `INSERT INTO tbl_hms_solution_license
       (solution_key, status, serial_hash, activated_at, expires_at, activated_by, request_code, request_code_expires_at)
     VALUES (?, 'active', ?, ?, ?, ?, NULL, NULL)
     ON DUPLICATE KEY UPDATE
       status='active',
       serial_hash=VALUES(serial_hash),
       activated_at=VALUES(activated_at),
       expires_at=VALUES(expires_at),
       activated_by=VALUES(activated_by),
       request_code=NULL,
       request_code_expires_at=NULL`,
    [payload.sid, serialHash, activatedAt, expiresAt, actorId || null]
  );

  await audit(pool, 'serial_activated', payload.sid, actorId, {
    expiresAt: expiresAt.toISOString(),
  });

  await syncLicensedDeployment(pool);

  await refreshLicenseCache(pool);

  return {
    solutionKey: payload.sid,
    label: getSolution(payload.sid).label,
    activatedAt: activatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

async function getPendingRequestCode(pool, solutionKey) {
  const [rows] = await pool.query(
    `SELECT request_code, request_code_expires_at, status
       FROM tbl_hms_solution_license
      WHERE solution_key=? LIMIT 1`,
    [solutionKey]
  ).catch(() => [[]]);
  const row = rows && rows[0];
  if (!row || row.status !== 'pending' || !row.request_code) return null;
  if (row.request_code_expires_at && new Date(row.request_code_expires_at).getTime() < Date.now()) return null;
  return {
    requestCode: row.request_code,
    requestExpiresAt: row.request_code_expires_at,
  };
}

let _licenseCache = {
  loaded: false,
  enforced: false,
  activeKeys: [],
  slices: null,
};

function setLicenseCache({ enforced, activeKeys, slices }) {
  _licenseCache = {
    loaded: true,
    enforced: !!enforced,
    activeKeys: activeKeys || [],
    slices: slices || null,
  };
}

function getLicenseCache() {
  return _licenseCache;
}

function isRouteAllowedByLicense(url, urlToCodes) {
  const { isLicenseDeploymentEnabled } = require('./hmsLicenseDeploymentGuard');
  if (!isLicenseDeploymentEnabled() || !_licenseCache.loaded) return true;
  if (!_licenseCache.enforced) return true;
  const path = String(url || '').trim().split('?')[0];
  const exempt = [
    '/dashboard',
    '/hms-admin/subscriptions',
    '/profile',
    '/my-profile',
    '/workflow-guides',
    '/user-manual',
  ];
  if (exempt.some((p) => path === p || path.startsWith(p + '/'))) return true;
  const slices = _licenseCache.slices || [];
  const { urlAllowedBySlices } = require('./aclNavSlices');
  const overrides = deploymentConfig.getModuleOverrides();
  return urlAllowedBySlices(url, urlToCodes, slices, overrides);
}

async function refreshLicenseCache(pool) {
  const { isLicenseDeploymentEnabled } = require('./hmsLicenseDeploymentGuard');
  await markExpiredLicenses(pool);

  if (!isLicenseDeploymentEnabled()) {
    setLicenseCache({ enforced: false, activeKeys: [], slices: null });
    return _licenseCache;
  }

  const slices = (await syncLicensedDeployment(pool)) || [];
  const activeKeys = await getActiveSolutionKeys(pool);
  const [countRows] = await pool.query('SELECT COUNT(*) AS c FROM tbl_hms_solution_license').catch(() => [[{ c: 0 }]]);
  const hasRecords = Number(countRows[0]?.c || 0) > 0;

  setLicenseCache({
    enforced: hasRecords || activeKeys.length === 0,
    activeKeys,
    slices,
  });
  return _licenseCache;
}

/**
 * Deactivate one solution license (security incident, suspected tampering, etc.).
 * Removes module access immediately; blocked serial cannot be reactivated.
 */
async function deactivateSolutionLicense(pool, { solutionKey, actorId, reason } = {}) {
  const key = String(solutionKey || '').trim();
  if (!isValidSolutionKey(key)) throw new Error('Unknown solution.');
  const note = String(reason || 'security_deactivation').trim().slice(0, 500);

  const [rows] = await pool.query(
    `SELECT status FROM tbl_hms_solution_license WHERE solution_key=? LIMIT 1`,
    [key]
  );
  if (!rows.length) throw new Error('No subscription record for this solution.');
  const st = String(rows[0].status || '');
  if (st === 'revoked') throw new Error('This subscription is already deactivated.');
  if (st !== 'active' && st !== 'pending' && st !== 'expired') {
    throw new Error('Only active, pending, or expired subscriptions can be deactivated.');
  }

  await pool.query(
    `UPDATE tbl_hms_solution_license
     SET status = 'revoked',
         request_code = NULL,
         request_code_expires_at = NULL,
         notes = ?,
         updated_at = NOW()
     WHERE solution_key = ?`,
    [note, key]
  );

  await audit(pool, 'license_deactivated', key, actorId, { reason: note, previousStatus: st });
  await syncLicensedDeployment(pool);
  await refreshLicenseCache(pool);

  const sol = getSolution(key);
  return { solutionKey: key, label: sol?.label || key, status: 'revoked' };
}

/**
 * Emergency: deactivate all active and pending subscriptions (keep audit rows).
 */
async function deactivateAllActiveLicenses(pool, { actorId, reason } = {}) {
  const note = String(reason || 'security_bulk_deactivation').trim().slice(0, 500);
  const [result] = await pool.query(
    `UPDATE tbl_hms_solution_license
     SET status = 'revoked',
         request_code = NULL,
         request_code_expires_at = NULL,
         notes = ?,
         updated_at = NOW()
     WHERE status IN ('active', 'pending', 'expired')`,
    [note]
  );
  const count = result.affectedRows || 0;
  if (count < 1) throw new Error('No active or pending subscriptions to deactivate.');

  await audit(pool, 'licenses_deactivated_all', null, actorId, { reason: note, count });
  await syncLicensedDeployment(pool);
  await refreshLicenseCache(pool);
  return { deactivatedCount: count };
}

/**
 * Remove all solution licenses and issue a new installation ID (new server / redeploy).
 * Existing serial numbers remain bound to the old installation ID in the vendor system.
 */
async function resetAllLicensesForRedeploy(pool, { actorId, reason } = {}) {
  const { installationId: previousInstallationId } = await ensureInstallationId(pool);
  const [countRows] = await pool.query('SELECT COUNT(*) AS c FROM tbl_hms_solution_license').catch(() => [[{ c: 0 }]]);
  const removedCount = Number(countRows[0]?.c || 0);

  await pool.query('DELETE FROM tbl_hms_solution_license').catch(() => {});

  const newInstallationId = generateInstallationId();
  await pool.query('UPDATE tbl_app_settings SET license_installation_id = ? WHERE id = 1', [newInstallationId]).catch(async () => {
    await pool.query(
      'INSERT INTO tbl_app_settings (id, license_installation_id) VALUES (1, ?) ON DUPLICATE KEY UPDATE license_installation_id = VALUES(license_installation_id)',
      [newInstallationId]
    );
  });

  await applyEmptyLicensedDeployment(pool);
  await refreshLicenseCache(pool);

  await audit(pool, 'licenses_reset_redeploy', null, actorId, {
    reason: String(reason || 'new_server_deployment').slice(0, 120),
    previousInstallationId,
    newInstallationId,
    removedCount,
  });

  return {
    previousInstallationId,
    installationId: newInstallationId,
    removedCount,
  };
}

module.exports = {
  LICENSE_MANAGER_ROLES,
  canManageLicenses,
  ensureInstallationId,
  getSubscriptionDashboard,
  createSubscriptionRequest,
  activateSerial,
  getPendingRequestCode,
  getActiveLicensedSlices,
  getActiveSolutionKeys,
  syncLicensedDeployment,
  getLicensedDeploymentView,
  markExpiredLicenses,
  saveContactEmail,
  audit,
  refreshLicenseCache,
  getLicenseCache,
  isRouteAllowedByLicense,
  licenseKeysConfigured,
  resetAllLicensesForRedeploy,
  deactivateSolutionLicense,
  deactivateAllActiveLicenses,
};
