import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';

export const REPORT_HUB_TABS = [
  { id: 'revenue', icon: 'line-chart', labelKey: 'cashier_odoo.reports_hub_revenue', fallback: 'Revenue analytics' },
  { id: 'daily_summary', icon: 'bar-chart', labelKey: 'cashier.daily_summary_link', fallback: "Today's summary", ns: 'clinical' },
  { id: 'eod', icon: 'balance-scale', labelKey: 'cashier.eod_reconciliation_link', fallback: 'Close till (EOD)', ns: 'clinical' },
  { id: 'ledger', icon: 'book', labelKey: 'cashier.ledger_link', fallback: 'Till register', ns: 'clinical' },
];

function labelForTab(tab, tClinical, tOps) {
  if (tab.ns === 'clinical') {
    return tClinical(tab.labelKey, { defaultValue: tab.fallback });
  }
  return tOps(tab.labelKey, { defaultValue: tab.fallback });
}

export function reportHubHref(tabId) {
  const params = new URLSearchParams({ page: 'reports' });
  if (tabId && tabId !== 'revenue') params.set('report', tabId);
  return `/cashier?${params.toString()}`;
}

export function CashierReportHubBar({ activeTab = 'revenue', linkMode = false, onTabChange, className = '' }) {
  const { t: tClinical } = useTranslation('clinical');
  const { t: tOps } = useTranslation('ops');

  return (
    <div className={`rpt-hub-tabs${className ? ` ${className}` : ''}`} role="tablist" aria-label={tOps('cashier_odoo.reports_section_aria', { defaultValue: 'Cashier reports' })}>
      {REPORT_HUB_TABS.map((tab) => {
        const active = activeTab === tab.id;
        const label = labelForTab(tab, tClinical, tOps);
        if (linkMode) {
          return (
            <a
              key={tab.id}
              href={reportHubHref(tab.id)}
              className={`rpt-hub-tab${active ? ' rpt-hub-tab--active' : ''}`}
              role="tab"
              aria-selected={active}
            >
              <FaIcon name={tab.icon} /> {label}
            </a>
          );
        }
        return (
          <button
            key={tab.id}
            type="button"
            className={`rpt-hub-tab${active ? ' rpt-hub-tab--active' : ''}`}
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange?.(tab.id)}
          >
            <FaIcon name={tab.icon} /> {label}
          </button>
        );
      })}
    </div>
  );
}
