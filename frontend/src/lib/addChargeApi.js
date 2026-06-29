import { formatAmount } from './hmsLocale';

export function fcfaFmt(n) {
  return formatAmount(n);
}

export async function fetchServiceCatalog(category) {
  const r = await fetch(`/api/service-catalog?category=${encodeURIComponent(category)}`, {
    credentials: 'same-origin',
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchPharmacyInventory() {
  const r = await fetch('/api/pharmacy/inventory', { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}
