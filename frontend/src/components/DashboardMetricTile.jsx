import { useTranslation } from 'react-i18next';

function normalizeIcon(icon) {
  const cls = String(icon || 'fa-bar-chart').trim();
  return cls.startsWith('fa-') ? cls : `fa-${cls}`;
}

export function DashboardMetricTile({
  href,
  label,
  value,
  icon = 'fa-bar-chart',
  color = '#475569',
  hint = null,
  valueless = false,
  tone = null,
}) {
  const { t } = useTranslation('dashboard');
  const iconCls = normalizeIcon(icon);
  const accent = tone === 'danger' ? 'var(--hms-danger, #ef4444)' : color;

  return (
    <a
      href={href}
      className={`hms-dash-tile no-underline${tone === 'danger' ? ' hms-dash-tile--danger' : ''}`}
      style={{ '--dash-tile-accent': accent }}
    >
      <span className="hms-dash-tile__accent" aria-hidden="true" />
      <span className="hms-dash-tile__icon">
        <i className={`fa ${iconCls}`} aria-hidden="true" />
      </span>
      <span className="hms-dash-tile__body">
        <span className="hms-dash-tile__label">{label}</span>
        {valueless ? (
          <span className="hms-dash-tile__action">{t('open_shortcut')}</span>
        ) : (
          <span className="hms-dash-tile__value">{value ?? 0}</span>
        )}
        {hint ? <span className="hms-dash-tile__hint">{hint}</span> : null}
      </span>
      <i className="fa fa-angle-right hms-dash-tile__chev" aria-hidden="true" />
    </a>
  );
}
