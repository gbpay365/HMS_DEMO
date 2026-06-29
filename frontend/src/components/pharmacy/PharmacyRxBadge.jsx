const RX_BADGE = {
  'rx-new': { cls: 'ph-badge-rx-new', labelKey: 'pharmacy.rx_status_new' },
  'rx-preparing': { cls: 'ph-badge-rx-prep', labelKey: 'pharmacy.rx_status_preparing' },
  'rx-ready': { cls: 'ph-badge-rx-ready', labelKey: 'pharmacy.rx_status_ready' },
  'rx-dispensed': { cls: 'ph-badge-rx-dispensed', labelKey: 'pharmacy.rx_status_dispensed' },
  'rx-out-of-stock': { cls: 'ph-badge-rx-out', labelKey: 'pharmacy.rx_status_out_of_stock' },
  'rx-partial': { cls: 'ph-badge-rx-partial', labelKey: 'pharmacy.rx_status_partial' },
  'rx-cancelled': { cls: 'ph-badge-rx-cancelled', labelKey: 'pharmacy.rx_status_cancelled' },
};

export function PharmacyRxBadge({ status, label, t }) {
  const cfg = RX_BADGE[status] || RX_BADGE['rx-new'];
  const text = label || (t ? t(cfg.labelKey) : status);
  return <span className={`ph-rx-badge ${cfg.cls}`}>{text}</span>;
}

export function rxStatusStep(status) {
  const map = {
    'rx-new': 0,
    'rx-preparing': 1,
    'rx-out-of-stock': 1,
    'rx-ready': 2,
    'rx-partial': 2,
    'rx-dispensed': 3,
    'rx-cancelled': 0,
  };
  return map[status] ?? 0;
}
