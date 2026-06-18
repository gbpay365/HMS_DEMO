/** Keep in sync with lib/betterPayQr.js CASHIER_PAYMENT_METHODS */
export const CASHIER_PAYMENT_METHODS = [
  'Cash',
  'MOMO',
  'OM',
  'Wallet',
  'BetterPay',
];

const HIDDEN_CASHIER_METHODS = new Set(['Bank Transfer', 'Insurance']);

/** Server pageData may be stale; always include BetterPay and normalize legacy labels. */
export function resolveCashierPaymentMethods(serverList) {
  const raw = Array.isArray(serverList) && serverList.length ? serverList : CASHIER_PAYMENT_METHODS;
  const out = [];
  for (const m of raw) {
    let v = String(m || '').trim();
    if (v === 'Mobile Money') v = 'MOMO';
    if (v === 'Orange Money') v = 'OM';
    if (v === 'QR Code') v = 'BetterPay';
    if (!v || HIDDEN_CASHIER_METHODS.has(v)) continue;
    if (!out.includes(v)) out.push(v);
  }
  if (!out.includes('BetterPay')) out.push('BetterPay');
  return out;
}
