import { useTranslation } from 'react-i18next';
import { FormField } from '../components/FormField';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';

export function OpdAssignRoomModal({ open, onClose, visitId, currentRoomId, consultationRooms = [] }) {
  const { t } = useTranslation('clinical');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('opd.room_title')}
      subtitle={t('opd.room_subtitle')}
      size="md"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton form="hms-assign-room-form" />
        </>
      }
    >
      <form id="hms-assign-room-form" method="post" action="/opd-queue/assign-consultation-room">
        <input type="hidden" name="visit_id" value={visitId || ''} />
        <FormField label={t('opd.room_label')} htmlFor="assign-room-select">
          <select
            id="assign-room-select"
            name="consultation_room_id"
            defaultValue={String(currentRoomId || 0)}
            className="hms-input"
          >
            <option value="0">{t('opd.room_none')}</option>
            {consultationRooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.code})
                {r.room_staff_label ? ` · ${r.room_staff_label}` : r.room_doc_fn ? ` · Dr. ${r.room_doc_fn} ${r.room_doc_ln}` : ''}
              </option>
            ))}
          </select>
        </FormField>
      </form>
    </Modal>
  );
}
