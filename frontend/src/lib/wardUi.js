import { tFallback } from './tFallback';

export function ipdStatusPill(status) {
  const s = String(status || 'admitted').toLowerCase();
  const map = {
    admitted: 'bg-sky-100 text-sky-800 ring-sky-200',
    clinical_discharged: 'bg-amber-100 text-amber-900 ring-amber-200',
    discharged: 'bg-emerald-100 text-emerald-800 ring-emerald-200'};
  return {
    label: s.replace(/_/g, ' '),
    className: `inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset ${map[s] || map.admitted}`};
}

export function ipdStatusPillLocalized(status, t) {
  const pill = ipdStatusPill(status);
  const s = String(status || 'admitted').toLowerCase();
  return { ...pill, label: t ? tFallback(t, `status.${s}`, pill.label, { ns: 'ipd' }) : pill.label };
}

export function bedStatusClass(status) {
  const s = String(status || 'available');
  if (s === 'occupied') return 'border-l-4 border-blue-700 bg-gradient-to-br from-sky-50 to-white';
  if (s === 'housekeeping') return 'border-l-4 border-amber-500 bg-amber-50/80';
  return 'border-l-4 border-emerald-500 bg-white';
}

export function formatFcfa(n) {
  return Math.round(Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}
