import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormErrorBanner } from '../components/FormErrorBanner';
import { FormField } from '../components/FormField';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';
import { DateDmyInput } from '../components/DateDmyInput';
import {
  filterPhoneInput,
  isValidEmail,
  isValidOptionalPhone,
  isValidPhone,
  isoToDmy,
  parseDmyToIso} from '../lib/formValidation';
import { applyPhoneDialPrefix, patientRegistrationFromBoot } from '../lib/hmsLocale';

export function EditPatientModal({ open, onClose, patientId }) {
  const { t } = useTranslation(['ops', 'clinical']);
  const patientReg = patientRegistrationFromBoot();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    gender: 'Male',
    dobDmy: '',
    age_years: '',
    age_only: false,
    patient_type: 'OutPatient',
    cni_number: '',
    phone: '',
    email: '',
    address: '',
    next_of_kin_name: '',
    next_of_kin_relationship: '',
    next_of_kin_phone: '',
    portal_enabled: false});
  const [dobMode, setDobMode] = useState('dob');
  const dobHiddenRef = useRef(null);
  const datePh = t('modals.registerPatient.date_ph');

  useEffect(() => {
    if (!open || !patientId) return;
    setLoading(true);
    setLoadError('');
    setFormError('');
    fetch(`/patients/edit/${patientId}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((p) => {
        const ageOnly = p.age_only_registration == 1 || p.age_only_registration === true;
        const dobRaw = p.dob != null ? String(p.dob).trim() : '';
        const hasDob = dobRaw !== '';
        const hasAge = p.age_years != null && String(p.age_years).trim() !== '';
        setDobMode(ageOnly || (!hasDob && hasAge) ? 'age' : 'dob');
        setForm({
          first_name: p.first_name || '',
          last_name: p.last_name || '',
          gender: p.gender || 'Male',
          dobDmy: hasDob ? isoToDmy(dobRaw.split('T')[0].split(' ')[0]) : '',
          age_years: p.age_years != null ? String(p.age_years) : '',
          age_only: ageOnly,
          patient_type: p.patient_type || 'OutPatient',
          cni_number: p.cni_number || '',
          phone: p.phone || '',
          email: p.email || '',
          address: p.address || '',
          next_of_kin_name: p.next_of_kin_name || '',
          next_of_kin_relationship: p.next_of_kin_relationship || '',
          next_of_kin_phone: p.next_of_kin_phone || '',
          portal_enabled: parseInt(p.portal_enabled, 10) === 1});
      })
      .catch(() => setLoadError(t('modals.editPatient.load_failed')))
      .finally(() => setLoading(false));
  }, [open, patientId, t]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');
    const formEl = e.currentTarget;
    const email = String(form.email || '').trim();

    if (form.portal_enabled && !email) {
      setFormError(t('modals.registerPatient.err_email_portal'));
      return;
    }
    if (email && !isValidEmail(email)) {
      setFormError(t('modals.registerPatient.err_email_format'));
      return;
    }
    if (!isValidPhone(form.phone)) {
      setFormError(t('modals.registerPatient.err_phone_format'));
      return;
    }
    if (!isValidOptionalPhone(form.next_of_kin_phone)) {
      setFormError(t('modals.registerPatient.err_nok_phone_format'));
      return;
    }

    if (dobMode === 'dob') {
      const dobIso = parseDmyToIso(form.dobDmy);
      if (!dobIso) {
        setFormError(t('modals.registerPatient.err_dob_format'));
        return;
      }
      if (dobHiddenRef.current) dobHiddenRef.current.value = dobIso;
    } else if (dobHiddenRef.current) {
      dobHiddenRef.current.value = '';
    }

    formEl.submit();
  };

  if (!patientId) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modals.editPatient.title')}
      subtitle={t('modals.editPatient.subtitle', { id: patientId })}
      size="lg"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton form="hms-edit-patient-form" label={t('modals.editPatient.save')} disabled={loading} />
        </>
      }
    >
      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">{t('modals.editPatient.loading')}</div>
      ) : loadError ? (
        <FormErrorBanner message={loadError} />
      ) : (
        <form
          id="hms-edit-patient-form"
          method="post"
          action={`/patients/edit/${patientId}`}
          className="space-y-4"
          onSubmit={handleSubmit}
        >
          <input type="hidden" name="ep_dob_mode" value={dobMode} />
          <input type="hidden" name="portal_enabled" value={form.portal_enabled ? '1' : '0'} />
          <input type="hidden" name="dob" ref={dobHiddenRef} defaultValue="" />

          <FormErrorBanner message={formError} />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('modals.editPatient.first_name')} htmlFor="ep-fn" required>
              <input
                id="ep-fn"
                name="first_name"
                required
                className="hms-input"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
            </FormField>
            <FormField label={t('modals.editPatient.last_name')} htmlFor="ep-ln" required>
              <input
                id="ep-ln"
                name="last_name"
                required
                className="hms-input"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              />
            </FormField>
            <FormField label={t('modals.editPatient.gender')} htmlFor="ep-gender" required>
              <select
                id="ep-gender"
                name="gender"
                className="hms-input"
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
              >
                <option value="Male">{t('modals.editPatient.male')}</option>
                <option value="Female">{t('modals.editPatient.female')}</option>
              </select>
            </FormField>
            <FormField label={t('modals.editPatient.patient_type')} htmlFor="ep-type" required>
              <select
                id="ep-type"
                name="patient_type"
                className="hms-input"
                value={form.patient_type}
                onChange={(e) => setForm({ ...form, patient_type: e.target.value })}
              >
                <option value="OutPatient">{t('modals.editPatient.outpatient')}</option>
                <option value="InPatient">{t('modals.editPatient.inpatient')}</option>
              </select>
            </FormField>
            <FormField label={t('modals.editPatient.dob_age')} htmlFor={dobMode === 'dob' ? 'ep-dob' : 'ep-age'}>
              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1 text-xs font-semibold ${dobMode === 'dob' ? 'bg-brand text-white' : 'bg-slate-100'}`}
                  onClick={() => setDobMode('dob')}
                >
                  {t('modals.editPatient.dob')}
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1 text-xs font-semibold ${dobMode === 'age' ? 'bg-brand text-white' : 'bg-slate-100'}`}
                  onClick={() => setDobMode('age')}
                >
                  {t('modals.editPatient.age')}
                </button>
              </div>
              {dobMode === 'dob' ? (
                <DateDmyInput
                  id="ep-dob"
                  placeholder={datePh}
                  autoComplete="bday"
                  required
                  value={parseDmyToIso(form.dobDmy) || ''}
                  onChange={(iso) => setForm({ ...form, dobDmy: iso ? isoToDmy(iso) : '' })}
                />
              ) : (
                <input
                  id="ep-age"
                  name="age_years"
                  type="number"
                  min="0"
                  max="130"
                  required
                  className="hms-input"
                  value={form.age_years}
                  onChange={(e) => setForm({ ...form, age_years: e.target.value })}
                />
              )}
              {dobMode === 'dob' ? <input type="hidden" name="age_years" value={form.age_years} /> : null}
            </FormField>
            <FormField
              label={patientReg.identityIdLabel || t('modals.editPatient.cni', { defaultValue: 'National ID' })}
              htmlFor="ep-cni"
              hint={patientReg.identityHint || ''}
            >
              <input
                id="ep-cni"
                name="cni_number"
                className="hms-input"
                inputMode={patientReg.identityInputMode === 'numeric' ? 'numeric' : 'text'}
                maxLength={patientReg.identityMaxLength || 100}
                placeholder={patientReg.identityHint || ''}
                value={form.cni_number}
                onChange={(e) => setForm({ ...form, cni_number: e.target.value })}
              />
            </FormField>
            <FormField label={t('modals.editPatient.phone')} htmlFor="ep-phone" required>
              <input
                id="ep-phone"
                name="phone"
                type="tel"
                required
                className="hms-input"
                maxLength={32}
                inputMode="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: applyPhoneDialPrefix(e.target.value) })}
              />
            </FormField>
            <FormField
              label={t('modals.editPatient.email')}
              htmlFor="ep-email"
              required={form.portal_enabled}
              hint={form.portal_enabled ? t('modals.registerPatient.email_portal_required') : ''}
            >
              <input
                id="ep-email"
                name="email"
                type="email"
                className="hms-input"
                autoComplete="email"
                required={form.portal_enabled}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value.trimStart() })}
              />
            </FormField>
            <FormField label={t('modals.editPatient.address')} htmlFor="ep-address" className="sm:col-span-2">
              <textarea
                id="ep-address"
                name="address"
                rows={2}
                className="hms-input resize-y"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </FormField>
            <FormField label={t('modals.editPatient.nok_name')} htmlFor="ep-nok-name">
              <input
                id="ep-nok-name"
                name="next_of_kin_name"
                className="hms-input"
                value={form.next_of_kin_name}
                onChange={(e) => setForm({ ...form, next_of_kin_name: e.target.value })}
              />
            </FormField>
            <FormField label={t('modals.editPatient.nok_relationship')} htmlFor="ep-nok-rel">
              <input
                id="ep-nok-rel"
                name="next_of_kin_relationship"
                className="hms-input"
                value={form.next_of_kin_relationship}
                onChange={(e) => setForm({ ...form, next_of_kin_relationship: e.target.value })}
              />
            </FormField>
            <FormField label={t('modals.editPatient.nok_phone')} htmlFor="ep-nok-phone">
              <input
                id="ep-nok-phone"
                name="next_of_kin_phone"
                type="tel"
                className="hms-input"
                maxLength={32}
                inputMode="tel"
                value={form.next_of_kin_phone}
                onChange={(e) => setForm({ ...form, next_of_kin_phone: filterPhoneInput(e.target.value) })}
              />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.portal_enabled}
              onChange={(e) => setForm({ ...form, portal_enabled: e.target.checked })}
              className="rounded border-slate-300 text-brand focus:ring-brand"
            />
            {t('modals.editPatient.portal_enable')}
          </label>
        </form>
      )}
    </Modal>
  );
}
