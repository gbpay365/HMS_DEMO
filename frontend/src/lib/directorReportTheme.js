/** Shared theme tokens for director reports — mirrors hms-tokens.css / hms-director-reports.css */
export const RPT = {
  bg: 'var(--hms-surface-bg)',
  surface: 'var(--hms-surface-card)',
  surfaceAlt: 'var(--hms-bg)',
  border: 'var(--hms-surface-border)',
  text: 'var(--hms-ink)',
  textMid: 'var(--hms-text-secondary)',
  textMuted: 'var(--hms-ink-muted)',
  textDim: 'var(--hms-text-tertiary)',
  brand: 'var(--hms-brand)',
  brandDark: 'var(--hms-brand-dark)',
  brandSoft: 'var(--hms-brand-soft)',
  brandLight: 'var(--hms-brand-light)',
  blue: 'var(--hms-dept-radiology)',
  blueLight: '#e0f2fe',
  green: 'var(--hms-brand)',
  greenLight: 'var(--hms-brand-light)',
  amber: 'var(--hms-warning)',
  amberLight: '#fef3c7',
  red: 'var(--hms-danger)',
  redLight: '#fee2e2',
  purple: 'var(--hms-dept-laboratory)',
  purpleLight: '#ede9fe',
  teal: '#0891b2',
  finance: 'var(--hms-dept-finance)',
  financeLight: '#e0e7ff',
  chartGrid: '#f1f5f9',
  chartPie: [
    'var(--hms-dept-radiology)',
    'var(--hms-brand)',
    'var(--hms-dept-laboratory)',
    '#0891b2',
    'var(--hms-warning)',
  ],
};

export const DOMAIN_COLORS = {
  clinical: 'var(--hms-dept-radiology)',
  financial: 'var(--hms-brand-dark)',
  patient: 'var(--hms-dept-laboratory)',
  workforce: 'var(--hms-warning)',
  safety: 'var(--hms-danger)',
};

export function chartTooltipStyle() {
  return {
    contentStyle: {
      background: '#ffffff',
      border: `1px solid ${RPT.border}`,
      borderRadius: 10,
      fontSize: 12,
      boxShadow: 'var(--hms-shadow-card)',
    },
    labelStyle: { color: RPT.text, fontWeight: 600, marginBottom: 4 },
    itemStyle: { color: RPT.textMid },
  };
}

export function deltaTone(value, invert = false) {
  if (value === 0 || value == null) return { label: '±0', className: 'is-neutral', color: RPT.textDim };
  const up = value > 0;
  const good = invert ? !up : up;
  return {
    label: `${up ? '▲' : '▼'} ${Math.abs(value)}`,
    className: good ? 'is-good' : 'is-bad',
    color: good ? RPT.green : RPT.red,
  };
}
