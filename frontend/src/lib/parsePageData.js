export function parsePageData(scriptId) {
  const el = document.getElementById(scriptId);
  if (!el) return {};
  try {
    return JSON.parse(el.textContent || '{}');
  } catch {
    return {};
  }
}
