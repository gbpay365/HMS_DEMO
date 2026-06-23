import { useTranslation } from 'react-i18next';
import { tileLabel } from '../lib/tileI18n';

function resolveTileHref(tile) {
  const raw = String(tile?.url || tile?.href || '').trim();
  if (!raw || raw === '#' || raw === '__home__') return '';
  return raw;
}

function FaTileIcon({ icon, color, compact }) {
  const cls = icon?.startsWith('fa-') ? icon : icon ? `fa-${icon}` : 'fa-th-large';
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-2xl text-white shadow-md ${
        compact ? 'h-11 w-11 text-lg' : 'h-14 w-14 text-2xl'
      }`}
      style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
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

export function PortalQuickActionCard({ tile, accentColor = '#714b67', compact = false }) {
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

export function PortalQuickActions({ tiles = [], accentColor = '#714b67' }) {
  const { t } = useTranslation('clinical');
  if (!tiles.length) return null;

  const compact = tiles.length > 6;
  const gridClass = compact
    ? 'grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'
    : tiles.length <= 3
      ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
      : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  return (
    <section className="mb-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-ink">{t('portalQuick.title')}</h2>
          <p className="text-xs text-slate-500">{t('portalQuick.subtitle')}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {tiles.length} {tiles.length === 1 ? t('portalQuick.shortcut') : t('portalQuick.shortcuts')}
        </span>
      </div>
      <div className={gridClass}>
        {tiles.map((tile) => (
          <PortalQuickActionCard
            key={tile.code || tile.url}
            tile={tile}
            accentColor={accentColor}
            compact={compact}
          />
        ))}
      </div>
    </section>
  );
}
