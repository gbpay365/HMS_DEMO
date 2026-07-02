import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { formatDate } from '../lib/listUi';
import { MaternityChartBillingPanel, MaternityChartTabContent } from '../components/maternity/MaternityChartTabContent';

const TABS = [
  { id: 'anc', key: 'tab_anc' },
  { id: 'risk', key: 'tab_risk' },
  { id: 'scans', key: 'tab_scans' },
  { id: 'labor', key: 'tab_labor' },
  { id: 'delivery', key: 'tab_delivery' },
  { id: 'newborn', key: 'tab_newborn' },
  { id: 'postnatal', key: 'tab_postnatal' },
  { id: 'complications', key: 'tab_complications' },
];

export function MaternityChartPageApp({
  summary = {},
  billing = null,
  tab = 'anc',
  deliveryId = null,
  laborId = null,
  flash = null,
  error = null}) {
  const { t } = useTranslation('legacy');
  const tc = (k, def) => t(`maternity_chart.${k}`, { defaultValue: def });
  const p = summary.patient || {};
  const patientId = p.id;
  const activeTab = TABS.some((x) => x.id === tab) ? tab : 'anc';
  const chartBase = `/maternity/chart/${patientId}`;

  return (
    <div className="maternity-chart-react">
      <FlashMessages flash={flash} error={error} />

      <div className="hms-surface-hero mb-3 py-3 px-3">
        <p className="mb-0 small">
          G{p.gravida}P{p.para}A{p.abortion} · {tc('lmp', 'LMP')} {formatDate(p.lmp)} · {tc('edd', 'EDD')} {formatDate(p.edd)}
          <span className={`risk-pill ${p.risk_level} ml-2`}>{p.risk_level} {tc('risk_suffix', 'risk')}</span>
        </p>
      </div>

      <MaternityChartBillingPanel billing={billing} />

      <ul className="nav nav-tabs mat-tabs mb-3">
        {TABS.map((x) => (
          <li key={x.id} className="nav-item">
            <a
              className={`nav-link ${activeTab === x.id ? 'active' : ''}`}
              href={`${chartBase}?tab=${x.id}`}
            >
              {tc(x.key, x.id)}
            </a>
          </li>
        ))}
      </ul>

      <MaternityChartTabContent
        tab={activeTab}
        patientId={patientId}
        summary={summary}
        billing={billing}
        deliveryId={deliveryId}
        laborId={laborId}
      />
    </div>
  );
}
