'use strict';

const { getSettings, saveSettings, listFacilities } = require('../lib/facilityIntegrationSettings');
const cfg = require('../lib/integrationConfig');

async function getJson(url, headers) {
  if (typeof fetch !== 'function') return { ok: false, status: 0, data: { error: 'fetch unavailable' } };
  const res = await fetch(url, { headers });
  const text = await res.text().catch(() => '');
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

module.exports = function mountIntegrationSettings(app, pool, requireAuth, requireSuperAdmin) {
  app.get('/super-admin/integrations', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      await require('../lib/ensureFacilityIntegrationSchema')(pool);
      const facilities = await listFacilities(pool);
      const selectedId = Math.max(
        1,
        parseInt(String(req.query.facility_id || req.session.facilityId || '1'), 10) || 1
      );
      const settings = await getSettings(pool, selectedId);
      const publicBase = settings.public_base_url || cfg.publicBaseUrl() || `http://127.0.0.1:${process.env.PORT || 3000}`;
      res.render('super-admin-integrations', {
        title: 'Integration settings — Super Admin',
        facilities,
        selectedId,
        settings,
        flash: req.query.msg || null,
        error: req.query.err || null,
        inboundEndpoints: {
          health: `${publicBase}/api/integrations/health`,
          chartOfAccounts: `${publicBase}/api/integrations/chart-of-accounts`,
          journalEntry: `${publicBase}/api/integrations/journal-entry`,
        },
      });
    } catch (e) {
      res.redirect('/super-admin?err=' + encodeURIComponent(e.message));
    }
  });

  app.post('/super-admin/integrations', requireAuth, requireSuperAdmin, async (req, res) => {
    const facilityId = Math.max(1, parseInt(String(req.body.facility_id || '1'), 10) || 1);
    try {
      await saveSettings(pool, facilityId, {
        public_base_url: req.body.public_base_url,
        core_account_url: req.body.core_account_url,
        core_account_api_key: req.body.core_account_api_key,
        core_account_sync_enabled: req.body.core_account_sync_enabled === '1',
        hms_api_key_inbound: req.body.hms_api_key_inbound,
        zaizens_url: req.body.zaizens_url,
        zaizens_api_key_outbound: req.body.zaizens_api_key_outbound,
        zaizens_sync_enabled: req.body.zaizens_sync_enabled === '1',
      });
      res.redirect(`/super-admin/integrations?facility_id=${facilityId}&msg=${encodeURIComponent('Integration settings saved.')}`);
    } catch (e) {
      res.redirect(`/super-admin/integrations?facility_id=${facilityId}&err=${encodeURIComponent(e.message)}`);
    }
  });

  app.post('/super-admin/integrations/test-core', requireAuth, requireSuperAdmin, async (req, res) => {
    const facilityId = Math.max(1, parseInt(String(req.body.facility_id || '1'), 10) || 1);
    try {
      const s = await getSettings(pool, facilityId);
      const base = s.core_account_url || cfg.coreAccountUrl();
      const r = await getJson(`${base}/api/v1/integrations/health`, {
        'X-API-Key': s.core_account_api_key || cfg.coreAccountApiKey(),
        'X-Facility-Id': String(facilityId),
      });
      let msg;
      if (r.ok) {
        msg = 'Account_Core connection OK.';
      } else if (r.status === 401) {
        msg =
          'Account_Core test failed (HTTP 401 — wrong API key). ' +
          'Use the Account_Core inbound key (Integrations__ApiKey): dev-integration-key-change-in-production. ' +
          'Do NOT use dev-hms-inbound-key-change-in-production here — that key is only for Core → HMS.';
      } else {
        msg = `Account_Core test failed (HTTP ${r.status}). ${r.data?.error || ''}`.trim();
      }
      res.redirect(`/super-admin/integrations?facility_id=${facilityId}&msg=${encodeURIComponent(msg)}`);
    } catch (e) {
      res.redirect(`/super-admin/integrations?facility_id=${facilityId}&err=${encodeURIComponent(e.message)}`);
    }
  });

  app.post('/super-admin/integrations/sync-journals', requireAuth, requireSuperAdmin, async (req, res) => {
    const facilityId = Math.max(1, parseInt(String(req.body.facility_id || '1'), 10) || 1);
    try {
      const { syncAllJournalsToAccountCore } = require('../lib/syncJournalsToAccountCore');
      const summary = await syncAllJournalsToAccountCore(pool, {
        facilityId,
        force: req.body.force === '1',
        limit: 2000,
      });
      const msg = `Journal sync: ${summary.sent} sent, ${summary.duplicate} duplicate, ${summary.failed} failed, ${summary.skipped} skipped.`;
      const err = summary.firstError ? ` First error: ${summary.firstError}` : '';
      res.redirect(`/super-admin/integrations?facility_id=${facilityId}&msg=${encodeURIComponent(msg + err)}`);
    } catch (e) {
      res.redirect(`/super-admin/integrations?facility_id=${facilityId}&err=${encodeURIComponent(e.message)}`);
    }
  });

  app.post('/super-admin/integrations/test-zaizens', requireAuth, requireSuperAdmin, async (req, res) => {
    const facilityId = Math.max(1, parseInt(String(req.body.facility_id || '1'), 10) || 1);
    try {
      const s = await getSettings(pool, facilityId);
      const base = s.zaizens_url || cfg.zaizensPayrollUrl();
      const r = await getJson(`${base}/api/v1/integrations/health`, {
        'X-API-Key': s.zaizens_api_key_outbound || cfg.zaizensPayrollApiKey(),
        'X-Facility-Id': String(facilityId),
      });
      const msg = r.ok ? 'Zaizens PayRoll connection OK.' : `Zaizens test failed (HTTP ${r.status}).`;
      res.redirect(`/super-admin/integrations?facility_id=${facilityId}&msg=${encodeURIComponent(msg)}`);
    } catch (e) {
      res.redirect(`/super-admin/integrations?facility_id=${facilityId}&err=${encodeURIComponent(e.message)}`);
    }
  });
};
