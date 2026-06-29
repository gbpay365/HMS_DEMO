'use strict';

const { ensureCountryProfileSchema } = require('../lib/ensureCountryProfileSchema');
const profileSvc = require('../lib/hmsCountryProfileService');

module.exports = function mountCountryConfiguration(app, pool, requireAuth, requirePerm) {
  const requireCountryConfigure = requirePerm('country.configure');

  app.get('/admin/country-configuration', requireAuth, requireCountryConfigure, async (req, res) => {
    try {
      await ensureCountryProfileSchema(pool);
      await profileSvc.loadActiveFromDb(pool);
      const activeCode = profileSvc.getActiveCode();
      res.render('country-configuration', {
        title: 'Country & locale configuration',
        activeCode,
        profiles: profileSvc.listProfiles(),
        flash: req.query.msg || null,
        error: req.query.err || null,
      });
    } catch (e) {
      res.redirect('/hms?err=' + encodeURIComponent(e.message));
    }
  });

  app.get('/api/admin/country-profiles', requireAuth, requireCountryConfigure, async (req, res) => {
    try {
      await ensureCountryProfileSchema(pool);
      await profileSvc.loadActiveFromDb(pool);
      res.json({
        activeCode: profileSvc.getActiveCode(),
        profiles: profileSvc.listProfiles(),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/country-profiles/apply', requireAuth, requireCountryConfigure, async (req, res) => {
    try {
      await ensureCountryProfileSchema(pool);
      const code = String(req.body?.country_code || req.body?.code || '').trim().toUpperCase();
      if (!profileSvc.getProfile(code)) {
        return res.status(400).json({ error: 'Invalid country code' });
      }
      const profile = await profileSvc.applyProfile(pool, code, req.session.user?.id);
      res.json({ ok: true, activeCode: profile.code, profile });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};
