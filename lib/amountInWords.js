'use strict';

const hmsMoneyFormat = require('./hmsMoneyFormat');
const { currencyWordsSpec, subunitWord } = require('./currencyWords');

function _cap(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Integer 0 … 1e12-1 → lower-case English words (no "and" between thousands scales; "and" only inside a chunk < 1000).
 */
function integerToEnglishWords(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return 'zero';
  const ones = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'
  ];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const scales = ['', 'thousand', 'million', 'billion', 'trillion'];

  function belowHundred(x) {
    if (x < 20) return ones[x];
    const t = Math.floor(x / 10);
    const u = x % 10;
    let s = tens[t];
    if (u) s += '-' + ones[u];
    return s;
  }

  function belowThousand(x) {
    let s = '';
    if (x >= 100) {
      s += ones[Math.floor(x / 100)] + ' hundred';
      x %= 100;
      if (x) s += ' and ';
    }
    if (x > 0) s += belowHundred(x);
    return s;
  }

  const parts = [];
  let i = 0;
  let num = n;
  while (num > 0) {
    const chunk = num % 1000;
    if (chunk) {
      let p = belowThousand(chunk);
      if (scales[i]) p += ' ' + scales[i];
      parts.unshift(p);
    }
    num = Math.floor(num / 1000);
    i++;
  }
  return parts.join(' ');
}

/**
 * @param {number|string} amount — total paid in active country currency; may include subunits
 * @returns {{ en: string, fr: string, numeric: string }}
 */
function amountPaidWords(amount) {
  const raw = Number(amount);
  const safe = Number.isFinite(raw) ? raw : 0;
  const rounded = Math.round(safe * 100) / 100;
  const whole = Math.floor(Math.abs(rounded));
  const cents = Math.round(Math.round(Math.abs(rounded) * 100) - whole * 100);
  const spec = currencyWordsSpec();

  let en = _cap(integerToEnglishWords(whole)) + ' ' + spec.en;
  if (cents > 0) {
    en += ' and ' + integerToEnglishWords(cents) + ' ' + subunitWord(spec, cents, 'en');
  }
  en += ' only';

  let fr = _cap(integerToFrenchWords(whole)) + ' ' + spec.fr;
  if (cents > 0) {
    fr += ' et ' + integerToFrenchWords(cents) + ' ' + subunitWord(spec, cents, 'fr');
  }
  fr += ' seulement';

  return {
    en,
    fr,
    numeric: hmsMoneyFormat.formatMoney(rounded),
  };
}

/** French cardinal 0 … 999 999 999 (hospital-scale amounts). */
function integerToFrenchWords(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return 'zéro';

  const u = [
    'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
    'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'
  ];

  function under100(x) {
    if (x < 20) return u[x];
    if (x < 70) {
      const d = Math.floor(x / 10);
      const r = x % 10;
      const names = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };
      let b = names[d];
      if (r === 0) return b;
      if (r === 1) return b + '-et-un';
      return b + '-' + u[r];
    }
    if (x < 80) return 'soixante-' + under100(x - 60);
    if (x === 80) return 'quatre-vingts';
    const r = x - 80;
    if (r === 0) return 'quatre-vingts';
    if (r === 1) return 'quatre-vingt-un';
    return 'quatre-vingt-' + under100(r);
  }

  /** 1 … 999 (never zero) */
  function below1000(x) {
    if (x < 100) return under100(x);
    const h = Math.floor(x / 100);
    const r = x % 100;
    let head = h === 1 ? 'cent' : u[h] + ' cent';
    if (r === 0) {
      if (h > 1) head += 's';
      return head;
    }
    return head + ' ' + under100(r);
  }

  const millions = Math.floor(n / 1000000);
  let rest = n % 1000000;
  const thousands = Math.floor(rest / 1000);
  rest %= 1000;

  const parts = [];
  if (millions) {
    parts.push(millions === 1 ? 'un million' : below1000(millions) + ' millions');
  }
  if (thousands) {
    parts.push(thousands === 1 ? 'mille' : below1000(thousands) + ' mille');
  }
  if (rest) parts.push(below1000(rest));
  return parts.join(' ') || 'zéro';
}

module.exports = { amountPaidWords, integerToEnglishWords, integerToFrenchWords };
