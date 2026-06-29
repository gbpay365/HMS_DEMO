'use strict';

const hmsCountry = require('../lib/hmsCountry');
const catalog = require('../lib/countryProfileCatalog');
const { getCountryGeoPayload, listAvailableGeoCodes } = require('../lib/countryGeo');

module.exports = function registerCountryGeo(app, requireAuth) {
  /** Unified geo API for all West & Central Africa country profiles. */
  app.get('/api/geo/:code', requireAuth, (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!catalog.getProfile(code)) {
      return res.status(404).json({ error: `Unknown country code: ${code}` });
    }
    const active = String(hmsCountry.code || '').toUpperCase();
    if (active !== code) {
      return res.status(404).json({ error: `Geo for ${code} is not enabled — active profile is ${active}.` });
    }
    const payload = getCountryGeoPayload(code);
    if (!payload) {
      return res.status(404).json({ error: `No geo dataset for ${code}.` });
    }
    res.json(payload);
  });

  /** Index of bundled geo datasets (admin / diagnostics). */
  app.get('/api/geo', requireAuth, (req, res) => {
    res.json({
      active: hmsCountry.code,
      available: listAvailableGeoCodes(),
    });
  });
};
