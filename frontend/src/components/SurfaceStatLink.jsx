import { useTranslation } from 'react-i18next';

function normalizeIcon(icon) {
  const cls = String(icon || 'fa-bar-chart').trim();
  return cls.startsWith('fa-') ? cls : `fa-${cls}`;
}

export function SurfaceStatLink({
  href,
  label,
  value,
  icon = 'fa-bar-chart',
  color = '#475569',
  hint = null,
  valueless = false,
  tone = null}) {
  const { t } = useTranslation('dashboard');
  const iconCls = normalizeIcon(icon);
  const accent = tone === 'danger' ? 'var(--hms-danger, #ef4444)' : color;
  const className = `hms-stat-link no-underline${tone === 'danger' ? ' hms-stat-link--danger' : ''}`;

  return (
    <a
      href={href}
      className={className}
      style={{ '--hms-stat-accent': accent }}
    >
      <span className="hms-stat-link__orb" aria-hidden="true" />
      <span className="hms-stat-link__icon">
        <i className={`fa ${iconCls}`} aria-hidden="true" />
      </span>
      <span className="hms-stat-link__body">
        <span className="hms-stat-link__label">{label}</span>
        {valueless ? (
          <span className="hms-stat-link__shortcut">{t('open_shortcut')}</span>
        ) : (
          <span className="hms-stat-link__value">{value ?? 0}</span>
        )}
        {hint ? <span className="hms-stat-link__hint">{hint}</span> : null}
      </span>
    </a>
  );
}
