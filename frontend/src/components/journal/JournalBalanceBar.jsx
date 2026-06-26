import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import { journalLineTotals } from '../../lib/journalEntryFormHelpers';

export function JournalBalanceBar({ lines = [] }) {
  const { t } = useTranslation('financials');
  const totals = journalLineTotals(lines);
  const validCount = lines.filter(
    (ln) => ln.accountId && (parseInt(String(ln.debit).replace(/\D/g, ''), 10) || parseInt(String(ln.credit).replace(/\D/g, ''), 10))
  ).length;
  const isBalanced = totals.balanced && validCount >= 2;
  const showImbalance = !isBalanced && totals.diff !== 0;

  let headline = t('journal_form.balanced_ok', { defaultValue: 'Balanced' });
  if (!isBalanced) {
    if (totals.diff === 0 && validCount < 2) {
      headline = t('journal_form.need_two_lines', { defaultValue: 'Add at least two lines' });
    } else if (totals.diff !== 0) {
      headline = t('journal_form.not_balanced', { defaultValue: 'Not balanced' });
    } else {
      headline = t('journal_form.balanced_pending', { defaultValue: 'Out of balance' });
    }
  }

  return (
    <div
      className={[
        'jem-balance',
        isBalanced && 'jem-balance--ok',
        showImbalance && 'jem-balance--imb',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="jem-balance__left">
        <div className="jem-balance__icon" aria-hidden>
          <FaIcon name={isBalanced ? 'shield' : showImbalance ? 'exclamation-triangle' : 'shield'} />
        </div>
        <div>
          <p className="jem-balance__label">{t('journal_form.balance_check', { defaultValue: 'Balance check' })}</p>
          <h4 className="jem-balance__headline">{headline}</h4>
        </div>
      </div>
      <div className="jem-balance__right">
        <div className="jem-balance__cell">
          <p className="jem-balance__cell--small">{t('journal_form.total_debit', { defaultValue: 'Total Debits' })}</p>
          <p className="jem-balance__val">
            {totals.debit.toLocaleString('fr-FR')}
            <span className="jem-balance__unit">XAF</span>
          </p>
        </div>
        <div className="jem-balance__sep" />
        <div className="jem-balance__cell">
          <p className="jem-balance__cell--small">{t('journal_form.total_credit', { defaultValue: 'Total Credits' })}</p>
          <p className="jem-balance__val">
            {totals.credit.toLocaleString('fr-FR')}
            <span className="jem-balance__unit">XAF</span>
          </p>
        </div>
        {showImbalance ? (
          <>
            <div className="jem-balance__sep" />
            <div className="jem-balance__cell">
              <p className="jem-balance__cell--small">{t('journal_form.difference', { defaultValue: 'Imbalance' })}</p>
              <p className="jem-balance__val" style={{ color: '#be123c' }}>
                {Math.abs(totals.diff).toLocaleString('fr-FR')}
                <span className="jem-balance__unit">XAF</span>
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
