export function DashboardPanel({
  title,
  icon,
  iconTone = 'brand',
  actionHref,
  actionLabel,
  children,
  className = '',
  bodyClassName = '',
}) {
  const showHead = title || (actionHref && actionLabel);

  return (
    <div className={`hms-dash-panel ${className}`.trim()}>
      {showHead ? (
        <div className="hms-dash-panel__head">
          {title ? (
            <h3 className="hms-dash-panel__title">
              {icon ? (
                <span className={`hms-dash-panel__icon hms-dash-panel__icon--${iconTone}`}>
                  <i className={`fa ${icon}`} aria-hidden="true" />
                </span>
              ) : null}
              {title}
            </h3>
          ) : (
            <span />
          )}
          {actionHref && actionLabel ? (
            <a href={actionHref} className="hms-dash-panel__action">
              {actionLabel}
            </a>
          ) : null}
        </div>
      ) : null}
      <div className={`hms-dash-panel__body ${bodyClassName}`.trim()}>{children}</div>
    </div>
  );
}
