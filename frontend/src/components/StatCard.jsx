const TONES = {
  default: 'text-ink',
  brand: 'text-brand',
  success: 'text-emerald-600',
  warning: 'text-amber-600',
  danger: 'text-red-600'};

const ICON_BG = {
  default: { bg: '#f1f5f9', color: '#475569' },
  brand: { bg: '#dbeafe', color: '#2563eb' },
  success: { bg: '#d1fae5', color: '#059669' },
  warning: { bg: '#fef3c7', color: '#d97706' },
  danger: { bg: '#fee2e2', color: '#dc2626' }};

function normalizeFa(icon) {
  const cls = String(icon || '').trim();
  if (!cls) return '';
  return cls.startsWith('fa-') ? cls : `fa-${cls}`;
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  icon = null,
  size = 'default',
  accentColor = null,
  animated = false,
  animationDelay = 0,
}) {
  const iconCls = normalizeFa(icon);
  const chip = ICON_BG[tone] || ICON_BG.default;
  const dense = size === 'dense';
  const compact = size === 'compact' || dense;
  const useGradient = !!accentColor;

  return (
    <div
      className={`hms-surface-card border border-slate-100 bg-white shadow-card transition duration-300 ${
        dense ? 'rounded-lg p-2' : compact ? 'rounded-xl p-2.5' : 'rounded-2xl p-4'
      } ${animated ? 'hms-staff-kpi-card group' : ''}`}
      style={animated ? { animationDelay: `${animationDelay}ms` } : undefined}
    >
      <div className={`flex items-start gap-2 ${compact ? '' : 'flex-col'}`}>
        {iconCls ? (
          <div
            className={`inline-flex shrink-0 items-center justify-center rounded-lg transition duration-300 ${
              dense
                ? 'h-7 w-7 text-[10px]'
                : compact
                  ? 'h-8 w-8 text-xs'
                  : 'mb-2 h-9 w-9 text-sm'
            } ${animated ? 'hms-staff-kpi-card__icon group-hover:scale-110' : ''}`}
            style={
              useGradient
                ? {
                    background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
                    color: '#fff',
                    boxShadow: `0 4px 12px ${accentColor}40`,
                  }
                : { background: chip.bg, color: chip.color }
            }
          >
            <i className={`fa ${iconCls}`} aria-hidden="true" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div
            className={`hms-stat-card__label uppercase tracking-wide ${
              dense
                ? 'text-[10px] font-bold leading-tight text-slate-800'
                : compact
                  ? 'text-[13px] font-bold leading-snug text-slate-800'
                  : 'text-xs font-bold text-slate-700'
            }`}
          >
            {label}
          </div>
          <div
            className={`font-bold leading-tight ${TONES[tone] || TONES.default} ${
              dense ? 'mt-0.5 text-xs' : compact ? 'mt-0.5 text-sm' : 'mt-1 text-2xl'
            } ${animated ? 'transition duration-300 group-hover:translate-x-0.5' : ''}`}
          >
            {value}
          </div>
          {hint ? (
            <div className={`text-slate-500 ${dense ? 'mt-0.5 text-[10px]' : compact ? 'mt-0.5 text-[10px]' : 'mt-1 text-xs'}`}>{hint}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
