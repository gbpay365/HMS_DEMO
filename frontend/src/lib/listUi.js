import { notifyError } from './notifyBridge';
import { tFallback } from './tFallback';
import { formatMoney as formatHmsMoney, currencyCode as profileCurrencyCode } from './hmsLocale';

export function appointmentStatus(status) {
  const s = Number(status);
  if (s === 1) return { variant: 'confirmed', label: 'Confirmed', key: 'confirmed' };
  if (s === 2) return { variant: 'completed', label: 'Completed', key: 'completed' };
  if (s === 0) return { variant: 'cancelled', label: 'Cancelled', key: 'cancelled' };
  if (s === 3) return { variant: 'pending', label: 'Pending confirmation', key: 'pending' };
  return { variant: 'pending', label: 'Pending', key: 'pending' };
}

/** Prefer portal_state when present (online booking lifecycle). */
export function appointmentRecordStatus(appt) {
  const ps = String(appt?.portal_state || '').trim().toLowerCase();
  if (ps === 'confirmed') return { variant: 'confirmed', label: 'Confirmed', key: 'confirmed' };
  if (ps === 'pending') return { variant: 'pending', label: 'Pending confirmation', key: 'pending' };
  if (ps === 'declined') return { variant: 'cancelled', label: 'Declined', key: 'declined' };
  if (ps === 'cancelled') return { variant: 'cancelled', label: 'Cancelled', key: 'cancelled' };
  return appointmentStatus(appt?.status);
}

export function appointmentVisitTypeLabel(t, visitType) {
  const vt = String(visitType || 'in_person').toLowerCase();
  if (vt === 'telemedicine') {
    return t('appointments.visit_telemedicine', { ns: 'clinical' });
  }
  return t('appointments.visit_in_person', { ns: 'clinical' });
}

export function appointmentStatusLabel(t, status) {
  const st = appointmentStatus(status);
  return tFallback(t, `appointments.status.${st.key}`, st.label, { ns: 'clinical' });
}

export function appointmentRecordStatusLabel(t, appt) {
  const st = appointmentRecordStatus(appt);
  return tFallback(t, `appointments.status.${st.key}`, st.label, { ns: 'clinical' });
}

export function patientTypeBadge(patientType) {
  const t = String(patientType || '');
  const isIp = t === 'InPatient';
  return { variant: isIp ? 'danger' : 'success', label: t || '—', key: isIp ? 'inpatient' : 'outpatient' };
}

export function patientTypeLabel(tFn, patientType) {
  const pt = String(patientType || '');
  if (pt === 'InPatient') return tFn('patients.type_inpatient', { ns: 'ops' });
  if (pt === 'OutPatient') return tFn('patients.type_outpatient', { ns: 'ops' });
  return pt || '—';
}

const BADGE_STYLES = {
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  completed: 'bg-slate-100 text-slate-700 ring-slate-200',
  cancelled: 'bg-red-50 text-red-700 ring-red-200',
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  warning: 'bg-orange-50 text-orange-800 ring-orange-200',
};

export function badgeClass(variant) {
  return `inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${BADGE_STYLES[variant] || BADGE_STYLES.pending}`;
}

export function hasPerm(userPerms, key) {
  const p = userPerms || [];
  if (p.includes('*')) return true;
  if (Array.isArray(key)) return key.some((k) => p.includes(k));
  return p.includes(key);
}

/** Hospital-wide date display: DD/MM/YYYY */
export const HMS_DATE_LOCALE = 'en-GB';

export function formatDate(value) {
  if (value == null || value === '') return '—';
  const s = String(value).trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(HMS_DATE_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return s;
  }
}

/** Hospital-wide date+time display: DD/MM/YYYY, HH:MM */
export function formatDateTime(value) {
  if (value == null || value === '') return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(HMS_DATE_LOCALE, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return String(value);
  }
}

export function formatMoney(amount) {
  return formatHmsMoney(amount);
}

export function moneyCurrencyCode() {
  return profileCurrencyCode();
}

export function employeeStatus(status) {
  const active = Number(status) === 1;
  return { variant: active ? 'success' : 'cancelled', label: active ? 'Active' : 'Inactive', key: active ? 'active' : 'inactive' };
}

export function employeeStatusLabel(t, status) {
  const st = employeeStatus(status);
  return tFallback(t, `employees.status_${st.key}`, st.label, { ns: 'ops' });
}

export function prescriptionStatus(status) {
  const s = String(status || 'ORDERED').toUpperCase();
  if (/DISPENS|COMPLET|FILLED/.test(s)) return { variant: 'completed', label: s };
  if (/CANCEL/.test(s)) return { variant: 'cancelled', label: s };
  if (/PARTIAL/.test(s)) return { variant: 'info', label: s };
  return { variant: 'pending', label: s };
}

export function transactionStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'completed') return { variant: 'success', label: 'Completed', key: 'completed' };
  if (s === 'cancelled') return { variant: 'cancelled', label: 'Cancelled', key: 'cancelled' };
  return { variant: 'pending', label: status || 'Pending', key: 'pending' };
}

export function transactionStatusLabel(t, status) {
  const st = transactionStatus(status);
  return tFallback(t, `billing.status_${st.key}`, st.label, { ns: 'ops' });
}

export function inventoryStockStatus(qty, reorder) {
  const q = Number(qty) || 0;
  const r = Number(reorder) || 0;
  if (q === 0) return { variant: 'cancelled', label: 'Out of Stock', key: 'out' };
  if (q <= r) return { variant: 'pending', label: 'Low Stock', key: 'low' };
  return { variant: 'success', label: 'Available', key: 'available' };
}

export function inventoryStockStatusLabel(t, qty, reorder) {
  const st = inventoryStockStatus(qty, reorder);
  const keyMap = { out: 'stock_out', low: 'stock_low', available: 'stock_available' };
  return tFallback(t, `inventory.${keyMap[st.key]}`, st.label, { ns: 'ops' });
}

const OPD_STATUS_STYLES = {
  registered: 'bg-sky-100 text-sky-800 ring-sky-200',
  triage: 'bg-amber-100 text-amber-900 ring-amber-200',
  waiting_doctor: 'bg-orange-100 text-orange-900 ring-orange-200',
  in_consultation: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  orders_pending: 'bg-violet-100 text-violet-800 ring-violet-200',
  billing: 'bg-pink-100 text-pink-800 ring-pink-200',
  completed: 'bg-slate-100 text-slate-600 ring-slate-200',
  cancelled: 'bg-red-100 text-red-800 ring-red-200',
};

export function opdQueueStatus(status) {
  const s = String(status || 'registered').toLowerCase();
  const label = s.replace(/_/g, ' ');
  return { key: s, label, className: OPD_STATUS_STYLES[s] || OPD_STATUS_STYLES.registered };
}

export function opdQueueStatusLabel(t, status) {
  const st = opdQueueStatus(status);
  return tFallback(t, `opd.status.${st.key}`, st.label, { ns: 'clinical' });
}

export function postForm(url, fields = {}) {
  const f = document.createElement('form');
  f.method = 'POST';
  f.action = url;
  Object.entries(fields).forEach(([k, v]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = k;
    input.value = v == null ? '' : String(v);
    f.appendChild(input);
  });
  document.body.appendChild(f);
  f.submit();
}

/** POST expecting JSON (sets Accept + X-Requested-With so server never returns HTML redirects). */
export async function postJson(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: body !== undefined ? JSON.stringify(body) : '{}',
  });
  const ct = String(r.headers.get('content-type') || '');
  if (!ct.includes('application/json')) {
    const snippet = (await r.text()).replace(/\s+/g, ' ').slice(0, 120);
    if (r.status === 404) {
      throw new Error(
        'API route not found. Restart the HMS server after updating, then try again.'
      );
    }
    throw new Error(`Server error (${r.status}). ${snippet}`);
  }
  const data = await r.json();
  return { response: r, data };
}

/** POST multipart file upload; follows server redirect to show flash messages. */
export async function postFileUpload(url, file, fieldName = 'file') {
  const fd = new FormData();
  fd.append(fieldName, file);
  const res = await fetch(url, {
    method: 'POST',
    body: fd,
    credentials: 'same-origin',
    redirect: 'manual',
  });
  if (res.type === 'opaqueredirect' || res.status === 0) {
    window.location.href = '/catalog';
    return;
  }
  const loc = res.headers.get('Location');
  if (loc && res.status >= 300 && res.status < 400) {
    window.location.href = loc;
    return;
  }
  if (res.ok) {
    window.location.reload();
    return;
  }
  let message = 'Upload failed.';
  try {
    const text = await res.text();
    if (text) message = text.slice(0, 200);
  } catch (_) {}
  notifyError(message);
}

export function labStatus(status, revisionPending) {
  if (Number(revisionPending) === 1) {
    return { variant: 'warning', label: 'Return for correction', key: 'revision' };
  }
  const s = String(status || '').toLowerCase();
  if (s === 'completed' || s === 'done') return { variant: 'completed', label: 'Completed', key: 'completed' };
  if (s === 'received') return { variant: 'success', label: 'Results ready', key: 'received' };
  if (s === 'in_progress') return { variant: 'info', label: 'In progress', key: 'in_progress' };
  if (s === 'pending') return { variant: 'pending', label: 'Pending', key: 'pending' };
  if (s === 'external') return { variant: 'info', label: 'External', key: 'external' };
  return { variant: 'pending', label: status || 'Pending', key: 'pending' };
}

export function labStatusLabel(t, status) {
  const st = labStatus(status);
  return tFallback(t, `laboratory.status_${st.key}`, st.label, { ns: 'ops' });
}

export function buildPageUrl(base, page, query = {}, pageParam = 'p') {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v != null && v !== '') params.set(k, String(v));
  });
  if (page > 1) params.set(pageParam, String(page));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
