import { useTranslation } from 'react-i18next';
import { FormField } from '../FormField';
import { formatDate } from '../../lib/listUi';
import { formatMoney } from '../../lib/hmsLocale';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function MatCard({ title, children, className = '' }) {
  return (
    <div className={`mat-card ${className}`.trim()}>
      {title ? <div className="mat-card-head">{title}</div> : null}
      {children}
    </div>
  );
}

function RiskPill({ level }) {
  return <span className={`risk-pill ${level || ''}`}>{level}</span>;
}

export function MaternityChartTabContent({
  tab,
  patientId,
  summary = {},
  billing,
  deliveryId}) {
  const { t } = useTranslation('legacy');
  const tc = (k, def) => t(`maternity_chart.${k}`, { defaultValue: def });
  const dash = tc('dash', '—');
  const p = summary.patient || {};
  const ld = summary.labor_delivery;

  if (tab === 'anc') {
    return (
      <div className="row">
        <div className="col-lg-5 mb-3">
          <form method="post" action={`/maternity/chart/${patientId}/anc`} className="mat-card p-3">
            <h6 className="font-weight-bold mb-3">{tc('record_anc', 'Record ANC visit')}</h6>
            <div className="form-row">
              <div className="form-group col-6">
                <FormField label={tc('visit_date', 'Visit date')} required>
                  <input type="date" name="visit_date" className="hms-input w-full" defaultValue={todayIso()} required />
                </FormField>
              </div>
              <div className="form-group col-6">
                <FormField label={tc('ega_weeks', 'EGA (weeks)')}>
                  <input type="number" name="ega_weeks" className="hms-input w-full" min={0} max={45} />
                </FormField>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group col-4">
                <FormField label={tc('weight_kg', 'Weight (kg)')}>
                  <input type="number" step="0.1" name="weight" className="hms-input w-full" />
                </FormField>
              </div>
              <div className="form-group col-4">
                <FormField label={tc('bp_sys', 'BP sys')}>
                  <input type="number" name="blood_pressure_systolic" className="hms-input w-full" />
                </FormField>
              </div>
              <div className="form-group col-4">
                <FormField label={tc('bp_dia', 'BP dia')}>
                  <input type="number" name="blood_pressure_diastolic" className="hms-input w-full" />
                </FormField>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group col-6">
                <label className="small">{tc('fhr', 'FHR')}</label>
                <input type="number" name="fetal_heart_rate" className="hms-input w-full" />
              </div>
              <div className="form-group col-6">
                <label className="small">{tc('hb', 'Hb')}</label>
                <input type="number" step="0.1" name="haemoglobin" className="hms-input w-full" />
              </div>
            </div>
            <div className="form-group">
              <label className="small">{tc('presentation', 'Presentation')}</label>
              <select name="fetal_presentation" className="hms-input w-full" defaultValue="">
                <option value="">{dash}</option>
                {['cephalic', 'breech', 'transverse', 'oblique', 'unknown'].map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="small">{tc('next_visit', 'Next visit')}</label>
              <input type="date" name="next_visit_date" className="hms-input w-full" />
            </div>
            <div className="form-group">
              <FormField label={tc('notes', 'Notes')}>
                <textarea name="notes" className="hms-input w-full" rows={2} />
              </FormField>
            </div>
            <button type="submit" className="hms-btn hms-btn-primary hms-btn-lg hms-btn-block w-full">
              <i className="fa fa-save mr-1" aria-hidden="true" /> {tc('save_visit', 'Save visit')}
            </button>
          </form>
        </div>
        <div className="col-lg-7">
          <MatCard title={tc('visit_history', 'Visit history')}>
            <div className="table-responsive">
              <table className="table table-sm mb-0">
                <thead>
                  <tr>
                    <th>#</th><th>{tc('th_date', 'Date')}</th><th>{tc('th_ega', 'EGA')}</th>
                    <th>{tc('th_bp', 'BP')}</th><th>{tc('th_fhr', 'FHR')}</th><th>{tc('th_hb', 'Hb')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary.antenatal_visits || []).map((v) => (
                    <tr key={v.id || v.visit_number}>
                      <td>{v.visit_number}</td>
                      <td>{formatDate(v.visit_date)}</td>
                      <td>{v.ega_weeks ?? dash}</td>
                      <td>{v.blood_pressure_systolic}/{v.blood_pressure_diastolic}</td>
                      <td>{v.fetal_heart_rate ?? dash}</td>
                      <td>{v.haemoglobin ?? dash}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MatCard>
        </div>
      </div>
    );
  }

  if (tab === 'scans') {
    return (
      <div className="row">
        <div className="col-lg-5 mb-3">
          <form method="post" action={`/maternity/chart/${patientId}/scan`} className="mat-card p-3">
            <h6 className="font-weight-bold mb-3">{tc('ultrasound_scan', 'Ultrasound scan')}</h6>
            <div className="form-row">
              <div className="form-group col-6">
                <label className="small">{tc('scan_date', 'Scan date')}</label>
                <input type="date" name="scan_date" className="hms-input w-full" defaultValue={todayIso()} />
              </div>
              <div className="form-group col-6">
                <label className="small">{tc('ega_weeks', 'EGA (weeks)')}</label>
                <input type="number" name="ega_by_scan" className="hms-input w-full" min={0} max={45} />
              </div>
            </div>
            <div className="form-group">
              <label className="small">{tc('scan_type', 'Scan type')}</label>
              <select name="scan_type" className="hms-input w-full" defaultValue="dating">
                <option value="dating">{tc('scan_dating', 'Dating')}</option>
                <option value="anomaly">{tc('scan_anomaly', 'Anomaly')}</option>
                <option value="growth">{tc('scan_growth', 'Growth')}</option>
                <option value="doppler">{tc('scan_doppler', 'Doppler')}</option>
              </select>
            </div>
            <div className="form-group">
              <label className="small">{tc('findings', 'Findings')}</label>
              <textarea name="findings" className="hms-input w-full" rows={2} />
            </div>
            <div className="form-group">
              <label className="small">{tc('placenta', 'Placenta')}</label>
              <input type="text" name="placenta_position" className="hms-input w-full" placeholder={tc('placenta_placeholder', 'e.g. anterior low-lying')} />
            </div>
            <div className="form-row">
              <div className="form-group col-6">
                <label className="small">{tc('afi', 'AFI')}</label>
                <input type="number" step="0.1" name="amniotic_fluid_index" className="hms-input w-full" />
              </div>
              <div className="form-group col-6">
                <label className="small">
                  <input type="checkbox" name="fetal_anomaly_detected" value="1" className="mr-1" />
                  {tc('anomaly_detected', 'Anomaly detected')}
                </label>
              </div>
            </div>
            <button type="submit" className="hms-btn hms-btn-primary hms-btn-lg hms-btn-block w-full">
              <i className="fa fa-save mr-1" aria-hidden="true" /> {tc('save_scan', 'Save scan')}
            </button>
          </form>
        </div>
        <div className="col-lg-7">
          <MatCard title={tc('scan_history', 'Scan history')}>
            <div className="table-responsive">
              <table className="table table-sm mb-0">
                <thead>
                  <tr>
                    <th>{tc('th_date', 'Date')}</th><th>{tc('th_type', 'Type')}</th><th>{tc('th_ega', 'EGA')}</th>
                    <th>{tc('placenta', 'Placenta')}</th><th>{tc('th_anomaly', 'Anomaly')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary.ultrasound_scans || []).map((s) => (
                    <tr key={s.id || s.scan_date}>
                      <td>{formatDate(s.scan_date)}</td>
                      <td>{s.scan_type || dash}</td>
                      <td>{s.ega_by_scan ?? dash}</td>
                      <td>{s.placenta_position || dash}</td>
                      <td>{s.fetal_anomaly_detected ? tc('yes', 'Yes') : tc('no', 'No')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MatCard>
        </div>
      </div>
    );
  }

  if (tab === 'risk') {
    return (
      <div className="row">
        <div className="col-md-6">
          <form method="post" action={`/maternity/chart/${patientId}/risk`} className="mat-card p-3">
            <h6 className="font-weight-bold">{tc('risk_assessment', 'Risk assessment')}</h6>
            <p className="small text-muted">{tc('risk_factors_hint', 'Comma-separated risk factor codes')}</p>
            <input type="text" name="risk_factors" className="hms-input w-full mb-2" placeholder={tc('risk_factors_placeholder', 'age_over_35, hypertension')} />
            <textarea name="action_plan" className="hms-input w-full mb-2" rows={3} placeholder={tc('action_plan', 'Action plan')} />
            <button type="submit" className="hms-btn hms-btn-primary">
              <i className="fa fa-save mr-1" aria-hidden="true" /> {tc('save_assessment', 'Save assessment')}
            </button>
          </form>
        </div>
        <div className="col-md-6 mat-card p-3">
          {(summary.risk_assessments || []).map((r) => (
            <div key={r.id || r.assessment_date} className="border-bottom py-2">
              <strong>{r.assessment_date}</strong> — {tc('score_label', 'score {{score}}', { score: r.overall_risk_score })}{' '}
              <RiskPill level={r.risk_level} />
              <div className="small text-muted">{r.action_plan || ''}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tab === 'labor') {
    return (
      <>
        <form method="post" action={`/maternity/chart/${patientId}/labor`} className="mat-card p-3">
          <h6 className="font-weight-bold">{tc('admit_labor', 'Admit to labor ward')}</h6>
          <div className="form-row">
            <div className="form-group col-md-3">
              <label className="small">{tc('admission_type', 'Admission type')}</label>
              <select name="admission_type" className="hms-input w-full" required defaultValue="spontaneous">
                {['spontaneous', 'induced', 'elective_cs', 'emergency'].map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>
            <div className="form-group col-md-2">
              <label className="small">{tc('ega', 'EGA')}</label>
              <input type="number" name="ega_at_admission" className="hms-input w-full" />
            </div>
            <div className="form-group col-md-2">
              <label className="small">{tc('dilation_cm', 'Dilation (cm)')}</label>
              <input type="number" name="cervical_dilation" className="hms-input w-full" min={0} max={10} />
            </div>
            <div className="form-group col-md-2">
              <label className="small">{tc('fhr', 'FHR')}</label>
              <input type="number" name="fhr_at_admission" className="hms-input w-full" />
            </div>
          </div>
          <div className="border rounded p-2 mb-3" style={{ background: '#fff7ed', borderColor: '#fdba74' }}>
            <label className="d-flex align-items-start mb-2 font-weight-bold small">
              <input type="checkbox" name="create_ipd_admission" value="1" defaultChecked className="mr-2 mt-1" />
              <span><i className="fa fa-bed mr-1 text-warning" aria-hidden="true" /> {tc('create_ipd_admission', 'Also create IPD admission')}</span>
            </label>
            <p className="small text-muted mb-2 ml-4">{tc('create_ipd_hint', 'Opens hospital admission for billing and ward board.')}</p>
            <label className="d-flex align-items-center small ml-4 mb-0">
              <input type="checkbox" name="ipd_pay_later" value="1" defaultChecked className="mr-2" />
              {tc('ipd_pay_later', 'Pay later — defer HOS payment code')}
            </label>
          </div>
          <button type="submit" className="hms-btn hms-btn-warning">
            <i className="fa fa-sign-in mr-1" aria-hidden="true" /> {tc('admit_partograph', 'Admit & open partograph')}
          </button>
        </form>
        {ld ? (
          <div className="mt-2 small">
            <p className="mb-1">
              {tc('latest_labor', 'Latest labor: {{status}} since {{date}}', { status: ld.status, date: formatDate(ld.admission_date) })}{' '}
              <a href={`/maternity/labor?labor_id=${ld.id}`}>{tc('open_partograph', 'Open partograph')}</a>
            </p>
            {ld.ipd_admission_id ? (
              <div className="hms-flash hms-flash--success py-2 px-3 mb-0">
                <i className="fa fa-hospital-o mr-1" aria-hidden="true" />
                <strong>{tc('ipd_linked', 'IPD admission')} #{ld.ipd_admission_id}</strong>
                {ld.ipd_ward_name && ld.ipd_bed_label ? (
                  <> · {ld.ipd_ward_name} / {ld.ipd_bed_label}</>
                ) : (
                  <> · {tc('assign_bed', 'Assign bed on')} <a href="/wards">{tc('ward_board', 'ward board')}</a></>
                )}
                {' · '}
                <a href={`/ipd/treatment/${ld.ipd_admission_id}`}>{tc('open_ipd', 'Open IPD')}</a>
              </div>
            ) : null}
          </div>
        ) : null}
      </>
    );
  }

  if (tab === 'delivery') {
    if (!ld) {
      return (
        <div className="mat-card p-4 mb-3">
          <h6 className="font-weight-bold mb-2">{tc('no_labor', 'No labor admission yet')}</h6>
          <p className="small text-muted mb-3">{tc('no_labor_hint', 'Admit the mother to the labor ward before recording a delivery.')}</p>
          <a href={`/maternity/chart/${patientId}?tab=labor`} className="hms-btn hms-btn-warning font-weight-bold">
            <i className="fa fa-heartbeat mr-1" aria-hidden="true" /> {tc('go_labor_admit', 'Go to Labor — admit patient')}
          </a>
        </div>
      );
    }
    if (ld.delivery_id) {
      return (
        <div className="mat-card p-3 mb-3">
          <h6 className="font-weight-bold">{tc('delivery_on_file', 'Delivery on file')}</h6>
          <p className="mb-0 small">
            {ld.delivery_type} · {ld.outcome} · {ld.delivery_date_time}{' '}
            <a href={`/maternity/chart/${patientId}?tab=newborn&delivery_id=${ld.delivery_id}`} className="hms-btn hms-btn-success hms-btn-sm ml-2">
              {tc('register_newborn', 'Register newborn')}
            </a>
          </p>
        </div>
      );
    }
    return (
      <form method="post" action={`/maternity/labor/${ld.id}/delivery`} className="mat-card p-3">
        <h6 className="font-weight-bold">{tc('record_delivery', 'Record delivery')}</h6>
        <input type="hidden" name="register_newborn" value="1" />
        <div className="form-row">
          <div className="form-group col-md-3">
            <label className="small">{tc('delivery_type', 'Type')}</label>
            <select name="delivery_type" className="hms-input w-full" required defaultValue="svd">
              {['svd', 'vacuum', 'forceps', 'emergency_cs', 'elective_cs', 'breech'].map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="form-group col-md-3">
            <label className="small">{tc('outcome', 'Outcome')}</label>
            <select name="outcome" className="hms-input w-full" required defaultValue="live_birth">
              {['live_birth', 'stillbirth', 'nnd', 'maternal_death'].map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="form-group col-md-3">
            <label className="small">{tc('blood_loss', 'Blood loss (ml)')}</label>
            <input type="number" name="blood_loss_estimated" className="hms-input w-full" />
          </div>
          <div className="form-group col-md-3">
            <label className="small">{tc('date_time', 'Date/time')}</label>
            <input type="datetime-local" name="delivery_date_time" className="hms-input w-full" />
          </div>
        </div>
        <button type="submit" className="hms-btn hms-btn-success">
          <i className="fa fa-medkit mr-1" aria-hidden="true" /> {tc('record_delivery_btn', 'Record delivery')}
        </button>
      </form>
    );
  }

  if (tab === 'newborn') {
    const dId = deliveryId || ld?.delivery_id;
    return (
      <div className="row">
        <div className="col-lg-6 mb-3">
          {dId ? (
            <form method="post" action={`/maternity/chart/${patientId}/newborn`} className="mat-card p-3">
              <input type="hidden" name="delivery_record_id" value={dId} />
              <h6 className="font-weight-bold mb-3">{tc('register_newborn', 'Register newborn')}</h6>
              <div className="form-row">
                <div className="form-group col-4">
                  <label className="small">{tc('sex', 'Sex')}</label>
                  <select name="sex" className="hms-input w-full" required defaultValue="male">
                    <option value="male">{tc('sex_male', 'Male')}</option>
                    <option value="female">{tc('sex_female', 'Female')}</option>
                  </select>
                </div>
                <div className="form-group col-4">
                  <label className="small">{tc('birth_weight', 'Weight (kg)')}</label>
                  <input type="number" step="0.001" name="birth_weight" className="hms-input w-full" required />
                </div>
                <div className="form-group col-4">
                  <label className="small">{tc('birth_outcome', 'Outcome')}</label>
                  <select name="birth_outcome" className="hms-input w-full" required defaultValue="alive">
                    <option value="alive">{tc('outcome_alive', 'Alive')}</option>
                    <option value="fresh_stillbirth">{tc('outcome_stillbirth', 'Fresh stillbirth')}</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group col-4">
                  <label className="small">{tc('apgar_1', 'APGAR 1 min')}</label>
                  <input type="number" name="apgar_score_1min" className="hms-input w-full" min={0} max={10} required />
                </div>
                <div className="form-group col-4">
                  <label className="small">{tc('apgar_5', 'APGAR 5 min')}</label>
                  <input type="number" name="apgar_score_5min" className="hms-input w-full" min={0} max={10} required />
                </div>
                <div className="form-group col-4">
                  <label className="small">{tc('time_of_birth', 'Time of birth')}</label>
                  <input type="datetime-local" name="time_of_birth" className="hms-input w-full" />
                </div>
              </div>
              <p className="small font-weight-bold mb-1">{tc('birth_immunizations', 'Birth immunizations')}</p>
              <label className="mr-2"><input type="checkbox" name="vitamin_k_given" value="1" defaultChecked /> {tc('vit_k', 'Vit K')}</label>
              <label className="mr-2"><input type="checkbox" name="bcg_given" value="1" /> {tc('bcg', 'BCG')}</label>
              <label className="mr-2"><input type="checkbox" name="opv0_given" value="1" /> OPV0</label>
              <label className="mr-2"><input type="checkbox" name="hep_b_given" value="1" /> {tc('hep_b', 'Hep B')}</label>
              <label className="d-block mt-2"><input type="checkbox" name="breastfeeding_initiated" value="1" /> {tc('breastfeeding', 'Breastfeeding initiated')}</label>
              <button type="submit" className="hms-btn hms-btn-success hms-btn-block mt-3 w-full">
                <i className="fa fa-child mr-1" aria-hidden="true" /> {tc('save_newborn', 'Save newborn record')}
              </button>
            </form>
          ) : (
            <div className="mat-card p-4">
              <h6 className="font-weight-bold mb-2">{tc('newborn_registration', 'Newborn registration')}</h6>
              {!ld ? (
                <a href={`/maternity/chart/${patientId}?tab=labor`} className="hms-btn hms-btn-warning font-weight-bold mt-2">
                  {tc('step1_admit', 'Step 1 — Admit to labor')}
                </a>
              ) : !ld.delivery_id ? (
                <a href={`/maternity/chart/${patientId}?tab=delivery`} className="hms-btn hms-btn-success font-weight-bold mt-2">
                  {tc('step2_delivery', 'Step 2 — Record delivery')}
                </a>
              ) : null}
            </div>
          )}
        </div>
        <div className="col-lg-6">
          <MatCard title={tc('newborn_records', 'Newborn records')}>
            <div className="p-3">
              {!(summary.newborns || []).length ? (
                <p className="small text-muted mb-0">{tc('none_recorded', 'None recorded.')}</p>
              ) : null}
              {(summary.newborns || []).map((nb) => (
                <div key={nb.id} className="border-bottom py-2">
                  <strong>{nb.sex}</strong> · {nb.birth_weight} kg · APGAR {nb.apgar_score_1min}/{nb.apgar_score_5min}
                </div>
              ))}
            </div>
          </MatCard>
        </div>
      </div>
    );
  }

  if (tab === 'postnatal') {
    return (
      <>
        <form method="post" action={`/maternity/chart/${patientId}/postnatal`} className="mat-card p-3">
          <h6 className="font-weight-bold">{tc('postnatal_visit', 'Postnatal visit (EPDS)')}</h6>
          <div className="form-row">
            <div className="form-group col-md-3">
              <label className="small">{tc('visit_type', 'Visit type')}</label>
              <select name="visit_type" className="hms-input w-full" defaultValue="day1">
                {['day1', 'day3', 'day7', 'week6', 'other'].map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>
            <div className="form-group col-md-3">
              <label className="small">{tc('epds_score', 'EPDS score')}</label>
              <input type="number" name="postpartum_depression_score" className="hms-input w-full" min={0} max={30} />
            </div>
            <div className="form-group col-md-3">
              <label className="small">{tc('bp_sys_dia', 'BP sys/dia')}</label>
              <input type="number" name="bp_systolic" className="hms-input w-full mb-1" />
              <input type="number" name="bp_diastolic" className="hms-input w-full" />
            </div>
          </div>
          <button type="submit" className="hms-btn hms-btn-primary">
            <i className="fa fa-save mr-1" aria-hidden="true" /> {tc('save_postnatal', 'Save postnatal visit')}
          </button>
        </form>
        <MatCard title={tc('postnatal_history', 'Postnatal visit history')} className="mt-3">
          <div className="table-responsive">
            <table className="table table-sm mb-0">
              <thead>
                <tr><th>{tc('th_date', 'Date')}</th><th>{tc('th_type', 'Type')}</th><th>{tc('epds_score', 'EPDS')}</th><th>{tc('th_bp', 'BP')}</th></tr>
              </thead>
              <tbody>
                {(summary.postnatal_visits || []).map((v) => (
                  <tr key={v.id || v.visit_date}>
                    <td>{formatDate(v.visit_date)}</td>
                    <td>{v.visit_type}</td>
                    <td>{v.postpartum_depression_score ?? dash}</td>
                    <td>{v.bp_systolic}/{v.bp_diastolic}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MatCard>
      </>
    );
  }

  if (tab === 'complications') {
    return (
      <>
        <form method="post" action={`/maternity/chart/${patientId}/complication`} className="mat-card p-3 mb-3">
          <h6 className="font-weight-bold">{tc('record_complication', 'Record complication')}</h6>
          <div className="form-row">
            <div className="form-group col-md-3">
              <label className="small">{tc('phase', 'Phase')}</label>
              <select name="phase" className="hms-input w-full" defaultValue="antenatal">
                <option value="antenatal">{tc('phase_antenatal', 'Antenatal')}</option>
                <option value="intrapartum">{tc('phase_intrapartum', 'Intrapartum')}</option>
                <option value="postpartum">{tc('phase_postpartum', 'Postpartum')}</option>
              </select>
            </div>
            <div className="form-group col-md-4">
              <label className="small">{tc('complication_type', 'Type')}</label>
              <input type="text" name="complication_type" className="hms-input w-full" placeholder={tc('complication_placeholder', 'e.g. PPH')} />
            </div>
            <div className="form-group col-md-3">
              <label className="small">{tc('severity', 'Severity')}</label>
              <select name="severity" className="hms-input w-full" defaultValue="mild">
                {['mild', 'moderate', 'severe', 'life_threatening'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <label className="mr-3"><input type="checkbox" name="postpartum_haemorrhage" value="1" /> {tc('pph', 'PPH')}</label>
          <label className="mr-3"><input type="checkbox" name="pre_eclampsia" value="1" /> {tc('pre_eclampsia', 'Pre-eclampsia')}</label>
          <label className="mr-3"><input type="checkbox" name="sepsis" value="1" /> {tc('sepsis', 'Sepsis')}</label>
          <button type="submit" className="hms-btn hms-btn-danger hms-btn-sm mt-2">
            <i className="fa fa-exclamation-triangle mr-1" aria-hidden="true" /> {tc('save_complication', 'Save complication')}
          </button>
        </form>
        <div className="mat-card p-3">
          {(summary.complications || []).map((c) => (
            <div key={c.id} className="py-2 border-bottom">
              <strong>{c.complication_type || c.phase}</strong> · {c.severity} · {formatDate(c.complication_date)}
            </div>
          ))}
        </div>
      </>
    );
  }

  return null;
}

export function MaternityChartBillingPanel({ billing }) {
  const { t } = useTranslation('legacy');
  const tc = (k, def) => t(`maternity_chart.${k}`, { defaultValue: def });
  if (!billing) return null;
  return (
    <div className="mat-card p-3 mb-3" style={{ borderColor: '#86efac', background: '#f0fdf4' }}>
      <h6 className="font-weight-bold mb-2">
        <i className="fa fa-money mr-1 text-success" aria-hidden="true" /> {tc('billing_title', 'Billing & payments')}
      </h6>
      {(billing.suggestions || []).length ? (
        <div className="row">
          {billing.suggestions.map((s) => (
            <div key={s.code || s.label} className="col-md-6 col-lg-4 mb-2">
              <div className="border rounded p-2 h-100 bg-white">
                <div className="small font-weight-bold">{s.label}</div>
                <div className="small text-muted">{formatMoney(s.price || 0)}</div>
                <span className={`badge mt-1 ${s.paid ? 'badge-success' : 'badge-warning'}`}>
                  {s.paid ? tc('billing_paid', 'Paid') : tc('billing_due', 'Payment due')}
                </span>
                {!s.paid && s.cashier_url ? (
                  <a href={s.cashier_url} className="hms-btn hms-btn-success hms-btn-sm hms-btn-block mt-2">
                    {tc('collect_payment', 'Collect at cashier')}
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="small text-muted mb-0">{tc('billing_none', 'Record a clinical visit to see suggested tariffs.')}</p>
      )}
    </div>
  );
}
