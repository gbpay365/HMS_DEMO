import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CameroonAddressFields } from '../components/CameroonAddressFields';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { FormErrorBanner } from '../components/FormErrorBanner';
import { FormField } from '../components/FormField';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';
import { PatientInsuranceFields } from '../components/PatientInsuranceFields';
import { DateDmyInput } from '../components/DateDmyInput';
import {
  filterPhoneInput,
  isValidEmail,
  isValidOptionalPhone,
  isValidPhone,
  isoToDmy,
  parseDmyToIso} from '../lib/formValidation';

const INITIAL = {
  dobMode: 'dob',
  portalEnabled: false,
  openCredit: false,
  emergencyCredit: false,
  formError: '',
  dobDmy: '',
  cniDateDmy: '',
  phone: '',
  email: '',
  nokPhone: '',
  emergPhone: ''};

export function RegisterPatientModal({ open, onClose, fromMaternity = false }) {
  const { t } = useTranslation(['ops', 'clinical']);
  const datePh = t('modals.registerPatient.date_ph');
  const [state, setState] = useState(INITIAL);
  const [geo, setGeo] = useState(null);
  const [carriers, setCarriers] = useState([]);
  const [formKey, setFormKey] = useState(0);
  const dobHiddenRef = useRef(null);
  const cniDateHiddenRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setState(INITIAL);
      setFormKey((k) => k + 1);
      return undefined;
    }

    let cancelled = false;
    setState(INITIAL);

    Promise.all([
      fetch('/api/cameroon-geo').then((r) => r.json()),
      fetch('/api/insurance/carriers').then((r) => r.json()),
    ])
      .then(([geoData, carrierRows]) => {
        if (cancelled) return;
        setGeo(geoData);
        setCarriers(Array.isArray(carrierRows) ? carrierRows : []);
      })
      .catch(() => {
        if (!cancelled) {
          setGeo({ regions: [], departments: {}, communes: {}, villageDefaults: [], villageHints: {} });
          setCarriers([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setState((s) => ({ ...s, formError: '' }));
    const form = e.currentTarget;
    const fd = new FormData(form);
    const portalOn = fd.get('portal_enabled');
    const email = String(state.email || '').trim();

    if (portalOn && !email) {
      setState((s) => ({
        ...s,
        formError: t('modals.registerPatient.err_email_portal')}));
      return;
    }
    if (email && !isValidEmail(email)) {
      setState((s) => ({
        ...s,
        formError: t('modals.registerPatient.err_email_format')}));
      return;
    }
    if (!isValidPhone(state.phone)) {
      setState((s) => ({
        ...s,
        formError: t('modals.registerPatient.err_phone_format')}));
      return;
    }
    if (!isValidOptionalPhone(state.nokPhone)) {
      setState((s) => ({
        ...s,
        formError: t('modals.registerPatient.err_nok_phone_format')}));
      return;
    }
    if (!isValidOptionalPhone(state.emergPhone)) {
      setState((s) => ({
        ...s,
        formError: t('modals.registerPatient.err_emerg_phone_format')}));
      return;
    }

    if (state.dobMode === 'dob') {
      const dobIso = parseDmyToIso(state.dobDmy);
      if (!dobIso) {
        setState((s) => ({
          ...s,
          formError: t('modals.registerPatient.err_dob_format')}));
        return;
      }
      if (dobHiddenRef.current) dobHiddenRef.current.value = dobIso;
    } else if (dobHiddenRef.current) {
      dobHiddenRef.current.value = '';
    }

    if (state.cniDateDmy.trim()) {
      const cniIso = parseDmyToIso(state.cniDateDmy);
      if (!cniIso) {
        setState((s) => ({
          ...s,
          formError: t('modals.registerPatient.err_date_format')}));
        return;
      }
      if (cniDateHiddenRef.current) cniDateHiddenRef.current.value = cniIso;
    } else if (cniDateHiddenRef.current) {
      cniDateHiddenRef.current.value = '';
    }

    const carrierId = String(fd.get('ins_carrier_id') || '').trim();
    const autoData = String(fd.get('ins_auto_data') || '').trim();
    const pct = parseInt(String(fd.get('ins_insurer_covered_percent') || ''), 10);
    if (carrierId && !autoData && (!Number.isFinite(pct) || pct <= 0)) {
      setState((s) => ({
        ...s,
        formError: t('modals.registerPatient.err_insurance_pct')}));
      return;
    }

    form.submit();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modals.registerPatient.title')}
      subtitle={t('modals.registerPatient.subtitle')}
      size="xl"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton form="hms-register-patient-form" label={t('modals.registerPatient.register')} />
        </>
      }
    >
      <form
        key={formKey}
        id="hms-register-patient-form"
        method="post"
        action="/patients/add"
        className="space-y-5"
        onSubmit={handleSubmit}
      >
        <input type="hidden" name="ap_dob_mode" value={state.dobMode} />
        <input type="hidden" name="dob" ref={dobHiddenRef} defaultValue="" />
        <input type="hidden" name="cni_issue_date" ref={cniDateHiddenRef} defaultValue="" />
        {fromMaternity ? <input type="hidden" name="from" value="maternity" /> : null}

        <FormErrorBanner message={state.formError} />

        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-brand">{t('modals.registerPatient.section_identity')}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('modals.registerPatient.first_name')} htmlFor="rp-fn" required>
              <input id="rp-fn" name="first_name" required className="hms-input" autoComplete="given-name" />
            </FormField>
            <FormField label={t('modals.registerPatient.last_name')} htmlFor="rp-ln">
              <input id="rp-ln" name="last_name" className="hms-input" autoComplete="family-name" />
            </FormField>
            <FormField label={t('modals.registerPatient.cni')} htmlFor="rp-cni">
              <input id="rp-cni" name="cni_number" className="hms-input" />
            </FormField>
            <FormField label={t('modals.registerPatient.cni_issue_date')} htmlFor="rp-cni-date">
              <DateDmyInput
                id="rp-cni-date"
                placeholder={datePh}
                value={parseDmyToIso(state.cniDateDmy) || ''}
                onChange={(iso) => setState((s) => ({ ...s, cniDateDmy: iso ? isoToDmy(iso) : '' }))}
              />
            </FormField>
            <FormField label={t('modals.registerPatient.dob')} htmlFor={state.dobMode === 'dob' ? 'rp-dob' : 'rp-age'} required>
              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${state.dobMode === 'dob' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'}`}
                  onClick={() => setState((s) => ({ ...s, dobMode: 'dob' }))}
                >
                  {t('modals.registerPatient.dob_mode')}
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${state.dobMode === 'age' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'}`}
                  onClick={() => setState((s) => ({ ...s, dobMode: 'age' }))}
                >
                  {t('modals.registerPatient.age_only_mode')}
                </button>
              </div>
              {state.dobMode === 'dob' ? (
                <DateDmyInput
                  id="rp-dob"
                  placeholder={datePh}
                  autoComplete="bday"
                  required
                  value={parseDmyToIso(state.dobDmy) || ''}
                  onChange={(iso) => setState((s) => ({ ...s, dobDmy: iso ? isoToDmy(iso) : '' }))}
                />
              ) : (
                <input
                  id="rp-age"
                  name="age_years"
                  type="number"
                  min="0"
                  max="130"
                  required
                  className="hms-input"
                  placeholder={t('modals.registerPatient.age_ph')}
                />
              )}
            </FormField>
            <FormField label={t('modals.registerPatient.gender')} htmlFor="rp-gender" required>
              <select id="rp-gender" name="gender" required className="hms-input">
                <option value="Male">{t('modals.registerPatient.male')}</option>
                <option value="Female">{t('modals.registerPatient.female')}</option>
              </select>
            </FormField>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-brand">{t('modals.registerPatient.section_care')}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('modals.registerPatient.patient_type')} htmlFor="rp-type" required>
              <select id="rp-type" name="patient_type" required className="hms-input">
                <option value="OutPatient">{t('modals.registerPatient.outpatient')}</option>
                <option value="InPatient">{t('modals.registerPatient.inpatient')}</option>
              </select>
            </FormField>
            <FormField label={t('modals.registerPatient.phone')} htmlFor="rp-phone" required>
              <input
                id="rp-phone"
                name="phone"
                type="tel"
                required
                className="hms-input"
                maxLength={32}
                inputMode="tel"
                autoComplete="tel"
                value={state.phone}
                onChange={(ev) => setState((s) => ({ ...s, phone: filterPhoneInput(ev.target.value) }))}
              />
            </FormField>
            <FormField
              label={t('modals.registerPatient.email')}
              htmlFor="rp-email"
              required={state.portalEnabled}
              hint={state.portalEnabled ? t('modals.registerPatient.email_portal_required') : ''}
              className="sm:col-span-2"
            >
              <input
                id="rp-email"
                name="email"
                type="email"
                className="hms-input"
                autoComplete="email"
                required={state.portalEnabled}
                value={state.email}
                onChange={(ev) => setState((s) => ({ ...s, email: ev.target.value.trimStart() }))}
              />
            </FormField>
          </div>
        </section>

        <CollapsibleSection
          number="3"
          title={t('modals.registerPatient.location_title')}
          hint={t('modals.registerPatient.location_hint')}
          accent="slate"
        >
          <CameroonAddressFields geo={geo} />
        </CollapsibleSection>

        <CollapsibleSection number="4" title={t('modals.registerPatient.nok_title')} hint={t('modals.registerPatient.nok_hint')} accent="slate">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label={t('modals.registerPatient.full_name')} htmlFor="rp-nok-name">
              <input id="rp-nok-name" name="next_of_kin_name" className="hms-input" />
            </FormField>
            <FormField label={t('modals.registerPatient.relationship')} htmlFor="rp-nok-rel" hint={t('modals.registerPatient.relationship_ph')}>
              <input id="rp-nok-rel" name="next_of_kin_relationship" className="hms-input" placeholder={t('modals.registerPatient.relationship_ph')} />
            </FormField>
            <FormField label={t('modals.registerPatient.phone')} htmlFor="rp-nok-phone">
              <input
                id="rp-nok-phone"
                name="next_of_kin_phone"
                type="tel"
                className="hms-input"
                maxLength={32}
                inputMode="tel"
                value={state.nokPhone}
                onChange={(ev) => setState((s) => ({ ...s, nokPhone: filterPhoneInput(ev.target.value) }))}
              />
            </FormField>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          number="5"
          title={t('modals.registerPatient.emergency_title')}
          hint={t('modals.registerPatient.emergency_hint')}
          accent="slate"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('modals.registerPatient.full_name')} htmlFor="rp-emerg-name">
              <input id="rp-emerg-name" name="emergency_contact_name" className="hms-input" />
            </FormField>
            <FormField label={t('modals.registerPatient.phone')} htmlFor="rp-emerg-phone">
              <input
                id="rp-emerg-phone"
                name="emergency_contact_phone"
                type="tel"
                className="hms-input"
                maxLength={32}
                inputMode="tel"
                value={state.emergPhone}
                onChange={(ev) => setState((s) => ({ ...s, emergPhone: filterPhoneInput(ev.target.value) }))}
              />
            </FormField>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          number="6"
          title={t('modals.registerPatient.portal_title')}
          hint={t('modals.registerPatient.portal_hint')}
          accent="indigo"
        >
          <div className="space-y-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="portal_enabled"
                value="1"
                className="mt-1 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/30"
                checked={state.portalEnabled}
                onChange={(e) => setState((s) => ({ ...s, portalEnabled: e.target.checked }))}
              />
              <span>
                <span className="block text-sm font-semibold text-ink">{t('modals.registerPatient.portal_enable')}</span>
                <span className="block text-xs text-slate-500">
                  {t('modals.registerPatient.portal_enable_hint')}
                </span>
              </span>
            </label>
            <FormField label={t('modals.registerPatient.account_status')} htmlFor="rp-status" className="max-w-xs">
              <select id="rp-status" name="status" className="hms-input" defaultValue="1">
                <option value="1">{t('modals.registerPatient.active')}</option>
                <option value="0">{t('modals.registerPatient.inactive')}</option>
              </select>
            </FormField>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          number="7"
          title={t('modals.registerPatient.credit_title')}
          hint={t('modals.registerPatient.credit_hint')}
          accent="amber"
        >
          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="open_credit_line"
                value="1"
                className="mt-1 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/30"
                checked={state.openCredit}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    openCredit: e.target.checked,
                    emergencyCredit: e.target.checked ? s.emergencyCredit : false}))
                }
              />
              <span>
                <span className="block text-sm font-semibold text-ink">{t('modals.registerPatient.credit_open')}</span>
                <span className="block text-xs text-slate-500">{t('modals.registerPatient.credit_open_hint')}</span>
              </span>
            </label>
            {state.openCredit ? (
              <label className="ml-7 flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  name="emergency_credit_pending"
                  value="1"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-300"
                  checked={state.emergencyCredit}
                  onChange={(e) => setState((s) => ({ ...s, emergencyCredit: e.target.checked }))}
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">{t('modals.registerPatient.credit_emergency')}</span>
                  <span className="block text-xs text-slate-500">{t('modals.registerPatient.credit_emergency_hint')}</span>
                </span>
              </label>
            ) : null}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          number="8"
          title={t('modals.registerPatient.insurance_title')}
          hint={t('modals.registerPatient.insurance_hint')}
          accent="emerald"
        >
          <PatientInsuranceFields carriers={carriers} />
        </CollapsibleSection>
      </form>
    </Modal>
  );
}
