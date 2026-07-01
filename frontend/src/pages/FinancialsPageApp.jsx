import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '../components/FormField';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { JournalNewForm } from '../components/journal/JournalNewForm';
import { formatMoney, currencyCode } from '../lib/hmsLocale';

const FIN_NAV = [
  { key: 'dashboard', href: '/financials', labelKey: 'nav.dashboard' },
  { key: 'journal', href: '/financials/journal', labelKey: 'nav.journal' },
  { key: 'livre-journal', href: '/financials/livre-journal', labelKey: 'nav.livre_journal' },
  { key: 'ledger', href: '/financials/general-ledger', labelKey: 'nav.ledger' },
  { key: 'accounts', href: '/financials/accounts', labelKey: 'nav.accounts' },
  { key: 'ar', href: '/financials/accounts-receivable', labelKey: 'nav.ar' },
  { key: 'ap', href: '/financials/accounts-payable', labelKey: 'nav.ap' },
  { key: 'treasury', href: '/financials/treasury', labelKey: 'nav.treasury' },
  { key: 'bank', href: '/financials/bank-reconciliation', labelKey: 'nav.bank' },
  { key: 'trial', href: '/financials/trial-balance', labelKey: 'nav.trial' },
  { key: 'balance', href: '/financials/balance-sheet', labelKey: 'nav.balance' },
  { key: 'cashflow', href: '/financials/cash-flow', labelKey: 'nav.cashflow' },
  { key: 'expenses', href: '/financials/expenses', labelKey: 'nav.expenses' },
  { key: 'settings', href: '/financials/settings', labelKey: 'nav.settings' },
];

function fmt(n) {
  if (n == null || n === '') return '—';
  return formatMoney(n);
}

const cur = currencyCode();

function FinNavLink({ href, active, children }) {
  return (
    <a
      href={href}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset no-underline transition ${
        active
          ? 'bg-brand text-white ring-brand'
          : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
      }`}
    >
      {children}
    </a>
  );
}

function FinNav({ active }) {
  const { t } = useTranslation('financials');
  return (
    <nav className="mb-4 flex flex-wrap gap-1.5" aria-label={t('nav.aria_shortcuts')}>
      {FIN_NAV.map((n) => (
        <FinNavLink key={n.key} href={n.href} active={active === n.key}>
          {t(n.labelKey)}
        </FinNavLink>
      ))}
    </nav>
  );
}

function CellValue({ col, row }) {
  const { t } = useTranslation('financials');
  const raw = row[col.key];
  if (col.format === 'money') {
    return <span>{fmt(raw)}</span>;
  }
  if (col.format === 'link' && col.linkTemplate) {
    const href = col.linkTemplate.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(row[k] ?? ''));
    return (
      <a href={href} className="font-bold text-blue-600">
        {col.linkLabel || raw || t('open')}
      </a>
    );
  }
  return raw ?? '—';
}

function DataTable({ columns = [], rows = [], emptyLabel }) {
  const { t } = useTranslation('financials');
  const empty = emptyLabel ?? t('no_records');
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-900 text-xs font-bold uppercase tracking-wide text-white">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {!rows.length ? (
            <tr>
              <td colSpan={columns.length || 1} className="px-3 py-8 text-center text-slate-400">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={row.id || i} className="hover:bg-slate-50">
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right font-mono' : ''}`}>
                    <CellValue col={c} row={row} />
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function GroupedClassView({ byClass = {}, classKeys = [] }) {
  const { t } = useTranslation('financials');
  const keys = classKeys.length ? classKeys : Object.keys(byClass).sort((a, b) => Number(a) - Number(b));
  if (!keys.length) return <p className="text-slate-400">{t('no_accounts_view')}</p>;
  return (
    <div className="space-y-4">
      {keys.map((k) => {
        const rows = byClass[k] || byClass[String(k)] || [];
        if (!rows.length) return null;
        return (
          <div key={k} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 text-xs font-bold uppercase text-slate-600">
              {t('class', { n: k })}
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {rows.map((a) => (
                  <tr key={a.account_code || a.code || a.id}>
                    <td className="px-4 py-2 font-mono font-bold">{a.account_code || a.code}</td>
                    <td className="px-4 py-2">{a.account_label || a.label}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmt(a.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function GlAccountsView({ glAccounts = [] }) {
  const { t } = useTranslation('financials');
  if (!glAccounts.length) return null;
  return (
    <div className="mt-6 space-y-4">
      <h2 className="text-sm font-bold uppercase text-slate-500">{t('by_account')}</h2>
      {glAccounts.map((acct) => (
        <details key={acct.code} className="rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 font-bold">
            <code>{acct.code}</code> — {acct.label}{' '}
            <span className="float-right font-mono text-slate-600">{fmt(acct.closing)}</span>
          </summary>
          <div className="border-t border-slate-100 px-2 pb-2">
            <DataTable
              columns={[
                { key: 'entry_date', label: t('col_date') },
                { key: 'narration', label: t('col_description') },
                { key: 'debit', label: t('col_debit'), align: 'right', format: 'money' },
                { key: 'credit', label: t('col_credit'), align: 'right', format: 'money' },
                { key: 'running', label: t('col_running'), align: 'right', format: 'money' },
                { key: 'journal_id', label: '', format: 'link', linkTemplate: '/financials/journal-view?id={journal_id}', linkLabel: t('view_detail', { defaultValue: 'View' }) },
              ]}
              rows={acct.rows || []}
              emptyLabel={t('no_lines')}
            />
          </div>
        </details>
      ))}
    </div>
  );
}

function JournalDetailView({ journal, lines = [], columns = [], finCanWrite = false, detail = null }) {
  const { t } = useTranslation('financials');
  if (!journal) return <p className="text-slate-400">{t('journal_not_found')}</p>;
  const isDraft = String(journal.status || '') === 'draft';
  const isPosted = String(journal.status || '') === 'posted';
  const isReversed = String(journal.status || '') === 'reversed';
  const cashier = detail?.cashierTxn;
  const billing = detail?.billing;
  const patient = detail?.patient;
  const ticket = detail?.ticket;
  const ticketLines = detail?.ticketLines || [];
  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-bold uppercase text-slate-500">{t('journal_entry_title')}</div>
        <div className="text-lg font-extrabold">{journal.piece_number || `#${journal.id}`}</div>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
          <span>{t('date_label')} {journal.entry_date || journal.journal_date}</span>
          <span>{t('ref_label')} {journal.reference || '—'}</span>
          <span>Journal: {journal.journal_code || 'OD'}</span>
          <span>Status: {journal.status || 'posted'}</span>
          <span>{t('source_label')} {journal.source_type || journal.source || '—'}</span>
        </div>
        {journal.narration ? <p className="mt-2 text-sm text-slate-700">{journal.narration}</p> : null}
        {finCanWrite && isDraft ? (
          <form method="POST" action={`/financials/journal/${journal.id}/post`} className="mt-3">
            <button type="submit" className="hms-btn-primary text-sm">{t('journal_post_draft', { defaultValue: 'Post draft' })}</button>
          </form>
        ) : null}
        {finCanWrite && isPosted && !journal.reversed_by_id ? (
          <form method="POST" action={`/financials/journal/${journal.id}/reverse`} className="mt-3 flex flex-wrap gap-2">
            <input name="reason" className="hms-input text-sm" placeholder={t('journal_reverse_reason', { defaultValue: 'Reversal reason' })} />
            <button type="submit" className="hms-btn-secondary text-sm">{t('journal_reverse', { defaultValue: 'Reverse entry' })}</button>
          </form>
        ) : null}
        {isReversed ? <p className="mt-2 text-sm text-amber-700">{t('journal_reversed_note', { defaultValue: 'This entry has been reversed.' })}</p> : null}
      </div>

      {(cashier || billing || patient || ticket) ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          {cashier ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">{t('journal_detail.cashier', { defaultValue: 'Cashier transaction' })}</h3>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                <dt className="text-slate-500">{t('journal_detail.cashier_code', { defaultValue: 'Cashier' })}</dt>
                <dd className="font-semibold">{cashier.cashier_code} — {cashier.cashier_identity}</dd>
                <dt className="text-slate-500">{t('journal_detail.method', { defaultValue: 'Method' })}</dt>
                <dd>{cashier.payment_method}</dd>
                <dt className="text-slate-500">{t('journal_detail.amount', { defaultValue: 'Amount' })}</dt>
                <dd className="font-mono">{cashier.amount_fmt}</dd>
                <dt className="text-slate-500">{t('journal_detail.opening', { defaultValue: 'Opening' })}</dt>
                <dd className="font-mono">{cashier.opening_balance_fmt}</dd>
                <dt className="text-slate-500">{t('journal_detail.debit', { defaultValue: 'Debit' })}</dt>
                <dd className="font-mono">{cashier.debit_amount_fmt}</dd>
                <dt className="text-slate-500">{t('journal_detail.credit', { defaultValue: 'Credit' })}</dt>
                <dd className="font-mono">{cashier.credit_amount_fmt}</dd>
                <dt className="text-slate-500">{t('journal_detail.closing', { defaultValue: 'Closing' })}</dt>
                <dd className="font-mono">{cashier.closing_balance_fmt}</dd>
                <dt className="text-slate-500">GL Dr / Cr</dt>
                <dd className="font-mono text-xs">{cashier.gl_debit_account} / {cashier.gl_credit_account}</dd>
              </dl>
              <a href="/cashier/ledger" className="mt-3 inline-block text-xs font-bold text-blue-600">{t('journal_detail.open_ledger', { defaultValue: 'Open cashier ledger' })}</a>
            </div>
          ) : null}
          {(billing || patient || ticket) ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">{t('journal_detail.source_doc', { defaultValue: 'Source document' })}</h3>
              {patient ? (
                <p className="mb-1"><span className="text-slate-500">{t('journal_detail.patient', { defaultValue: 'Patient' })}:</span> <strong>{patient.name}</strong>{patient.patient_code ? ` (${patient.patient_code})` : ''}</p>
              ) : null}
              {billing?.doc_number ? (
                <p className="mb-1"><span className="text-slate-500">{t('journal_detail.receipt', { defaultValue: 'Receipt' })}:</span> <strong>{billing.doc_number}</strong> · {billing.total_amount_fmt}</p>
              ) : null}
              {ticket?.ticket_code ? (
                <p className="mb-1"><span className="text-slate-500">{t('journal_detail.ticket', { defaultValue: 'Ticket' })}:</span> <strong>{ticket.ticket_code}</strong></p>
              ) : null}
              {billing?.payment_method ? (
                <p className="mb-1"><span className="text-slate-500">{t('journal_detail.method', { defaultValue: 'Method' })}:</span> {billing.payment_method}</p>
              ) : null}
              {billing?.created_at_fmt ? (
                <p className="text-slate-500 text-xs">{t('journal_detail.collected_at', { defaultValue: 'Collected' })}: {billing.created_at_fmt}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {ticketLines.length ? (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">{t('journal_detail.line_items', { defaultValue: 'Service line items' })}</h3>
          <DataTable
            columns={[
              { key: 'description', label: t('journal_detail.service', { defaultValue: 'Service' }) },
              { key: 'quantity', label: t('journal_detail.qty', { defaultValue: 'Qty' }), align: 'right' },
              { key: 'unit_price', label: t('journal_detail.unit', { defaultValue: 'Unit' }), align: 'right', format: 'money' },
              { key: 'patient_due', label: t('journal_detail.patient_due', { defaultValue: 'Patient due' }), align: 'right', format: 'money' },
            ]}
            rows={ticketLines.map((ln, i) => ({
              id: i,
              ...ln,
              patient_due: ln.patient_due != null ? ln.patient_due : ln.unit_price * ln.quantity,
            }))}
          />
        </div>
      ) : null}

      <DataTable columns={columns} rows={lines} />
      <div className="mt-3 flex flex-wrap gap-3">
        <a href="/financials/journal" className="text-sm font-bold text-blue-600">
          {t('back_journal')}
        </a>
        <a href="/financials/livre-journal" className="text-sm font-bold text-blue-600">
          {t('nav.livre_journal', { defaultValue: 'Livre-journal' })}
        </a>
      </div>
    </>
  );
}

function LivreJournalView({ rows = [], filterFrom, filterTo, filterJournal = 'all' }) {
  const qs = new URLSearchParams({ from: filterFrom || '', to: filterTo || '', journal: filterJournal || 'all' });
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <a href={`/financials/livre-journal/print?${qs}`} target="_blank" rel="noreferrer" className="hms-btn-secondary text-xs">
          PDF / Print
        </a>
        <a href={`/financials/livre-journal/export.xlsx?${qs}`} className="hms-btn-secondary text-xs">
          Sage / Excel export
        </a>
      </div>
      <DataTable
        columns={[
          { key: 'entry_date', label: 'Date' },
          { key: 'journal_code', label: 'Journal' },
          { key: 'piece_number', label: 'Piece' },
          { key: 'account_code', label: 'Account' },
          { key: 'account_label', label: 'Label' },
          { key: 'debit', label: 'Debit', align: 'right', format: 'money' },
          { key: 'credit', label: 'Credit', align: 'right', format: 'money' },
          { key: 'narration', label: 'Narration' },
        ]}
        rows={rows}
      />
    </>
  );
}
function ExpenseNewForm({ categories = [], body = {}, error = null }) {
  const { t } = useTranslation('financials');
  return (
    <form method="POST" action="/financials/expenses/new" className="max-w-xl rounded-xl border bg-white p-6">
      {error ? <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
      <FormField label={t('expense_form.date')} className="mb-3" required>
        <input name="expense_date" type="date" className="hms-input w-full" defaultValue={body.expense_date || ''} required />
      </FormField>
      <FormField label={t('expense_form.category')} className="mb-3" required>
        <select name="category" className="hms-input w-full" defaultValue={body.category || ''} required>
          <option value="">{t('expense_form.select')}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label={t('expense_form.description')} className="mb-3">
        <input name="description" className="hms-input w-full" defaultValue={body.description || ''} />
      </FormField>
      <FormField label={t('expense_form.amount')} className="mb-3" required>
        <input name="amount_xaf" className="hms-input w-full" defaultValue={body.amount_xaf || ''} required />
      </FormField>
      <FormField label={t('expense_form.vendor')} className="mb-3">
        <input name="vendor" className="hms-input w-full" defaultValue={body.vendor || ''} />
      </FormField>
      <button type="submit" className="hms-btn hms-btn-primary">
        {t('expense_form.save')}
      </button>
    </form>
  );
}

function SettingsForm({ section = 'general', tax = {}, betterpay = {}, canWrite = false }) {
  const { t } = useTranslation('financials');
  return (
    <form method="POST" action="/financials/settings/save" className="max-w-xl rounded-xl border bg-white p-6">
      <input type="hidden" name="section" value={section} />
      <div className="mb-3">
        <label className="mb-1 block text-xs font-bold">{t('settings.legal_name')}</label>
        <input name="settings[company_legal_name]" className="hms-input w-full" defaultValue={tax.company_legal_name || ''} readOnly={!canWrite} />
      </div>
      <div className="mb-3">
        <label className="mb-1 block text-xs font-bold">{t('settings.city')}</label>
        <input name="settings[company_city]" className="hms-input w-full" defaultValue={tax.company_city || ''} readOnly={!canWrite} />
      </div>
      <div className="mb-3">
        <label className="mb-1 block text-xs font-bold">{t('settings.currency')}</label>
        <input name="settings[company_currency]" className="hms-input w-full" defaultValue={tax.currency_code || cur} readOnly={!canWrite} />
      </div>
      {section === 'taxes' ? (
        <>
          <div className="mb-3">
            <label className="mb-1 block text-xs font-bold">{t('settings.company_niu')}</label>
            <input name="settings[company_niu]" className="hms-input w-full" defaultValue={tax.company_niu || ''} readOnly={!canWrite} />
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-xs font-bold">{t('settings.tva_rate')}</label>
            <input name="settings[tva_rate_standard]" className="hms-input w-full" defaultValue={tax.tva_rate_standard || ''} readOnly={!canWrite} />
          </div>
        </>
      ) : null}
      {section === 'payments' ? (
        <>
          <p className="mb-3 text-sm text-slate-600">{t('settings.betterpay_hint')}</p>
          <div className="mb-3">
            <label className="mb-1 block text-xs font-bold">{t('settings.betterpay_partner')}</label>
            <input
              name="settings[betterpay_partner_identifier]"
              className="hms-input w-full font-mono text-sm"
              defaultValue={betterpay.partner_identifier || ''}
              readOnly={!canWrite}
              placeholder="e.g. hospital-slug-from-betterpay"
              required
            />
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-xs font-bold">{t('settings.betterpay_base_url')}</label>
            <input
              name="settings[betterpay_pay_base_url]"
              className="hms-input w-full font-mono text-sm"
              defaultValue={betterpay.pay_base_url || 'https://betterpayme.com/pay'}
              readOnly={!canWrite}
            />
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-xs font-bold">{t('settings.betterpay_webhook_secret')}</label>
            <input
              name="settings[betterpay_webhook_secret]"
              className="hms-input w-full font-mono text-sm"
              defaultValue={betterpay.webhook_secret || ''}
              readOnly={!canWrite}
            />
          </div>
        </>
      ) : null}
      {canWrite ? (
        <button type="submit" className="hms-btn hms-btn-primary">
          {t('settings.save')}
        </button>
      ) : null}
      <div className="mt-4 flex gap-2 text-sm">
        <a href="/financials/settings?section=general" className={section === 'general' ? 'font-bold' : ''}>
          {t('settings.general')}
        </a>
        <a href="/financials/settings?section=taxes" className={section === 'taxes' ? 'font-bold' : ''}>
          {t('settings.taxes')}
        </a>
        <a href="/financials/settings?section=payments" className={section === 'payments' ? 'font-bold' : ''}>
          {t('settings.payments')}
        </a>
      </div>
    </form>
  );
}

function SyncGlForm({ rfD1, rfD2, exD1, exD2, canRun, finOk }) {
  const { t } = useTranslation('financials');
  if (!finOk) return <p className="text-red-600">{t('sync.gl_unavailable')}</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form method="POST" action="/financials/sync-gl" className="rounded-xl border bg-white p-4">
        <h3 className="mb-2 font-bold">{t('sync.receipts')}</h3>
        <input type="hidden" name="sync_receipts" value="1" />
        <div className="mb-2 grid grid-cols-2 gap-2">
          <input name="rf_d1" type="date" className="hms-input" defaultValue={rfD1} />
          <input name="rf_d2" type="date" className="hms-input" defaultValue={rfD2} />
        </div>
        <button type="submit" className="hms-btn hms-btn-primary text-sm" disabled={!canRun}>
          {t('sync.receipts')}
        </button>
      </form>
      <form method="POST" action="/financials/sync-gl" className="rounded-xl border bg-white p-4">
        <h3 className="mb-2 font-bold">{t('sync.expenses')}</h3>
        <input type="hidden" name="sync_expenses" value="1" />
        <div className="mb-2 grid grid-cols-2 gap-2">
          <input name="ex_d1" type="date" className="hms-input" defaultValue={exD1} />
          <input name="ex_d2" type="date" className="hms-input" defaultValue={exD2} />
        </div>
        <button type="submit" className="hms-btn hms-btn-secondary text-sm" disabled={!canRun}>
          {t('sync.expenses')}
        </button>
      </form>
    </div>
  );
}

function BankReconForm({ bankCode, asof, stmtBal }) {
  const { t } = useTranslation('financials');
  return (
    <form method="GET" action="/financials/bank-reconciliation" className="mb-4 flex flex-wrap gap-2 rounded-xl border bg-white p-4">
      <input name="bank" className="hms-input" placeholder={t('bank.bank_ph')} defaultValue={bankCode || '521000'} />
      <input name="asof" type="date" className="hms-input" defaultValue={asof || ''} />
      <input name="stmt" className="hms-input" placeholder={t('bank.stmt_ph')} defaultValue={stmtBal || ''} />
      <button type="submit" className="hms-btn hms-btn-primary text-sm">
        {t('bank.reconcile')}
      </button>
    </form>
  );
}

function DashboardView({ metrics = {}, recentJournals = [], topAccounts = [] }) {
  const { t } = useTranslation('financials');
  const m = metrics;
  const netTone = (m.netIncomeMtd || 0) >= 0 ? 'brand' : 'danger';
  return (
    <>
      <div className="hms-compact-kpi-grid mb-3">
        <StatCard label={t('dashboard.income_mtd')} value={fmt(m.revenueMtd)} tone="brand" icon="arrow-up" />
        <StatCard label={t('dashboard.expenses_mtd')} value={fmt(m.expensesMtd)} tone="default" icon="arrow-down" />
        <StatCard label={t('dashboard.net_income_mtd')} value={fmt(m.netIncomeMtd)} tone={netTone} icon="line-chart" />
        <StatCard label={t('dashboard.cash_bank')} value={fmt(m.cashBalance)} tone="brand" icon="bank" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-bold uppercase text-slate-500">{t('dashboard.recent_journals')}</h2>
          <DataTable
            columns={[
              { key: 'journal_date', label: t('col_date') },
              { key: 'description', label: t('col_description') },
              { key: 'source', label: t('col_source') },
              { key: 'total_dr', label: t('col_amount'), align: 'right', format: 'money' },
            ]}
            rows={recentJournals}
          />
        </div>
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase text-slate-500">{t('dashboard.top_balances')}</h2>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {!topAccounts.length ? (
              <li className="p-4 text-sm text-slate-400">{t('dashboard.no_gl_balances')}</li>
            ) : (
              topAccounts.map((a) => (
                <li key={a.account_code} className="flex justify-between px-4 py-3 text-sm">
                  <div>
                    <code className="font-bold">{a.account_code}</code>
                    <div className="text-xs text-slate-500">{a.account_label}</div>
                  </div>
                  <a href={`/financials/general-ledger?acct=${encodeURIComponent(a.account_code)}`} className="font-bold">
                    {fmt(a.balance)}
                  </a>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </>
  );
}

function StubView({ stubTitle, phpPage, panels = [] }) {
  const { t } = useTranslation('financials');
  return (
    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 text-sm">
      <h2 className="font-bold text-amber-900">{stubTitle || t('stub.coming_soon')}</h2>
      {phpPage ? <p className="mt-2 text-amber-800">{t('stub.php_ref', { page: phpPage })}</p> : null}
      {panels.map((p, i) => (
        <p key={i} className="mt-2 text-amber-700">
          {p.note}
        </p>
      ))}
    </div>
  );
}

function YearEndView({ fiscalYear, fiscalYearStatus = 'open', rows = [], columns = [], finCanWrite = false }) {
  const { t } = useTranslation('financials');
  const closed = String(fiscalYearStatus) === 'closed';
  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-bold uppercase text-slate-500">
          {t('year_end.fiscal_year', { defaultValue: 'Fiscal year' })} {fiscalYear}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
              closed ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {closed
              ? t('year_end.status_closed', { defaultValue: 'Closed' })
              : t('year_end.status_open', { defaultValue: 'Open' })}
          </span>
          {finCanWrite && !closed ? (
            <form method="POST" action="/financials/fiscal-close" className="inline-flex items-center gap-2">
              <input type="hidden" name="fiscal_year" value={fiscalYear} />
              <button type="submit" className="hms-btn-primary text-xs">
                {t('year_end.close_fiscal_year', { defaultValue: 'Close fiscal year' })}
              </button>
            </form>
          ) : null}
          {closed ? (
            <span className="text-xs text-slate-500">
              {t('year_end.closed_hint', { defaultValue: 'All months are locked. Posting to this year is blocked.' })}
            </span>
          ) : null}
        </div>
      </div>
      <DataTable columns={columns} rows={rows} />
    </>
  );
}

function PageBody(props) {
  const { t } = useTranslation('financials');
  const { pageKey, formType } = props;

  if (pageKey === 'dashboard') {
    return <DashboardView metrics={props.metrics} recentJournals={props.recentJournals} topAccounts={props.topAccounts} />;
  }
  if (pageKey === 'journal-view') {
    return (
      <JournalDetailView
        journal={props.journal}
        lines={props.rows}
        columns={props.columns}
        finCanWrite={props.finCanWrite}
        detail={props.detail}
      />
    );
  }
  if (pageKey === 'livre-journal') {
    return (
      <LivreJournalView
        rows={props.rows}
        filterFrom={props.filterFrom}
        filterTo={props.filterTo}
        filterJournal={props.filterJournal}
      />
    );
  }
  if (formType === 'expense-new') {
    return <ExpenseNewForm categories={props.categories} body={props.body} error={props.error} />;
  }
  if (formType === 'journal-new') {
    return (
      <JournalNewForm
        accounts={props.accounts}
        catalogByAccount={props.catalogByAccount || {}}
        costCenters={props.costCenters || []}
        body={props.body}
        error={props.error}
      />
    );
  }
  if (formType === 'settings') {
    return (
      <SettingsForm
        section={props.section}
        tax={props.tax}
        betterpay={props.betterpay}
        canWrite={props.canWrite}
      />
    );
  }
  if (formType === 'sync-gl') {
    return <SyncGlForm {...props} />;
  }
  if (pageKey === 'bank-reconciliation') {
    return (
      <>
        <BankReconForm bankCode={props.bankCode} asof={props.asof} stmtBal={props.stmtBal} />
        {props.stats?.length ? null : <p className="text-sm text-slate-500">{t('bank.hint')}</p>}
      </>
    );
  }
  if (pageKey === 'chart-of-accounts' || pageKey === 'balance-sheet') {
    return (
      <>
        {pageKey === 'balance-sheet' && props.glOk === false && props.glMessage ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {props.glMessage}
          </div>
        ) : null}
        {props.rows?.length ? (
          <DataTable columns={props.columns} rows={props.rows} />
        ) : (
          <GroupedClassView byClass={props.byClass} classKeys={props.classKeys} />
        )}
      </>
    );
  }
  if (pageKey === 'year-end') {
    return (
      <YearEndView
        fiscalYear={props.fiscalYear}
        fiscalYearStatus={props.fiscalYearStatus}
        rows={props.rows}
        columns={props.columns}
        finCanWrite={props.finCanWrite}
      />
    );
  }
  if (pageKey === 'general-ledger') {
    return (
      <>
        <DataTable columns={props.columns} rows={props.rows} />
        <GlAccountsView glAccounts={props.glAccounts} />
      </>
    );
  }
  if (pageKey === 'stub') {
    return <StubView stubTitle={props.stubTitle} phpPage={props.phpPage} panels={props.panels} />;
  }
  if (pageKey === 'platform-overview') {
    return (
      <div className="rounded-xl border bg-white p-4 text-sm">
        <p className="mb-2 font-bold">{t('platform.migrations')}</p>
        <ul className="list-disc pl-5">
          {(props.migrationSteps || []).slice(0, 8).map((s) => (
            <li key={s.id || s.file}>{s.label || s.file}</li>
          ))}
        </ul>
        <a href="/financials/journal-diagnostics" className="mt-3 inline-block font-bold text-blue-600">
          {t('platform.diagnostics')}
        </a>
      </div>
    );
  }
  if (formType === 'journal-diagnostics') {
    return (
      <form method="POST" action="/financials/journal-diagnostics" className="space-y-4">
        <input type="hidden" name="d1" value={props.d1 || ''} />
        <input type="hidden" name="d2" value={props.d2 || ''} />
        {props.hint ? <p className="rounded-lg bg-slate-50 p-3 text-sm">{props.hint}</p> : null}
        {props.repairMsg ? (
          <p className={`rounded-lg p-3 text-sm ${props.repairOk ? 'bg-emerald-50' : 'bg-red-50'}`}>{props.repairMsg}</p>
        ) : null}
        {props.canRepair ? (
          <div className="flex gap-2">
            <button type="submit" name="repair_orphan_lines" value="1" className="hms-btn hms-btn-secondary text-sm">
              {t('diagnostics.relink')}
            </button>
            <button type="submit" name="repair_journal_schema" value="1" className="hms-btn hms-btn-outline-danger text-sm">
              {t('diagnostics.repair_schema')}
            </button>
          </div>
        ) : null}
      </form>
    );
  }
  if (formType === 'journal-loader') {
    return (
      <form method="POST" action="/financials/journal-loader" className="mb-4 rounded-xl border bg-white p-4">
        <input type="hidden" name="import_csv" value="1" />
        <label className="mb-1 block text-xs font-bold">{t('loader.csv_import')}</label>
        <textarea name="csv" className="hms-input mb-2 w-full font-mono text-xs" rows={6} placeholder="date,reference,narration,account,debit,credit" />
        <button type="submit" className="hms-btn hms-btn-primary text-sm" disabled={!props.canWrite}>
          {t('loader.import')}
        </button>
      </form>
    );
  }
  return <DataTable columns={props.columns} rows={props.rows} emptyLabel={props.panels?.[0]?.empty || t('no_records')} />;
}

export function FinancialsPageApp({
  pageKey = 'dashboard',
  finNavActive = 'dashboard',
  title = 'Accounting',
  subtitle = '',
  flash = null,
  error = null,
  finCanWrite = false,
  stats = [],
  panels = [],
  ...rest
}) {
  const { t } = useTranslation('financials');
  return (
    <div className="hms-surface-module w-full pb-8">
      {(flash || error) && (
        <div className={`mb-3 rounded-lg px-4 py-2 text-sm ${error ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>
          {error || flash}
        </div>
      )}

      <SurfaceHero icon="calculator" title={title} subtitle={subtitle || undefined}>
        {finCanWrite ? (
          <div className="hms-surface-hero-actions mt-4">
            <a href="/financials/journal-new" className="hms-btn-primary text-xs">
              {t('journal_entry')}
            </a>
          </div>
        ) : null}
      </SurfaceHero>

      <FinNav active={finNavActive || pageKey} />

      {stats.length ? (
        <div className="hms-compact-kpi-grid mb-3">
          {stats.map((s) => (
            <StatCard
              key={s.label}
              label={s.label}
              value={s.format === 'money' ? fmt(s.value) : s.value}
              tone="brand"
            />
          ))}
        </div>
      ) : null}

      <PageBody pageKey={pageKey} stats={stats} panels={panels} {...rest} />

      {panels.map((p, i) =>
        p.html && p.note ? (
          <div key={i} className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            {p.note}
          </div>
        ) : null
      )}
    </div>
  );
}
