import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const PRESET_PCTS = [70, 80, 90, 100];

function encodeAutoData(result, carrier) {
  const payload = {
    carrier_id: result.carrier_id || carrier?.id,
    policy_number: result.policy_number,
    insurer_covered_percent: result.insurer_covered_percent,
    api_source: result.carrier_code || 'auto'};
  return btoa(JSON.stringify(payload));
}

export function PatientInsuranceFields({ carriers = [] }) {
  const { t } = useTranslation('ops');
  const [tab, setTab] = useState('manual');
  const [manualCarrier, setManualCarrier] = useState('');
  const [manualPolicy, setManualPolicy] = useState('');
  const [pctMode, setPctMode] = useState('preset');
  const [pctPreset, setPctPreset] = useState('');
  const [pctCustom, setPctCustom] = useState('');
  const [autoCarrier, setAutoCarrier] = useState('');
  const [autoExternalId, setAutoExternalId] = useState('');
  const [autoData, setAutoData] = useState('');
  const [lookupState, setLookupState] = useState('idle');
  const [lookupError, setLookupError] = useState('');
  const [lookupResult, setLookupResult] = useState(null);

  const manualPct =
    pctMode === 'preset'
      ? pctPreset
      : String(Math.max(0, Math.min(100, parseInt(pctCustom, 10) || 0)));

  const clearAuto = () => {
    setAutoData('');
    setLookupResult(null);
    setLookupState('idle');
    setLookupError('');
  };

  const runLookup = async () => {
    if (!autoCarrier || !autoExternalId.trim()) {
      setLookupError(t('modals.patientInsurance.err_required'));
      setLookupState('error');
      return;
    }
    setLookupState('loading');
    setLookupError('');
    setLookupResult(null);
    setAutoData('');
    try {
      const res = await fetch('/patients/0/insurance/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carrier_id: parseInt(autoCarrier, 10),
          insurance_id_external: autoExternalId.trim()})});
      const data = await res.json();
      if (!data.ok) {
        setLookupState('error');
        setLookupError(data.error || t('modals.patientInsurance.lookup_failed'));
        return;
      }
      setLookupResult(data.result);
      setAutoData(encodeAutoData(data.result, data.carrier));
      setLookupState('success');
    } catch (err) {
      setLookupState('error');
      setLookupError(err.message || t('modals.patientInsurance.network_error'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === 'manual' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'}`}
          onClick={() => {
            setTab('manual');
            clearAuto();
          }}
        >
          {t('modals.patientInsurance.manual_entry')}
        </button>
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === 'auto' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'}`}
          onClick={() => setTab('auto')}
        >
          {t('modals.patientInsurance.auto_lookup')}
        </button>
      </div>

      {tab === 'manual' ? (
        <div className="space-y-4">
          <input type="hidden" name="ins_auto_data" value="" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="hms-label" htmlFor="rp-ins-carrier">
                {t('modals.patientInsurance.carrier')}
              </label>
              <select
                id="rp-ins-carrier"
                name="ins_carrier_id"
                className="hms-input"
                value={manualCarrier}
                onChange={(e) => setManualCarrier(e.target.value)}
              >
                <option value="">{t('modals.patientInsurance.none')}</option>
                {carriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="hms-label" htmlFor="rp-ins-policy">
                {t('modals.patientInsurance.policy_number')}
              </label>
              <input
                id="rp-ins-policy"
                name="ins_policy_number"
                className="hms-input"
                value={manualPolicy}
                onChange={(e) => setManualPolicy(e.target.value)}
                disabled={!manualCarrier}
              />
            </div>
          </div>

          {manualCarrier ? (
            <div>
              <span className="hms-label">{t('modals.patientInsurance.coverage_share')}</span>
              <input type="hidden" name="ins_insurer_covered_percent" value={manualPct} />
              <div className="mt-2 flex flex-wrap gap-2">
                {PRESET_PCTS.map((p) => (
                  <label
                    key={p}
                    className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                      pctMode === 'preset' && pctPreset === String(p)
                        ? 'border-brand bg-brand-light text-brand'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ins_pct_radio"
                      value={p}
                      className="sr-only"
                      checked={pctMode === 'preset' && pctPreset === String(p)}
                      onChange={() => {
                        setPctMode('preset');
                        setPctPreset(String(p));
                      }}
                    />
                    {p}%
                  </label>
                ))}
                <label
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    pctMode === 'custom'
                      ? 'border-brand bg-brand-light text-brand'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="ins_pct_radio"
                    value=""
                    className="sr-only"
                    checked={pctMode === 'custom'}
                    onChange={() => setPctMode('custom')}
                  />
                  {t('modals.patientInsurance.custom')}
                </label>
              </div>
              {pctMode === 'custom' ? (
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="hms-input mt-2 max-w-[8rem]"
                  value={pctCustom}
                  onChange={(e) => setPctCustom(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder={t('modals.patientInsurance.pct_ph')}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
          <input type="hidden" name="ins_auto_data" value={autoData} />
          <input type="hidden" name="ins_carrier_id" value="" />
          <input type="hidden" name="ins_policy_number" value="" />
          <input type="hidden" name="ins_insurer_covered_percent" value="" />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="hms-label" htmlFor="rp-auto-carrier">
                {t('modals.patientInsurance.carrier')}
              </label>
              <select
                id="rp-auto-carrier"
                className="hms-input"
                value={autoCarrier}
                onChange={(e) => {
                  setAutoCarrier(e.target.value);
                  clearAuto();
                }}
              >
                <option value="">{t('modals.patientInsurance.select_carrier')}</option>
                {carriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="hms-label" htmlFor="rp-auto-id">
                {t('modals.patientInsurance.card_id')}
              </label>
              <div className="flex gap-2">
                <input
                  id="rp-auto-id"
                  className="hms-input min-w-0 flex-1"
                  value={autoExternalId}
                  onChange={(e) => {
                    setAutoExternalId(e.target.value);
                    clearAuto();
                  }}
                  placeholder={t('modals.patientInsurance.card_ph')}
                />
                <button
                  type="button"
                  className="hms-btn-primary shrink-0 whitespace-nowrap px-3"
                  onClick={runLookup}
                  disabled={lookupState === 'loading'}
                >
                  {lookupState === 'loading' ? t('modals.patientInsurance.checking') : t('modals.patientInsurance.lookup')}
                </button>
              </div>
            </div>
          </div>

          {lookupState === 'error' && lookupError ? (
            <p className="text-sm text-red-600">{lookupError}</p>
          ) : null}

          {lookupState === 'success' && lookupResult ? (
            <div className="rounded-lg border border-emerald-200 bg-white p-3 text-sm text-slate-700">
              <p className="font-semibold text-emerald-700">{t('modals.patientInsurance.verify_success')}</p>
              <p>{t('modals.patientInsurance.carrier')}: {lookupResult.carrier_name}</p>
              <p>
                {t('modals.patientInsurance.coverage')}: <strong>{lookupResult.insurer_covered_percent}%</strong>
              </p>
              <p>{t('modals.patientInsurance.policy')}: {lookupResult.policy_number}</p>
              {lookupResult.message ? (
                <p className="mt-1 text-xs italic text-slate-500">{lookupResult.message}</p>
              ) : null}
            </div>
          ) : null}

          <p className="text-xs text-slate-500">
            {t('modals.patientInsurance.auto_save_hint')}
          </p>
        </div>
      )}
    </div>
  );
}
