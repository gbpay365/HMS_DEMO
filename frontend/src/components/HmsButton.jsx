const VARIANTS = {
  primary: 'hms-btn-primary',
  secondary: 'hms-btn-secondary',
  success: 'hms-btn-success',
  warning: 'hms-btn-warning',
  danger: 'hms-btn-danger',
  'outline-primary': 'hms-btn-outline-primary',
  'outline-success': 'hms-btn-outline-success',
  'outline-danger': 'hms-btn-outline-danger',
  ghost: 'hms-btn-ghost',
  start: 'hms-btn-action-start',
  save: 'hms-btn-action-save',
  vitals: 'hms-btn-action-vitals',
  complete: 'hms-btn-action-complete',
  dispense: 'hms-btn-action-dispense'};

function normalizeFa(icon) {
  if (!icon) return '';
  const cls = String(icon).trim();
  return cls.startsWith('fa-') ? cls : `fa-${cls}`;
}

export function HmsButton({
  variant = 'primary',
  size,
  icon,
  iconRight,
  block,
  className = '',
  as: Tag = 'button',
  children,
  ...props
}) {
  const variantCls = VARIANTS[variant] || VARIANTS.primary;
  const sizeCls = size === 'sm' ? 'hms-btn-sm' : size === 'lg' ? 'hms-btn-lg' : '';
  const blockCls = block ? 'hms-btn-block' : '';
  const cls = ['hms-btn', variantCls, sizeCls, blockCls, className].filter(Boolean).join(' ');
  const iconCls = normalizeFa(icon || iconRight);

  return (
    <Tag className={cls} {...props}>
      {icon && !iconRight ? <i className={`fa ${iconCls}`} aria-hidden="true" /> : null}
      {children}
      {iconRight ? <i className={`fa ${iconCls}`} aria-hidden="true" /> : null}
    </Tag>
  );
}
