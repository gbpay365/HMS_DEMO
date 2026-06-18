export function normCat(v) {
  return String(v || 'service').trim().toLowerCase() || 'service';
}

export function tabCat(v) {
  const s = normCat(v);
  if (s === 'radiology' || s === 'scan') return 'scans_imaging';
  return s;
}

export function prettyCat(v) {
  const s = normCat(v);
  if (s === 'scans_imaging' || s === 'radiology' || s === 'scan') return 'Scans & Imaging';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const BADGE_TONES = {
  laboratory: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  pharmacy: 'bg-sky-50 text-sky-800 ring-sky-200',
  maternity: 'bg-pink-50 text-pink-800 ring-pink-200',
  scans_imaging: 'bg-violet-50 text-violet-800 ring-violet-200',
  surgery: 'bg-amber-50 text-amber-900 ring-amber-200',
  consultation: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
  ward: 'bg-slate-100 text-slate-700 ring-slate-200',
  procedure: 'bg-orange-50 text-orange-900 ring-orange-200',
  service: 'bg-slate-50 text-slate-700 ring-slate-200'};

export function catBadgeClass(v) {
  const s = tabCat(v);
  return BADGE_TONES[s] || BADGE_TONES.service;
}

export const CATALOG_CATEGORIES = [
  { value: '', label: 'Service' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'laboratory', label: 'Laboratory' },
  { value: 'scans_imaging', label: 'Scans & Imaging' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'ward', label: 'Ward' },
  { value: 'maternity', label: 'Maternity' },
  { value: 'surgery', label: 'Surgery' },
  { value: 'procedure', label: 'Procedure' },
];

export function serviceSearchBlob(service) {
  const cat = tabCat(service.category);
  const name = String(service.name || '');
  const dept = String(service.department_name || '');
  const price = Number(service.price || 0);
  return `${prettyCat(cat)} ${name} ${dept} ${price}`.toLowerCase();
}
