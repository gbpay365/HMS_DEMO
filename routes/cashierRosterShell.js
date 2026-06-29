'use strict';

/** Redirect legacy /cashier/* roster URLs to the cashier-shell query form. */
module.exports = function mountCashierRosterShell(app, { requireAuth, requirePerm }) {
  function rosterQuery(req) {
    const q = new URLSearchParams();
    q.set('from', 'cashier');
    for (const [key, val] of Object.entries(req.query || {})) {
      if (key === 'from') continue;
      if (val != null && String(val) !== '') q.set(key, String(val));
    }
    return q.toString();
  }

  app.get(
    '/cashier/nurse-roster',
    requireAuth,
    requirePerm('cashier.read', 'cashier.write', 'nurse_duty.read', 'nurse_duty.write'),
    (req, res) => {
      res.redirect(302, `/nurse-roster?${rosterQuery(req)}`);
    }
  );

  app.get(
    '/cashier/doctor-roster',
    requireAuth,
    requirePerm('cashier.read', 'cashier.write', 'doctor_duty.read', 'doctor_duty.write'),
    (req, res) => {
      res.redirect(302, `/doctor-roster?${rosterQuery(req)}`);
    }
  );
};
