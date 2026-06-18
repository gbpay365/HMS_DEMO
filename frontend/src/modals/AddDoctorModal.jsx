import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormErrorBanner } from '../components/FormErrorBanner';
import { FormField } from '../components/FormField';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';
import { validateStaffIdentityFields } from '../lib/formValidation';

function isDoctorRole(roleId, doctorRoleIds) {
  return (doctorRoleIds || []).map(String).includes(String(roleId));
}

export function AddDoctorModal({ open, onClose, roles, departments, specialisations, doctorRoleIds }) {
  const { t } = useTranslation(['ops', 'clinical']);
  const [formError, setFormError] = useState('');
  const doctorRoles = useMemo(
    () => (roles || []).filter((r) => isDoctorRole(r.role, doctorRoleIds)),
    [roles, doctorRoleIds]
  );
  const defaultRole = doctorRoles[0]?.role || '';
  const [role, setRole] = useState(String(defaultRole));
  const [specialisation, setSpecialisation] = useState('');
  const showSpec = isDoctorRole(role, doctorRoleIds);

  const handleSubmit = (ev) => {
    const fd = new FormData(ev.target);
    const err = validateStaffIdentityFields(
      {
        first_name: fd.get('first_name'),
        last_name: fd.get('last_name'),
        username: fd.get('username'),
        emailid: fd.get('emailid'),
        phone: fd.get('phone'),
        password: fd.get('pwd')},
      {
        firstName: t('modals.addDoctor.err_first_name'),
        lastName: t('modals.addDoctor.err_last_name'),
        username: t('modals.addDoctor.err_username'),
        password: t('modals.addDoctor.err_password'),
        email: t('modals.addDoctor.err_email'),
        phone: t('modals.addDoctor.err_phone')}
    );
    if (err) {
      ev.preventDefault();
      setFormError(err);
      return;
    }
    if (showSpec && !String(fd.get('specialisation') || '').trim()) {
      ev.preventDefault();
      setFormError(t('modals.addDoctor.err_specialisation'));
      return;
    }
    setFormError('');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modals.addDoctor.title')}
      subtitle={t('modals.addDoctor.subtitle')}
      size="lg"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton form="hms-add-doctor-form" label={t('modals.addDoctor.save')} />
        </>
      }
    >
      <FormErrorBanner message={formError} />
      <form id="hms-add-doctor-form" method="post" action="/employees/add" className="space-y-5" onSubmit={handleSubmit}>
        <input type="hidden" name="status" value="1" />
        <input type="hidden" name="gender" value="Male" />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('modals.addDoctor.first_name')} htmlFor="doc-fn" required>
            <input id="doc-fn" name="first_name" required className="hms-input" autoComplete="given-name" />
          </FormField>
          <FormField label={t('modals.addDoctor.last_name')} htmlFor="doc-ln" required>
            <input id="doc-ln" name="last_name" required className="hms-input" autoComplete="family-name" />
          </FormField>
          <FormField label={t('modals.addDoctor.username')} htmlFor="doc-un" required>
            <input id="doc-un" name="username" required className="hms-input" autoComplete="username" />
          </FormField>
          <FormField label={t('modals.addDoctor.email')} htmlFor="doc-em" required>
            <input id="doc-em" name="emailid" type="email" required className="hms-input" autoComplete="email" />
          </FormField>
          <FormField label={t('modals.addDoctor.phone')} htmlFor="doc-ph" required>
            <input id="doc-ph" name="phone" required className="hms-input" autoComplete="tel" />
          </FormField>
          <FormField label={t('modals.addDoctor.password')} htmlFor="doc-pw" required>
            <input id="doc-pw" name="pwd" type="password" required className="hms-input" autoComplete="new-password" />
          </FormField>
          <FormField label={t('modals.addDoctor.role')} htmlFor="doc-role" required>
            <select
              id="doc-role"
              name="role"
              required
              className="hms-input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {doctorRoles.map((r) => (
                <option key={r.role} value={r.role}>
                  {r.title}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('modals.addDoctor.department')} htmlFor="doc-dept">
            <select id="doc-dept" name="primary_department" className="hms-input">
              <option value="">{t('modals.addDoctor.not_set')}</option>
              {(departments || []).map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        {showSpec ? (
          <FormField label={t('modals.addDoctor.specialisation')} htmlFor="doc-spec" required>
            <select
              id="doc-spec"
              name="specialisation"
              required
              className="hms-input"
              value={specialisation}
              onChange={(e) => setSpecialisation(e.target.value)}
            >
              <option value="">{t('modals.addDoctor.select_specialisation')}</option>
              {(specialisations || []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FormField>
        ) : null}

        <FormField label={t('modals.addDoctor.bio')} htmlFor="doc-bio">
          <textarea
            id="doc-bio"
            name="bio"
            rows={3}
            className="hms-input resize-y"
            placeholder={t('modals.addDoctor.bio_ph')}
          />
        </FormField>
      </form>
    </Modal>
  );
}
