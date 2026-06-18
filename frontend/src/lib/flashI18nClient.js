const ERR_TEXT_TO_KEY = {
  'Access denied. You do not have permission to open this section.': { key: 'access.section', ns: 'errors' },
  'Access denied. HR self-service is not enabled for your role.': { key: 'access.hr_self', ns: 'errors' },
  'Access denied': { key: 'flash.access_denied', ns: 'errors' },
  'Access denied.': { key: 'access.denied', ns: 'errors' },
  'Your session has expired. Please sign in again.': { key: 'session.expired', ns: 'common' },
  'Invalid portal.': { key: 'portal.invalid', ns: 'errors' },
  'Portal not found.': { key: 'portal.not_found', ns: 'errors' },
  'This portal is disabled.': { key: 'portal.disabled', ns: 'errors' },
  'You do not have access to this portal.': { key: 'portal.no_access', ns: 'errors' }};

function isLocaleKey(value) {
  return /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(String(value || '').trim());
}

/** Translate flash/error strings from ?err= / ?msg= on the client. */
export function translateFlashText(raw, t) {
  if (!raw || typeof t !== 'function') return raw || null;
  const s = String(raw).trim();
  if (!s) return null;

  if (isLocaleKey(s)) {
    const tr = t(s, { ns: 'errors' }) || t(s, { ns: 'common' });
    return tr || s;
  }

  const mapped = ERR_TEXT_TO_KEY[s];
  if (mapped) {
    return t(mapped.key, { ns: mapped.ns });
  }

  const signedOutEn = s.match(/^Signed out after (\d+) minute/i);
  if (signedOutEn) {
    const minutes = parseInt(signedOutEn[1], 10) || 10;
    return t('flash.signed_out_after_inactivity', {
      ns: 'errors',
      minutes,
      suffix: minutes === 1 ? '' : 's'});
  }

  return s;
}
