'use strict';

function _key(kind, id) {
  return kind === 'ipd' ? `adm:${id}` : `ov:${id}`;
}

function setBypass(req, kind, id, ttlMs = 20 * 60 * 1000) {
  if (!req.session) return;
  req.session.clinicalNadBypass = req.session.clinicalNadBypass || {};
  req.session.clinicalNadBypass[_key(kind, id)] = Date.now() + ttlMs;
}

function hasBypass(req, kind, id) {
  const m = req.session && req.session.clinicalNadBypass;
  if (!m) return false;
  const exp = m[_key(kind, id)];
  return typeof exp === 'number' && Date.now() < exp;
}

module.exports = { setBypass, hasBypass };
