import { mapJournalTypeToCode } from './journalCounterparts';

export const JOURNAL_TYPE_OPTIONS = [
  { code: 'JNL', label: 'Standard (JNL)' },
  { code: 'RJE', label: 'Recurring (RJE)' },
  { code: 'REV', label: 'Reversal (REV)' },
  { code: 'AJE', label: 'Allocation (AJE)' },
  { code: 'TJE', label: 'Tax (TJE)' },
  { code: 'OBL', label: 'Opening balance (OBL)' },
];

export function generateJournalReference(date = new Date()) {
  const d = date instanceof Date ? date : new Date(String(date).slice(0, 10) + 'T12:00:00');
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `JE-${y}${m}${day}-${String(suffix).toUpperCase()}`;
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

/** Build locked metadata fields (Account_Core parity). */
export function buildJournalEntryMetadata(body = {}) {
  const journalDate =
    body.journal_date && /^\d{4}-\d{2}-\d{2}$/.test(String(body.journal_date))
      ? String(body.journal_date).slice(0, 10)
      : todayIsoDate();
  const [y, m] = journalDate.split('-').map((n) => parseInt(n, 10));
  const journalType = String(body.journal_type || 'JNL').trim().toUpperCase() || 'JNL';
  const reference = String(body.reference || '').trim() || generateJournalReference(new Date(`${journalDate}T12:00:00`));

  return {
    journalDate,
    fiscalYear: Number.isFinite(y) ? y : new Date().getFullYear(),
    fiscalPeriod: Number.isFinite(m) ? m : new Date().getMonth() + 1,
    reference,
    currencyCode: String(body.currency_code || 'XAF').trim().toUpperCase() || 'XAF',
    exchangeRate: body.exchange_rate != null && body.exchange_rate !== '' ? Number(body.exchange_rate) || 1 : 1,
    journalType,
    journalCode: String(body.journal_code || mapJournalTypeToCode(journalType) || 'OD'),
  };
}
