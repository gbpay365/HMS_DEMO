/** Cashier module chrome — matches cashier-module.html reference layout */
import { FaIcon } from '../FaIcon';
import { CashierTopSearch } from './CashierTopSearch';
import { CashierShiftUserMenu } from './CashierShiftUserMenu';

const MAIN_PAGES = [
  { id: 'dashboard', icon: 'th-large', labelKey: 'cashier_odoo.tab_overview', fallback: 'Overview' },
  { id: 'pos', icon: 'credit-card', labelKey: 'cashier_odoo.point_of_sale', fallback: 'Point of Sale' },
  { id: 'bills', icon: 'file-text-o', labelKey: 'cashier_odoo.patient_bills', fallback: 'Bills', chip: 'pending' },
  { id: 'invoices', icon: 'file-text', labelKey: 'cashier_odoo.invoices', fallback: 'Invoices', chip: 'billing' },
  { id: 'insurance', icon: 'shield', labelKey: 'cashier_odoo.insurance', fallback: 'Insurance', chip: 'insurance' },
  { id: 'shift', icon: 'clock-o', labelKey: 'cashier_odoo.shift_summary', fallback: 'Shift' },
  { id: 'refunds', icon: 'undo', labelKey: 'cashier_odoo.refunds', fallback: 'Refunds' },
  { id: 'reports', icon: 'line-chart', labelKey: 'cashier_odoo.tab_reports', fallback: 'Reports' },
];

const PAGE_TITLE_KEYS = {
  dashboard: ['cashier_odoo.page_dashboard', 'Cashier dashboard'],
  pos: ['cashier_odoo.page_pos', 'Point of Sale'],
  bills: ['cashier_odoo.page_bills', 'Patient bills'],
  invoices: ['cashier_odoo.page_invoices', 'Invoices'],
  insurance: ['cashier_odoo.page_insurance', 'Insurance claims'],
  shift: ['cashier_odoo.page_shift', 'Shift summary'],
  refunds: ['cashier_odoo.page_refunds', 'Refunds'],
  reports: ['cashier_odoo.page_reports', 'Revenue analytics'],
};

export function CashierReferenceShell({
  page,
  onPageChange,
  onSearchNavigate,
  onNewBill,
  pendingCount = 0,
  billingPendingCount = 0,
  insurancePendingCount = 0,
  userInitials = 'ZA',
  cashierName = '',
  cashierCode = '',
  shiftLabel = '',
  dateTimeLabel = '',
  balanceLabel = '',
  tOps,
  onEditProfile,
  onChangePassword,
  children,
}) {
  const pageTitle = PAGE_TITLE_KEYS[page] || PAGE_TITLE_KEYS.dashboard;

  return (
    <>
      <div className="shift-bar">
        <div className="shift-dot" aria-hidden="true" />
        <span>
          {tOps('cashier_odoo.shift_open', { defaultValue: 'Shift open' })}
          {shiftLabel ? (
            <>
              {' '}
              · <strong>{shiftLabel}</strong>
            </>
          ) : null}
        </span>
        <span className="shift-bar__meta">
          {cashierName ? (
            <CashierShiftUserMenu
              cashierName={cashierName}
              tOps={tOps}
              onEditProfile={onEditProfile}
              onChangePassword={onChangePassword}
            />
          ) : null}
          {cashierCode ? (
            <>
              {' '}
              &nbsp;|&nbsp; {tOps('cashier_odoo.code_label', { defaultValue: 'Code' })}: <strong>{cashierCode}</strong>
            </>
          ) : null}
          {balanceLabel ? (
            <>
              {' '}
              &nbsp;|&nbsp; {tOps('cashier_odoo.float_label', { defaultValue: 'Balance' })}: <strong>{balanceLabel}</strong>
            </>
          ) : null}
          {dateTimeLabel ? (
            <>
              {' '}
              &nbsp;|&nbsp; {dateTimeLabel}
            </>
          ) : null}
        </span>
        <a href="/cashier?page=reports&report=eod" className="cs-btn cs-btn-sm shift-bar__close-btn">
          <FaIcon name="lock" /> {tOps('cashier_odoo.close_shift', { defaultValue: 'Close shift' })}
        </a>
      </div>

      <header className="cs-topbar">
        <div className="cs-topbar-title">{tOps(pageTitle[0], { defaultValue: pageTitle[1] })}</div>
        <CashierTopSearch onNavigate={onSearchNavigate} />
        {pendingCount > 0 ? (
          <button type="button" className="cs-btn cs-notif" style={{ width: 32, padding: 0, justifyContent: 'center' }} aria-label="Notifications">
            <FaIcon name="bell" style={{ fontSize: 15 }} />
            <span className="cs-notif-dot">{pendingCount > 9 ? '9+' : pendingCount}</span>
          </button>
        ) : null}
        <div className="cs-avatar" style={{ background: 'var(--cs-light)', color: 'var(--cs-primary)', fontSize: 10 }}>
          {userInitials}
        </div>
        <button type="button" className="cs-btn cs-btn-primary" onClick={onNewBill}>
          <FaIcon name="plus" /> {tOps('cashier_odoo.new_bill', { defaultValue: 'New bill' })}
        </button>
      </header>

      <div className="cs-tabs" role="tablist">
        {MAIN_PAGES.map((tab) => {
          const active = page === tab.id;
          let chip = null;
          if (tab.chip === 'pending' && pendingCount > 0) {
            chip = (
              <span className="cs-tab-chip" style={{ background: 'var(--cs-pending-bg)', color: 'var(--cs-pending-text)' }}>
                {pendingCount} {tOps('cashier_odoo.pending_short', { defaultValue: 'pending' })}
              </span>
            );
          }
          if (tab.chip === 'billing' && billingPendingCount > 0) {
            chip = (
              <span className="cs-tab-chip" style={{ background: 'var(--cs-partial-bg)', color: 'var(--cs-partial-text)' }}>
                {billingPendingCount} {tOps('cashier_odoo.invoices_short', { defaultValue: 'open' })}
              </span>
            );
          }
          if (tab.chip === 'insurance' && insurancePendingCount > 0) {
            chip = (
              <span className="cs-tab-chip" style={{ background: 'var(--cs-partial-bg)', color: 'var(--cs-partial-text)' }}>
                {insurancePendingCount} {tOps('cashier_odoo.insurance_short', { defaultValue: 'claims' })}
              </span>
            );
          }
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`cs-tab${active ? ' active' : ''}`}
              onClick={() => onPageChange(tab.id)}
            >
              <FaIcon name={tab.icon} /> {tOps(tab.labelKey, { defaultValue: tab.fallback })}
              {chip}
            </button>
          );
        })}
      </div>

      <main className="cs-content">{children}</main>
    </>
  );
}

export function CashierPageSection({ page, id, children }) {
  return (
    <div id={`page-${id}`} className={`cs-page${page === id ? ' active' : ''}`}>
      {children}
    </div>
  );
}

export function CsBadge({ tone = 'pending', children }) {
  const cls = {
    paid: 'bg-paid',
    pending: 'bg-pending',
    overdue: 'bg-overdue',
    partial: 'bg-partial',
    insurance: 'bg-insurance',
    refunded: 'bg-refunded',
  }[tone] || 'bg-pending';
  return <span className={`cs-badge ${cls}`}>{children}</span>;
}

export function CsKpi({ label, value, sub, color, icon, subColor }) {
  return (
    <div className="cs-kpi" style={{ borderTopColor: color || 'var(--cs-accent)' }}>
      <div className="cs-kpi-label">
        {icon ? <FaIcon name={icon} style={{ color: color || 'var(--cs-accent)' }} /> : null}
        {label}
      </div>
      <div className="cs-kpi-value" style={{ color: color === 'var(--cs-accent)' ? 'var(--cs-primary)' : color || 'var(--cs-primary)' }}>
        {value}
      </div>
      {sub ? (
        <div className="cs-kpi-sub" style={{ color: subColor || '#6B7280' }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

export function InnerWorkflowTab({ active, onClick, icon, label, count }) {
  return (
    <button type="button" className={`cs-inner-tab${active ? ' active' : ''}`} onClick={onClick}>
      <FaIcon name={icon} /> {label}
      {count > 0 ? <span className="cs-tab-chip" style={{ background: 'var(--cs-pending-bg)', color: 'var(--cs-pending-text)' }}>{count}</span> : null}
    </button>
  );
}
