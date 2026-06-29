import { useTranslation } from 'react-i18next';
import { tileLabel } from '../lib/tileI18n';

function resolveTileHref(tile) {
  const raw = String(tile?.url || tile?.href || '').trim();
  if (!raw || raw === '#' || raw === '__home__') return '';
  return raw;
}

function FaTileIcon({ icon, color, compact, dense, animated }) {
  const cls = icon?.startsWith('fa-') ? icon : icon ? `fa-${icon}` : 'fa-th-large';
  const sizeClass = dense
    ? 'h-9 w-9 rounded-lg text-sm'
    : compact
      ? 'h-11 w-11 rounded-2xl text-lg'
      : 'h-14 w-14 rounded-2xl text-2xl';
  return (
    <span
      className={`flex shrink-0 items-center justify-center text-white shadow-md transition duration-300 ${sizeClass} ${
        animated ? 'hms-staff-action-card__icon group-hover:scale-110 group-hover:-rotate-3' : ''
      }`}
      style={{
        background: `linear-gradient(135deg, ${color}, ${color}cc)`,
        boxShadow: `0 4px 14px ${color}45`,
      }}
    >
      <i className={`fa ${cls}`} aria-hidden="true" />
    </span>
  );
}

function resolveTileHint(tile, t) {
  const url = resolveTileHref(tile).split('?')[0].trim();
  const hintKey = `portalQuick.hints.${url}`;
  const direct = t(hintKey);
  if (direct) return direct;
  const base = url.split('/').filter(Boolean)[0];
  if (base === 'hr') return t('portalQuick.hr_self_service');
  if (base === 'catalog') return t('portalQuick.catalog_tariffs');
  return t('portalQuick.open_workspace');
}

export function PortalQuickActionCard({
  tile,
  accentColor = '#714b67',
  compact = false,
  dense = false,
  animationDelay = 0,
}) {
  const { t } = useTranslation(['clinical', 'nav']);
  const color = tile.color || accentColor;
  const href = resolveTileHref(tile);
  const hint = resolveTileHint(tile, t);
  const label = tileLabel(tile.code, tile.label, t);

  const handleClick = (e) => {
    if (!href) {
      e.preventDefault();
      return;
    }
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    document.documentElement.classList.add('hms-nav-pending');
    if (e.defaultPrevented) {
      window.location.assign(href);
    }
  };

  if (dense) {
    return (
      <a
        href={href || '#'}
        onClick={handleClick}
        className="hms-staff-action-card group flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 shadow-card transition duration-300 hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-lg"
        style={{ animationDelay: `${animationDelay}ms` }}
      >
        <FaTileIcon icon={tile.icon} color={color} dense animated />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-ink transition duration-300 group-hover:text-brand">
            {label}
          </div>
          <div className="truncate text-xs leading-snug text-slate-500">{hint}</div>
        </div>
        <span
          className="shrink-0 text-slate-300 transition duration-300 group-hover:translate-x-1 group-hover:text-brand"
          aria-hidden="true"
        >
          →
        </span>
      </a>
    );
  }

  if (compact) {
    return (
      <a
        href={href || '#'}
        onClick={handleClick}
        className="group flex cursor-pointer flex-col items-center rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-card transition hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-lg"
      >
        <FaTileIcon icon={tile.icon} color={color} compact />
        <span className="mt-3 text-xs font-bold leading-snug text-ink">{label}</span>
      </a>
    );
  }

  return (
    <a
      href={href || '#'}
      onClick={handleClick}
      className="group relative flex min-h-[132px] cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card transition hover:-translate-y-1 hover:border-slate-200 hover:shadow-xl"
    >
      <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${color}, ${color}55)` }} />
      <div className="flex flex-1 flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <FaTileIcon icon={tile.icon} color={color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-extrabold leading-snug text-ink">{label}</h3>
            <span
              className="mt-0.5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500"
              aria-hidden="true"
            >
              →
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{hint}</p>
        </div>
      </div>
    </a>
  );
}

export function PortalQuickActions({ tiles = [], accentColor = '#714b67', dense = false }) {
  const { t } = useTranslation('clinical');
  if (!tiles.length) return null;

  const compact = !dense && tiles.length > 6;
  const gridClass = dense
    ? 'grid gap-2 sm:grid-cols-2 lg:grid-cols-3'
    : compact
      ? 'grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'
      : tiles.length <= 3
        ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
        : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  return (
    <section className={dense ? 'mb-4' : 'mb-6'}>
      <div className={`flex items-end justify-between gap-3 ${dense ? 'mb-2' : 'mb-4'}`}>
        <div>
          <h2 className={`font-extrabold text-ink ${dense ? 'text-xs uppercase tracking-wider text-slate-500' : 'text-lg'}`}>
            {t('portalQuick.title')}
          </h2>
          {!dense ? <p className="text-xs text-slate-500">{t('portalQuick.subtitle')}</p> : null}
        </div>
        {!dense ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {tiles.length} {tiles.length === 1 ? t('portalQuick.shortcut') : t('portalQuick.shortcuts')}
          </span>
        ) : null}
      </div>
      <div className={gridClass}>
        {tiles.map((tile, idx) => (
          <PortalQuickActionCard
            key={tile.code || tile.url}
            tile={tile}
            accentColor={accentColor}
            compact={compact}
            dense={dense}
            animationDelay={dense ? idx * 80 + 120 : 0}
          />
        ))}
      </div>
    </section>
  );
}
