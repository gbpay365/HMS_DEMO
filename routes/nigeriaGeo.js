'use strict';

const hmsCountry = require('../lib/hmsCountry');
const { getCountryGeoPayload } = require('../lib/countryGeo');

module.exports = function registerNigeriaGeo(app, requireAuth) {
  app.get('/api/hms-country', (req, res) => {
    res.json(hmsCountry.publicPayload());
  });

  app.get('/api/nigeria-geo', requireAuth, (req, res) => {
    if (!hmsCountry.isNigeria) {
      return res.status(404).json({ error: 'Nigeria geo is not enabled for this deployment.' });
    }
    res.json(getCountryGeoPayload('NG'));
  });
};
