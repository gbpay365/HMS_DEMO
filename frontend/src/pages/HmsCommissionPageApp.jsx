import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';

const SERVICE_OPTIONS = [
  { value: 'consultation', icon: 'fa-stethoscope', color: '#0c8b8b' },
  { value: 'laboratory', icon: 'fa-flask', color: '#7c3aed' },
  { value: 'radiology', icon: 'fa-film', color: '#0369a1' },
  { value: 'pharmacy', icon: 'fa-medkit', color: '#059669' },
  { value: 'all', icon: 'fa-th-large', color: '#475569' },
];

const RATE_OPTIONS = [
  { value: 'percent', icon: 'fa-percent' },
  { value: 'fixed', icon: 'fa-money' },
];

function doctorLabel(d) {
  return `Dr. ${d.first_name || ''} ${d.last_name || ''}`.trim();
}

function doctorInitials(d) {
  return `${(d.first_name || '?')[0] || ''}${(d.last_name || '?')[0] || ''}`.toUpperCase();
}

function serviceLabel(value, t) {
  const key = `hms_commission.service_${value}`;
  return t(key, { ns: 'legacy' });
}

function FieldLabel({ icon, children }) {
  return (
    <label className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
      <i className={`fa ${icon} text-brand`} aria-hidden="true" />
      {children}
    </label>
  );
}

export function HmsCommissionPageApp({
  doctors = [],
  rules = [],
  canWrite = false,
  flash = null,
  error = null}) {
  const { t } = useTranslation('legacy');
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ? String(doctors[0].id) : '');

  const stats = useMemo(() => {
    const doctorIds = new Set(rules.map((r) => r.doctor_id));
    return {
      rules: rules.length,
      doctors: doctorIds.size,
      percent: rules.filter((r) => r.rate_type === 'percent').length,
      fixed: rules.filter((r) => r.rate_type === 'fixed').length};
  }, [rules]);

  const serviceMeta = (kind) => SERVICE_OPTIONS.find((s) => s.value === kind) || SERVICE_OPTIONS[0];

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero
          icon="percent"
          title={t('hms_commission.title')}
          subtitle={t('hms_commission.subtitle')}
        >
          <div className="hms-surface-hero-actions mt-4">
            <a href="/settings" className="hms-btn-secondary text-xs">
              <i className="fa fa-sliders" aria-hidden="true" />
              {t('hms_commission.back_settings')}
            </a>
            <a href="/hms/commission/report" className="hms-btn-secondary text-xs">
              <i className="fa fa-bar-chart" aria-hidden="true" />
              {t('hms_commission.report_link')}
            </a>
          </div>
        </SurfaceHero>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={t('hms_commission.stat_rules')}
            value={stats.rules}
            tone="brand"
          />
          <StatCard
            label={t('hms_commission.stat_doctors')}
            value={stats.doctors}
          />
          <StatCard
            label={t('hms_commission.stat_percent')}
            value={stats.percent}
          />
          <StatCard
            label={t('hms_commission.stat_fixed')}
            value={stats.fixed}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-lg text-amber-700">
                  <i className="fa fa-plus-circle" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-extrabold text-ink">
                    {t('hms_commission.add_rule')}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {t('hms_commission.add_hint')}
                  </p>
                </div>
              </div>

              {!doctors.length ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-900">
                  <i className="fa fa-user-md mb-2 text-2xl" aria-hidden="true" />
                  <p>{t('hms_commission.no_doctors')}</p>
                </div>
              ) : (
                <form method="POST" action="/hms/commission/rule" className="space-y-4">
                  <div>
                    <FieldLabel icon="fa-user-md">
                      {t('hms_commission.col_doctor')}
                    </FieldLabel>
                    <select
                      name="doctor_id"
                      required
                      value={doctorId}
                      onChange={(e) => setDoctorId(e.target.value)}
                      className="hms-input w-full"
                    >
                      <option value="" disabled>
                        {t('hms_commission.select_doctor')}
                      </option>
                      {doctors.map((d) => (
                        <option key={d.id} value={d.id}>
                          {doctorLabel(d)}
                          {d.primary_department ? ` — ${d.primary_department}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <FieldLabel icon="fa-tag">
                      {t('hms_commission.rule_name_ph')}
                    </FieldLabel>
                    <input
                      name="rule_name"
                      required
                      placeholder={t('hms_commission.rule_name_ph')}
                      className="hms-input w-full"
                    />
                  </div>

                  <div>
                    <FieldLabel icon="fa-stethoscope">
                      {t('hms_commission.col_service')}
                    </FieldLabel>
                    <select name="service_kind" className="hms-input w-full" defaultValue="consultation">
                      {SERVICE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {serviceLabel(opt.value, t)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel icon="fa-sliders">
                        {t('hms_commission.rate_type')}
                      </FieldLabel>
                      <select name="rate_type" className="hms-input w-full" defaultValue="percent">
                        {RATE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.value === 'percent' ? t('hms_commission.rate_percent') : t('hms_commission.rate_fixed')}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <FieldLabel icon="fa-calculator">
                        {t('hms_commission.rate_ph')}
                      </FieldLabel>
                      <input
                        name="rate_value"
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        placeholder="0"
                        className="hms-input w-full"
                      />
                    </div>
                  </div>

                  {canWrite ? (
                    <button type="submit" className="hms-btn-primary w-full py-3 text-sm font-bold">
                      <i className="fa fa-check mr-2" aria-hidden="true" />
                      {t('hms_commission.add_rule')}
                    </button>
                  ) : (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      {t('hms_commission.read_only')}
                    </p>
                  )}
                </form>
              )}
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                    <i className="fa fa-list-alt" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-base font-extrabold text-ink">
                      {t('hms_commission.rules_table')}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {t('hms_commission.rules_count', { count: rules.length })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">{t('hms_commission.col_doctor')}</th>
                      <th className="px-4 py-3">{t('hms_commission.rule_name_ph')}</th>
                      <th className="px-4 py-3">{t('hms_commission.col_service')}</th>
                      <th className="px-4 py-3 text-right">{t('hms_commission.col_rate')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {!rules.length ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center text-slate-400">
                          <i className="fa fa-inbox mb-2 block text-3xl" aria-hidden="true" />
                          {t('hms_commission.no_rules')}
                        </td>
                      </tr>
                    ) : (
                      rules.map((r) => {
                        const svc = serviceMeta(r.service_kind);
                        return (
                          <tr key={r.id} className="hover:bg-slate-50/80">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <span
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                                  style={{ background: `linear-gradient(135deg, ${svc.color}, #1e293b)` }}
                                >
                                  {doctorInitials(r)}
                                </span>
                                <span className="font-semibold text-ink">
                                  Dr. {r.first_name} {r.last_name}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{r.rule_name}</td>
                            <td className="px-4 py-3">
                              <span
                                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                                style={{ backgroundColor: svc.color }}
                              >
                                <i className={`fa ${svc.icon}`} aria-hidden="true" />
                                {serviceLabel(r.service_kind, t)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-extrabold text-ink">
                              {r.rate_type === 'percent'
                                ? `${r.rate_value}%`
                                : `${Number(r.rate_value || 0).toLocaleString('fr-FR')} XAF`}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
