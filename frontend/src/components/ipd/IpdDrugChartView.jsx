import { useTranslation } from 'react-i18next';
import { IpdAdminProtocol } from './IpdAdminProtocol';

export function IpdDrugChartView({ admission = {}, active = null, slots = [], canAdminister = false }) {
  const { t } = useTranslation('ipd');
  const treatmentActive = active && active.status === 'active';

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">{t('treatment.drug_chart_title')}</h1>
          <p className="text-sm text-slate-500">
            {admission.first_name} {admission.last_name} · {admission.ward_name} · {admission.bed_label}
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/ipd/treatment/${admission.id}`} className="hms-btn hms-btn-secondary text-sm">
            {t('shared.treatment')}
          </a>
          <a href={`/ipd/audit/${admission.id}`} className="hms-btn hms-btn-secondary text-sm">
            {t('treatment.audit_trail')}
          </a>
        </div>
      </div>

      {!active ? (
        <p className="rounded-xl border bg-white p-6 text-sm text-slate-500">{t('treatment.no_active_chart')}</p>
      ) : active.status !== 'active' ? (
        <div className="mb-4 rounded-xl border border-slate-300 bg-slate-100 p-4 text-sm text-slate-600">
          {t('treatment.chart_locked', { status: active.status })}
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {t('pages.active_label', { diagnosis: active.diagnosis })}
        </div>
      )}

      {!slots.length ? (
        <p className="rounded-xl border bg-white p-6 text-sm text-slate-400">{t('treatment.no_doses_window')}</p>
      ) : (
        <IpdAdminProtocol
          doseSlots={slots}
          prescriptions={[]}
          inventory={[]}
          canEdit={false}
          canAdminister={canAdminister}
          treatmentActive={!!treatmentActive}
          returnTo="chart"
        />
      )}

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded border border-emerald-400 bg-emerald-50" /> {t('treatment.legend_given')}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded border border-amber-300 bg-white" /> {t('treatment.legend_pending')}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded border border-red-300 bg-red-50" /> {t('treatment.legend_missed')}
        </span>
      </div>
    </>
  );
}
