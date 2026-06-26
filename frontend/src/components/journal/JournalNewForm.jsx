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

  return (
    <form method="POST" action="/financials/journal-new" className="jem--page">
      {error ? <div className="jem-form-err">{error}</div> : null}

      <input type="hidden" name="journal_date" value={metadata.journalDate} />
      <input type="hidden" name="reference" value={metadata.reference} />
      <input type="hidden" name="journal_code" value={journalCode} />
      <input type="hidden" name="journal_type" value={journalType} />
      <input type="hidden" name="currency_code" value={metadata.currencyCode} />
      <input type="hidden" name="exchange_rate" value={metadata.exchangeRate} />
      <input type="hidden" name="fiscal_year" value={metadata.fiscalYear} />
      <input type="hidden" name="fiscal_period" value={metadata.fiscalPeriod} />

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
              <input
                type="date"
                className="jem-field jem-field--locked"
                value={metadata.journalDate}
                readOnly
                tabIndex={-1}
                title={t('journal_form.auto_locked', { defaultValue: 'Set automatically; not editable' })}
              />
            </div>
            <div className="jem-grid-2" style={{ marginTop: '0.75rem' }}>
              <div className="jem-input-group">
                <span className="jem-label">{t('journal_form.fiscal_year', { defaultValue: 'Fiscal year' })}</span>
                <input
                  type="text"
                  className="jem-field jem-field--locked"
                  value={metadata.fiscalYear}
                  readOnly
                  tabIndex={-1}
                  title={t('journal_form.auto_locked', { defaultValue: 'Set automatically; not editable' })}
                />
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('journal_form.period', { defaultValue: 'Period' })}</span>
                <input
                  type="text"
                  className="jem-field jem-field--locked"
                  value={metadata.fiscalPeriod}
                  readOnly
                  tabIndex={-1}
                  title={t('journal_form.auto_locked', { defaultValue: 'Set automatically; not editable' })}
                />
              </div>
            </div>
            <div className="jem-input-group" style={{ marginTop: '0.75rem' }}>
              <label className="jem-label jem-label--inline">
                <FaIcon name="info-circle" />
                {t('journal_form.reference')}
              </label>
              <input
                type="text"
                className="jem-field jem-mono jem-field--locked"
                value={metadata.reference}
                readOnly
                tabIndex={-1}
                title={t('journal_form.ref_autogen', { defaultValue: 'Autogenerated; not editable' })}
              />
            </div>
            <div className="jem-grid-2" style={{ marginTop: '0.75rem' }}>
              <div className="jem-input-group">
                <label className="jem-label jem-label--inline">
                  <FaIcon name="money" />
                  {t('journal_form.currency', { defaultValue: 'CCY' })}
                </label>
                <input
                  type="text"
                  className="jem-field jem-mono jem-field--locked"
                  value={metadata.currencyCode}
                  readOnly
                  tabIndex={-1}
                  title={t('journal_form.auto_locked', { defaultValue: 'Set automatically; not editable' })}
                />
              </div>
              <div className="jem-input-group">
                <label className="jem-label jem-label--inline">
                  <FaIcon name="percent" />
                  {t('journal_form.fx_rate', { defaultValue: '% FX' })}
                </label>
                <input
                  type="text"
                  className="jem-field jem-mono jem-field--locked"
                  value={metadata.exchangeRate}
                  readOnly
                  tabIndex={-1}
                  title={t('journal_form.auto_locked', { defaultValue: 'Set automatically; not editable' })}
                />
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
            <button type="submit" name="save_as_draft" value="1" className="jem-btn-primary" disabled={!canPost}>
              <FaIcon name="floppy-o" />
              {t('journal_form.save_draft', { defaultValue: 'Save draft' })}
            </button>
            <button type="submit" name="save_as_draft" value="0" className="jem-btn-secondary" disabled={!canPost}>
              {t('journal_form.post', { defaultValue: 'Post journal' })}
            </button>
          </div>
        </main>
      </div>
    </form>
  );
}
