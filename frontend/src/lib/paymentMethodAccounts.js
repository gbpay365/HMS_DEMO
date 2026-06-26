/** OHADA payment method accounts (Class 5) — aligned with Account_Core 552601–552606. */

export const PAYMENT_METHOD_ACCOUNT_CODES = Object.freeze([
  '552601',
  '552602',
  '552603',
  '552604',
  '552605',
  '552606',
]);

export const PAYMENT_METHOD_SHORT_LABELS = Object.freeze({
  552601: 'Cash',
  552602: 'OM',
  552603: 'MOMO',
  552604: 'Bank',
  552605: 'BetterPay',
  552606: 'Wallet',
});

export function isPaymentMethodAccountCode(code) {
  return PAYMENT_METHOD_ACCOUNT_CODES.includes(String(code || '').trim());
}

export function paymentMethodsFromAccounts(postingAccounts) {
  const byCode = new Map(postingAccounts.map((a) => [a.code, a]));
  const out = [];
  for (const code of PAYMENT_METHOD_ACCOUNT_CODES) {
    const acct = byCode.get(code);
    if (!acct) continue;
    out.push({
      ...acct,
      shortLabel: PAYMENT_METHOD_SHORT_LABELS[code] || acct.label,
    });
  }
  return out;
}
