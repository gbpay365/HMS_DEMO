'use strict';

const DEFAULT_IDLE_MS = 10 * 60 * 1000;

/** @returns {number} */
function idleTimeoutMs() {
 const mins = parseInt(process.env.HMS_SESSION_IDLE_MINUTES, 10);
 if (Number.isFinite(mins) && mins > 0) return mins * 60 * 1000;
 const raw = parseInt(process.env.HMS_SESSION_IDLE_MS, 10);
 if (Number.isFinite(raw) && raw > 0) return raw;
 return DEFAULT_IDLE_MS;
}

function hasAuthSession(req) {
 if (!req.session) return false;
 if (req.session.user) return true;
 return (parseInt(req.session.portalPatientId, 10) || 0) > 0;
}

function isPortalSession(req) {
 return (parseInt(req.session?.portalPatientId, 10) || 0) > 0 && !req.session?.user;
}

function touchSession(req) {
 if (req.session) req.session.lastActivity = Date.now();
}

function isIdleExpired(req, maxIdleMs) {
 const t = req.session?.lastActivity;
 if (!t) return false;
 return Date.now() - Number(t) > maxIdleMs;
}

function wantsJson(req) {
 const accept = String(req.get('accept') || '');
 const xhr = String(req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest';
 const path = String(req.path || '').split('?')[0];
 return req.is('application/json') || accept.includes('application/json') || xhr || path.startsWith('/api/');
}

const SKIP_PREFIXES = [
 '/css/',
 '/js/',
 '/img/',
 '/assets/',
 '/favicon',
 '/health',
 '/ping',
 '/api/health',
];

function shouldSkipPath(path) {
 const p = String(path || '');
 if (p === '/logout' || p === '/portal/logout') return true;
 return SKIP_PREFIXES.some((pre) => p.startsWith(pre));
}

function idleMessage(req, minutes) {
 const hmsI18n = require('./hmsI18n');
 const lang = hmsI18n.resolveLocale(req);
 const t = hmsI18n.getFixedT(lang);
 const suffix = minutes === 1 ? '' : 's';
 return t('flash.signed_out_after_inactivity', {
  ns: 'errors',
  minutes,
  suffix,
  defaultValue: `Signed out after ${minutes} minute${suffix} of inactivity. Please sign in again.`,
 });
}

/**
 * Enforce idle timeout on authenticated sessions (staff + patient portal).
 */
function sessionIdleMiddleware() {
 const maxIdleMs = idleTimeoutMs();
 const idleMinutes = Math.max(1, Math.round(maxIdleMs / 60000));

 return function sessionIdle(req, res, next) {
  if (shouldSkipPath(req.path)) return next();
  if (!hasAuthSession(req)) return next();

  if (isIdleExpired(req, maxIdleMs)) {
   const portal = isPortalSession(req);
   return req.session.destroy((err) => {
    if (err) console.warn('session destroy (idle):', err.message);
    const msg = idleMessage(req, idleMinutes);
    if (wantsJson(req)) {
     return res.status(401).json({
      ok: false,
      reason: 'idle',
      error: msg,
     });
    }
    if (portal) {
     return res.redirect('/portal/login?msg=' + encodeURIComponent(msg));
    }
    return res.redirect('/?msg=' + encodeURIComponent(msg));
   });
  }

  touchSession(req);
  res.locals.hmsSessionIdle = {
   active: true,
   idleMs: maxIdleMs,
   idleMinutes,
   logoutUrl: isPortalSession(req) ? '/portal/logout?reason=idle' : '/logout?reason=idle',
  };
  return next();
 };
}

function setLoginActivity(req) {
 touchSession(req);
}

module.exports = {
 idleTimeoutMs,
 sessionIdleMiddleware,
 setLoginActivity,
 touchSession,
};
