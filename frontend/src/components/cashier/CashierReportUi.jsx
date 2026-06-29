import { FaIcon } from '../FaIcon';

export function methodKey(pm) {
  const raw = String(pm || '').trim().toLowerCase();
  if (!raw) return 'other';
  if (raw.includes('momo') || raw === 'mobile money' || raw === 'mobile_money') return 'momo';
  if (raw.includes('orange') || raw === 'om') return 'om';
  if (raw.includes('wallet')) return 'wallet';
  if (raw.includes('ussd')) return 'ussd';
  if (raw.includes('bank') || raw.includes('transfer')) return 'bank';
  if (raw.includes('pos') || raw.includes('card')) return 'pos';
  if (raw.includes('betterpay') || raw.includes('qr')) return 'betterpay';
  if (raw.includes('paystack')) return 'paystack';
  if (raw.includes('cash')) return 'cash';
  if (raw.includes('insurance')) return 'insurance';
  return 'other';
}

const METHOD_META = {
  cash: { icon: 'money', tone: 'cash' },
  momo: { icon: 'mobile', tone: 'momo' },
  om: { icon: 'mobile', tone: 'om' },
  wallet: { icon: 'credit-card', tone: 'wallet' },
  ussd: { icon: 'phone', tone: 'ussd' },
  bank: { icon: 'university', tone: 'bank' },
  pos: { icon: 'credit-card-alt', tone: 'pos' },
  betterpay: { icon: 'qrcode', tone: 'betterpay' },
  paystack: { icon: 'cc-stripe', tone: 'paystack' },
  insurance: { icon: 'shield', tone: 'insurance' },
  other: { icon: 'ellipsis-h', tone: 'other' },
};

export const CATEGORY_ICONS = {
  consultation: 'stethoscope',
  laboratory: 'flask',
  radiology: 'film',
  pharmacy: 'medkit',
  maternity: 'female',
  hospitalization: 'hospital-o',
  emergency: 'ambulance',
  surgery: 'scissors',
  nursing: 'heartbeat',
  material: 'cubes',
  service: 'cog',
  other: 'ellipsis-h',
};

export function PaymentMethodChip({ method, label }) {
  const key = methodKey(method || label);
  const meta = METHOD_META[key] || METHOD_META.other;
  return (
    <span className={`cs-ledger-method cs-ledger-method--${meta.tone}`}>
      <FaIcon name={meta.icon} className="cs-ledger-method__icon" />
      <span>{label || method || '—'}</span>
    </span>
  );
}

export function TxnTypeBadge({ type }) {
  const isReceipt = String(type || '').toLowerCase() === 'receipt';
  return (
    <span className={`cs-ledger-txn cs-ledger-txn--${isReceipt ? 'receipt' : 'refund'}`}>
      <FaIcon name={isReceipt ? 'arrow-circle-down' : 'arrow-circle-up'} />
      <span>{type || '—'}</span>
    </span>
  );
}

export function ReportTh({ icon, children, numeric = false, className = '' }) {
  return (
    <th className={`${numeric ? 'cs-ledger-num' : ''} ${className}`.trim()}>
      {icon ? <FaIcon name={icon} className="cs-ledger-th-icon" /> : null}
      <span>{children}</span>
    </th>
  );
}

export function ReportSkeleton({ rows = 4 }) {
  return (
    <div className="cs-ledger-skeleton" aria-hidden="true">
      <div className="cs-ledger-skeleton__bar cs-ledger-skeleton__bar--short" />
      <div className="cs-ledger-skeleton__card">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="cs-ledger-skeleton__row" style={{ animationDelay: `${i * 0.07}s` }} />
        ))}
      </div>
    </div>
  );
}

export function ReportLoading({ message }) {
  return (
    <div className="cs-ledger-loading">
      <FaIcon name="spinner" className="cs-ledger-loading__spin" />
      <p>{message}</p>
      <ReportSkeleton />
    </div>
  );
}

export function ReportError({ message }) {
  return (
    <p className="rpt-daily-error cs-ledger-error">
      <FaIcon name="exclamation-triangle" /> {message}
    </p>
  );
}

export function ReportFlash({ message, icon = 'check-circle' }) {
  return (
    <p className="rpt-daily-flash cs-rpt-flash">
      <FaIcon name={icon} /> {message}
    </p>
  );
}

export function ReportKpiTile({ icon, label, value, sub, tone = 'default', delay = 0 }) {
  return (
    <div className="col-4">
      <div className={`cs-kpi rpt-kpi cs-rpt-kpi cs-rpt-kpi--${tone}`} style={{ animationDelay: `${delay}s` }}>
        <div className="cs-rpt-kpi__icon">
          <FaIcon name={icon} />
        </div>
        <div className="cs-kpi-label">{label}</div>
        <div className="cs-kpi-value">{value}</div>
        {sub ? <div className="cs-kpi-sub">{sub}</div> : null}
      </div>
    </div>
  );
}

export function CategoryLabel({ categoryKey, label }) {
  const icon = CATEGORY_ICONS[categoryKey] || CATEGORY_ICONS.other;
  return (
    <span className="cs-rpt-cat">
      <FaIcon name={icon} className="cs-rpt-cat__icon" />
      <span>{label}</span>
    </span>
  );
}
