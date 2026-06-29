import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import { JournalBalanceBar } from './JournalBalanceBar';
import { JournalLedgerLinesGrid } from './JournalLedgerLinesGrid';
import { journalLineTotals, journalLinesFromBody, parseJournalAmount } from '../../lib/journalEntryFormHelpers';
import { mapJournalTypeToCode } from '../../lib/journalCounterparts';
import { buildJournalEntryMetadata, JOURNAL_TYPE_OPTIONS } from '../../lib/journalEntryMetadata';
import './JournalEntryForm.css';

export function JournalNewForm({ accounts = [], catalogByAccount = {}, costCenters = [], body = {}, error = null }) {
  const { t } = useTranslation('financials');
  const metadata = useMemo(() => buildJournalEntryMetadata(body), [body]);
  const [journalType, setJournalType] = useState(metadata.journalType);
  const journalCode = mapJournalTypeToCode(journalType);
  const [lines, setLines] = useState(() => journalLinesFromBody(body, 2));
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(error || '');
  const [subAccountPrompt, setSubAccountPrompt] = useState(null);
  const [pendingPayload, setPendingPayload] = useState(null);
  const totals = journalLineTotals(lines);
  const validLineCount = lines.filter(
    (ln) => ln.accountId && (parseJournalAmount(ln.debit) > 0 || parseJournalAmount(ln.credit) > 0)
  ).length;
  const requireCostCentre = costCenters.length > 0;
  const linesWithAmount = lines.filter(
    (ln) => parseJournalAmount(ln.debit) > 0 || parseJournalAmount(ln.credit) > 0
  );
  const allHaveCostCentre =
    !requireCostCentre || linesWithAmount.every((ln) => String(ln.costCentre || '').trim());
  const canPost = totals.balanced && validLineCount >= 2 && allHaveCostCentre;

  function buildPayload(asDraft) {
    return {
      journal_date: metadata.journalDate,
      reference: metadata.reference,
      journal_code: journalCode,
      journal_type: journalType,
      currency_code: metadata.currencyCode,
      exchange_rate: metadata.exchangeRate,
      fiscal_year: metadata.fiscalYear,
      fiscal_period: metadata.fiscalPeriod,
      description: document.getElementById('journal_description')?.value || body.description || '',
      saveAsDraft: asDraft,
      lines: lines.map((ln) => ({
        accountId: ln.accountId,
        debit: parseJournalAmount(ln.debit),
        credit: parseJournalAmount(ln.credit),
        memo: ln.memo || '',
        costCentre: ln.costCentre || '',
      })),
    };
  }

  async function submitJournal(asDraft, autoCreateSubAccounts = false) {
    setBusy(true);
    setFormError('');
    try {
      const payload = pendingPayload || buildPayload(asDraft);
      const res = await fetch('/api/financials/journal-new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...payload, autoCreateSubAccounts }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 422 && data.needsSubAccounts) {
        setPendingPayload({ ...payload, saveAsDraft: asDraft });
        setSubAccountPrompt(data.missing || []);
        return;
      }
      if (!res.ok || !data.ok) {
        throw new Error(data.error || t('journal_form.failed', { defaultValue: 'Could not post journal.' }));
      }
      setSubAccountPrompt(null);
      setPendingPayload(null);
      window.location.assign(
        `/financials/journal-view?id=${data.journalId}&msg=${encodeURIComponent(data.message || 'Journal saved.')}`
      );
    } catch (e) {
      setFormError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="jem--page">
      {formError ? <div className="jem-form-err">{formError}</div> : null}

      {subAccountPrompt ? (
        <div className="jem-subaccount-prompt" style={{ margin: '1rem', padding: '1rem', border: '1px solid #f59e0b', borderRadius: '8px', background: '#fffbeb' }}>
          <h3 style={{ margin: '0 0 0.5rem', fontWeight: 700 }}>{t('journal_form.subaccounts_title')}</h3>
          <p style={{ margin: '0 0 0.75rem' }}>{t('journal_form.subaccounts_body')}</p>
          <ul style={{ margin: '0 0 1rem', paddingLeft: '1.25rem' }}>
            {subAccountPrompt.map((row) => (
              <li key={`${row.role}-${row.motherCode}`}>
                <strong>{row.role}</strong>: {row.motherCode} ({row.motherLabel}) → <code>{row.proposedCode}</code>
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" className="jem-btn-ghost" disabled={busy} onClick={() => { setSubAccountPrompt(null); setPendingPayload(null); }}>
              {t('journal_form.cancel')}
            </button>
            <button type="button" className="jem-btn-secondary" disabled={busy} onClick={() => submitJournal(pendingPayload?.saveAsDraft, true)}>
              {busy ? t('journal_form.working') : t('journal_form.subaccounts_confirm')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="jem-body--page">
        <aside className="jem-sidebar">
          <div>
            <span className="jem-label">{t('journal_form.core_classification', { defaultValue: 'Core classification' })}</span>
            <div className="jem-input-group" style={{ marginTop: '0.5rem' }}>
              <label className="jem-label jem-label--inline" htmlFor="journal_type">
                <FaIcon name="sitemap" />
                {t('journal_form.journal_type', { defaultValue: 'Journal type' })}
              </label>
              <select
                id="journal_type"
                className="jem-type-select"
                value={journalType}
                onChange={(e) => setJournalType(e.target.value)}
              >
                <optgroup label={t('journal_form.manual_types', { defaultValue: 'Manual' })}>
                  {JOURNAL_TYPE_OPTIONS.filter((o) => o.code !== 'OBL').map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t('journal_form.system_types', { defaultValue: 'System / setup' })}>
                  {JOURNAL_TYPE_OPTIONS.filter((o) => o.code === 'OBL').map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          <hr className="jem-hr" />

          <div>
            <span className="jem-label">{t('journal_form.metadata', { defaultValue: 'Metadata & period' })}</span>
            <div className="jem-input-group" style={{ marginTop: '0.5rem' }}>
              <label className="jem-label jem-label--inline">
                <FaIcon name="calendar" />
                {t('journal_form.posting_date', { defaultValue: 'Posting date' })}
              </label>
              <input type="date" className="jem-field jem-field--locked" value={metadata.journalDate} readOnly tabIndex={-1} />
            </div>
            <div className="jem-grid-2" style={{ marginTop: '0.75rem' }}>
              <div className="jem-input-group">
                <span className="jem-label">{t('journal_form.fiscal_year', { defaultValue: 'Fiscal year' })}</span>
                <input type="text" className="jem-field jem-field--locked" value={metadata.fiscalYear} readOnly tabIndex={-1} />
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('journal_form.period', { defaultValue: 'Period' })}</span>
                <input type="text" className="jem-field jem-field--locked" value={metadata.fiscalPeriod} readOnly tabIndex={-1} />
              </div>
            </div>
            <div className="jem-input-group" style={{ marginTop: '0.75rem' }}>
              <label className="jem-label jem-label--inline">
                <FaIcon name="info-circle" />
                {t('journal_form.reference')}
              </label>
              <input type="text" className="jem-field jem-mono jem-field--locked" value={metadata.reference} readOnly tabIndex={-1} />
            </div>
            <div className="jem-grid-2" style={{ marginTop: '0.75rem' }}>
              <div className="jem-input-group">
                <label className="jem-label jem-label--inline">
                  <FaIcon name="money" />
                  {t('journal_form.currency', { defaultValue: 'CCY' })}
                </label>
                <input type="text" className="jem-field jem-mono jem-field--locked" value={metadata.currencyCode} readOnly tabIndex={-1} />
              </div>
              <div className="jem-input-group">
                <label className="jem-label jem-label--inline">
                  <FaIcon name="percent" />
                  {t('journal_form.fx_rate', { defaultValue: '% FX' })}
                </label>
                <input type="text" className="jem-field jem-mono jem-field--locked" value={metadata.exchangeRate} readOnly tabIndex={-1} />
              </div>
            </div>
          </div>

          <hr className="jem-hr" />

          <div className="jem-input-group">
            <label className="jem-label" htmlFor="journal_description">
              {t('journal_form.description')} *
            </label>
            <textarea
              id="journal_description"
              name="description"
              className="jem-field"
              rows={5}
              defaultValue={body.description || ''}
              required
              placeholder={t('journal_form.description_ph', { defaultValue: 'Transaction details for auditors…' })}
            />
          </div>
        </aside>

        <main className="jem-main">
          <div className="jem-section-head">
            <h2 className="jem-section-title">
              <FaIcon name="calculator" />
              {t('journal_form.ledger_lines', { defaultValue: 'Ledger lines' })}
            </h2>
            <span className="jem-badge-soft">{t('journal_form.double_entry', { defaultValue: 'Double entry' })}</span>
          </div>

          <JournalLedgerLinesGrid
            accounts={accounts}
            catalogByAccount={catalogByAccount}
            journalCode={journalCode}
            lines={lines}
            onLinesChange={setLines}
            costCenters={costCenters}
          />

          <JournalBalanceBar lines={lines} />

          <div className="jem-footer">
            <a href="/financials/journal" className="jem-btn-ghost">
              {t('journal_form.cancel', { defaultValue: 'Cancel' })}
            </a>
            <button type="button" className="jem-btn-primary" disabled={!canPost || busy} onClick={() => submitJournal(true, false)}>
              <FaIcon name="floppy-o" />
              {busy ? t('journal_form.working') : t('journal_form.save_draft', { defaultValue: 'Save draft' })}
            </button>
            <button type="button" className="jem-btn-secondary" disabled={!canPost || busy} onClick={() => submitJournal(false, false)}>
              {busy ? t('journal_form.working') : t('journal_form.post', { defaultValue: 'Post journal' })}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
