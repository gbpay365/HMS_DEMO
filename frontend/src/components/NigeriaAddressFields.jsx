import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function composeNigeriaAddress({ state, lga, lgaOther, detail }) {
  let lgaVal = lga;
  if (lga === '__OTHER__') lgaVal = (lgaOther || '').trim();
  const parts = [state, lgaVal, (detail || '').trim()].filter(Boolean);
  return parts.join(' | ');
}

export function NigeriaAddressFields({ geo }) {
  const { t } = useTranslation('ops');
  const [zone, setZone] = useState('');
  const [state, setState] = useState('');
  const [lga, setLga] = useState('');
  const [lgaOther, setLgaOther] = useState('');
  const [detail, setDetail] = useState('');

  const zoneStates = useMemo(() => {
    if (!geo || !zone) return geo?.states || [];
    return geo.zones?.[zone] || [];
  }, [geo, zone]);

  const lgas = useMemo(() => {
    if (!geo || !state) return [];
    return geo.lgas?.[state] || [];
  }, [geo, state]);

  const composed = useMemo(
    () => composeNigeriaAddress({ state, lga, lgaOther, detail }),
    [state, lga, lgaOther, detail]
  );

  const onZoneChange = (val) => {
    setZone(val);
    setState('');
    setLga('');
    setLgaOther('');
  };

  const onStateChange = (val) => {
    setState(val);
    setLga('');
    setLgaOther('');
  };

  if (!geo) {
    return <p className="text-sm text-slate-500">{t('forms.nigeriaAddress.loading')}</p>;
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="address" value={composed} readOnly />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            {t('forms.nigeriaAddress.zone', { defaultValue: 'Geopolitical zone' })}
          </span>
          <select
            className="hms-input w-full"
            value={zone}
            onChange={(e) => onZoneChange(e.target.value)}
          >
            <option value="">
              {t('forms.nigeriaAddress.choose_zone', { defaultValue: '— All zones —' })}
            </option>
            {Object.keys(geo.zones || {}).map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            {t('forms.nigeriaAddress.state', { defaultValue: 'State' })}
          </span>
          <select
            className="hms-input w-full"
            value={state}
            onChange={(e) => onStateChange(e.target.value)}
            required
          >
            <option value="">
              {t('forms.nigeriaAddress.choose_state', { defaultValue: '— Choose state —' })}
            </option>
            {(zone ? zoneStates : geo.states || []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            {t('forms.nigeriaAddress.lga', { defaultValue: 'LGA' })}
          </span>
          <select
            className="hms-input w-full"
            value={lga}
            onChange={(e) => setLga(e.target.value)}
            required
            disabled={!state}
          >
            <option value="">
              {state
                ? t('forms.nigeriaAddress.choose_lga', { defaultValue: '— Choose LGA —' })
                : t('forms.nigeriaAddress.choose_state_first', { defaultValue: 'Choose state first' })}
            </option>
            {lgas.map((row) => (
              <option key={row} value={row}>
                {row}
              </option>
            ))}
            <option value="__OTHER__">
              {t('forms.nigeriaAddress.other_specify', { defaultValue: 'Other (specify)…' })}
            </option>
          </select>
        </label>
        {lga === '__OTHER__' ? (
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              {t('forms.nigeriaAddress.lga_other', { defaultValue: 'LGA name' })}
            </span>
            <input
              className="hms-input w-full"
              value={lgaOther}
              onChange={(e) => setLgaOther(e.target.value)}
              placeholder={t('forms.nigeriaAddress.lga_other_ph', { defaultValue: 'Enter LGA' })}
            />
          </label>
        ) : null}
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">
            {t('forms.nigeriaAddress.detail', { defaultValue: 'Street / landmark / estate' })}
          </span>
          <input
            className="hms-input w-full"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={t('forms.nigeriaAddress.detail_ph', {
              defaultValue: 'House no., street, estate, landmark…',
            })}
          />
        </label>
      </div>
      {composed ? (
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-700">
            {t('forms.nigeriaAddress.preview', { defaultValue: 'Address preview:' })}
          </span>{' '}
          {composed}
        </p>
      ) : null}
    </div>
  );
}
