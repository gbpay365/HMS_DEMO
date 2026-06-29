import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { geoFromBoot } from '../lib/hmsLocale';

export function composeCascadeAddress({ region, subRegion, detail }) {
  const parts = [(region || '').trim(), (subRegion || '').trim(), (detail || '').trim()].filter(Boolean);
  return parts.join(' | ');
}

/** Generic region → sub-region cascading dropdowns (profile labels from boot geo). */
export function CascadingAddressFields({ geo }) {
  const { t } = useTranslation('ops');
  const bootGeo = geoFromBoot();
  const regionLabel = geo?.regionLabel || bootGeo.regionLabel || t('forms.cascadeAddress.region', { defaultValue: 'Region' });
  const subRegionLabel =
    geo?.subRegionLabel || bootGeo.subRegionLabel || t('forms.cascadeAddress.sub_region', { defaultValue: 'District' });

  const [region, setRegion] = useState('');
  const [subRegion, setSubRegion] = useState('');
  const [detail, setDetail] = useState('');

  const subRegions = useMemo(() => {
    if (!geo || !region) return [];
    return geo.subRegions?.[region] || [];
  }, [geo, region]);

  const composed = useMemo(
    () => composeCascadeAddress({ region, subRegion, detail }),
    [region, subRegion, detail]
  );

  const onRegionChange = (val) => {
    setRegion(val);
    setSubRegion('');
  };

  if (!geo) {
    return <p className="text-sm text-slate-500">{t('forms.cascadeAddress.loading')}</p>;
  }

  const hasSubRegions = geo.subRegions && Object.keys(geo.subRegions).length > 0;

  return (
    <div className="space-y-3">
      <input type="hidden" name="address" value={composed} readOnly />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">{regionLabel}</span>
          <select
            className="hms-input w-full"
            value={region}
            onChange={(e) => onRegionChange(e.target.value)}
            required
          >
            <option value="">
              {t('forms.cascadeAddress.choose_region', { defaultValue: '— Choose —' })}
            </option>
            {(geo.regions || []).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        {hasSubRegions ? (
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">{subRegionLabel}</span>
            <select
              className="hms-input w-full"
              value={subRegion}
              onChange={(e) => setSubRegion(e.target.value)}
              required
              disabled={!region}
            >
              <option value="">
                {region
                  ? t('forms.cascadeAddress.choose_sub_region', { defaultValue: '— Choose —' })
                  : t('forms.cascadeAddress.choose_region_first', { defaultValue: 'Choose region first' })}
              </option>
              {subRegions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className={`block text-sm ${hasSubRegions ? 'sm:col-span-2' : ''}`}>
          <span className="mb-1 block font-medium text-slate-700">
            {t('forms.cascadeAddress.detail', { defaultValue: 'Street / ward / detail' })}
          </span>
          <input
            className="hms-input w-full"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={t('forms.cascadeAddress.detail_ph', {
              defaultValue: 'House no., street, ward, landmark…',
            })}
          />
        </label>
      </div>
      {composed ? (
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-700">
            {t('forms.cascadeAddress.preview', { defaultValue: 'Address preview:' })}
          </span>{' '}
          {composed}
        </p>
      ) : null}
    </div>
  );
}
