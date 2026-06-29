import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';

function SectionCard({ title, icon, children }) {
  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 md:px-5">
        <i className={`fa ${icon} text-brand`} aria-hidden />
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      </div>
      <div className="p-4 md:p-5 text-sm text-slate-700">{children}</div>
    </div>
  );
}

function KeyValueList({ items }) {
  if (!items?.length) return <p className="text-slate-500">—</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.code || item.label} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <span className="font-semibold text-slate-800">{item.label}</span>
          <span className="text-slate-600">
            {item.rate != null ? `${item.rate}${item.unit || ''}` : ''}
            {item.note ? item.note : ''}
            {item.glCode ? ` · GL ${item.glCode}` : ''}
            {item.type ? ` · ${item.type.replace(/_/g, ' ')}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CountryConfigurationPageApp({
  activeCode = 'NG',
  profiles = [],
  flash = null,
  error = null,
}) {
  const { t } = useTranslation('configuration');
  const [selectedCode, setSelectedCode] = useState(activeCode);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(flash);
  const [err, setErr] = useState(error);

  const selected = useMemo(
    () => profiles.find((p) => p.code === selectedCode) || profiles[0] || null,
    [profiles, selectedCode]
  );

  const profileGroups = useMemo(() => {
    const groups = new Map();
    for (const p of profiles) {
      const key = p.regionGroup || t('region_other');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    return [...groups.entries()];
  }, [profiles, t]);

  async function applyProfile() {
    if (!selectedCode || busy) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await fetch('/api/admin/country-profiles/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ country_code: selectedCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t('apply_failed'));
      setMsg(t('apply_success', { country: data.profile?.name || selectedCode }));
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setErr(e.message || t('apply_failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-8 pt-2 sm:px-6">
        <FlashMessages flash={msg} error={err} />

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>
        </div>

        <div className="mb-6 rounded-2xl border border-brand/20 bg-brand-light/30 p-4 md:p-5">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-800" htmlFor="country-select">
                {t('country_label')}
              </label>
              <select
                id="country-select"
                className="hms-input w-full max-w-md text-sm"
                value={selectedCode}
                onChange={(ev) => setSelectedCode(ev.target.value)}
              >
                {profileGroups.map(([group, items]) => (
                  <optgroup key={group} label={group}>
                    {items.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name} ({p.currency?.code})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-600">{t('country_hint')}</p>
            </div>
            <button
              type="button"
              className="hms-btn-primary px-6 py-3 text-sm font-bold disabled:opacity-60"
              disabled={busy || selectedCode === activeCode}
              onClick={applyProfile}
            >
              {busy ? t('applying') : t('apply_btn')}
            </button>
          </div>
          {selectedCode === activeCode ? (
            <p className="mt-3 text-xs font-semibold text-emerald-700">
              <i className="fa fa-check-circle mr-1" />
              {t('active_now', { country: selected?.name || activeCode })}
            </p>
          ) : (
            <p className="mt-3 text-xs font-semibold text-amber-700">
              <i className="fa fa-info-circle mr-1" />
              {t('preview_mode')}
            </p>
          )}
        </div>

        {selected ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title={t('section_currency')} icon="fa-money">
              <p>
                <strong>{selected.currency?.symbol}</strong> {selected.currency?.code} ·{' '}
                {selected.currency?.locale}
              </p>
              <p className="mt-1 text-slate-600">{t('timezone')}: {selected.timezone}</p>
              <p className="text-slate-600">{t('default_city')}: {selected.defaultCity}</p>
            </SectionCard>

            <SectionCard title={t('section_geo')} icon="fa-map-marker">
              <p>{selected.geo?.description}</p>
              <p className="mt-2">
                {selected.geo?.regionLabel} · {selected.geo?.subRegionLabel}
              </p>
              <p className="text-slate-600">API: {selected.geo?.apiPath}</p>
            </SectionCard>

            <SectionCard title={t('section_coa')} icon="fa-book">
              <p className="font-semibold">{selected.chartOfAccounts?.label}</p>
              <p className="text-slate-600">{t('template')}: {selected.chartOfAccounts?.template}</p>
              <p className="text-slate-600">{selected.fiscalRegime}</p>
            </SectionCard>

            <SectionCard title={t('section_taxes')} icon="fa-percent">
              <KeyValueList items={selected.taxes} />
            </SectionCard>

            <SectionCard title={t('section_payroll')} icon="fa-users">
              <KeyValueList items={selected.payrollTaxes} />
            </SectionCard>

            <SectionCard title={t('section_payments')} icon="fa-credit-card">
              <KeyValueList items={selected.paymentMethods} />
              <p className="mt-3 text-xs text-slate-500">{t('cashier_methods')}: {selected.cashierMethods?.join(', ')}</p>
            </SectionCard>

            <SectionCard title={t('section_languages')} icon="fa-language">
              <ul className="space-y-1">
                {(selected.languages || []).map((lang) => (
                  <li key={lang.code}>
                    {lang.label} ({lang.code}){lang.default ? ` · ${t('default_lang')}` : ''}
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>
        ) : null}
      </div>
    </div>
  );
}
