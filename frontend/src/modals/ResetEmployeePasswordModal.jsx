import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormErrorBanner } from '../components/FormErrorBanner';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';

export function ResetEmployeePasswordModal({ open, onClose, employee }) {
  const { t } = useTranslation('ops');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  if (!employee) return null;

  const name = `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || `#${employee.id}`;

  const handleSubmit = (ev) => {
    ev.preventDefault();
    setError('');
    if (password.length < 6) {
      setError(t('employee_password.err_min_length'));
      return;
    }
    if (password !== confirm) {
      setError(t('employee_password.err_mismatch'));
      return;
    }
    postForm(`/employees/${employee.id}/reset-password`, {
      password,
      password_confirm: confirm});
  };

  const handleClose = () => {
    setPassword('');
    setConfirm('');
    setError('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('employee_password.modal_title')}
      subtitle={t('employee_password.modal_subtitle', { name, username: employee.username || '—' })}
      size="md"
      footer={
        <>
          <ModalCancelButton onClick={handleClose} label={t('employee_password.cancel')} />
          <ModalSubmitButton form="hms-reset-employee-password-form" label={t('employee_password.save_password')} />
        </>
      }
    >
      <form id="hms-reset-employee-password-form" onSubmit={handleSubmit} className="grid gap-4">
        <FormErrorBanner message={error} />
        <div>
          <label className="hms-label" htmlFor="reset-pw">
            {t('employee_password.new_password')} <span className="text-red-500">*</span>
          </label>
          <input
            id="reset-pw"
            type="password"
            className="hms-input"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
          />
        </div>
        <div>
          <label className="hms-label" htmlFor="reset-pw-confirm">
            {t('employee_password.confirm_password')} <span className="text-red-500">*</span>
          </label>
          <input
            id="reset-pw-confirm"
            type="password"
            className="hms-input"
            value={confirm}
            onChange={(ev) => setConfirm(ev.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
          />
        </div>
        <p className="text-xs text-slate-500">{t('employee_password.modal_hint')}</p>
      </form>
    </Modal>
  );
}
