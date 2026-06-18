import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmployeeProfilePicturePicker } from '../components/EmployeeProfilePicturePicker';
import { FormErrorBanner } from '../components/FormErrorBanner';
import { FormField } from '../components/FormField';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';
import { validateStaffIdentityFields } from '../lib/formValidation';

const ROLE_KEYS = [
  { value: '1', key: 'role_administrator' },
  { value: '2', key: 'role_doctor' },
  { value: '3', key: 'role_front_desk' },
  { value: '4', key: 'role_lab_tech' },
  { value: '5', key: 'role_pharmacist' },
  { value: '7', key: 'role_nurse' },
];

export function AddStaffModal({ open, onClose }) {
  const { t } = useTranslation(['ops', 'clinical']);
  const [formError, setFormError] = useState('');
  const roles = useMemo(
    () => ROLE_KEYS.map((r) => ({ value: r.value, label: t(`modals.addStaff.${r.key}`) })),
    [t]
  );

  const handleSubmit = (ev) => {
    const fd = new FormData(ev.target);
    const err = validateStaffIdentityFields(
      {
        first_name: fd.get('first_name'),
        last_name: fd.get('last_name'),
        username: fd.get('username'),
        emailid: fd.get('emailid'),
        phone: fd.get('phone'),
        password: fd.get('password')},
      {
        firstName: t('modals.addStaff.err_first_name'),
        lastName: t('modals.addStaff.err_last_name'),
        username: t('modals.addStaff.err_username'),
        password: t('modals.addStaff.err_password'),
        email: t('modals.addStaff.err_email'),
        phone: t('modals.addStaff.err_phone')}
    );
    if (err) {
      ev.preventDefault();
      setFormError(err);
      return;
    }
    setFormError('');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modals.addStaff.title')}
      subtitle={t('modals.addStaff.subtitle')}
      size="lg"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton form="hms-add-staff-form" label={t('modals.addStaff.create_account')} />
        </>
      }
    >
      <FormErrorBanner message={formError} />
      <form
        id="hms-add-staff-form"
        method="post"
        action="/staff/add"
        encType="multipart/form-data"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={handleSubmit}
      >
        <FormField label={t('modals.addStaff.first_name')} htmlFor="staff-fn" required>
          <input id="staff-fn" name="first_name" required className="hms-input" />
        </FormField>
        <FormField label={t('modals.addStaff.last_name')} htmlFor="staff-ln" required>
          <input id="staff-ln" name="last_name" required className="hms-input" />
        </FormField>
        <FormField label={t('modals.addStaff.username')} htmlFor="staff-user" required>
          <input id="staff-user" name="username" required className="hms-input" autoComplete="off" />
        </FormField>
        <FormField label={t('modals.addStaff.temp_password')} htmlFor="staff-pw" required>
          <input id="staff-pw" name="password" type="password" required className="hms-input" autoComplete="new-password" />
        </FormField>
        <FormField label={t('modals.addStaff.email')} htmlFor="staff-email">
          <input id="staff-email" name="emailid" type="email" className="hms-input" />
        </FormField>
        <FormField label={t('modals.addStaff.phone')} htmlFor="staff-phone">
          <input id="staff-phone" name="phone" className="hms-input" />
        </FormField>
        <div className="sm:col-span-2">
          <span className="hms-label">{t('modals.addStaff.gender')}</span>
          <div className="mt-1 flex flex-wrap gap-4">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input type="radio" name="gender" value="Male" defaultChecked className="text-brand focus:ring-brand" />
              {t('modals.addStaff.male')}
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input type="radio" name="gender" value="Female" className="text-brand focus:ring-brand" />
              {t('modals.addStaff.female')}
            </label>
          </div>
        </div>
        <div className="sm:col-span-2">
          <EmployeeProfilePicturePicker
            formId="hms-add-staff-form"
            initialGender="Male"
            initialEmoji=""
            initialPhotoPath=""
            hiddenInputId="staff_profile_emoji"
            inputName="profile_emoji"
          />
        </div>
        <FormField label={t('modals.addStaff.system_role')} htmlFor="staff-role" required className="sm:col-span-2">
          <select id="staff-role" name="role" required className="hms-input">
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </FormField>
      </form>
    </Modal>
  );
}
