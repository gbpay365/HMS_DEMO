/** Hospital revenue GL accounts with HMS service catalog prices (Account_Core parity). */

import { isPaymentMethodAccountCode, paymentMethodShortLabels, isIfrsAccounting } from './paymentMethodAccounts';

export function isHospitalRevenueAccount(code) {
  const c = String(code || '');
  if (isIfrsAccounting()) {
    return c.startsWith('510') || c.startsWith('520');
  }
  return (
    c.startsWith('7016') ||
    c.startsWith('7026') ||
    c.startsWith('7036') ||
    c.startsWith('7046') ||
    c.startsWith('7066')
  );
}

export function catalogEntryForAccount(catalogByCode, accountCode) {
  if (!accountCode || !catalogByCode) return null;
  return catalogByCode[accountCode] ?? null;
}

export function findCatalogService(entry, serviceKey) {
  if (!entry?.services?.length || !serviceKey) return null;
  return entry.services.find((s) => s.key === serviceKey) ?? null;
}

export function pickDefaultCatalogService(entry) {
  if (!entry?.services?.length) return null;
  if (entry.services.length === 1) return entry.services[0];
  const target = Number(entry.default_price) || 0;
  const hit = entry.services.find((s) => s.price === target);
  if (hit) return hit;
  let best = entry.services[0];
  let bestDiff = Math.abs(best.price - target);
  for (const svc of entry.services.slice(1)) {
    const diff = Math.abs(svc.price - target);
    if (diff < bestDiff) {
      best = svc;
      bestDiff = diff;
    }
  }
  return best;
}

export function applyCatalogPriceToLine(line, _entry, service) {
  return {
    catalogServiceKey: service.key,
    creditAmount: service.price,
    debitAmount: 0,
    description: line.description?.trim() ? line.description : service.name,
  };
}

export function defaultLineDescription(accountCode, accountLabel, catalogByCode) {
  const code = String(accountCode || '').trim();
  const labels = paymentMethodShortLabels();
  if (isPaymentMethodAccountCode(code) && labels[code]) {
    return labels[code];
  }
  const entry = catalogEntryForAccount(catalogByCode, accountCode);
  const service = entry ? pickDefaultCatalogService(entry) : null;
  if (service?.name) return service.name;
  if (entry?.hms_subcategory) return entry.hms_subcategory;
  const parts = accountLabel.split('—').map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) return parts[parts.length - 1];
  const dashParts = accountLabel.split(' - ').map((s) => s.trim()).filter(Boolean);
  if (dashParts.length > 1) return dashParts[dashParts.length - 1];
  return accountLabel;
}
