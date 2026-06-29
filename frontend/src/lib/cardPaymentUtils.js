/** Card brand detection + client-side validation for cashier POS (no full PAN persisted). */

const CARD_BRANDS = [
  {
    id: 'verve',
    label: 'Verve',
    lengths: [16, 19],
    pattern: /^(50609[0-9]|507865[0-9]|65000[2-7])/,
  },
  {
    id: 'visa',
    label: 'Visa',
    lengths: [13, 16, 19],
    pattern: /^4/,
  },
  {
    id: 'mastercard',
    label: 'Mastercard',
    lengths: [16],
    pattern: /^(5[1-5]|2(2[2-9]|[3-6][0-9]|7[01]|720))/,
  },
  {
    id: 'amex',
    label: 'American Express',
    lengths: [15],
    pattern: /^3[47]/,
  },
  {
    id: 'discover',
    label: 'Discover',
    lengths: [16, 19],
    pattern: /^(6011|65|64[4-9])/,
  },
  {
    id: 'diners',
    label: 'Diners Club',
    lengths: [14, 16, 19],
    pattern: /^(3(0[0-5]|[68]))/,
  },
  {
    id: 'jcb',
    label: 'JCB',
    lengths: [16, 17, 18, 19],
    pattern: /^35(2[89]|[3-8][0-9])/,
  },
  {
    id: 'unionpay',
    label: 'UnionPay',
    lengths: [16, 17, 18, 19],
    pattern: /^62/,
  },
];

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

export function detectCardBrand(pan) {
  const digits = digitsOnly(pan);
  if (!digits) return null;
  for (const brand of CARD_BRANDS) {
    if (brand.pattern.test(digits)) return brand;
  }
  return null;
}

export function maxCardLength(pan) {
  const brand = detectCardBrand(pan);
  if (brand?.lengths?.length) return Math.max(...brand.lengths);
  return 19;
}

export function formatCardNumberInput(value) {
  const digits = digitsOnly(value).slice(0, maxCardLength(value));
  const brand = detectCardBrand(digits);
  if (brand?.id === 'amex') {
    const p1 = digits.slice(0, 4);
    const p2 = digits.slice(4, 10);
    const p3 = digits.slice(10, 15);
    return [p1, p2, p3].filter(Boolean).join(' ');
  }
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

export function luhnCheck(pan) {
  const digits = digitsOnly(pan);
  if (digits.length < 12) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = parseInt(digits[i], 10);
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export function formatExpiryInput(value) {
  const digits = digitsOnly(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function isExpiryValid(expiry) {
  const digits = digitsOnly(expiry);
  if (digits.length !== 4) return false;
  const month = parseInt(digits.slice(0, 2), 10);
  const year = parseInt(digits.slice(2, 4), 10);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const expEnd = new Date(2000 + year, month, 0, 23, 59, 59);
  return expEnd >= new Date(now.getFullYear(), now.getMonth(), 1);
}

export function validateCardPayment({ cardNumber, cardHolder, cardExpiry, authCode }) {
  const digits = digitsOnly(cardNumber);
  const brand = detectCardBrand(digits);
  if (!brand) return { ok: false, error: 'unknown_card' };
  if (!brand.lengths.includes(digits.length)) return { ok: false, error: 'invalid_length' };
  if (!luhnCheck(digits)) return { ok: false, error: 'invalid_number' };
  if (!String(cardHolder || '').trim()) return { ok: false, error: 'holder_required' };
  if (!isExpiryValid(cardExpiry)) return { ok: false, error: 'invalid_expiry' };
  if (!String(authCode || '').trim()) return { ok: false, error: 'auth_required' };
  return {
    ok: true,
    meta: {
      card_type: brand.label,
      card_last4: digits.slice(-4),
      card_expiry: formatExpiryInput(cardExpiry),
      card_holder: String(cardHolder).trim().slice(0, 80),
      auth_code: String(authCode).trim().slice(0, 32),
    },
  };
}

export function cardBrandLabel(brand) {
  return brand?.label || '';
}
