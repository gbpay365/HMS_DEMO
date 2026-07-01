/** Session permission codes injected by the server (header.ejs / page boot). */
export function readBootUserPerms() {
  if (typeof window === 'undefined') return [];
  const fromHms = window.HMS?.userPerms;
  if (Array.isArray(fromHms)) return fromHms;
  try {
    const el = document.getElementById('hms-page-data');
    if (el?.textContent) {
      const data = JSON.parse(el.textContent);
      if (Array.isArray(data.userPerms)) return data.userPerms;
    }
  } catch {
    /* ignore */
  }
  return [];
}
