import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';
import { PatientSearchField } from '../components/PatientSearchField';
import { PharmacyMedicationPicker } from '../components/pharmacy/PharmacyMedicationPicker';

export function NewPrescriptionModal({
  open,
  onClose,
  patients = [],
  initialPatientId = '',
  theme = 'default',
  returnUrl = '',
}) {
  const { t } = useTranslation('clinical');
  const [formKey, setFormKey] = useState(0);
  const isPharmacy = theme === 'pharmacy';

  useEffect(() => {
    if (open) setFormKey((k) => k + 1);
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      theme={theme}
      title={t('modals.newPrescription.title')}
      subtitle={t('modals.newPrescription.subtitle')}
      size="lg"
      footer={
        isPharmacy ? (
          <>
            <button type="button" className="pha-btn-secondary px-4 py-2 text-sm font-semibold" onClick={onClose}>
              {t('shared.cancel')}
            </button>
            <button type="submit" form="hms-new-rx-form" className="pha-btn-primary px-4 py-2 text-sm font-bold">
              {t('modals.newPrescription.create')}
            </button>
          </>
        ) : (
          <>
            <ModalCancelButton onClick={onClose} />
            <ModalSubmitButton form="hms-new-rx-form" label={t('modals.newPrescription.create')} />
          </>
        )
      }
    >
      <form id="hms-new-rx-form" method="post" action="/prescriptions/add" className="space-y-4">
        {returnUrl ? <input type="hidden" name="_return" value={returnUrl} /> : null}
        <PatientSearchField
          key={formKey}
          id="rx-patient"
          patients={patients}
          initialPatientId={initialPatientId}
          required
          label={t('shared.patient')}
        />
        <div>
          <label className="hms-label" htmlFor="rx-title">
            {t('modals.newPrescription.prescription_title')} <span className="text-red-500">*</span>
          </label>
          <input id="rx-title" name="title" required className="hms-input" placeholder={t('modals.newPrescription.title_ph')} />
        </div>
        <PharmacyMedicationPicker key={`med-${formKey}`} inputId="rx-items" name="items" />
        <div>
          <label className="hms-label" htmlFor="rx-notes">
            {t('modals.newPrescription.clinical_notes')}
          </label>
          <textarea id="rx-notes" name="notes" rows={2} className="hms-input resize-y" placeholder={t('modals.newPrescription.notes_ph')} />
        </div>
      </form>
    </Modal>
  );
}
