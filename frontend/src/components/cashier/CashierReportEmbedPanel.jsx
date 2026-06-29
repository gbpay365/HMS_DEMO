import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';

const EMBED_CONFIG = {
  eod: {
    src: '/cashier/eod-reconciliation',
    titleKey: 'cashier.eod_reconciliation_link',
    titleFallback: 'Close till (EOD)',
    openKey: 'cashier.daily_summary.open_full',
    openFallback: 'Open full page',
  },
  ledger: {
    src: '/cashier/ledger',
    titleKey: 'cashier.ledger_link',
    titleFallback: 'Till register',
    openKey: 'cashier.ledger.open_full',
    openFallback: 'Open full page',
  },
};

export function CashierReportEmbedPanel({ view = 'eod' }) {
  const { t } = useTranslation('clinical');
  const cfg = EMBED_CONFIG[view] || EMBED_CONFIG.eod;

  return (
    <div className="rpt-embed-wrap">
      <div className="rpt-embed-toolbar">
        <span className="rpt-embed-title">{t(cfg.titleKey, { defaultValue: cfg.titleFallback })}</span>
        <a href={cfg.src} target="_blank" rel="noopener noreferrer" className="cs-btn cs-btn-sm">
          <FaIcon name="external-link" /> {t(cfg.openKey, { defaultValue: cfg.openFallback })}
        </a>
      </div>
      <iframe title={t(cfg.titleKey, { defaultValue: cfg.titleFallback })} src={cfg.src} className="rpt-embed-frame" />
    </div>
  );
}
