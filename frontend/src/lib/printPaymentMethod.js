/** Map stored payment_method values to print.json receipt.payment_methods.* keys. */
export function printPaymentMethodLabel(method, t) {
  const raw = String(method || 'cash').trim();
  if (!raw) return t('receipt.payment_methods.cash');
  const slug = raw
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  return t(`receipt.payment_methods.${slug}`);
}

export function amountWordsForLocale(amountWords, grand, fmt, language) {
  const lng = String(language || 'en').toLowerCase().slice(0, 2);
  if (amountWords) {
    if (lng === 'fr' && amountWords.fr) return amountWords.fr;
    if (amountWords.en) return amountWords.en;
  }
  const n = Number(grand || 0);
  if (lng === 'fr') return `${fmt(n)} francs CFA`;
  return `${fmt(n)} CFA francs`;
}
