import { useMemo, useState } from 'react';
import { geoFromBoot } from '../lib/hmsLocale';

export function composeProfileAddress({ region, subRegion, detail }) {
  const parts = [(region || '').trim(), (subRegion || '').trim(), (detail || '').trim()].filter(Boolean);
  return parts.join(' | ');
}

/** Generic region / sub-region fields when no dedicated geo API exists for the country. */
export function ProfileAddressFields({ geoLabels }) {
  const bootGeo = geoFromBoot();
  const labels = geoLabels || bootGeo || {};
  const regionLabel = labels.regionLabel || 'Region';
  const subRegionLabel = labels.subRegionLabel || 'District';
  const [region, setRegion] = useState('');
  const [subRegion, setSubRegion] = useState('');
  const [detail, setDetail] = useState('');

  const composed = useMemo(
    () => composeProfileAddress({ region, subRegion, detail }),
    [region, subRegion, detail]
  );

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="form-label text-sm">{regionLabel}</label>
          <input
            className="form-control form-control-sm"
            name="profile_region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label text-sm">{subRegionLabel}</label>
          <input
            className="form-control form-control-sm"
            name="profile_sub_region"
            value={subRegion}
            onChange={(e) => setSubRegion(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-3">
        <label className="form-label text-sm">Street / ward / detail</label>
        <input
          className="form-control form-control-sm"
          name="profile_address_detail"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
        />
      </div>
      <input type="hidden" name="address" value={composed} />
    </>
  );
}
