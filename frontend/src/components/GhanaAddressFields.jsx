import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function composeGhanaAddress({ region, district, detail }) {
  const parts = [(region || '').trim(), (district || '').trim(), (detail || '').trim()].filter(Boolean);
  return parts.join(' | ');
}

export function GhanaAddressFields({ geo }) {
  const { t } = useTranslation('ops');
  const [region, setRegion] = useState('');
  const [district, setDistrict] = useState('');
  const [detail, setDetail] = useState('');

  const districts = useMemo(() => {
    if (!geo || !region) return [];
    return geo.districts?.[region] || geo.subRegions?.[region] || [];
  }, [geo, region]);

  const composed = useMemo(
    () => composeGhanaAddress({ region, district, detail }),
    [region, district, detail]
  );

  const onRegionChange = (val) => {
    setRegion(val);
    setDistrict('');
  };

  if (!geo) {
    return <p className="text-sm text-slate-500">{t('forms.ghanaAddress.loading')}</p>;
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="address" value={composed} readOnly />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            {t('forms.ghanaAddress.region', { defaultValue: 'Region' })}
          </span>
          <select
            className="hms-input w-full"
            value={region}
            onChange={(e) => onRegionChange(e.target.value)}
            required
          >
            <option value="">
              {t('forms.ghanaAddress.choose_region', { defaultValue: '— Choose region —' })}
            </option>
            {(geo.regions || []).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            {t('forms.ghanaAddress.district', { defaultValue: 'District' })}
          </span>
          <select
            className="hms-input w-full"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            required
            disabled={!region}
          >
            <option value="">
              {region
                ? t('forms.ghanaAddress.choose_district', { defaultValue: '— Choose district —' })
                : t('forms.ghanaAddress.choose_region_first', { defaultValue: 'Choose region first' })}
            </option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">
            {t('forms.ghanaAddress.detail', { defaultValue: 'Street / ward / detail' })}
          </span>
          <input
            className="hms-input w-full"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={t('forms.ghanaAddress.detail_ph', {
              defaultValue: 'House no., street, ward, landmark…',
            })}
          />
        </label>
      </div>
      {composed ? (
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-700">
            {t('forms.ghanaAddress.preview', { defaultValue: 'Address preview:' })}
          </span>{' '}
          {composed}
        </p>
      ) : null}
    </div>
  );
}
