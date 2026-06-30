import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { FaIcon } from '../components/FaIcon';

const MENU_KEYS = [
  { href: '/ipd/hospitalizations', icon: 'clipboard', titleKey: 'menu_hosp', descKey: 'menu_hosp_desc' },
  { href: '/wards', icon: 'bed', titleKey: 'menu_wards', descKey: 'menu_wards_desc' },
  { href: '/ipd/medication', icon: 'medkit', titleKey: 'menu_meds', descKey: 'menu_meds_desc' },
  { href: '/ipd/handover', icon: 'refresh', titleKey: 'menu_handover', descKey: 'menu_handover_desc' },
  { href: '/nursing/supply-requests', icon: 'cube', titleKey: 'menu_supply', descKey: 'menu_supply_desc' },
  { href: '/ipd/ward-rounds', icon: 'stethoscope', titleKey: 'menu_rounds', descKey: 'menu_rounds_desc' },
  { href: '/ipd/census', icon: 'users', titleKey: 'menu_census', descKey: 'menu_census_desc' },
  { href: '/death-registry?source=ipd', icon: 'heart-o', titleKey: 'menu_death', descKey: 'menu_death_desc' },
  { href: '/cashier/ipd-settle', icon: 'credit-card', titleKey: 'menu_settle', descKey: 'menu_settle_desc' },
  { href: '/ipd/config', icon: 'cog', titleKey: 'menu_config', descKey: 'menu_config_desc' },
];

export function IpdHubPageApp({ stats = {}, bedStats = {}, flash = null, error = null }) {
  const { t } = useTranslation('ipd');

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="hospital-o" title={t('hub.title')} subtitle={t('hub.subtitle')} />

        <div className="hms-compact-kpi-grid mb-4">
          <StatCard label={t('hub.kpi_active')} value={stats.active_count || 0} tone="brand" icon="bed" />
          <StatCard label={t('hub.kpi_beds')} value={bedStats.avail || 0} tone="brand" icon="check-circle" />
          <StatCard label={t('hub.kpi_awaiting')} value={stats.awaiting_financial || 0} tone="warning" icon="clock" />
          <StatCard label={t('hub.kpi_completed')} value={stats.completed_count || 0} tone="default" icon="flag-checkered" />
        </div>

        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">{t('hub.menus_title')}</h2>
        <div className="hms-compact-kpi-grid">
          {MENU_KEYS.map((m) => (
            <a
              key={m.href}
              href={m.href}
              className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-light text-xl text-brand">
                <FaIcon name={m.icon} />
              </span>
              <div className="font-bold text-ink">{t(`hub.${m.titleKey}`)}</div>
              <div className="mt-1 text-xs text-slate-500">{t(`hub.${m.descKey}`)}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
