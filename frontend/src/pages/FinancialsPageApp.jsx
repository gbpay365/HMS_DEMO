import { useTranslation } from 'react-i18next';
import { FormField } from '../components/FormField';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';

const FIN_NAV = [
  { key: 'dashboard', href: '/financials', labelKey: 'nav.dashboard' },
  { key: 'journal', href: '/financials/journal', labelKey: 'nav.journal' },
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
  return Number(n || 0).toLocaleString('fr-FR');
}

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
            <span className="float-right font-mono text-slate-600">{fmt(acct.closing)} XAF</span>
          </summary>
          <div className="border-t border-slate-100 px-2 pb-2">
            <DataTable
              columns={[
                { key: 'entry_date', label: t('col_date') },
                { key: 'narration', label: t('col_description') },
                { key: 'debit', label: t('col_debit'), align: 'right', format: 'money' },
                { key: 'credit', label: t('col_credit'), align: 'right', format: 'money' },
                { key: 'running', label: t('col_running'), align: 'right', format: 'money' },
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

function JournalDetailView({ journal, lines = [], columns = [] }) {
  const { t } = useTranslation('financials');
  if (!journal) return <p className="text-slate-400">{t('journal_not_found')}</p>;
  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-bold uppercase text-slate-500">{t('journal_entry_title')}</div>
        <div className="text-lg font-extrabold">{journal.narration || journal.description}</div>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
          <span>{t('date_label')} {journal.entry_date || journal.journal_date}</span>
          <span>{t('ref_label')} {journal.reference || '—'}</span>
          <span>{t('source_label')} {journal.source_type || journal.source || '—'}</span>
        </div>
      </div>
      <DataTable columns={columns} rows={lines} />
      <div className="mt-3">
        <a href="/financials/journal" className="text-sm font-bold text-blue-600">
          {t('back_journal')}
        </a>
      </div>
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

function JournalNewForm({ accounts = [], body = {}, error = null }) {
  const { t } = useTranslation('financials');
  const lineCount = 4;
  return (
    <form method="POST" action="/financials/journal-new" className="max-w-3xl rounded-xl border bg-white p-6">
      {error ? <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-bold">{t('journal_form.date')}</label>
          <input name="journal_date" type="date" className="hms-input w-full" defaultValue={body.journal_date || ''} required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold">{t('journal_form.reference')}</label>
          <input name="reference" className="hms-input w-full" defaultValue={body.reference || ''} />
        </div>
      </div>
      <div className="mb-4">
        <label className="mb-1 block text-xs font-bold">{t('journal_form.description')}</label>
        <input name="description" className="hms-input w-full" defaultValue={body.description || ''} required />
      </div>
      <div className="mb-2 text-xs font-bold uppercase text-slate-500">{t('journal_form.lines')}</div>
      {Array.from({ length: lineCount }).map((_, i) => (
        <div key={i} className="mb-2 grid gap-2 sm:grid-cols-4">
          <select name={`acc_${i}`} className="hms-input sm:col-span-2" defaultValue={body[`acc_${i}`] || ''}>
            <option value="">{t('journal_form.account')}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_code || a.code} — {a.account_label || a.label || a.label_en}
              </option>
            ))}
          </select>
          <input name={`dr_${i}`} placeholder={t('journal_form.debit_ph')} className="hms-input" defaultValue={body[`dr_${i}`] || ''} />
          <input name={`cr_${i}`} placeholder={t('journal_form.credit_ph')} className="hms-input" defaultValue={body[`cr_${i}`] || ''} />
        </div>
      ))}
      <button type="submit" className="hms-btn hms-btn-primary">
        {t('journal_form.post')}
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
        <input name="settings[company_currency]" className="hms-input w-full" defaultValue={tax.currency_code || 'XAF'} readOnly={!canWrite} />
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
              defaultValue={betterpay.pay_base_url || 'https://pay.betterpay.online/pay'}
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
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('dashboard.income_mtd')} value={`${fmt(m.revenueMtd)} XAF`} tone="brand" icon="arrow-up" />
        <StatCard label={t('dashboard.expenses_mtd')} value={`${fmt(m.expensesMtd)} XAF`} tone="default" icon="arrow-down" />
        <StatCard label={t('dashboard.net_income_mtd')} value={`${fmt(m.netIncomeMtd)} XAF`} tone={netTone} icon="line-chart" />
        <StatCard label={t('dashboard.cash_bank')} value={`${fmt(m.cashBalance)} XAF`} tone="brand" icon="bank" />
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

function PageBody(props) {
  const { t } = useTranslation('financials');
  const { pageKey, formType } = props;

  if (pageKey === 'dashboard') {
    return <DashboardView metrics={props.metrics} recentJournals={props.recentJournals} topAccounts={props.topAccounts} />;
  }
  if (pageKey === 'journal-view') {
    return <JournalDetailView journal={props.journal} lines={props.rows} columns={props.columns} />;
  }
  if (formType === 'expense-new') {
    return <ExpenseNewForm categories={props.categories} body={props.body} error={props.error} />;
  }
  if (formType === 'journal-new') {
    return <JournalNewForm accounts={props.accounts} body={props.body} error={props.error} />;
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
        {props.rows?.length ? (
          <DataTable columns={props.columns} rows={props.rows} />
        ) : (
          <GroupedClassView byClass={props.byClass} classKeys={props.classKeys} />
        )}
      </>
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
            <a href="/financials/expenses/new" className="hms-btn-secondary text-xs">
              {t('expense')}
            </a>
          </div>
        ) : null}
      </SurfaceHero>

      <FinNav active={finNavActive || pageKey} />

      {stats.length ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <StatCard
              key={s.label}
              label={s.label}
              value={s.format === 'money' ? `${fmt(s.value)} XAF` : s.value}
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
