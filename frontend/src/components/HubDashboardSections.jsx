import { useTranslation } from 'react-i18next';
import { HubStatCard } from './HubStatCard';
import { PortalQuickActionCard } from './PortalQuickActionCard';
import { hubItemLabel } from '../lib/hubI18n';
import { hubStatValue } from '../lib/hubStatCatalog';
import { groupHubModules, groupHubStats } from '../lib/hubLayoutCatalog';

export function HubDashboardSections({
  hubStatItems = [],
  liveHubStats = null,
  hubModuleCards = [],
  portalAccent = '#714b67',
}) {
  const { t } = useTranslation(['legacy', 'nav']);
  const statGroups = groupHubStats(hubStatItems);
  const moduleGroups = groupHubModules(hubModuleCards);

  if (!statGroups.length && !moduleGroups.length) return null;

  return (
    <div className="hms-hub-dashboard space-y-6">
      {statGroups.length > 0 ? (
        <section className="hms-hub-stat-bands space-y-4">
          {statGroups.map((group) => (
            <div key={group.id}>
              <h2 className="hms-hub-section-title">
                {t(group.labelKey, { ns: 'legacy', defaultValue: group.fallback })}
              </h2>
              <div className="hms-hub-stat-row">
                {group.items.map((s) => (
                  <HubStatCard
                    key={s.code}
                    compact
                    label={hubItemLabel(s.code, s.label, t)}
                    value={hubStatValue(liveHubStats, s.code)}
                    icon={s.icon}
                    color={s.color}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {moduleGroups.length > 0 ? (
        <section className="space-y-5">
          {moduleGroups.map((group) => (
            <div key={group.id}>
              <h2 className="hms-hub-section-title">
                {t(group.labelKey, { ns: 'legacy', defaultValue: group.fallback })}
              </h2>
              <div className="hms-hub-module-row">
                {group.items.map((card) => (
                  <PortalQuickActionCard
                    key={card.code}
                    tile={{
                      code: card.code,
                      label: card.label,
                      url: card.url,
                      icon: card.icon,
                      color: card.color,
                    }}
                    accentColor={portalAccent}
                    compact
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
