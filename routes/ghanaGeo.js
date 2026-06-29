'use strict';

const hmsCountry = require('../lib/hmsCountry');
const { getCountryGeoPayload } = require('../lib/countryGeo');

module.exports = function registerGhanaGeo(app, requireAuth) {
  app.get('/api/ghana-geo', requireAuth, (req, res) => {
    if (hmsCountry.code !== 'GH') {
      return res.status(404).json({ error: 'Ghana geo is not enabled for this deployment.' });
    }
    res.json(getCountryGeoPayload('GH'));
  });
};
