'use strict';

const hmsLicense = require('../lib/hmsLicense');
const hmsLicenseRemote = require('../lib/hmsLicenseRemote');
const { getSolution } = require('../lib/hmsLicenseCatalog');

function wantsJson(req) {
  const accept = String(req.get('accept') || '');
  const xhr = String(req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest';
  return req.is('application/json') || accept.includes('application/json') || xhr;
}

function requireLicenseManager(req, res, next) {
  const role = String((req.session.user || {}).role || '');
  if (hmsLicense.canManageLicenses(role)) return next();
  if (wantsJson(req)) {
    return res.status(403).json({ ok: false, error: 'Only Admin or Director may manage solution subscriptions.' });
  }
  return res.redirect('/dashboard?err=' + encodeURIComponent('Only Admin or Director may manage solution subscriptions.'));
}

module.exports = function mountHmsLicenseRoutes(app, pool, requireAuth) {
  app.get('/hms-admin/subscriptions', requireAuth, requireLicenseManager, async (req, res) => {
    try {
      const dash = await hmsLicense.getSubscriptionDashboard(pool);
      const remoteSync = await hmsLicenseRemote.getRemoteSyncStatus(pool);
      const flash = req.query.msg ? String(req.query.msg) : null;
      const error = req.query.err ? String(req.query.err) : null;
      res.render('solution-subscriptions', {
        title: 'Solution Subscriptions — ZAIZENS',
        reactPage: 'solution-subscriptions',
        reactLoadingLabel: 'Loading Solution Subscriptions…',
        pageData: {
          ...dash,
          flash,
          error,
          vendorEmail: process.env.LICENSE_VENDOR_EMAIL || '',
          smtpConfigured: require('../lib/hmsMailer').smtpConfigured(),
          licenseKeysConfigured: hmsLicense.licenseKeysConfigured(),
          licenseServer: remoteSync,
        },
      });
    } catch (err) {
      console.error('subscriptions page:', err);
      return res.redirect('/dashboard?err=' + encodeURIComponent('Could not load subscriptions.'));
    }
  });

  app.post('/hms-admin/subscriptions/request', requireAuth, requireLicenseManager, async (req, res) => {
    const back = '/hms-admin/subscriptions';
    try {
      const solutionKey = String(req.body.solution_key || req.body.solutionKey || '').trim();
      const contactEmail = String(req.body.contact_email || req.body.contactEmail || '').trim();
      const actorId = req.session.user && req.session.user.id;
      const result = await hmsLicense.createSubscriptionRequest(pool, {
        solutionKey,
        contactEmail,
        actorId,
      });
      try {
        await hmsLicenseRemote.submitRequestToLicenseServer(pool, result);
      } catch (remoteErr) {
        console.warn('[LicenseServer] request submit:', remoteErr.message || remoteErr);
      }
      if (wantsJson(req)) {
        return res.json({ ok: true, ...result });
      }
      const emailNote = result.emailSent
        ? ' Request code emailed to vendor.'
        : result.vendorEmail
          ? ' Copy the request code and send it to your vendor.'
          : '';
      return res.redirect(
        back +
          '?msg=' +
          encodeURIComponent(
            'Request code generated for ' +
              (getSolution(solutionKey)?.label || solutionKey) +
              '.' +
              emailNote
          ) +
          '&code=' +
          encodeURIComponent(result.requestCode) +
          '&solution=' +
          encodeURIComponent(solutionKey) +
          (result.emailSent ? '&emailed=1' : '')
      );
    } catch (err) {
      if (wantsJson(req)) {
        return res.status(400).json({ ok: false, error: err.message || 'Could not create request.' });
      }
      return res.redirect(back + '?err=' + encodeURIComponent(err.message || 'Could not create request.'));
    }
  });

  app.post('/hms-admin/subscriptions/activate', requireAuth, requireLicenseManager, async (req, res) => {
    const back = '/hms-admin/subscriptions';
    try {
      const serial = String(req.body.serial || req.body.serial_number || '').trim();
      const actorId = req.session.user && req.session.user.id;
      const result = await hmsLicense.activateSerial(pool, { serial, actorId });
      try {
        await hmsLicenseRemote.syncWithLicenseServer(pool, { actorId });
      } catch (remoteErr) {
        console.warn('[LicenseServer] post-activate sync:', remoteErr.message || remoteErr);
      }
      if (wantsJson(req)) {
        return res.json({ ok: true, ...result });
      }
      return res.redirect(
        back +
          '?msg=' +
          encodeURIComponent(result.label + ' activated until ' + new Date(result.expiresAt).toLocaleDateString() + '.')
      );
    } catch (err) {
      if (wantsJson(req)) {
        return res.status(400).json({ ok: false, error: err.message || 'Activation failed.' });
      }
      return res.redirect(back + '?err=' + encodeURIComponent(err.message || 'Activation failed.'));
    }
  });

  app.post('/hms-admin/subscriptions/deactivate', requireAuth, requireLicenseManager, async (req, res) => {
    const back = '/hms-admin/subscriptions';
    try {
      const solutionKey = String(req.body.solution_key || req.body.solutionKey || '').trim();
      const reason = String(req.body.reason || req.body.deactivate_reason || 'security_deactivation').trim();
      const actorId = req.session.user && req.session.user.id;
      const result = await hmsLicense.deactivateSolutionLicense(pool, { solutionKey, actorId, reason });
      const msg = `${result.label} deactivated. Module access removed immediately.`;
      if (wantsJson(req)) return res.json({ ok: true, ...result, message: msg });
      return res.redirect(back + '?msg=' + encodeURIComponent(msg));
    } catch (err) {
      if (wantsJson(req)) return res.status(400).json({ ok: false, error: err.message || 'Deactivation failed.' });
      return res.redirect(back + '?err=' + encodeURIComponent(err.message || 'Deactivation failed.'));
    }
  });

  app.post('/hms-admin/subscriptions/deactivate-all', requireAuth, requireLicenseManager, async (req, res) => {
    const back = '/hms-admin/subscriptions';
    try {
      const confirm = String(req.body.confirm || '').trim().toUpperCase();
      if (confirm !== 'REVOKE') {
        const msg = 'Type REVOKE to confirm deactivation of all active subscriptions.';
        if (wantsJson(req)) return res.status(400).json({ ok: false, error: msg });
        return res.redirect(back + '?err=' + encodeURIComponent(msg));
      }
      const actorId = req.session.user && req.session.user.id;
      const result = await hmsLicense.deactivateAllActiveLicenses(pool, {
        actorId,
        reason: req.body.reason || 'security_bulk_deactivation',
      });
      const msg = `${result.deactivatedCount} subscription(s) deactivated. All licensed modules are now disabled.`;
      if (wantsJson(req)) return res.json({ ok: true, ...result, message: msg });
      return res.redirect(back + '?msg=' + encodeURIComponent(msg));
    } catch (err) {
      if (wantsJson(req)) return res.status(400).json({ ok: false, error: err.message || 'Bulk deactivation failed.' });
      return res.redirect(back + '?err=' + encodeURIComponent(err.message || 'Bulk deactivation failed.'));
    }
  });

  app.post('/hms-admin/subscriptions/reset-all', requireAuth, requireLicenseManager, async (req, res) => {
    const back = '/hms-admin/subscriptions';
    try {
      const confirm = String(req.body.confirm || '').trim().toUpperCase();
      if (confirm !== 'RESET') {
        const msg = 'Type RESET in the confirmation field to remove all licenses.';
        if (wantsJson(req)) return res.status(400).json({ ok: false, error: msg });
        return res.redirect(back + '?err=' + encodeURIComponent(msg));
      }
      const actorId = req.session.user && req.session.user.id;
      const result = await hmsLicense.resetAllLicensesForRedeploy(pool, {
        actorId,
        reason: req.body.reason || 'admin_ui_reset',
      });
      const msg =
        `All subscriptions cleared (${result.removedCount}). New installation ID: ${result.installationId}. ` +
        'Request new codes and activate fresh serial numbers for this server.';
      if (wantsJson(req)) return res.json({ ok: true, ...result, message: msg });
      return res.redirect(back + '?msg=' + encodeURIComponent(msg));
    } catch (err) {
      if (wantsJson(req)) {
        return res.status(400).json({ ok: false, error: err.message || 'Reset failed.' });
      }
      return res.redirect(back + '?err=' + encodeURIComponent(err.message || 'Reset failed.'));
    }
  });

  app.post('/hms-admin/subscriptions/contact-email', requireAuth, requireLicenseManager, async (req, res) => {
    try {
      const email = await hmsLicense.saveContactEmail(pool, req.body.contact_email || req.body.contactEmail);
      if (wantsJson(req)) return res.json({ ok: true, contactEmail: email });
      return res.redirect('/hms-admin/subscriptions?msg=' + encodeURIComponent('Contact email saved.'));
    } catch (err) {
      if (wantsJson(req)) return res.status(400).json({ ok: false, error: err.message });
      return res.redirect('/hms-admin/subscriptions?err=' + encodeURIComponent(err.message || 'Save failed.'));
    }
  });

  app.get('/api/hms/subscriptions', requireAuth, requireLicenseManager, async (req, res) => {
    try {
      const dash = await hmsLicense.getSubscriptionDashboard(pool);
      const remoteSync = await hmsLicenseRemote.getRemoteSyncStatus(pool);
      res.json({ ok: true, ...dash, licenseServer: remoteSync });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || 'Could not load subscriptions.' });
    }
  });

  app.post('/hms-admin/subscriptions/sync-now', requireAuth, requireLicenseManager, async (req, res) => {
    try {
      const actorId = req.session.user && req.session.user.id;
      const result = await hmsLicenseRemote.syncWithLicenseServer(pool, { actorId, forceRegister: true });
      const remoteSync = await hmsLicenseRemote.getRemoteSyncStatus(pool);
      if (wantsJson(req)) return res.json({ ok: true, ...result, licenseServer: remoteSync });
      const note =
        result.commandsApplied > 0
          ? ` Applied ${result.commandsApplied} remote command(s).`
          : ' No pending remote commands.';
      return res.redirect('/hms-admin/subscriptions?msg=' + encodeURIComponent('License server sync completed.' + note));
    } catch (err) {
      if (wantsJson(req)) return res.status(400).json({ ok: false, error: err.message || 'Sync failed.' });
      return res.redirect('/hms-admin/subscriptions?err=' + encodeURIComponent(err.message || 'Sync failed.'));
    }
  });

  app.post('/api/hms/license-server/push', async (req, res) => {
    try {
      if (!pool) return res.status(503).json({ ok: false, error: 'Database unavailable.' });
      const result = await hmsLicenseRemote.handleLicenseServerPush(pool, req);
      res.json({
        ok: true,
        commandsApplied: result.commandsApplied,
        commandsReceived: result.commandsReceived,
        applied: result.applied,
      });
    } catch (err) {
      res.status(401).json({ ok: false, error: err.message || 'Push rejected.' });
    }
  });
};
