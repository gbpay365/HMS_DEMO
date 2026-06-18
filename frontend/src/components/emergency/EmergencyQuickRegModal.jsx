import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '../FormField';
import { Modal } from '../Modal';
import { ModalCancelButton, ModalSubmitButton } from '../ModalActions';
import { PatientSearchField } from '../PatientSearchField';

export function EmergencyQuickRegModal({ open, onClose, doctors = [] }) {
  const { t } = useTranslation('clinical');
  const [mode, setMode] = useState('existing');

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      headerClassName="!from-red-900 !to-red-600"
      title={t('emergency.reg_title')}
      subtitle={t('emergency.reg_phase')}
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton form="hms-er-quick-reg-form" label={t('emergency.reg_submit')} variant="danger" />
        </>
      }
    >
      <form id="hms-er-quick-reg-form" action="/emergency/quick-register" method="POST" className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${mode === 'existing' ? 'bg-red-600 text-white' : 'bg-slate-100'}`}
            onClick={() => setMode('existing')}
          >
            {t('emergency.reg_existing')}
          </button>
          <button
            type="button"
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${mode === 'new' ? 'bg-red-600 text-white' : 'bg-slate-100'}`}
            onClick={() => setMode('new')}
          >
            {t('emergency.reg_new')}
          </button>
        </div>

        {mode === 'existing' ? (
          <PatientSearchField async required label={t('shared.patient')} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('emergency.reg_first_name')} htmlFor="er-fn">
              <input id="er-fn" name="first_name" className="hms-input w-full" placeholder={t('emergency.reg_unknown_ph')} />
            </FormField>
            <FormField label={t('emergency.reg_last_name')} htmlFor="er-ln">
              <input id="er-ln" name="last_name" className="hms-input w-full" />
            </FormField>
            <FormField label={t('emergency.reg_gender')} htmlFor="er-gender">
              <select id="er-gender" name="gender" className="hms-input w-full">
                <option value="">—</option>
                <option value="Male">{t('emergency.reg_male')}</option>
                <option value="Female">{t('emergency.reg_female')}</option>
              </select>
            </FormField>
            <FormField label={t('emergency.reg_phone')} htmlFor="er-phone">
              <input id="er-phone" name="phone" className="hms-input w-full" />
            </FormField>
          </div>
        )}

        <FormField label={t('emergency.reg_assigned_doctor')} htmlFor="er-doc">
          <select id="er-doc" name="assigned_doctor_id" className="hms-input w-full">
            <option value="">{t('emergency.reg_any_doctor')}</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                Dr. {d.first_name} {d.last_name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label={t('emergency.reg_chief')} htmlFor="er-chief" required>
          <textarea id="er-chief" name="chief_complaint" className="hms-input w-full" rows={2} required />
        </FormField>
      </form>
    </Modal>
  );
}
