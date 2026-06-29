import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { FormField } from '../components/FormField';
import { confirmModal } from '../lib/modalBridge';
import { currencyCode } from '../lib/hmsLocale';

function calcTypeLabel(t, ct) {
  if (ct === 'seniority_scale') return t('settings.calc_seniority', { defaultValue: 'Seniority scale (auto)' });
  if (ct === 'pct_basic') return t('settings.calc_pct_basic', { defaultValue: '% of Basic' });
  const cur = currencyCode();
  if (ct === 'fixed') return t('settings.calc_fixed', { defaultValue: `Fixed amount (${cur})` });
  if (ct === 'per_shift') return t('settings.calc_per_shift', { defaultValue: `Per shift (${cur} × shifts)` });
  return t('settings.calc_disabled', { defaultValue: 'Disabled' });
}

function AllowanceRow({ row, index, canEdit, defRow, t }) {
  const ct = String(row.calc_type || 'none');
  const legalBasis = String(row.legal_basis || '').trim() || String(defRow?.legal_basis || '').trim();
  const desc = String(row.description || '').trim() || String(defRow?.description || '').trim();
  let pctVal = row.pct_value != null && row.pct_value !== '' ? row.pct_value : '';
  if (ct === 'pct_basic' && (pctVal === '' || parseFloat(pctVal) <= 0) && defRow?.pct_value) pctVal = defRow.pct_value;
  const fixedVal = row.fixed_amount != null ? row.fixed_amount : '';
  const unitVal = row.per_unit_amount != null ? row.per_unit_amount : '';

  return (
    <tr>
      <td className="text-center">
        {canEdit ? (
          <input type="checkbox" name="allowance_enabled[]" value={row.code} defaultChecked={!!row.enabled} />
        ) : (
          <i className={`fa ${row.enabled ? 'fa-check-circle text-success' : 'fa-times-circle text-muted'}`} aria-hidden="true" />
        )}
        <input type="hidden" name="allowance_code[]" value={row.code} />
        <input type="hidden" name="allowance_label[]" value={row.label || ''} />
        <input type="hidden" name="allowance_label_fr[]" value={row.label_fr || ''} />
        <input type="hidden" name="allowance_calc_type[]" value={row.calc_type || ''} />
        <input type="hidden" name="allowance_sort_order[]" value={index + 1} />
      </td>
      <td>
        <div className="font-weight-bold">{row.label}</div>
        <div className="text-muted small" style={{ fontStyle: 'italic' }}>{row.label_fr}</div>
        {desc ? <small className="text-muted d-block">{desc.slice(0, 120)}{desc.length > 120 ? '…' : ''}</small> : null}
      </td>
      <td>
        <span className="pay-badge pay-badge-pending text-xs">{calcTypeLabel(t, ct)}</span>
      </td>
      <td>
        {canEdit && ct === 'pct_basic' ? (
          <>
            <input type="number" step="0.01" min={0} max={100} name="allowance_pct_value[]" className="hms-input w-full text-sm" defaultValue={pctVal} />
            <input type="hidden" name="allowance_fixed_amount[]" value={fixedVal} />
            <input type="hidden" name="allowance_per_unit_amount[]" value={unitVal} />
          </>
        ) : canEdit && ct === 'fixed' ? (
          <>
            <input type="number" step="1" min={0} name="allowance_fixed_amount[]" className="hms-input w-full text-sm" defaultValue={fixedVal} />
            <input type="hidden" name="allowance_pct_value[]" value={pctVal} />
            <input type="hidden" name="allowance_per_unit_amount[]" value={unitVal} />
          </>
        ) : canEdit && ct === 'per_shift' ? (
          <>
            <input type="number" step="1" min={0} name="allowance_per_unit_amount[]" className="hms-input w-full text-sm" defaultValue={unitVal} />
            <input type="hidden" name="allowance_pct_value[]" value={pctVal} />
            <input type="hidden" name="allowance_fixed_amount[]" value={fixedVal} />
          </>
        ) : (
          <>
            <input type="hidden" name="allowance_pct_value[]" value={pctVal} />
            <input type="hidden" name="allowance_fixed_amount[]" value={fixedVal} />
            <input type="hidden" name="allowance_per_unit_amount[]" value={unitVal} />
            <span className="text-muted small">—</span>
          </>
        )}
      </td>
      <td>
        {canEdit && ct === 'seniority_scale' ? (
          <input type="number" step="0.1" min={0} max={100} name="allowance_cap_pct[]" className="hms-input w-full text-sm" defaultValue={row.cap_pct ?? ''} />
        ) : (
          <>
            <input type="hidden" name="allowance_cap_pct[]" value={row.cap_pct ?? ''} />
            <span className="text-muted small">{row.cap_pct ? `${row.cap_pct}%` : '—'}</span>
          </>
        )}
      </td>
      <td>
        <small className="text-muted">{legalBasis}</small>
        <input type="hidden" name="allowance_legal_basis[]" value={legalBasis} />
        <input type="hidden" name="allowance_description[]" value={desc} />
        <input type="hidden" name="allowance_applies_roles[]" value={row.applies_to_roles || ''} />
      </td>
    </tr>
  );
}

export function PayrollSettingsPageApp({
  current = {},
  brackets = [],
  canEdit = false,
  allowanceSettings = [],
  allowanceDefaultsByCode = {},
  activeSector = 'medical',
  allSectors = {},
  flash = null,
  error = null,
  initialTab = 'employer'}) {
  const { t } = useTranslation('payroll');
  const [tab, setTab] = useState(initialTab === 'allowances' ? 'allowances' : initialTab);
  const b = [brackets[0] || {}, brackets[1] || {}, brackets[2] || {}, brackets[3] || {}, brackets[4] || {}];
  const reg = parseInt(current.cnps_regime, 10) || 1;
  const sectorEntries = useMemo(() => Object.entries(allSectors || {}), [allSectors]);

  const tabs = [
    { id: 'employer', label: t('settings.tab_employer', { defaultValue: 'Employer' }) },
    { id: 'deductions', label: t('settings.tab_deductions', { defaultValue: 'Deductions (%)' }) },
    { id: 'irpp', label: t('settings.tab_irpp', { defaultValue: 'IRPP brackets' }) },
    { id: 'allowances', label: t('settings.tab_allowances', { defaultValue: 'Allowances & Bonuses' }) },
  ];

  return (
    <div className="payroll-settings-react">
      <FlashMessages flash={flash} error={error} />

      <div className="pay-hero">
        <h1>{t('settings.title', { defaultValue: 'Payroll tax settings' })}</h1>
      </div>

      <div className="pay-panel">
        <div className="flex flex-wrap gap-1 border-b border-slate-200 px-3 pt-3" role="tablist">
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={tab === x.id}
              className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${tab === x.id ? 'bg-white text-brand-dark border border-b-0 border-slate-200' : 'text-slate-500 hover:bg-slate-50'}`}
              onClick={() => setTab(x.id)}
            >
              {x.id === 'allowances' ? <><i className="fa fa-star mr-1" aria-hidden="true" />{x.label}</> : x.label}
            </button>
          ))}
        </div>

        {tab !== 'allowances' ? (
        <form method="POST" action="/payroll/settings/save" id="paySettingsForm" onSubmit={canEdit ? undefined : (e) => e.preventDefault()}>
        <div className="pay-panel-body">
          {tab === 'employer' ? (
            <div className="row">
              <div className="col-md-6">
                <FormField label={t('settings.cnps_employer_number', { defaultValue: 'CNPS employer number' })}>
                  <input type="text" name="employer_cnps_number" className="hms-input w-full" defaultValue={current.employer_cnps_number || ''} readOnly={!canEdit} />
                </FormField>
                <FormField label={t('settings.niu', { defaultValue: 'NIU (fiscal ID)' })}>
                  <input type="text" name="employer_niu" className="hms-input w-full" defaultValue={current.employer_niu || ''} readOnly={!canEdit} />
                </FormField>
                <FormField label={t('settings.cnps_regime', { defaultValue: 'CNPS regime' })}>
                  {canEdit ? (
                    <select name="cnps_regime" className="hms-input w-full" defaultValue={reg}>
                      <option value="1">{t('settings.regime_general', { defaultValue: 'General' })}</option>
                      <option value="2">{t('settings.regime_agriculture', { defaultValue: 'Agriculture' })}</option>
                      <option value="3">{t('settings.regime_public', { defaultValue: 'Public' })}</option>
                    </select>
                  ) : (
                    <p className="hms-input w-full rounded border bg-light px-3 py-2 small mb-0">{reg === 2 ? t('settings.regime_agriculture') : reg === 3 ? t('settings.regime_public') : t('settings.regime_general')}</p>
                  )}
                </FormField>
                <FormField label={t('settings.activity_sector', { defaultValue: 'Activity Sector' })}>
                  {canEdit ? (
                    <select name="default_sector" className="hms-input w-full" defaultValue={current.default_sector || 'medical'}>
                      {sectorEntries.map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="hms-input w-full rounded border bg-light px-3 py-2 small mb-0">{allSectors[current.default_sector || 'medical'] || current.default_sector}</p>
                  )}
                </FormField>
              </div>
              <div className="col-md-6">
                <FormField label={t('settings.address', { defaultValue: 'Address' })}>
                  <textarea name="employer_address" className="hms-input w-full" rows={3} defaultValue={current.employer_address || ''} readOnly={!canEdit} />
                </FormField>
                <FormField label={t('settings.phone', { defaultValue: 'Phone' })}>
                  <input type="text" name="employer_phone" className="hms-input w-full" defaultValue={current.employer_phone || ''} readOnly={!canEdit} />
                </FormField>
                <FormField label={t('settings.email', { defaultValue: 'Email' })}>
                  <input type="email" name="employer_email" className="hms-input w-full" defaultValue={current.employer_email || ''} readOnly={!canEdit} />
                </FormField>
              </div>
            </div>
          ) : null}

          {tab === 'deductions' ? (
            <div className="row">
              {[
                ['cnps_employee_rate', 'settings.cnps_employee', 4.2],
                ['cimr_employee_rate', 'settings.cfc_employee', 1.0],
                ['development_tax_rate', 'settings.fne', 1.0],
              ].map(([name, labelKey, fallback]) => (
                <div key={name} className="col-md-4">
                  <FormField label={t(labelKey)}>
                    <input type="number" step="0.01" name={name} className="hms-input w-full" defaultValue={current[name] ?? fallback} readOnly={!canEdit} />
                  </FormField>
                </div>
              ))}
              <input type="hidden" name="crtv_rate" value="0" />
              <input type="hidden" name="council_tax_rate" value="0" />
              <input type="hidden" name="cnhc_rate" value="0" />
            </div>
          ) : null}

          {tab === 'irpp' ? (
            <>
              {[
                ['tax_rate_1', 'settings.bracket_1', 10, b[0]],
                ['tax_rate_2', 'settings.bracket_2', 15, b[1]],
                ['tax_rate_3', 'settings.bracket_3', 25, b[2]],
                ['tax_rate_4', 'settings.bracket_4', 35, b[3]],
                ['tax_rate_5', 'settings.bracket_5', 35, b[4]],
              ].map(([name, labelKey, fallback, bracket]) => (
                <div key={name} className="pay-bracket-row">
                  <span className="small font-weight-bold">{t(labelKey)}</span>
                  <input type="number" step="0.01" name={name} className="hms-input w-full text-sm" defaultValue={bracket.rate != null ? bracket.rate : fallback} readOnly={!canEdit} />
                </div>
              ))}
              <FormField label={t('settings.tax_year', { defaultValue: 'Tax year' })} className="mt-3">
                <input type="number" name="tax_year" className="hms-input w-full" style={{ maxWidth: 140 }} defaultValue={current.tax_year} readOnly={!canEdit} />
              </FormField>
            </>
          ) : null}
        </div>

        {canEdit ? (
          <div className="pay-panel-body border-top pt-3">
            <button type="submit" className="hms-btn hms-btn-primary">
              <i className="fa fa-save mr-1" aria-hidden="true" /> {t('settings.save_settings', { defaultValue: 'Save settings' })}
            </button>
          </div>
        ) : null}
        </form>
        ) : null}

        {tab === 'allowances' ? (
        <div className="pay-panel-body">
            <form method="POST" action="/payroll/settings/allowances/save" id="allowanceForm">
              <input type="hidden" name="sector" value={activeSector} />
              <div className="mb-3 d-flex justify-content-end">
                <select
                  className="hms-input w-full text-sm"
                  style={{ maxWidth: 220 }}
                  defaultValue={activeSector}
                  onChange={(ev) => { window.location.href = `/payroll/settings?tab=allowances&sector=${encodeURIComponent(ev.target.value)}`; }}
                >
                  {sectorEntries.map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              {canEdit && activeSector === 'medical' ? (
                <a
                  href={`/payroll/settings?repair_allowances=1&sector=${encodeURIComponent(activeSector)}&tab=allowances`}
                  className="hms-btn hms-btn-outline-primary hms-btn-sm mb-3 d-inline-block"
                  onClick={async (ev) => {
                    const ok = await confirmModal({
                      title: t('settings.restore_medical', { defaultValue: 'Restore medical defaults' }),
                      message: t('settings.restore_confirm', { defaultValue: 'Restore medical allowance rates to Cameroon defaults?' }),
                      confirmLabel: t('common.save', { defaultValue: 'Confirm' })});
                    if (!ok) ev.preventDefault();
                  }}
                >
                  <i className="fa fa-wrench mr-1" aria-hidden="true" /> {t('settings.restore_medical', { defaultValue: 'Restore medical defaults' })}
                </a>
              ) : null}
              <div className="pay-table-wrap">
                <table className="pay-table text-sm">
                  <thead>
                    <tr>
                      <th className="text-center">{t('settings.col_on', { defaultValue: 'On' })}</th>
                      <th>{t('settings.col_label', { defaultValue: 'Label' })}</th>
                      <th>{t('settings.col_formula', { defaultValue: 'Formula type' })}</th>
                      <th>{t('settings.col_rate', { defaultValue: 'Rate / Amt' })}</th>
                      <th>{t('settings.col_cap', { defaultValue: 'Cap %' })}</th>
                      <th>{t('settings.col_legal', { defaultValue: 'Legal basis' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allowanceSettings.map((row, ri) => (
                      <AllowanceRow
                        key={row.code}
                        row={row}
                        index={ri}
                        canEdit={canEdit}
                        defRow={allowanceDefaultsByCode[row.code]}
                        t={t}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {canEdit ? (
                <div className="pt-3">
                  <button type="submit" className="hms-btn hms-btn-primary">
                    <i className="fa fa-save mr-1" aria-hidden="true" /> {t('settings.save_allowances', { defaultValue: 'Save allowance settings' })}
                  </button>
                </div>
              ) : null}
            </form>
        </div>
        ) : null}
      </div>
    </div>
  );
}
