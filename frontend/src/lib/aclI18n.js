import { tFallback } from './tFallback';
import { HUB_CODE_TO_LEGACY_KEY } from './hubI18n';

/** Nav item label — uses nav.codes.* (ACL code dots → underscores). */
export function navLabel(code, fallback, t) {
  const c = String(code ?? '').trim();
  if (!c) return fallback || '';
  const slug = c.replace(/\./g, '_');
  return tFallback(t, `codes.${slug}`, fallback || c, { ns: 'nav' });
}

/** Role display name — uses superAdmin.roles.names.* */
export function aclRoleLabel(code, fallbackTitle, t) {
  const c = String(code ?? '').trim();
  if (c) {
    const byCode = tFallback(t, `roles.names.${c}`, '', { ns: 'superAdmin' });
    if (byCode) return byCode;
  }
  const title = String(fallbackTitle || '').trim();
  if (!title) return c;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (slug) {
    const byTitle = tFallback(t, `roles.names_title.${slug}`, '', { ns: 'superAdmin' });
    if (byTitle) return byTitle;
  }
  return title;
}

export function aclModuleLabel(code, fallback, t) {
  const c = String(code ?? '').trim();
  if (!c) return fallback || '';
  return tFallback(t, `acl_modules.${c}`, fallback || c, { ns: 'access' });
}

export function aclPermLabel(code, fallback, t) {
  const c = String(code ?? '').trim();
  if (!c) return fallback || '';
  const key = c.replace(/\./g, '__');
  return tFallback(t, `acl_perms.${key}`, fallback || c, { ns: 'access' });
}

export { HUB_CODE_TO_LEGACY_KEY };
