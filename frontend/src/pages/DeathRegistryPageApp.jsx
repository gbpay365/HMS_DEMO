import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterChip } from '../components/FilterChip';
import { FlashMessages } from '../components/FlashMessages';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';

const MODULES = [
  { key: 'ipd', icon: '🏥', ring: 'ring-blue-200', bg: 'bg-blue-50', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-800' },
  { key: 'er', icon: '🚑', ring: 'ring-red-200', bg: 'bg-red-50', text: 'text-red-800', badge: 'bg-red-100 text-red-800' },
  { key: 'opd', icon: '🩺', ring: 'ring-teal-200', bg: 'bg-teal-50', text: 'text-teal-800', badge: 'bg-teal-100 text-teal-800' },
  { key: 'maternity', icon: '🤰', ring: 'ring-rose-200', bg: 'bg-rose-50', text: 'text-rose-800', badge: 'bg-rose-100 text-rose-800' },
];

const MODULE_BACK = {
  ipd: '/ipd',
  er: '/emergency',
  opd: '/opd-queue',
  maternity: '/maternity'};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function moduleMeta(key) {
  return MODULES.find((m) => m.key === key) || MODULES[0];
}

function moduleLabel(t, key) {
  return t(`modules.${key}`);
}

export function DeathRegistryPageApp({
  stats = {},
  rows = [],
  pending = {},
  doctors = [],
  prefill = {},
  flash = null,
  error = null}) {
  const { t } = useTranslation('death');
  const [doctorList, setDoctorList] = useState(() => (Array.isArray(doctors) ? doctors : []));

  useEffect(() => {
    if (doctorList.length) return;
    let cancelled = false;
    fetch('/death-registry/certifying-doctors', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : { doctors: [] }))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.doctors) && data.doctors.length) {
          setDoctorList(data.doctors);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [doctorList.length]);
  const initialModule = ['ipd', 'er', 'opd', 'maternity'].includes(prefill?.source_module)
    ? prefill.source_module
    : 'ipd';

  const [mainTab, setMainTab] = useState(
    prefill?.admission_id || prefill?.visit_id || prefill?.maternity_patient_id ? 'register' : 'register'
  );
  const [moduleTab, setModuleTab] = useState(initialModule);
  const [selected, setSelected] = useState(() => {
    if (prefill?.admission_id) {
      const hit = (pending.ipd || []).find((r) => r.admission_id === prefill.admission_id);
      if (hit) return hit;
    }
    if (prefill?.visit_id) {
      const hit = [...(pending.er || []), ...(pending.opd || [])].find((r) => r.visit_id === prefill.visit_id);
      if (hit) return hit;
    }
    if (prefill?.maternity_patient_id) {
      const hit = (pending.maternity || []).find((r) => r.maternity_patient_id === prefill.maternity_patient_id);
      if (hit) return hit;
    }
    return null;
  });

  const pendingList = pending[moduleTab] || [];
  const pendingTotal = useMemo(
    () => MODULES.reduce((n, m) => n + ((pending[m.key] || []).length || 0), 0),
    [pending]
  );

  const sel = selected || {};
  const patientId = sel.patient_id || '';
  const admissionId = moduleTab === 'ipd' ? sel.admission_id || prefill.admission_id || '' : '';
  const visitId = moduleTab === 'er' || moduleTab === 'opd' ? sel.visit_id || prefill.visit_id || '' : '';
  const maternityPatientId =
    moduleTab === 'maternity' ? sel.maternity_patient_id || prefill.maternity_patient_id || '' : '';
  const patientLabel = sel.label || (patientId ? `#${patientId}` : '');

  function pickCase(row) {
    setSelected(row);
    setModuleTab(row.source_module || moduleTab);
    setMainTab('register');
  }

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="heart-o" badge="🕊" title={t('title')} subtitle={t('subtitle')}>
          <div className="hms-surface-hero-actions mt-4">
            {MODULES.map((m) => (
              <a key={m.key} href={MODULE_BACK[m.key]} className="hms-btn-secondary text-xs">
                ← {t(`back_${m.key}`)}
              </a>
            ))}
          </div>
        </SurfaceHero>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t('kpi_total')} value={stats.total || 0} tone="danger" icon="list" />
          <StatCard label={t('kpi_month')} value={stats.this_month || 0} tone="warning" icon="calendar" />
          <StatCard label={t('kpi_pending')} value={pendingTotal} tone="default" icon="clock" />
          <div className="hms-surface-card rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('col_module')}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {MODULES.map((m) => (
                <span key={m.key} className="rounded-full bg-brand-light px-2.5 py-1 text-xs font-bold text-brand">
                  {moduleLabel(t, m.key)} {stats.by_module?.[m.key] || 0}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {[
            ['register', t('tab_register')],
            ['records', t('tab_records')],
          ].map(([key, label]) => (
            <FilterChip key={key} active={mainTab === key} onClick={() => setMainTab(key)}>
              {label}
            </FilterChip>
          ))}
        </div>

        {mainTab === 'register' ? (
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
                <div className="border-b border-slate-100 px-4 py-3">
                  <div className="font-bold text-ink">{t('pending_title')}</div>
                  <p className="mt-1 text-xs text-slate-500">{t('pending_hint')}</p>
                </div>
                <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
                  {MODULES.map((m) => {
                    const count = (pending[m.key] || []).length;
                    return (
                      <FilterChip
                        key={m.key}
                        active={moduleTab === m.key}
                        count={count}
                        onClick={() => {
                          setModuleTab(m.key);
                          setSelected(null);
                        }}
                      >
                        <span aria-hidden="true">{m.icon}</span>
                        {moduleLabel(t, m.key)}
                      </FilterChip>
                    );
                  })}
                </div>
                <div className="max-h-[28rem] overflow-y-auto p-2">
                  {pendingList.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-slate-500">{t('pending_empty')}</div>
                  ) : (
                    pendingList.map((row) => {
                      const meta = moduleMeta(row.source_module || moduleTab);
                      const isSel =
                        selected &&
                        ((row.admission_id && selected.admission_id === row.admission_id) ||
                          (row.visit_id && selected.visit_id === row.visit_id) ||
                          (row.maternity_patient_id && selected.maternity_patient_id === row.maternity_patient_id));
                      return (
                        <button
                          key={`${row.source_module}-${row.admission_id || row.visit_id || row.maternity_patient_id}`}
                          type="button"
                          onClick={() => pickCase(row)}
                          className={`mb-2 w-full rounded-xl border-2 p-3 text-left transition ${
                            isSel ? `ring-2 ${meta.ring} border-rose-300 bg-rose-50/50` : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg ${meta.bg}`}>
                              {meta.icon}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-bold text-ink">{row.label}</div>
                              <div className="truncate text-xs text-slate-500">{row.context}</div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-3">
              <form
                method="POST"
                action="/death-registry"
                className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card"
              >
                <div className="border-b border-slate-100 bg-gradient-to-r from-rose-50 to-slate-50 px-4 py-3">
                  <div className="font-bold text-ink">{t('form_title')}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span className={`rounded-full px-2 py-0.5 font-bold ${moduleMeta(moduleTab).badge}`}>
                      {moduleLabel(t, moduleTab)}
                    </span>
                    <span>{t(`module_desc.${moduleTab}`)}</span>
                  </div>
                </div>

                <div className="space-y-4 p-4">
                  <input type="hidden" name="source_module" value={moduleTab} />
                  <input type="hidden" name="patient_id" value={patientId} />
                  {admissionId ? <input type="hidden" name="admission_id" value={admissionId} /> : null}
                  {visitId ? <input type="hidden" name="visit_id" value={visitId} /> : null}
                  {maternityPatientId ? (
                    <input type="hidden" name="maternity_patient_id" value={maternityPatientId} />
                  ) : null}

                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase text-slate-600">{t('patient')}</label>
                    <div
                      className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
                        patientLabel ? 'border-slate-200 bg-slate-50 text-ink' : 'border-amber-200 bg-amber-50 text-amber-800'
                      }`}
                    >
                      {patientLabel || t('select_case_first')}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase text-slate-600">{t('date_of_death')}</label>
                      <input
                        type="date"
                        name="date_of_death"
                        className="hms-input w-full"
                        defaultValue={todayIso()}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase text-slate-600">{t('time_of_death')}</label>
                      <input type="time" name="time_of_death" className="hms-input w-full" />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase text-slate-600">{t('cause')}</label>
                    <input
                      type="text"
                      name="cause_of_death"
                      className="hms-input w-full"
                      placeholder={t('cause_ph')}
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase text-slate-600">{t('certifying_doctor')}</label>
                    <select name="certifying_doctor_id" className="hms-input w-full" required defaultValue="">
                      <option value="">{t('certifying_doctor_ph')}</option>
                      {doctorList.map((d) => (
                        <option key={d.id} value={d.id}>
                          {`${d.last_name || ''} ${d.first_name || ''}`.trim()}
                          {d.job_title ? ` — ${d.job_title}` : d.specialisation ? ` — ${d.specialisation}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase text-slate-600">{t('notes')}</label>
                    <textarea
                      name="notes"
                      className="hms-input w-full"
                      rows={3}
                      placeholder={t('notes_ph')}
                    />
                  </div>

                  <button
                    type="submit"
                    className="hms-btn hms-btn-primary w-full font-bold"
                    disabled={!patientId}
                  >
                    🕊 {t('save')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t('col_patient')}</th>
                    <th className="px-4 py-3">{t('col_module')}</th>
                    <th className="px-4 py-3">{t('col_context')}</th>
                    <th className="px-4 py-3">{t('col_date')}</th>
                    <th className="px-4 py-3">{t('col_time')}</th>
                    <th className="px-4 py-3">{t('col_cause')}</th>
                    <th className="px-4 py-3">{t('col_doctor')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows || []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                        {t('records_empty')}
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => {
                      const meta = moduleMeta(r.source_module);
                      const ctx = [r.ward_name, r.bed_label].filter(Boolean).join(' · ') ||
                        (r.visit_id ? `#${r.visit_id}` : '') ||
                        (r.antenatal_number ? `ANC ${r.antenatal_number}` : '—');
                      return (
                        <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-ink">{r.patient_name}</div>
                            {r.patient_code ? (
                              <div className="text-xs text-slate-500">{r.patient_code}</div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${meta.badge}`}>
                              {meta.icon} {moduleLabel(t, r.source_module)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{ctx}</td>
                          <td className="px-4 py-3">{r.date_of_death || '—'}</td>
                          <td className="px-4 py-3">
                            {r.time_of_death ? String(r.time_of_death).slice(0, 5) : '—'}
                          </td>
                          <td className="max-w-[12rem] truncate px-4 py-3 text-slate-600" title={r.cause_of_death || ''}>
                            {r.cause_of_death || '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{r.certifying_doctor || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
