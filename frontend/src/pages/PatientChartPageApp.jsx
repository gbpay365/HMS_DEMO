import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterChip } from '../components/FilterChip';
import { FlashMessages } from '../components/FlashMessages';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { PatientChartVitalsPanel } from '../components/PatientChartVitalsPanel';
import {
  isChartLabPrintable,
  isChartRadPrintable,
  labReportId,
  openDiagPatientBatchPrint} from '../lib/diagBatchPrint';
import { formatDate } from '../lib/listUi';

function parseStructuredLabResult(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function labResultPreview(row) {
  const structured = parseStructuredLabResult(row.structured_result || row.result_template_json);
  const resultRows = Array.isArray(structured?.results) ? structured.results : [];
  const values = resultRows
    .filter((r) => r && r.value != null && String(r.value).trim() !== '')
    .slice(0, 4)
    .map((r) => `${r.label || r.key}: ${r.value}${r.unit ? ` ${r.unit}` : ''}`);

  if (values.length) return values.join(' · ');
  if (structured?.conclusion) return structured.conclusion;
  if (row.notes) return String(row.notes).split('\n').filter(Boolean).slice(0, 2).join(' · ');
  if (row.conclusion_code) return row.conclusion_code;
  return '';
}

export function PatientChartPageApp({
  patient = {},
  allergies = [],
  medications = [],
  vitals = [],
  activeInsurance = null,
  labResults = [],
  radResults = [],
  consultations = [],
  latestOpdVisitId = null,
  prescriptions = [],
  patientSmart = null,
  maternityEpisode = null,
  vaccinationSummary = null,
  chartShowFollowUpOpd = false,
  chartCanRecordVitals = false,
  chartCanSignVitals = false,
  chartVitalsBlockReason = '',
  flash = null,
  error = null}) {
  const { t } = useTranslation('clinical');
  const TABS = useMemo(
    () => [
      { id: 'vitals', label: t('patientChart.tab_vitals'), icon: '❤️' },
      { id: 'consult', label: t('patientChart.tab_consult'), key: 'consultations' },
      { id: 'lab', label: t('patientChart.tab_lab'), key: 'labResults' },
      { id: 'rad', label: t('patientChart.tab_rad'), key: 'radResults' },
      { id: 'rx', label: t('patientChart.tab_rx'), key: 'prescriptions' },
      { id: 'meds', label: t('patientChart.tab_meds') },
      { id: 'insurance', label: t('patientChart.tab_insurance') },
      ...(maternityEpisode ? [{ id: 'maternity', label: t('patientChart.tab_maternity') }] : []),
      ...(vaccinationSummary ? [{ id: 'vaccination', label: t('patientChart.tab_vaccination') }] : []),
    ],
    [t, maternityEpisode, vaccinationSummary]
  );
  const [tab, setTab] = useState('vitals');
  const [labPrintIds, setLabPrintIds] = useState(new Set());
  const [radPrintIds, setRadPrintIds] = useState(new Set());
  const initials = `${(patient.first_name || '?')[0]}${(patient.last_name || '?')[0]}`;
  const patientId = patient.id || patient.patient_id || '';
  const latestVisitId =
    latestOpdVisitId ||
    consultations.reduce((best, c) => {
      const vid = parseInt(c.visit_id, 10) || 0;
      return vid > best ? vid : best;
    }, 0) ||
    '';
  const newConsultHref = patientId
    ? `/consultation-new?patient_id=${patientId}${latestVisitId ? `&visit_id=${latestVisitId}` : ''}`
    : '/opd-queue';

  function consultationOpenHref(c) {
    if (!patientId) return '/opd-queue';
    const params = new URLSearchParams({ patient_id: String(patientId) });
    if (c.visit_id) params.set('visit_id', String(c.visit_id));
    if (c.consult_id) params.set('edit_id', String(c.consult_id));
    return `/consultation-new?${params.toString()}`;
  }

  function countForTab(t) {
    if (t.key === 'consultations') return consultations.length;
    if (t.key === 'labResults') return labResults.length;
    if (t.key === 'radResults') return radResults.length;
    if (t.key === 'prescriptions') return prescriptions.length;
    return null;
  }

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2">
      <FlashMessages flash={flash} error={error} />

      <SurfaceHero
        badge={initials}
        title={`${patient.first_name} ${patient.last_name}`}
        subtitle={[patient.patient_code || `PT-${patient.id}`, patient.gender, patient.phone].filter(Boolean).join(' · ')}
      >
        <div className="hms-surface-hero-chips mt-3">
          <span className="hms-icon-chip">{patient.patient_type || t('patientChart.outpatient')}</span>
          {patientSmart
            ? Object.entries(patientSmart)
                .filter(([, v]) => v > 0)
                .slice(0, 4)
                .map(([k, v]) => (
                  <span key={k} className="hms-icon-chip">
                    {v} {k.replace(/_/g, ' ')}
                  </span>
                ))
            : null}
          {patient.next_of_kin_name ? (
            <span className="hms-icon-chip">
              {t('patientChart.emergency_contact')}: {patient.next_of_kin_name}
            </span>
          ) : null}
        </div>
        <div className="hms-surface-hero-actions mt-4">
          <a href="/patients" className="hms-btn-secondary text-xs">
            {t('patientChart.all_patients')}
          </a>
          <a href={`/patient-chart/${patientId}/passport`} target="_blank" rel="noopener noreferrer" className="hms-btn-secondary text-xs">
            <i className="fa fa-id-card-o" aria-hidden="true" />
            {t('patientChart.medical_passport')}
          </a>
          <a href={`/patient-chart/${patientId}/passport.pdf`} className="hms-btn-secondary text-xs">
            <i className="fa fa-download" aria-hidden="true" />
            {t('patientChart.passport_pdf')}
          </a>
          <a href={newConsultHref} className="hms-btn-primary text-xs">
            {t('patientChart.new_consultation')}
          </a>
          {chartShowFollowUpOpd ? (
            <a href={`/clinical/follow-up-opd?patient_id=${patient.id}`} className="hms-btn-secondary text-xs">
              {t('patientChart.follow_up')}
            </a>
          ) : null}
        </div>
      </SurfaceHero>

      <div className="hms-compact-kpi-grid mb-3">
        <StatCard label={t('patientChart.tab_consult')} value={consultations.length} tone="brand" icon="stethoscope" />
        <StatCard label={t('patientChart.tab_lab')} value={labResults.length} tone="default" icon="flask" />
        <StatCard label={t('patientChart.tab_rad')} value={radResults.length} tone="default" icon="film" />
        <StatCard label={t('patientChart.tab_vitals')} value={vitals.length} tone="brand" icon="heartbeat" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((tabItem) => (
          <FilterChip
            key={tabItem.id}
            active={tab === tabItem.id}
            onClick={() => setTab(tabItem.id)}
            count={countForTab(tabItem)}
          >
            {tabItem.icon ? `${tabItem.icon} ` : ''}
            {tabItem.label}
          </FilterChip>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {tab === 'vitals' ? (
          <>
            {chartVitalsBlockReason && !chartCanRecordVitals ? (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                {chartVitalsBlockReason}
              </div>
            ) : null}
            <PatientChartVitalsPanel
              patientId={patientId}
              latestVisitId={latestVisitId}
              vitals={vitals}
              canRecordVitals={chartCanRecordVitals}
              canSignVitals={chartCanSignVitals}
            />
          </>
        ) : null}

        {tab === 'consult' ? (
          consultations.length ? (
            <ul className="divide-y divide-slate-100">
              {consultations.map((c) => (
                <li key={c.id} className="py-3">
                  <div className="font-bold">{c.created_at ? formatDate(c.created_at) : '—'}</div>
                  <div className="text-sm text-slate-600">{c.chief_complaint || c.diagnosis || t('patientChart.consult_record')}</div>
                  <a
                    href={consultationOpenHref(c)}
                    className="text-xs text-blue-600"
                  >
                    {t('shared.open')}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-400">{t('patientChart.no_consultations')}</p>
          )
        ) : null}

        {tab === 'lab' ? (
          labResults.length ? (
            <>
              <div className="mb-3 flex flex-wrap justify-end gap-2">
                {labPrintIds.size > 0 ? (
                  <button
                    type="button"
                    className="rounded-full border border-violet-300 bg-violet-100 px-4 py-2 text-xs font-bold text-violet-900 hover:bg-violet-200"
                    onClick={() => {
                      openDiagPatientBatchPrint('laboratory', patientId, {
                        print: true,
                        ids: [...labPrintIds]});
                    }}
                  >
                    {t('patientChart.print_selected_lab', {
                      count: labPrintIds.size})}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-bold text-violet-800 hover:bg-violet-100"
                  onClick={() => openDiagPatientBatchPrint('laboratory', patientId)}
                >
                  {t('patientChart.print_all_lab')}
                </button>
              </div>
              <ul className="divide-y divide-slate-100">
              {labResults.map((r) => {
                const reportId = labReportId(r);
                const preview = labResultPreview(r);
                const status = String(r.status || '').trim();
                const printable = isChartLabPrintable(r);
                const checked = printable && labPrintIds.has(reportId);
                return (
                  <li key={reportId || `${r.test_name || 'lab'}-${r.created_at || ''}`} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {printable ? (
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-600"
                          checked={checked}
                          onChange={() => {
                            setLabPrintIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(reportId)) next.delete(reportId);
                              else next.add(reportId);
                              return next;
                            });
                          }}
                        />
                      ) : (
                        <span className="mt-1 w-4" />
                      )}
                      <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900">{r.test_name || r.exam_name || t('patientChart.lab_test')}</div>
                      {preview ? <div className="mt-1 text-slate-600">{preview}</div> : null}
                      <div className="mt-1 text-xs text-slate-400">
                        {r.created_at ? formatDate(r.created_at) : ''}
                        {status ? ` · ${status}` : ''}
                      </div>
                      </div>
                    </div>
                    {reportId ? (
                      <a
                        href={`/laboratory/report/${reportId}`}
                        className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700"
                      >
                        {t('patientChart.view_report')}
                      </a>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-400">
                        {t('patientChart.report_unavailable')}
                      </span>
                    )}
                  </li>
                );
              })}
              </ul>
            </>
          ) : (
            <p className="text-slate-400">{t('patientChart.no_lab')}</p>
          )
        ) : null}

        {tab === 'rad' ? (
          radResults.length ? (
            <>
              <div className="mb-3 flex flex-wrap justify-end gap-2">
                {radPrintIds.size > 0 ? (
                  <button
                    type="button"
                    className="rounded-full border border-sky-300 bg-sky-100 px-4 py-2 text-xs font-bold text-sky-900 hover:bg-sky-200"
                    onClick={() => {
                      openDiagPatientBatchPrint('radiology', patientId, {
                        print: true,
                        ids: [...radPrintIds]});
                    }}
                  >
                    {t('patientChart.print_selected_rad', {
                      count: radPrintIds.size})}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-bold text-sky-800 hover:bg-sky-100"
                  onClick={() => openDiagPatientBatchPrint('radiology', patientId)}
                >
                  {t('patientChart.print_all_rad')}
                </button>
              </div>
              <ul className="divide-y divide-slate-100">
              {radResults.map((r) => {
                const reportId = parseInt(String(r.id || ''), 10) || 0;
                const printable = isChartRadPrintable(r);
                const checked = printable && radPrintIds.has(reportId);
                return (
                <li key={r.id} className="flex justify-between gap-3 py-3 text-sm">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {printable ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-sky-600"
                        checked={checked}
                        onChange={() => {
                          setRadPrintIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(reportId)) next.delete(reportId);
                            else next.add(reportId);
                            return next;
                          });
                        }}
                      />
                    ) : (
                      <span className="w-4" />
                    )}
                    <span>{r.exam_name || t('patientChart.imaging')}</span>
                  </div>
                  <a href={`/radiology/report/${r.id}`} className="text-blue-600">
                    {t('patientChart.report')}
                  </a>
                </li>
              );})}
              </ul>
            </>
          ) : (
            <p className="text-slate-400">{t('patientChart.no_rad')}</p>
          )
        ) : null}

        {tab === 'rx' ? (
          prescriptions.length ? (
            <ul className="divide-y divide-slate-100">
              {prescriptions.map((r) => (
                <li key={r.id} className="py-3 text-sm">
                  <div className="font-bold">{r.title || t('patientChart.prescription')}</div>
                  <div className="text-slate-600">{r.items || r.notes || ''}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-400">{t('patientChart.no_rx')}</p>
          )
        ) : null}

        {tab === 'meds' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 font-bold">{t('patientChart.allergies')}</h3>
              {allergies.length ? (
                <ul className="list-disc pl-5 text-sm">
                  {allergies.map((a, i) => (
                    <li key={i}>{a.allergen || a.description || JSON.stringify(a)}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">{t('patientChart.nkda')}</p>
              )}
            </div>
            <div>
              <h3 className="mb-2 font-bold">{t('patientChart.medications')}</h3>
              {medications.length ? (
                <ul className="list-disc pl-5 text-sm">
                  {medications.map((m, i) => (
                    <li key={i}>{m.name || m.drug_name || m.description}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">{t('patientChart.none_recorded')}</p>
              )}
            </div>
          </div>
        ) : null}

        {tab === 'insurance' ? (
          activeInsurance ? (
            <div className="text-sm">
              <div className="font-bold">{activeInsurance.plan_name || activeInsurance.insurer_name}</div>
              <div className="text-slate-500">{t('patientChart.member')}: {activeInsurance.member_id || '—'}</div>
              <a href={`/patients/${patient.id}/insurance`} className="text-blue-600">
                {t('patientChart.manage_coverage')}
              </a>
            </div>
          ) : (
            <p className="text-slate-400">{t('patientChart.no_insurance')}</p>
          )
        ) : null}

        {tab === 'maternity' && maternityEpisode ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-xl border border-pink-200 bg-pink-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase text-pink-800">{t('patientChart.maternity_episode')}</div>
                  <div className="text-lg font-extrabold text-pink-950">{maternityEpisode.antenatal_number}</div>
                  <div className="mt-1 text-pink-900">
                    G{maternityEpisode.gravida}P{maternityEpisode.para} · {maternityEpisode.risk_level} {t('patientChart.risk')}
                  </div>
                  {maternityEpisode.lmp ? (
                    <div className="text-pink-800">
                      {t('patientChart.lmp')}: {formatDate(maternityEpisode.lmp)}
                      {maternityEpisode.edd ? ` · ${t('patientChart.edd')}: ${formatDate(maternityEpisode.edd)}` : ''}
                    </div>
                  ) : null}
                  {maternityEpisode.labor_status ? (
                    <div className="mt-2 inline-flex rounded-full bg-white px-3 py-1 text-xs font-bold text-pink-900">
                      {t('patientChart.labor_status', { status: maternityEpisode.labor_status })}
                    </div>
                  ) : null}
                </div>
                <a href={maternityEpisode.chart_url} className="hms-btn hms-btn-primary text-xs">
                  {t('patientChart.open_maternity_chart')}
                </a>
              </div>
            </div>
            {maternityEpisode.babies?.length ? (
              <div>
                <h3 className="mb-2 font-bold">{t('patientChart.linked_babies')}</h3>
                <ul className="divide-y divide-slate-100">
                  {maternityEpisode.babies.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        {b.neonatal_number || t('patientChart.baby')}
                        {b.baby_nicu_admission ? ` · ${t('patientChart.nicu')}` : ''}
                      </span>
                      {b.patient_id ? (
                        <a href={`/patient-chart/${b.patient_id}`} className="text-blue-600">
                          {b.patient_code || `#${b.patient_id}`}
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'vaccination' && vaccinationSummary ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase text-emerald-800">{t('patientChart.vaccination_summary')}</div>
                  <div className="mt-1 text-emerald-900">
                    {t('patientChart.total_doses', { count: vaccinationSummary.total_doses })}
                    {vaccinationSummary.due_count > 0 ? (
                      <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                        {t('patientChart.due_followups', { count: vaccinationSummary.due_count })}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href={vaccinationSummary.chart_url} className="hms-btn hms-btn-primary text-xs">
                    {t('patientChart.open_vaccination_chart')}
                  </a>
                  <a href={`/vaccination/administer?patient_id=${patientId}`} className="hms-btn text-xs">
                    {t('patientChart.administer_vaccine')}
                  </a>
                </div>
              </div>
            </div>
            {vaccinationSummary.recent?.length ? (
              <div>
                <h3 className="mb-2 font-bold">{t('patientChart.recent_doses')}</h3>
                <ul className="divide-y divide-slate-100">
                  {vaccinationSummary.recent.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <strong>{d.vaccine_name}</strong>
                        {' · '}
                        {t('patientChart.dose_n', { n: d.dose_number })}
                        {' · '}
                        {d.administered_date}
                      </span>
                      {d.next_dose_due ? (
                        <span className="text-xs text-amber-700">{t('patientChart.next_due')}: {d.next_dose_due}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-slate-400">{t('patientChart.no_vaccination_records')}</p>
            )}
          </div>
        ) : null}
      </div>
      </div>
    </div>
  );
}
