import { useTranslation } from 'react-i18next';
import { postForm } from '../../lib/listUi';
import { bedStatusClass, formatFcfa, ipdStatusPillLocalized } from '../../lib/wardUi';

function patientInitials(firstName, lastName) {
  const a = String(firstName || '').trim().charAt(0);
  const b = String(lastName || '').trim().charAt(0);
  return (a + b).toUpperCase() || '?';
}

function WardBedAction({ href, onClick, icon, label, tone = 'default', className = '' }) {
  const tones = {
    default:
      'border-slate-200/90 bg-white text-slate-700 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-900',
    message:
      'border-sky-200 bg-sky-50 text-sky-800 hover:border-sky-300 hover:bg-sky-100',
    violet:
      'border-violet-200 bg-violet-600 text-white hover:bg-violet-700',
    danger:
      'border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-300 hover:bg-rose-100'};
  const cls = `flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[10px] font-bold shadow-sm transition ${tones[tone] || tones.default} ${className}`;

  if (href) {
    return (
      <a href={href} className={cls}>
        <i className={`fa ${icon} text-[11px] opacity-80`} aria-hidden="true" />
        <span>{label}</span>
      </a>
    );
  }

  return (
    <button type="button" className={cls} onClick={onClick}>
      <i className={`fa ${icon} text-[11px] opacity-80`} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export function WardBedCard({
  bed,
  userRole = '',
  onAdmit,
  onClinicalDc,
  onCallDischarge,
  onTransferDrop,
  onDragStart,
  onMessage}) {
  const { t } = useTranslation('ipd');
  const isClinDc = bed.clinical_discharged_at && !bed.discharged_at;
  const canDoctor = userRole === '1' || userRole === '2' || userRole === '99';
  const pill = ipdStatusPillLocalized(isClinDc ? 'clinical_discharged' : bed.ipd_status || 'admitted', t);
  const cardClass = isClinDc
    ? 'border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-white ring-violet-100'
    : bedStatusClass(bed.status);

  if (bed.status === 'housekeeping') {
    return (
      <div className={`rounded-2xl border p-3 shadow-card ring-1 ring-slate-100 ${cardClass}`}>
        <div className="mb-2 flex items-center justify-between">
          <div className="font-bold text-ink">{bed.bed_label}</div>
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
        </div>
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-orange-600">
          <i className="fa fa-refresh" aria-hidden="true" />
          {t('bed.cleaning')}
        </div>
        <button
          type="button"
          className="hms-btn-primary w-full py-2 text-xs"
          onClick={() => postForm('/wards/bed-ready', { bed_id: bed.id })}
        >
          <i className="fa fa-check mr-1" aria-hidden="true" />
          {t('bed.mark_ready')}
        </button>
      </div>
    );
  }

  if (bed.status === 'available') {
    return (
      <div
        className={`rounded-2xl border p-3 shadow-card ring-1 ring-slate-100 ${cardClass}`}
        onDragOver={(ev) => {
          ev.preventDefault();
          ev.currentTarget.classList.add('ring-2', 'ring-emerald-400');
        }}
        onDragLeave={(ev) => {
          ev.currentTarget.classList.remove('ring-2', 'ring-emerald-400');
        }}
        onDrop={(ev) => {
          ev.preventDefault();
          ev.currentTarget.classList.remove('ring-2', 'ring-emerald-400');
          onTransferDrop?.(ev, bed.id);
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="font-bold text-ink">{bed.bed_label}</div>
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </div>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-emerald-700">
          <i className="fa fa-check-circle" aria-hidden="true" />
          {t('bed.available')}
        </div>
        <button type="button" className="hms-btn-secondary w-full py-2 text-xs" onClick={() => onAdmit?.(bed)}>
          <i className="fa fa-user-plus mr-1" aria-hidden="true" />
          {t('bed.admit_patient')}
        </button>
      </div>
    );
  }

  const patientName = [bed.first_name, bed.last_name].filter(Boolean).join(' ').trim();
  const accentClass = isClinDc ? 'from-violet-600 to-fuchsia-500' : 'from-blue-700 to-sky-500';
  const avatarClass = isClinDc ? 'from-violet-600 to-fuchsia-500' : 'from-blue-700 to-sky-500';

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border shadow-card ring-1 transition hover:shadow-lg ${cardClass} ${isClinDc ? 'cursor-pointer ring-violet-100' : 'ring-slate-100'}`}
      onClick={isClinDc ? () => onCallDischarge?.(bed) : undefined}
      role={isClinDc ? 'button' : undefined}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accentClass}`} />

      {isClinDc ? (
        <div className="mx-3 mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
          <i className="fa fa-hand-pointer-o" aria-hidden="true" />
          {t('bed.tap_discharge')}
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-2 px-3 pb-2 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          {bed.admission_id ? (
            <span
              draggable
              className="flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-sky-200 hover:text-sky-700 active:cursor-grabbing"
              onDragStart={(ev) => onDragStart?.(ev, bed.admission_id)}
              onClick={(ev) => ev.stopPropagation()}
              title={t('bed.drag_transfer')}
            >
              <i className="fa fa-arrows text-xs" aria-hidden="true" />
            </span>
          ) : null}
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-extrabold tracking-wide text-slate-700">
            {bed.bed_label}
          </span>
        </div>
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${isClinDc ? 'bg-violet-600' : 'bg-blue-700'}`} />
      </div>

      <div className="px-3 pb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-sm font-extrabold text-white shadow-sm ${avatarClass}`}
          >
            {patientInitials(bed.first_name, bed.last_name)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold text-ink">{patientName || '—'}</div>
            <div className="truncate text-[11px] text-slate-500">
              <i className="fa fa-hospital-o mr-1 text-[10px] opacity-70" aria-hidden="true" />
              {bed.admitting_department || t('shared.dept_general')}
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className={`${pill.className}`}>{pill.label}</span>
          {bed.admitting_department === 'Maternity' || bed.maternity_labor_id ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2 py-0.5 text-[10px] font-bold text-pink-800 ring-1 ring-inset ring-pink-200">
              <i className="fa fa-female text-[10px]" aria-hidden="true" />
              {t('bed.maternity')}
              {bed.maternity_labor_status === 'in_labor' ? ` · ${t('bed.in_labor')}` : ''}
            </span>
          ) : null}
          {bed.running_bill > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-inset ring-rose-200">
              <i className="fa fa-money text-[10px]" aria-hidden="true" />
              {formatFcfa(bed.running_bill)}
            </span>
          ) : null}
        </div>
      </div>

      {bed.admission_id ? (
        <div className="grid grid-cols-2 gap-1.5 border-t border-slate-100 bg-slate-50/70 p-2" onClick={(ev) => ev.stopPropagation()}>
          {!bed.clinical_discharged_at && canDoctor ? (
            <WardBedAction
              icon="fa-sign-out"
              label={t('bed.clinical_dc')}
              tone="danger"
              className="col-span-2"
              onClick={() => onClinicalDc?.(bed)}
            />
          ) : null}
          {bed.clinical_discharged_at && !bed.discharged_at ? (
            <WardBedAction
              icon="fa-phone"
              label={t('bed.call_discharge')}
              tone="violet"
              className="col-span-2"
              onClick={() => onCallDischarge?.(bed)}
            />
          ) : null}
          <WardBedAction
            href={`/ipd/treatment/${bed.admission_id}`}
            icon="fa-medkit"
            label={t('shared.treatment')}
          />
          <WardBedAction
            href={`/ipd/shift/${bed.admission_id}`}
            icon="fa-exchange"
            label={t('handover.short_label')}
          />
          <WardBedAction
            href={`/nursing/supply-requests?admission_id=${bed.admission_id}&patient=${encodeURIComponent(`${bed.first_name || ''} ${bed.last_name || ''}`.trim())}&ward=${encodeURIComponent(bed.ward_name || '')}`}
            icon="fa-medkit"
            label={t('supply.short_label')}
          />
          <WardBedAction icon="fa-envelope-o" label={t('pages.message')} tone="message" onClick={() => onMessage?.(bed)} />
          <WardBedAction
            href={`/patient-chart/${bed.adm_patient_id || bed.patient_id}`}
            icon="fa-folder-open-o"
            label={t('bed.patient_chart')}
            className="col-span-2"
          />
        </div>
      ) : null}
    </div>
  );
}
