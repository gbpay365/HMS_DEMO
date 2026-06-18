import { useTranslation } from 'react-i18next';
import { HmsButton } from './HmsButton';

export function useModalLabels() {
  const { t } = useTranslation('clinical');
  return {
    cancel: t('shared.cancel'),
    save: t('shared.save')};
}

export function ModalCancelButton({ onClick, disabled, label }) {
  const { cancel } = useModalLabels();
  return (
    <HmsButton type="button" variant="secondary" onClick={onClick} disabled={disabled}>
      {label ?? cancel}
    </HmsButton>
  );
}

export function ModalSubmitButton({
  form,
  label,
  variant = 'primary',
  disabled,
  type = 'submit',
  onClick,
  icon,
  className}) {
  const { save } = useModalLabels();
  return (
    <HmsButton
      type={type}
      variant={variant}
      form={form}
      disabled={disabled}
      onClick={onClick}
      icon={icon}
      className={className}
    >
      {label ?? save}
    </HmsButton>
  );
}

export function ModalFooterActions({ onCancel, cancelLabel, submitLabel, submitForm, submitVariant = 'primary', submitDisabled, children }) {
  return (
    <>
      <ModalCancelButton onClick={onCancel} label={cancelLabel} />
      {children}
      {submitForm || submitLabel ? (
        <ModalSubmitButton
          form={submitForm}
          label={submitLabel}
          variant={submitVariant}
          disabled={submitDisabled}
        />
      ) : null}
    </>
  );
}
