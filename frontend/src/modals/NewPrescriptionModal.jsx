import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';
import { PatientSearchField } from '../components/PatientSearchField';

export function NewPrescriptionModal({ open, onClose, patients = [], initialPatientId = '' }) {
  const { t } = useTranslation('clinical');
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (open) setFormKey((k) => k + 1);
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modals.newPrescription.title')}
      subtitle={t('modals.newPrescription.subtitle')}
      size="lg"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton form="hms-new-rx-form" label={t('modals.newPrescription.create')} />
        </>
      }
    >
      <form id="hms-new-rx-form" method="post" action="/prescriptions/add" className="space-y-4">
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
        <div>
          <label className="hms-label" htmlFor="rx-items">
            {t('modals.newPrescription.medication_items')}
          </label>
          <textarea
            id="rx-items"
            name="items"
            rows={5}
            className="hms-input resize-y"
            placeholder={t('modals.newPrescription.items_ph')}
          />
        </div>
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
