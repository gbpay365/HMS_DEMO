import { tFallback } from './tFallback';

/** ACL tile / nav element code → localized label (nav.codes.*). */
export function tileLabel(code, fallback, t) {
  const slug = String(code || '').replace(/\./g, '_');
  if (!slug) return fallback || '';
  return tFallback(t, `codes.${slug}`, fallback || code || '', { ns: 'nav' });
}
