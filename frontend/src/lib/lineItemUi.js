/** Shared order-line / section styling — neutral surface shell with brand accents. */
const SURFACE_ORDER_THEME = {
  shell: 'border-slate-200/80 bg-white ring-1 ring-slate-100/80',
  header: 'border-slate-100 text-slate-700',
  icon: 'from-emerald-500 to-teal-600',
  addBtn: 'border-slate-200 text-brand hover:bg-brand-light',
  footer: 'border-slate-100 bg-slate-50 text-slate-600',
  rowHover: 'hover:border-slate-200',
  dash: 'text-slate-400',
  variant: 'default'};

const MOCDOC_ORDER_THEME = {
  shell: '',
  header: '',
  icon: '',
  addBtn: '',
  footer: '',
  rowHover: '',
  dash: 'text-orange-500',
  variant: 'mocdoc'};

export const ORDER_THEMES = {
  plan: SURFACE_ORDER_THEME,
  pharmacy: SURFACE_ORDER_THEME,
  lab: MOCDOC_ORDER_THEME,
  radiology: MOCDOC_ORDER_THEME,
  mocdoc: MOCDOC_ORDER_THEME};

export function lineGradient() {
  return 'from-[#1a9e9e] to-[#148585] shadow-teal-500/25';
}

export function fmtCatalogPrice(n) {
  const v = parseFloat(n || 0);
  return Number.isFinite(v) ? Math.round(v).toLocaleString('fr-FR') : '0';
}
