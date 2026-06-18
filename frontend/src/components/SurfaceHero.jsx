function normalizeFa(icon) {
  const cls = String(icon || '').trim();
  if (!cls) return '';
  return cls.startsWith('fa-') ? cls : `fa-${cls}`;
}

export function SurfaceHero({ icon, badge, title, subtitle, children, className = '' }) {
  const iconCls = normalizeFa(icon);

  return (
    <div className={`hms-surface-hero mb-6 ${className}`.trim()}>
      {badge ? (
        <div className="hms-icon-chip mb-2">
          {iconCls ? <i className={`fa ${iconCls}`} aria-hidden="true" /> : null}
          {badge}
        </div>
      ) : iconCls ? (
        <div className="hms-surface-hero-icon">
          <i className={`fa ${iconCls}`} aria-hidden="true" />
        </div>
      ) : null}
      <h1 className="hms-surface-hero-title">{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      {children}
    </div>
  );
}
