const TONES = {
  default: 'text-ink',
  brand: 'text-brand',
  warning: 'text-amber-600',
  danger: 'text-red-600'};

const ICON_BG = {
  default: { bg: '#f1f5f9', color: '#475569' },
  brand: { bg: '#dbeafe', color: '#2563eb' },
  warning: { bg: '#fef3c7', color: '#d97706' },
  danger: { bg: '#fee2e2', color: '#dc2626' }};

function normalizeFa(icon) {
  const cls = String(icon || '').trim();
  if (!cls) return '';
  return cls.startsWith('fa-') ? cls : `fa-${cls}`;
}

export function StatCard({ label, value, hint, tone = 'default', icon = null }) {
  const iconCls = normalizeFa(icon);
  const chip = ICON_BG[tone] || ICON_BG.default;

  return (
    <div className="hms-surface-card rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
      {iconCls ? (
        <div
          className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm"
          style={{ background: chip.bg, color: chip.color }}
        >
          <i className={`fa ${iconCls}`} aria-hidden="true" />
        </div>
      ) : null}
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${TONES[tone] || TONES.default}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}
