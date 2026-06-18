/** Doses per day from frequency text (English catalog + common abbreviations). */
const FREQUENCY_PER_DAY = [
  [/^\s*stat\s*$/i, 1],
  [/^\s*prn\s*$/i, null],
  [/once\s+daily|once\s+a\s+day|\bod\b|\bq\.?\s*d\.?\s*$/i, 1],
  [/twice\s+daily|two\s+times\s+daily|\bbid\b|\bb\.?\s*i\.?\s*d\.?\s*$/i, 2],
  [/three\s+times\s+daily|\btid\b|\bt\.?\s*i\.?\s*d\.?\s*$/i, 3],
  [/four\s+times\s+daily|\bqid\b|\bq\.?\s*i\.?\s*d\.?\s*$/i, 4],
  [/every\s+6\s+h(ours?)?|\bq6h\b|\b6\s*hourly/i, 4],
  [/every\s+4\s+h(ours?)?|\bq4h\b|\b4\s*hourly/i, 6],
  [/every\s+8\s+h(ours?)?|\bq8h\b|\b8\s*hourly/i, 3],
  [/every\s+12\s+h(ours?)?|\bq12h\b|\b12\s*hourly/i, 2],
  [/daily|once\s+per\s+day/i, 1],
  [/(\d+)\s*x\s*(?:per\s+)?day/i, (_, n) => parseInt(n, 10)],
  [/(\d+)\s+times?\s+(?:a|per)\s+day/i, (_, n) => parseInt(n, 10)],
];

/**
 * Units taken per administration (e.g. "2 tabs" → 2; "500 mg" → 1 tablet/dose).
 */
export function parseDosageUnits(dosage) {
  const s = String(dosage || '').trim().toLowerCase();
  if (!s) return null;

  const countable =
    /^(\d+(?:\.\d+)?)\s*(?:tab|tabs|tablet|tablets|cap|caps|caplet|pill|pills|amp|amps|ampoule|ampoules|unit|units|sachet|sachets|puff|puffs|patch|patches|supp|suppository|suppositories)\b/.exec(
      s
    );
  if (countable) {
    return Math.max(1, Math.ceil(parseFloat(countable[1])));
  }

  const volume = /^(\d+(?:\.\d+)?)\s*(ml|milliliter|millilitre|l|liter|litre)\b/.exec(s);
  if (volume) {
    return Math.max(1, Math.ceil(parseFloat(volume[1])));
  }

  if (/^\d+(?:\.\d+)?\s*(mg|g|gram|grams|mcg|µg|iu)\b/.test(s)) {
    return 1;
  }

  const leading = /^(\d+(?:\.\d+)?)/.exec(s);
  if (leading) {
    const n = parseFloat(leading[1]);
    if (n <= 30) return Math.max(1, Math.ceil(n));
    return 1;
  }

  return 1;
}

export function parseFrequencyPerDay(frequency) {
  const s = String(frequency || '').trim();
  if (!s) return null;

  for (const [pattern, value] of FREQUENCY_PER_DAY) {
    const m = s.match(pattern);
    if (m) {
      if (typeof value === 'function') return value(...m);
      return value;
    }
  }

  const num = /(\d+)/.exec(s);
  if (num && /day|daily|x/i.test(s)) {
    const n = parseInt(num[1], 10);
    if (n >= 1 && n <= 12) return n;
  }

  return null;
}

/**
 * Total quantity to dispense: units per dose × doses per day × days.
 */
export function calcMedQuantity({ dosage, frequency, days }) {
  const dayCount = parseInt(String(days ?? ''), 10);
  if (!Number.isFinite(dayCount) || dayCount < 1) return null;

  const perDose = parseDosageUnits(dosage);
  const perDay = parseFrequencyPerDay(frequency);
  if (perDose == null || perDay == null || perDay < 1) return null;

  return Math.max(1, Math.ceil(perDose * perDay * dayCount));
}

export function formatMedQuantityFormula({ dosage, frequency, days }) {
  const perDose = parseDosageUnits(dosage);
  const perDay = parseFrequencyPerDay(frequency);
  const dayCount = parseInt(String(days ?? ''), 10);
  if (perDose == null || perDay == null || !Number.isFinite(dayCount) || dayCount < 1) return null;
  return { perDose, perDay, dayCount, total: Math.max(1, Math.ceil(perDose * perDay * dayCount)) };
}
