import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { IpdAuditView } from '../components/ipd/IpdAuditView';
import { IpdDrugChartView } from '../components/ipd/IpdDrugChartView';
import { IpdHandoverBoardView } from '../components/ipd/IpdHandoverBoardView';
import { IpdShiftReportView } from '../components/ipd/IpdShiftReportView';
import { IpdTreatmentView } from '../components/ipd/IpdTreatmentView';
import { formatDate, formatMoney } from '../lib/listUi';
import { ipdStatusPillLocalized } from '../lib/wardUi';
import { openAddChargeModal } from '../lib/addChargeBridge';

function fmt(n) {
  return formatMoney(n);
}

function RunningBillView({ admission = {}, charges = [], notes = [], forecast = null }) {
  const { t } = useTranslation('ipd');

  return (
    <>
      <SurfaceHero
        icon="file-text-o"
        title={`${admission.first_name} ${admission.last_name}`}
        subtitle={`${admission.ward_name} · ${admission.bed_label} · ${t('shared.day_n', { n: admission.los_days || 0 })}`}
      >
        <div className="hms-surface-hero-chips mt-3">
          <span className="hms-icon-chip">{t('pages.running_bill')}</span>
          <span className="hms-icon-chip">
            {fmt(admission.running_bill)}
          </span>
        </div>
        <p className="mt-2 text-sm opacity-90">{t('pages.payable_hint')}</p>
      </SurfaceHero>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex justify-between">
            <h2 className="font-bold">{t('pages.charge_breakdown')}</h2>
            <button type="button" className="hms-btn hms-btn-outline-danger text-xs" onClick={() => openAddChargeModal()}>
              {t('pages.add_charge')}
            </button>
          </div>
          {!charges.length ? (
            <p className="text-slate-400">{t('pages.no_charges')}</p>
          ) : (
            charges.map((c, i) => (
              <div key={c.id || i} className="flex justify-between border-b border-slate-100 py-2 text-sm">
                <div>
                  <span className="mr-2 rounded bg-slate-100 px-1 text-[10px] font-bold uppercase">{c.charge_type}</span>
                  {c.description}
                  {c.clinical_summary ? <div className="text-xs text-slate-500">{c.clinical_summary}</div> : null}
                </div>
                <span className="font-bold text-red-600">{fmt(c.amount)}</span>
              </div>
            ))
          )}
        </div>
        <div className="space-y-4">
          {forecast ? (
            <div className="rounded-2xl border bg-white p-4 shadow-sm text-sm">
              <h3 className="mb-2 font-bold">{t('pages.forecast')}</h3>
              <div className="flex justify-between">
                <span>{t('pages.deposit')}</span>
                <span>{fmt(forecast.deposit)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>{t('pages.balance_due')}</span>
                <span>{fmt(forecast.balance_due)}</span>
              </div>
            </div>
          ) : null}
          {notes.length ? (
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h3 className="mb-2 font-bold">{t('pages.notes')}</h3>
              {notes.map((n, i) => (
                <div key={i} className="mb-2 text-sm text-slate-600">
                  {n.note || n.body}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function WardRoundsView({ admissions = [], staffRole = '' }) {
  const { t } = useTranslation('ipd');
  const [showHistory, setShowHistory] = useState({});
  const [showDcForm, setShowDcForm] = useState({});

  const toggleHistory = (id) => {
    setShowHistory((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleDcForm = (id) => {
    setShowDcForm((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isDoc = true; // Make visible for all roles during testing

  return (
    <div className="space-y-6 pb-20">
      <SurfaceHero icon="stethoscope" title={t('pages.ward_rounds_title')} subtitle={t('pages.ward_rounds_sub')}>
        <div className="hms-surface-hero-actions mt-4">
          <a href="/wards" className="hms-btn-secondary text-xs">
            {t('pages.bed_board_link')}
          </a>
          <a href="/ipd/census" className="hms-btn-secondary text-xs">
            {t('pages.census_link')}
          </a>
        </div>
      </SurfaceHero>

      <div className="hms-compact-kpi-grid mb-2">
        <StatCard label={t('pages.stat_active_patients')} value={admissions.length} tone="brand" icon="users" />
        <StatCard
          label={t('pages.stat_clinical_dc')}
          value={admissions.filter((a) => a.ipd_status === 'clinical_discharged').length}
          tone="warning"
          icon="sign-out"
        />
      </div>

      {!admissions.length ? (
        <div className="flex flex-col items-center justify-center rounded-[2rem] border border-slate-200/60 bg-white/50 backdrop-blur-xl p-16 text-center shadow-sm">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-50 text-slate-300 mb-6 shadow-inner">
            <i className="fa fa-bed text-4xl" />
          </div>
          <h3 className="text-xl font-bold text-slate-700">{t('pages.no_active_inpatients')}</h3>
          <p className="text-slate-500 mt-2">All patients have been discharged or no admissions yet.</p>
        </div>
      ) : (
        <div className="grid gap-8">
          {admissions.map((adm) => {
            const history = adm.ward_notes_history || [];
            const rxs = adm.active_prescriptions || [];
            const tx = adm.active_treatment;
            const vit = adm.latest_vitals;
            const isClinDc = adm.ipd_status === 'clinical_discharged';

            return (
              <div key={adm.id} className="group relative overflow-hidden rounded-[2rem] bg-white border border-slate-200/60 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1">
                {/* Status Indicator Bar */}
                <div className={`absolute left-0 top-0 h-full w-1.5 ${isClinDc ? 'bg-purple-500' : 'bg-emerald-500'}`} />

                {/* Header Section */}
                <div className="mb-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-slate-100 pb-6">
                  <div className="flex items-center gap-5">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-xl font-black text-slate-700 shadow-inner border border-slate-100">
                      {(adm.first_name || '?')[0]}{(adm.last_name || '?')[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                          {adm.first_name} {adm.last_name}
                        </h2>
                        {isClinDc ? (
                          <span className="flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-bold tracking-wide text-purple-700 shadow-sm">
                            <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
                            {t('status.clinical_discharged')}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold tracking-wide text-emerald-700 shadow-sm">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {t('status.admitted')}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-sm font-medium text-slate-500">
                        <span className="flex items-center gap-1.5"><i className="fa fa-hospital-o text-slate-400" /> {adm.ward_name}</span>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center gap-1.5"><i className="fa fa-bed text-slate-400" /> {adm.bed_label}</span>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center gap-1.5"><i className="fa fa-calendar-check-o text-slate-400" /> {t('shared.day_n', { n: adm.los_days || 0 })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-3">
                    <a href={`/patient-chart/${adm.patient_id}`} className="group/btn flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 transition-all hover:bg-slate-800 hover:text-white shadow-sm border border-slate-200 hover:border-slate-800">
                      <i className="fa fa-folder-open text-slate-400 group-hover/btn:text-slate-300 transition-colors" /> {t('shared.chart')}
                    </a>
                    <a href={`/ipd/running-bill/${adm.id}`} className="group/btn flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 transition-all hover:bg-slate-800 hover:text-white shadow-sm border border-slate-200 hover:border-slate-800">
                      <i className="fa fa-calculator text-slate-400 group-hover/btn:text-slate-300 transition-colors" /> {t('shared.bill')}
                    </a>
                    <a href={`/ipd/treatment/${adm.id}`} className="group/btn flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 transition-all hover:bg-slate-800 hover:text-white shadow-sm border border-slate-200 hover:border-slate-800">
                      <i className="fa fa-medkit text-slate-400 group-hover/btn:text-slate-300 transition-colors" /> {t('shared.treatment')}
                    </a>
                  </div>
                </div>

                {/* Main Content Grid */}
                <div className="grid gap-8 lg:grid-cols-12 mt-6">
                  {/* Left Column: Context (Vitals, Rx, Tx) */}
                  <div className="space-y-6 lg:col-span-5">
                    {/* Active Treatment Card */}
                    <div className="rounded-[1.5rem] bg-gradient-to-b from-blue-50/50 to-white p-5 border border-blue-100 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10">
                        <i className="fa fa-stethoscope text-6xl text-blue-500" />
                      </div>
                      <h3 className="text-[11px] font-black uppercase tracking-widest text-blue-500 mb-3 flex items-center gap-2">
                        <i className="fa fa-heartbeat" /> Diagnosis & Treatment
                      </h3>
                      {tx ? (
                        <div className="relative z-10">
                          <div className="text-lg font-bold text-slate-800 leading-tight">{tx.diagnosis}</div>
                          <div className="mt-2 text-xs font-medium text-slate-500 flex items-center gap-1.5">
                            <i className="fa fa-clock-o" /> Started: {tx.start_date ? new Date(tx.start_date).toLocaleDateString() : '—'}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 font-medium italic relative z-10">No active treatment episode recorded.</p>
                      )}
                    </div>

                    {/* Vitals Widget */}
                    {vit && (
                      <div className="rounded-[1.5rem] bg-slate-50 p-5 border border-slate-100 shadow-sm transition-colors hover:bg-slate-100/80">
                        <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                          <i className="fa fa-line-chart" /> Latest Vitals
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase text-slate-400">Blood Pressure</span>
                            <span className="font-semibold text-slate-800">{vit.blood_pressure || '—'}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase text-slate-400">Temperature</span>
                            <span className="font-semibold text-slate-800">{vit.temperature ? `${vit.temperature}°C` : '—'}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase text-slate-400">Pulse Rate</span>
                            <span className="font-semibold text-slate-800">{vit.pulse ? `${vit.pulse} bpm` : '—'}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase text-slate-400">Respiration</span>
                            <span className="font-semibold text-slate-800">{vit.resp_rate ? `${vit.resp_rate} rpm` : '—'}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Prescriptions List */}
                    <div className="rounded-[1.5rem] bg-slate-50 p-5 border border-slate-100 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                          <i className="fa fa-pills" /> Active Prescriptions
                        </h3>
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                          {rxs.length}
                        </span>
                      </div>
                      {rxs.length > 0 ? (
                        <div className="max-h-[220px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                          {rxs.map((rx) => (
                            <div key={rx.id} className="group/rx flex items-start justify-between gap-3 rounded-xl bg-white p-3 shadow-sm border border-slate-100 transition-colors hover:border-indigo-200">
                              <div className="flex items-start gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500 group-hover/rx:bg-indigo-500 group-hover/rx:text-white transition-colors">
                                  <i className="fa fa-medkit text-xs" />
                                </div>
                                <div>
                                  <div className="font-bold text-slate-800 text-sm">{rx.drug_name}</div>
                                  <div className="text-xs font-medium text-slate-500 mt-0.5">{rx.dosage} · {rx.route}</div>
                                  <div className="text-[10px] font-bold text-indigo-600 uppercase mt-1 tracking-wider">{rx.frequency_label}</div>
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <span className="inline-block rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                                  {rx.duration_days} days
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 font-medium italic">No active prescriptions.</p>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Interaction (Forms & History) */}
                  <div className="space-y-6 lg:col-span-7">
                    {/* Ward Note Input Form */}
                    <div className="rounded-[1.5rem] bg-white p-6 border border-slate-200 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
                      <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2">
                        <i className="fa fa-edit text-indigo-500" /> Record Round Note
                      </h3>
                      <form method="POST" action="/ipd/ward-rounds/save" className="space-y-4">
                        <input type="hidden" name="admission_id" value={adm.id} />
                        <div>
                          <label className="sr-only">Daily Progress Note</label>
                          <textarea
                            name="ward_notes"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all resize-y min-h-[120px]"
                            required
                            placeholder="Enter detailed progress, objective findings, assessment, and plan..."
                          />
                        </div>
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                          <button type="submit" className="hms-btn hms-btn-primary w-full sm:w-auto">
                            <i className="fa fa-check-circle" aria-hidden="true" />
                            Save Assessment
                          </button>

                          {isDoc && !isClinDc ? (
                            <button
                              type="button"
                              onClick={() => toggleDcForm(adm.id)}
                              className="w-full sm:w-auto rounded-xl border-2 border-red-100 bg-red-50 px-6 py-2.5 text-sm font-bold text-red-600 transition-all hover:bg-red-600 hover:border-red-600 hover:text-white flex items-center justify-center gap-2"
                            >
                              <i className="fa fa-sign-out" /> Initiate Clinical DC
                            </button>
                          ) : null}
                        </div>
                      </form>
                    </div>

                    {/* Expandable Clinical Discharge Form */}
                    {showDcForm[adm.id] && isDoc && !isClinDc && (
                      <div className="animate-fade-in-up">
                        <form method="POST" action="/wards/clinical-discharge" className="relative overflow-hidden rounded-[1.5rem] border border-red-200 bg-gradient-to-br from-red-50 to-white p-6 shadow-lg">
                          <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                            <i className="fa fa-flag-checkered text-8xl text-red-900" />
                          </div>
                          <input type="hidden" name="admission_id" value={adm.id} />
                          <input type="hidden" name="return_to" value="/ipd/ward-rounds" />
                          
                          <h4 className="text-lg font-black text-red-700 tracking-tight flex items-center gap-2 mb-6">
                            <i className="fa fa-exclamation-triangle" /> Confirm Clinical Discharge
                          </h4>
                          
                          <div className="space-y-5 relative z-10">
                            <div>
                              <label className="block text-xs font-bold text-red-900 uppercase tracking-wide mb-2">Discharge Summary *</label>
                              <textarea
                                name="discharge_summary"
                                className="w-full rounded-xl border border-red-200 bg-white p-3 text-sm focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all min-h-[80px]"
                                required
                                placeholder="Patient condition, course in hospital, final diagnosis..."
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-red-900 uppercase tracking-wide mb-2">Discharge Instructions & Follow-up</label>
                              <textarea
                                name="follow_up"
                                className="w-full rounded-xl border border-red-200 bg-white p-3 text-sm focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all min-h-[60px]"
                                placeholder="Medications to continue, diet, next appointment date..."
                              />
                            </div>
                            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
                              <button type="button" onClick={() => toggleDcForm(adm.id)} className="w-full sm:w-auto rounded-xl px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 transition-colors">
                                Cancel
                              </button>
                              <button type="submit" className="hms-btn hms-btn-danger w-full sm:w-auto">
                                <i className="fa fa-sign-out" aria-hidden="true" />
                                Finalize Discharge
                              </button>
                            </div>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Note History Section */}
                    <div className="rounded-[1.5rem] bg-slate-50 p-6 border border-slate-100 shadow-inner">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-black text-slate-700 flex items-center gap-2">
                          <i className="fa fa-history text-slate-400" /> Historical Notes
                        </h3>
                        <span className="flex items-center justify-center rounded-full bg-slate-200 px-3 py-1 text-[10px] font-bold text-slate-600">
                          {history.length} entries
                        </span>
                      </div>
                      
                      {history.length > 0 ? (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleHistory(adm.id)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 hover:text-indigo-600 flex items-center justify-between group"
                          >
                            <span>{showHistory[adm.id] ? 'Hide Note History' : 'Reveal Note History'}</span>
                            <i className={`fa ${showHistory[adm.id] ? 'fa-chevron-up' : 'fa-chevron-down'} text-slate-400 group-hover:text-indigo-500 transition-colors`} />
                          </button>

                          {showHistory[adm.id] && (
                            <div className="mt-4 space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar animate-fade-in">
                              {history.map((h, idx) => (
                                <div key={h.id} className="relative pl-6">
                                  {/* Timeline Line */}
                                  {idx !== history.length - 1 && (
                                    <div className="absolute left-[11px] top-8 bottom-[-16px] w-[2px] bg-slate-200"></div>
                                  )}
                                  {/* Timeline Dot */}
                                  <div className="absolute left-0 top-3 h-[24px] w-[24px] rounded-full border-4 border-slate-50 bg-indigo-500 shadow-sm"></div>
                                  
                                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-50 pb-2">
                                      <div className="flex items-center gap-2 font-bold text-slate-700 text-sm">
                                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px]">
                                          <i className="fa fa-user-md" />
                                        </div>
                                        {h.author_name}
                                      </div>
                                      <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                                        <i className="fa fa-clock-o" />
                                        {h.written_at ? new Date(h.written_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                                      </div>
                                    </div>
                                    <div className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{h.note_text}</div>
                                    {h.orders_text && (
                                      <div className="mt-3 rounded-xl bg-indigo-50/50 p-3 border border-indigo-100 text-sm">
                                        <span className="font-bold text-[10px] uppercase tracking-wider text-indigo-500 block mb-1 flex items-center gap-1">
                                          <i className="fa fa-terminal" /> Orders Issued
                                        </span>
                                        <span className="text-indigo-900/80">{h.orders_text}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white/50 p-6 text-center">
                          <p className="text-sm text-slate-400 font-medium italic">No prior round notes recorded.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TreatmentView(props) {
  return <IpdTreatmentView {...props} />;
}

function GenericListView({ title, rows = [], columns = [], actions = [], subtitle = '' }) {
  const { t } = useTranslation('ipd');

  return (
    <>
      <SurfaceHero icon="hospital-o" title={title} subtitle={subtitle || undefined}>
        {actions.length ? (
          <div className="hms-surface-hero-actions mt-4">
            {actions.map((a) => (
              <a key={a.href} href={a.href} className="hms-btn-secondary text-xs">
                {a.label}
              </a>
            ))}
          </div>
        ) : null}
      </SurfaceHero>
      <div className="mb-4">
        <StatCard label={t('pages.stat_records')} value={rows.length} tone="default" icon="list" />
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-xs font-bold uppercase text-white">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-2 text-left">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!rows.length ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-400">
                  {t('shared.no_records')}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={row.id || i}>
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-2">
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function IpdInboxView({ messages = [], inboxMode = 'nurse', viewerId = 0 }) {
  const { t } = useTranslation('ipd');
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [msgList, setMsgList] = useState(messages);

  useEffect(() => {
    setMsgList(messages);
    if (messages.length > 0) {
      setSelectedMsg(messages[0]);
    }
  }, [messages]);

  // Mark message as read when selected
  useEffect(() => {
    if (selectedMsg && !selectedMsg.read_at && selectedMsg.to_user_id === viewerId) {
      fetch(`/ipd/inbox/${selectedMsg.id}/read`, {
        method: 'POST',
        credentials: 'same-origin'})
        .then((r) => r.json())
        .then((d) => {
          if (d.ok) {
            // Update local state to show message as read
            setMsgList((prev) =>
              prev.map((m) => (m.id === selectedMsg.id ? { ...m, read_at: new Date().toISOString() } : m))
            );
          }
        })
        .catch(() => {});
    }
  }, [selectedMsg, viewerId]);

  const handleSendReply = async (ev) => {
    ev.preventDefault();
    const txt = replyText.trim();
    if (!txt || !selectedMsg) return;
    setSending(true);
    setError('');
    try {
      const r = await fetch(`/ipd/inbox/${selectedMsg.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ body: txt })});
      const d = await r.json();
      if (d.ok) {
        setReplyText('');
        // Add the reply to the current view list locally
        const newReply = {
          id: d.id,
          admission_id: selectedMsg.admission_id,
          patient_id: selectedMsg.patient_id,
          patient_name: selectedMsg.patient_name,
          from_user_id: viewerId,
          to_user_id: selectedMsg.from_user_id,
          from_name: 'You',
          to_name: selectedMsg.from_name,
          subject: 'Re: ' + (selectedMsg.subject || 'IPD update'),
          body: txt,
          sent_at: new Date().toISOString(),
          source: 'doctor_reply',
          source_id: selectedMsg.id};
        setMsgList((prev) => [newReply, ...prev]);
        setSelectedMsg(newReply);
      } else {
        setError(d.error || 'Failed to send reply');
      }
    } catch {
      setError('Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  // Group or filter messages to see thread for selected admission
  const threadMessages = selectedMsg
    ? msgList
        .filter((m) => m.admission_id === selectedMsg.admission_id)
        .sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime())
    : [];

  // Deduplicate messages by admission to show unique threads in sidebar
  const uniqueThreads = [];
  const seenAdmissions = new Set();
  msgList.forEach((m) => {
    if (!seenAdmissions.has(m.admission_id)) {
      seenAdmissions.add(m.admission_id);
      uniqueThreads.push(m);
    }
  });

  const isDoctor = inboxMode === 'doctor';

  return (
    <div className="grid gap-6 lg:grid-cols-12 h-[calc(100vh-140px)] min-h-[500px]">
      {/* Sidebar: Thread List */}
      <div className="lg:col-span-4 border rounded-2xl bg-white flex flex-col shadow-sm overflow-hidden h-full">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 font-bold text-slate-800 text-sm flex items-center justify-between">
          <span>Active Threads</span>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">
            {uniqueThreads.length}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {uniqueThreads.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400 italic">No threads found.</p>
          ) : (
            uniqueThreads.map((t) => {
              const isSelected = selectedMsg && selectedMsg.admission_id === t.admission_id;
              const unread = !t.read_at && t.to_user_id === viewerId;

              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedMsg(t)}
                  className={`w-full text-left p-3.5 flex items-start gap-3 transition-colors duration-150 ${
                    isSelected ? 'bg-emerald-50/50' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                    isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {(t.patient_name || '?')[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="font-bold text-sm text-slate-850 truncate">{t.patient_name}</span>
                      <span className="text-[9px] text-slate-400 shrink-0">
                        {t.sent_at ? new Date(t.sent_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-brand truncate mb-1">
                      {t.from_name}
                    </div>
                    <div className={`text-xs truncate ${unread ? 'font-bold text-slate-900' : 'text-slate-500'}`}>
                      {t.body}
                    </div>
                  </div>
                  {unread ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 mt-2" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main Panel: Selected Chat Thread */}
      <div className="lg:col-span-8 border rounded-2xl bg-white flex flex-col shadow-sm overflow-hidden h-full">
        {selectedMsg ? (
          <>
            {/* Thread Header */}
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 text-sm">{selectedMsg.patient_name}</h2>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold mt-0.5">
                  Admission stay #{selectedMsg.admission_id}
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                {isDoctor ? 'Doctor View' : 'Nurse View'}
              </span>
            </div>

            {/* Chat Messages list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
              {threadMessages.map((m) => {
                const isDoc = m.source === 'doctor_reply' || String(m.subject).toLowerCase().includes('re:') || m.from_to?.toLowerCase().includes('doctor');
                const fromMe = m.from_user_id === viewerId;

                return (
                  <div key={m.id} className={`flex flex-col ${fromMe ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                      fromMe
                        ? 'bg-emerald-600 text-white rounded-tr-none'
                        : 'bg-white text-slate-800 rounded-tl-none border border-slate-200'
                    }`}>
                      <div className="text-[9px] font-extrabold uppercase tracking-wider mb-1 opacity-75">
                        {fromMe ? 'You' : m.from_name}
                      </div>
                      <div className="whitespace-pre-wrap leading-relaxed">{m.body}</div>
                      <div className="text-[9px] text-right mt-1 opacity-60">
                        {m.sent_at ? new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reply Input Form */}
            {isDoctor ? (
              <div className="border-t border-slate-100 p-3 bg-white">
                {error ? (
                  <div className="mb-2.5 rounded-lg bg-red-50 p-2 text-xs text-red-700 border border-red-200">
                    {error}
                  </div>
                ) : null}
                <form onSubmit={handleSendReply} className="flex gap-2">
                  <textarea
                    value={replyText}
                    onChange={(ev) => setReplyText(ev.target.value)}
                    className="hms-input min-h-[50px] flex-1 resize-none py-2 text-xs"
                    placeholder="Type your clinical instruction/reply to the nurse..."
                    rows={2}
                    required
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' && !ev.shiftKey) {
                        ev.preventDefault();
                        handleSendReply(ev);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    className="hms-btn-primary self-end px-3 py-2 text-xs shrink-0 flex items-center justify-center gap-1"
                    disabled={sending || !replyText.trim()}
                  >
                    {sending ? <i className="fa fa-spinner fa-spin" /> : <i className="fa fa-paper-plane" />}
                    Reply
                  </button>
                </form>
              </div>
            ) : (
              <div className="border-t border-slate-100 p-3 bg-slate-50 text-center text-xs text-slate-400 italic">
                Only doctors can reply in this inbox channel. Use the Patient Card on the Ward Board to initiate new messages.
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/30 p-6">
            <i className="fa fa-comments text-4xl text-slate-350 mb-3" />
            <p className="text-sm font-medium">Select a thread to view the conversation history.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function IpdPageApp(props) {
  const { t } = useTranslation('ipd');
  const { pageKey = 'running-bill', flash, error } = props;

  return (
    <div className="page-wrapper hms-surface-module">
      <div className={`content px-4 pb-10 pt-2 ${pageKey === 'treatment' ? 'min-h-[70vh] bg-gradient-to-b from-amber-50/80 via-slate-50 to-white py-6' : ''}`}>
      <FlashMessages flash={flash} error={error} />

      {pageKey === 'running-bill' ? <RunningBillView {...props} /> : null}
      {pageKey === 'ward-rounds' ? <WardRoundsView {...props} /> : null}
      {pageKey === 'treatment' ? <TreatmentView {...props} /> : null}
      {pageKey === 'hospitalizations' ? (
        <GenericListView
          title={t('pages.hospitalizations')}
          rows={props.admissions || props.rows || []}
          columns={[
            { key: 'patient_name', label: t('pages.patient'), render: (r) => r.patient_name || `${r.first_name} ${r.last_name}` },
            { key: 'ward_name', label: t('pages.ward') },
            {
              key: 'ipd_status',
              label: t('pages.status'),
              render: (r) => {
                const pill = ipdStatusPillLocalized(r.ipd_status, t);
                return <span className={pill.className}>{pill.label}</span>;
              }},
            {
              key: 'id',
              label: '',
              render: (r) => (
                <a href={`/ipd/hospitalization/${r.id}`} className="text-blue-600">
                  {t('shared.open')}
                </a>
              )},
          ]}
          actions={[
            { href: '/ipd/census', label: t('pages.census_link') },
            { href: '/wards', label: t('pages.bed_board_link') },
          ]}
        />
      ) : null}
      {pageKey === 'medication-hub' ? (
        <GenericListView
          title={t('pages.medication_hub')}
          rows={props.admissions || []}
          columns={[
            { key: 'patient_name', label: t('pages.patient') },
            { key: 'ward_name', label: t('pages.ward') },
            {
              key: 'id',
              label: '',
              render: (r) => (
                <a href={`/ipd/treatment/${r.id}`} className="text-blue-600">
                  {t('shared.treatment')}
                </a>
              )},
          ]}
        />
      ) : null}
      {pageKey === 'hospitalization-detail' ? (
        <div>
          <h1 className="mb-2 text-xl font-extrabold">
            {t('pages.hosp_detail', { id: props.adm?.id, name: `${props.adm?.first_name || ''} ${props.adm?.last_name || ''}`.trim() })}
          </h1>
          <p className="mb-4 text-sm text-slate-500">
            {props.adm?.ward_name} · {props.adm?.bed_label} ·{' '}
            {ipdStatusPillLocalized(props.adm?.ipd_status, t).label}
          </p>
          {props.death ? (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              <div className="font-bold">🕊 {t('pages.death_registry')}</div>
              <div>
                {props.death.date_of_death}
                {props.death.cause_of_death ? ` · ${props.death.cause_of_death}` : ''}
              </div>
            </div>
          ) : (
            <a
              href={`/death-registry?source=ipd&admission_id=${props.adm?.id}`}
              className="mb-4 inline-flex hms-btn hms-btn-secondary text-sm"
            >
              🕊 {t('pages.death_registry')}
            </a>
          )}
          {props.forecast ? (
            <div className="mb-4 rounded-xl border bg-white p-4 text-sm">
              <div className="flex justify-between">
                <span>{t('pages.running_bill_label')}</span>
                <span className="font-bold">
                  {fmt(props.forecast.running_bill)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{t('pages.balance_due')}</span>
                <span className="font-bold text-red-600">
                  {fmt(props.forecast.balance_due)}
                </span>
              </div>
            </div>
          ) : null}
          <a href={`/ipd/running-bill/${props.adm?.id}`} className="hms-btn hms-btn-secondary text-sm">
            {t('pages.running_bill_label')}
          </a>
        </div>
      ) : null}
      {pageKey === 'death-registry' ? (
        <GenericListView
          title={props.title || t('pages.death_registry')}
          rows={props.rows || []}
          columns={props.columns || [{ key: 'patient_name', label: t('pages.patient') }, { key: 'date_of_death', label: t('pages.date') }]}
        />
      ) : null}
      {pageKey === 'inbox' ? (
        <IpdInboxView
          messages={props.messages || props.rows || []}
          inboxMode={props.inboxMode || 'nurse'}
          viewerId={props.viewerId || 0}
        />
      ) : null}
      {pageKey === 'discharge' ? (
        <div>
          <h1 className="mb-4 text-xl font-extrabold">
            {t('pages.discharge_title', { name: `${props.admission?.first_name || ''} ${props.admission?.last_name || ''}`.trim() })}
          </h1>
          {props.totals ? (
            <div className="mb-4 rounded-xl border bg-white p-4 text-sm">
              <div className="flex justify-between">
                <span>{t('pages.total_charges')}</span>
                <span>
                  {fmt(props.totals.charges)}
                </span>
              </div>
              <div className="flex justify-between font-bold">
                <span>{t('pages.balance')}</span>
                <span>
                  {fmt(props.totals.balance)}
                </span>
              </div>
            </div>
          ) : null}
          {props.canDischarge ? (
            <form method="POST" action={`/ipd/discharge/${props.admission?.id}`}>
              <textarea name="summary" className="hms-input mb-3 w-full" rows={4} placeholder={t('pages.discharge_ph')} required />
              <button type="submit" className="hms-btn hms-btn-success">
                <i className="fa fa-check-circle" aria-hidden="true" />
                {t('pages.confirm_discharge')}
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">{t('pages.doctor_only_dc')}</p>
          )}
        </div>
      ) : null}
      {pageKey === 'drug-chart' ? <IpdDrugChartView {...props} /> : null}
      {pageKey === 'audit' ? <IpdAuditView {...props} /> : null}
      {pageKey === 'shift-report' ? <IpdShiftReportView {...props} /> : null}
      {pageKey === 'handover-board' ? <IpdHandoverBoardView {...props} /> : null}
      {pageKey === 'config' ? (
        <GenericListView
          title={props.title || pageKey.replace(/-/g, ' ')}
          rows={props.rows || props.slots || props.entries || []}
          columns={props.columns || [{ key: 'label', label: t('pages.item') }, { key: 'value', label: t('pages.detail') }]}
        />
      ) : null}
      </div>
    </div>
  );
}
