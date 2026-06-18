/** Font Awesome 4 icon helper — pass name without the `fa-` prefix (e.g. "ambulance"). */
export function FaIcon({ name, className = '' }) {
  if (!name) return null;
  const raw = String(name).trim();
  const iconCls = raw.startsWith('fa-') ? raw : `fa-${raw}`;
  const cls = ['fa', iconCls, className].filter(Boolean).join(' ');
  return <i className={cls} aria-hidden="true" />;
}
