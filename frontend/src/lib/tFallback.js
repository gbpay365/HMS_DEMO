/** Return translation or fallback when the locale key is missing. */
export function tFallback(t, key, fallback, options = {}) {
  const tr = String(t(key, options) ?? '');
  if (!tr) return fallback ?? '';
  if (tr === key) return fallback ?? '';
  if (options.ns) {
    const namespaced = `${options.ns}:${key}`;
    if (tr === namespaced) return fallback ?? '';
  }
  return tr;
}
