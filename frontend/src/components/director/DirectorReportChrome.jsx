import { RPT, deltaTone } from '../../lib/directorReportTheme';

export function DirectorReportShell({ children, variant = 'daily' }) {
  return <div className={`hms-director-report hms-director-report--${variant}`}>{children}</div>;
}

export function DirectorReportHero({ icon = 'fa-line-chart', title, subtitle, actions, live, liveLabel }) {
  return (
    <div className="hms-dr-hero">
      <div className="hms-dr-hero__brand">
        <div className="hms-dr-hero__icon" aria-hidden="true">
          <i className={`fa ${icon}`} />
        </div>
        <div className="min-w-0">
          <div className="hms-dr-hero__title">{title}</div>
          {subtitle ? <div className="hms-dr-hero__sub">{subtitle}</div> : null}
        </div>
      </div>
      <div className="hms-dr-hero__actions">
        {live ? (
          <div className="hms-dr-live">
            <div className="hms-dr-live__dot" aria-hidden="true" />
            <span>{liveLabel || 'Live'}</span>
          </div>
        ) : null}
        {actions}
      </div>
    </div>
  );
}

export function DirectorReportTabs({ tabs, active, onChange, badgeFor }) {
  if (!tabs?.length) return null;
  return (
    <div className="hms-dr-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`hms-dr-tab${active === tab.id ? ' is-active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {badgeFor?.(tab) ? <span className="hms-dr-tab__badge">{badgeFor(tab)}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function DirectorReportBody({ children, flush }) {
  return <div className={flush ? 'hms-dr-body hms-dr-body--flush' : 'hms-dr-body'}>{children}</div>;
}

export function DirectorReportInner({ children }) {
  return <div className="hms-dr-inner">{children}</div>;
}

export function DirectorPeriodPills({ items, value, onChange, onSurface }) {
  if (!items?.length) return null;
  return (
    <div className={`hms-dr-pills${onSurface ? ' hms-dr-pills--surface' : ''}`}>
      {items.map((item) => {
        const key = item.key ?? item.value;
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            className={`hms-dr-pill${active ? ' is-active' : ''}`}
            onClick={() => onChange(key)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function DirectorKpiCard({ label, value, sub, subColor, accent = RPT.brand, icon = 'fa-bar-chart', delta, deltaSuffix, invertDelta, spark }) {
  const d = delta != null ? deltaTone(delta, invertDelta) : null;
  return (
    <div className="hms-dr-kpi" style={{ '--hms-dr-kpi-accent': accent, '--hms-dr-kpi-accent-soft': `${accent}22` }}>
      <div className="hms-dr-kpi__head">
        <span className="hms-dr-kpi__label">{label}</span>
        <span className="hms-dr-kpi__icon" aria-hidden="true">
          <i className={`fa ${icon}`} />
        </span>
      </div>
      <div className="hms-dr-kpi__value">{value}</div>
      {sub ? (
        <div className="hms-dr-kpi__sub" style={subColor ? { color: subColor } : undefined}>
          {sub}
        </div>
      ) : null}
      {d ? (
        <div className={`hms-dr-kpi__delta ${d.className}`}>
          {d.label}
          {deltaSuffix ? <span style={{ color: RPT.textDim, fontWeight: 400 }}> {deltaSuffix}</span> : null}
        </div>
      ) : null}
      {spark}
    </div>
  );
}

export function DirectorPanel({ children, className = '' }) {
  return <div className={`hms-dr-panel ${className}`.trim()}>{children}</div>;
}

export function DirectorSection({ eyebrow, title, subtitle, accent = RPT.brand, children }) {
  return (
    <div className="hms-dr-section" style={{ '--hms-dr-section-accent': accent }}>
      {eyebrow ? <div className="hms-dr-section__eyebrow">{eyebrow}</div> : null}
      <div className="hms-dr-section__title">{title}</div>
      {subtitle ? <div className="hms-dr-section__sub">{subtitle}</div> : null}
      {children}
    </div>
  );
}

export function DirectorPeriodHead({ title, subtitle }) {
  return (
    <div className="hms-dr-period-head">
      <div className="hms-dr-period-head__title">{title}</div>
      {subtitle ? <div className="hms-dr-period-head__sub">{subtitle}</div> : null}
    </div>
  );
}

export function DirectorReportError({ children, onRetry, retryLabel }) {
  return (
    <div className="hms-dr-error">
      {children}
      {onRetry ? (
        <>
          {' '}
          <button type="button" onClick={onRetry} className="underline" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            {retryLabel || 'Try again'}
          </button>
        </>
      ) : null}
    </div>
  );
}

export function DirectorReportLoading({ children }) {
  return <div className="hms-dr-loading">{children}</div>;
}

export function DirectorPortalNav({ label, children }) {
  return (
    <div className="hms-dr-portal-nav">
      {label ? <div className="hms-dr-portal-nav__label">{label}</div> : null}
      <div className="hms-dr-portal-nav__tabs">{children}</div>
    </div>
  );
}

export function DirectorPortalTab({ active, onClick, children }) {
  return (
    <button type="button" className={`hms-dr-portal-tab${active ? ' is-active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}
