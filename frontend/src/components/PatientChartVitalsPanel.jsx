import { useTranslation } from 'react-i18next';
import { formatDate } from '../lib/listUi';
import { displayVital, formatBp, normalizeVitalRow } from '../lib/vitalsUi';

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20';

export function PatientChartVitalsPanel({
  patientId,
  latestVisitId = null,
  vitals = [],
  canRecordVitals = false,
  canSignVitals = false}) {
  const { t } = useTranslation('clinical');
  const normalized = vitals.map(normalizeVitalRow).filter(Boolean);
  const unsignedCount = normalized.filter((v) => !v.doctorSignedAt).length;

  return (
    <div className="space-y-5">
      {canRecordVitals ? (
        <section className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
          <h3 className="mb-1 text-sm font-bold text-slate-900">{t('patientChart.record_vitals_title')}</h3>
          <p className="mb-4 text-xs text-slate-600">{t('patientChart.record_vitals_hint')}</p>
          <form action="/nursing/vitals/save" method="post" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="patient_id" value={patientId} />
            {latestVisitId ? <input type="hidden" name="opd_visit_id" value={latestVisitId} /> : null}
            <input type="hidden" name="redirect_to" value={`/patient-chart/${patientId}`} />
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">{t('patientChart.bp_sys')}</label>
              <input name="bp_sys" type="number" className={inputClass} placeholder="120" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">{t('patientChart.bp_dia')}</label>
              <input name="bp_dia" type="number" className={inputClass} placeholder="80" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">{t('consultation.vital_pulse')}</label>
              <input name="heart_rate" type="number" className={inputClass} placeholder="72" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">{t('consultation.vital_temp')}</label>
              <input name="temp_c" type="number" step="0.1" className={inputClass} placeholder="36.5" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">{t('consultation.vital_spo2')}</label>
              <input name="spo2" type="number" className={inputClass} placeholder="98" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">{t('patientChart.resp_rate')}</label>
              <input name="rr" type="number" className={inputClass} placeholder="18" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">{t('consultation.vital_weight')}</label>
              <input name="weight_kg" type="number" step="0.1" className={inputClass} placeholder="70" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">{t('patientChart.height')}</label>
              <input name="height_cm" type="number" className={inputClass} placeholder="175" />
            </div>
            <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap gap-2 pt-1">
              <button type="submit" className="hms-btn hms-btn-primary text-xs">
                {t('patientChart.save_vitals')}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {canSignVitals && unsignedCount > 0 ? (
        <form action={`/patient-chart/${patientId}/vitals/sign`} method="post" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-sm text-emerald-900">
            {t('patientChart.unsigned_vitals', { count: unsignedCount })}
          </div>
          <button type="submit" name="sign_all" value="1" className="hms-btn hms-btn-primary text-xs">
            {t('patientChart.sign_all_vitals')}
          </button>
        </form>
      ) : null}

      {normalized.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left">{t('patientChart.col_when')}</th>
                <th className="px-2 py-2">{t('consultation.vital_bp')}</th>
                <th className="px-2 py-2">{t('consultation.vital_pulse')}</th>
                <th className="px-2 py-2">{t('consultation.vital_temp')}</th>
                <th className="px-2 py-2">{t('consultation.vital_spo2')}</th>
                <th className="px-2 py-2">{t('patientChart.col_recorded_by')}</th>
                {canSignVitals ? <th className="px-2 py-2">{t('patientChart.col_signed')}</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {normalized.map((v) => (
                <tr key={v.id}>
                  <td className="px-2 py-2 whitespace-nowrap">{v.recordedAt ? formatDate(v.recordedAt) : '—'}</td>
                  <td className="px-2 py-2 text-center">{formatBp(v)}</td>
                  <td className="px-2 py-2 text-center">{displayVital(v.pulse)}</td>
                  <td className="px-2 py-2 text-center">{displayVital(v.temp)}</td>
                  <td className="px-2 py-2 text-center">{displayVital(v.spo2)}</td>
                  <td className="px-2 py-2 text-xs text-slate-500">
                    {v.recordedByName?.trim() || v.sourceStation || '—'}
                  </td>
                  {canSignVitals ? (
                    <td className="px-2 py-2 text-center">
                      {v.doctorSignedAt ? (
                        <span className="text-xs font-semibold text-emerald-700" title={v.doctorSignedByName || ''}>
                          {t('patientChart.signed')}
                        </span>
                      ) : (
                        <form action={`/patient-chart/${patientId}/vitals/sign`} method="post">
                          <input type="hidden" name="vital_id" value={v.id} />
                          <button type="submit" className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-bold text-white">
                            {t('patientChart.sign_vital')}
                          </button>
                        </form>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-slate-400">{t('patientChart.no_vitals')}</p>
      )}
    </div>
  );
}
