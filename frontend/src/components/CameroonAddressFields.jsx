import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

function isOtherCommuneLabel(label) {
  return (
    String(label).indexOf('Autre commune') === 0 ||
    label === 'Other council…' ||
    String(label).indexOf('Other council') === 0
  );
}

function isOtherVillageLabel(label) {
  return String(label).indexOf('Autre') === 0 || label === 'Other (specify)…';
}

export function composeCameroonAddress({
  region,
  division,
  commune,
  communeOther,
  village,
  villageOther,
  detail}) {
  let communeVal = commune;
  if (commune === '__OTHER__') communeVal = (communeOther || '').trim();
  let villageVal = village;
  if (village === '__OTHER__' || (village && String(village).indexOf('Autre') === 0)) {
    const v2 = (villageOther || '').trim();
    if (v2) villageVal = v2;
  }
  const parts = [region, division, communeVal, villageVal, (detail || '').trim()].filter(
    (x) => x && x !== '' && x !== '— Choisir —'
  );
  return parts.join(' | ');
}

export function CameroonAddressFields({ geo }) {
  const { t } = useTranslation('ops');
  const [region, setRegion] = useState('');
  const [division, setDivision] = useState('');
  const [commune, setCommune] = useState('');
  const [communeOther, setCommuneOther] = useState('');
  const [village, setVillage] = useState('');
  const [villageOther, setVillageOther] = useState('');
  const [detail, setDetail] = useState('');

  const divisions = useMemo(() => {
    if (!geo || !region) return [];
    return geo.departments?.[region] || [];
  }, [geo, region]);

  const communes = useMemo(() => {
    if (!geo || !region || !division) return [];
    return geo.communes?.[region]?.[division] || [];
  }, [geo, region, division]);

  const villages = useMemo(() => {
    if (!geo || !region || !division || !commune || commune === '__OTHER__') return [];
    const key = `${region}|${division}|${commune}`;
    const hints = geo.villageHints?.[key] || geo.villageDefaults || [];
    return hints.filter((v) => v !== '— Choisir —');
  }, [geo, region, division, commune]);

  const composed = useMemo(
    () =>
      composeCameroonAddress({
        region,
        division,
        commune,
        communeOther,
        village,
        villageOther,
        detail}),
    [region, division, commune, communeOther, village, villageOther, detail]
  );

  const onRegionChange = (val) => {
    setRegion(val);
    setDivision('');
    setCommune('');
    setCommuneOther('');
    setVillage('');
    setVillageOther('');
  };

  const onDivisionChange = (val) => {
    setDivision(val);
    setCommune('');
    setCommuneOther('');
    setVillage('');
    setVillageOther('');
  };

  const onCommuneChange = (val) => {
    setCommune(val);
    setVillage('');
    setVillageOther('');
  };

  if (!geo) {
    return <p className="text-sm text-slate-500">{t('forms.cameroonAddress.loading')}</p>;
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="address" value={composed} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hms-label" htmlFor="rp-cm-region">
            {t('forms.cameroonAddress.region')}
          </label>
          <select
            id="rp-cm-region"
            name="cm_region"
            className="hms-input"
            value={region}
            onChange={(e) => onRegionChange(e.target.value)}
          >
            <option value="">{t('forms.cameroonAddress.choose_region')}</option>
            {(geo.regions || []).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="hms-label" htmlFor="rp-cm-division">
            {t('forms.cameroonAddress.division')}
          </label>
          <select
            id="rp-cm-division"
            name="cm_division"
            className="hms-input"
            value={division}
            disabled={!region}
            onChange={(e) => onDivisionChange(e.target.value)}
          >
            <option value="">
              {region ? t('forms.cameroonAddress.choose_department') : t('forms.cameroonAddress.choose_region_first')}
            </option>
            {divisions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="hms-label" htmlFor="rp-cm-commune">
            {t('forms.cameroonAddress.commune')}
          </label>
          <select
            id="rp-cm-commune"
            name="cm_commune"
            className="hms-input"
            value={commune}
            disabled={!division}
            onChange={(e) => onCommuneChange(e.target.value)}
          >
            <option value="">
              {division ? t('forms.cameroonAddress.choose_council') : t('forms.cameroonAddress.choose_department_first')}
            </option>
            {communes.map((c) => {
              const val = isOtherCommuneLabel(c) ? '__OTHER__' : c;
              return (
                <option key={c} value={val}>
                  {c}
                </option>
              );
            })}
          </select>
        </div>
        {commune === '__OTHER__' ? (
          <div>
            <label className="hms-label" htmlFor="rp-cm-commune-other">
              {t('forms.cameroonAddress.commune_other')}
            </label>
            <input
              id="rp-cm-commune-other"
              name="cm_commune_other"
              className="hms-input"
              value={communeOther}
              onChange={(e) => setCommuneOther(e.target.value)}
              placeholder={t('forms.cameroonAddress.commune_other_ph')}
            />
          </div>
        ) : null}
        <div>
          <label className="hms-label" htmlFor="rp-cm-village">
            {t('forms.cameroonAddress.village')}
          </label>
          <select
            id="rp-cm-village"
            name="cm_village"
            className="hms-input"
            value={village}
            disabled={!commune || commune === '__OTHER__'}
            onChange={(e) => setVillage(e.target.value)}
          >
            <option value="">
              {commune && commune !== '__OTHER__'
                ? t('forms.cameroonAddress.choose')
                : t('forms.cameroonAddress.choose_council_first')}
            </option>
            {villages.map((v) => {
              const val = isOtherVillageLabel(v) ? '__OTHER__' : v;
              return (
                <option key={v} value={val}>
                  {v}
                </option>
              );
            })}
            {commune && commune !== '__OTHER__' ? (
              <option value="__OTHER__">{t('forms.cameroonAddress.other_specify')}</option>
            ) : null}
          </select>
        </div>
        {village === '__OTHER__' ? (
          <div>
            <label className="hms-label" htmlFor="rp-cm-village-other">
              {t('forms.cameroonAddress.village_other')}
            </label>
            <input
              id="rp-cm-village-other"
              name="cm_village_other"
              className="hms-input"
              value={villageOther}
              onChange={(e) => setVillageOther(e.target.value)}
              placeholder={t('forms.cameroonAddress.village_other_ph')}
            />
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <label className="hms-label" htmlFor="rp-address-detail">
            {t('forms.cameroonAddress.detail')}
          </label>
          <input
            id="rp-address-detail"
            name="address_detail"
            className="hms-input"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={t('forms.cameroonAddress.detail_ph')}
          />
        </div>
      </div>

      {composed ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">{t('forms.cameroonAddress.preview')}</span> {composed}
        </div>
      ) : null}
    </div>
  );
}
