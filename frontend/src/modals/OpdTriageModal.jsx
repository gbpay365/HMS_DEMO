import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';

export function OpdTriageModal({ open, onClose, visit }) {
  const { t } = useTranslation('clinical');
  if (!visit) return null;
  const name = `${visit.first_name || ''} ${visit.last_name || ''}`.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('opd.triage_title')}
      subtitle={t('opd.triage_subtitle')}
      size="lg"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton form="hms-opd-triage-form" variant="vitals" icon="heartbeat" label={t('opd.triage_save')} />
        </>
      }
    >
      <form id="hms-opd-triage-form" method="post" action="/opd-queue/triage" className="space-y-4">
        <input type="hidden" name="visit_id" value={visit.id} />
        <input type="hidden" name="patient_id" value={visit.patient_id} />
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>{t('opd.triage_station')}</strong> {t('opd.triage_record')}
        </div>
        <p className="font-bold text-ink">
          {t('shared.patient')}: {name}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['bp_sys', 'triage_field_bp_sys', '120', 'mmHg'],
            ['bp_dia', 'triage_field_bp_dia', '80', 'mmHg'],
            ['heart_rate', 'triage_field_heart_rate', '72', 'bpm'],
            ['temp_c', 'triage_field_temp_c', '36.6', '°C'],
            ['spo2', 'triage_field_spo2', '98', '%'],
            ['rr', 'triage_field_rr', '16', '/min'],
            ['weight_kg', 'triage_field_weight_kg', '70', 'kg'],
            ['height_cm', 'triage_field_height_cm', '170', 'cm'],
          ].map(([fieldName, labelKey, ph, unit]) => (
            <div key={fieldName}>
              <label className="hms-label">{t(`opd.${labelKey}`)}</label>
              <div className="flex">
                <input
                  name={fieldName}
                  type="number"
                  step={fieldName === 'temp_c' || fieldName === 'weight_kg' ? '0.1' : '1'}
                  placeholder={ph}
                  className="hms-input rounded-r-none"
                />
                <span className="flex items-center rounded-r-xl border border-l-0 border-slate-200 bg-slate-50 px-2 text-xs text-slate-500">
                  {unit}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div>
          <label className="hms-label" htmlFor="triage-notes">
            {t('opd.triage_notes')}
          </label>
          <textarea id="triage-notes" name="triage_notes" rows={2} className="hms-input resize-y" placeholder={t('opd.triage_notes_ph')} />
        </div>
      </form>
    </Modal>
  );
}
