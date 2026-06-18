import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DateDmyInput } from '../components/DateDmyInput';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';
import { confirmModal } from '../lib/modalBridge';
import { notifyError } from '../lib/notifyBridge';

function formatValidCodeMessage(d, t) {
  if (d.validity_message) return d.validity_message;
  const v = d.validity;
  if (!v) return '';
  const left = v.remaining_uses != null ? Number(v.remaining_uses) : Math.max(0, (Number(v.max_uses) || 1) - (Number(v.uses_so_far) || 0));
  const exp = v.expires_display || v.expires_on || '';
  if (!exp && left == null) return '';
  return t('ipd:modals.valid_until', { date: exp || '—', count: left });
}

export function OpdAddVisitModal({ open, onClose, doctors = [] }) {
  const { t } = useTranslation(['clinical', 'errors', 'common']);
  const [code, setCode] = useState('');
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(null);
  const [canSubmit, setCanSubmit] = useState(false);
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setVisitDate(now.toISOString().split('T')[0]);
    setVisitTime(now.toTimeString().slice(0, 5));
    setCode('');
    setValidated(null);
    setCanSubmit(false);
    setSubmitting(false);
  }, [open]);

  const validateCode = async () => {
    const c = code.trim();
    if (!c) return;
    setValidating(true);
    try {
      const res = await fetch(`/api/payment/validate?code=${encodeURIComponent(c)}`);
      const d = await res.json();
      if (!d.ok) {
        notifyError(d.error || t('errors:payment.not_valid'));
        setCanSubmit(false);
        setValidated(null);
        return;
      }
      let dname = (d.assigned_doctor_name || '').trim();
      const did = parseInt(d.assigned_doctor_id, 10) || 0;
      if (!dname && did > 0) {
        const f = doctors.find((x) => Number(x.id) === did);
        if (f) dname = `Dr. ${f.first_name} ${f.last_name}`;
      }
      setValidated({
        patient_id: d.patient_id,
        patient_name: d.patient_name,
        service: d.service_name || d.service || '',
        department: d.department || '',
        doctor_id: did,
        doctor_name: dname || '—',
        validity_message: formatValidCodeMessage(d, t)});
      setCanSubmit(true);
    } catch {
      notifyError(t('common:notify.network_error'), t('common:notify.connection'));
    } finally {
      setValidating(false);
    }
  };

  const onEmergencyToggle = async (checked) => {
    if (!checked) return;
    const ok = await confirmModal({
      title: t('clinical:opd.emergency_switch_title'),
      message: t('clinical:opd.emergency_switch_msg'),
      confirmLabel: t('clinical:opd.emergency_switch_yes'),
      tone: 'danger'});
    if (ok) window.location.href = '/emergency?openQR=1';
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('clinical:opd.add_visit_title')}
      subtitle={t('clinical:opd.add_visit_subtitle')}
      size="lg"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <button
            type="submit"
            form="hms-opd-add-visit-form"
            className="hms-btn-primary"
            disabled={!canSubmit || submitting}
          >
            {submitting ? '…' : t('clinical:opd.register_visit')}
          </button>
        </>
      }
    >
      <form
        id="hms-opd-add-visit-form"
        method="post"
        action="/opd-queue/add"
        className="space-y-4"
        onSubmit={() => setSubmitting(true)}
      >
        <input type="hidden" name="patient_id" value={validated?.patient_id || ''} />
        <input type="hidden" name="assigned_doctor_id" value={validated?.doctor_id || 0} />
        <input type="hidden" name="department_name" value={validated?.department || ''} />

        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3">
          <div>
            <label htmlFor="emergency-toggle" className="cursor-pointer text-sm font-bold text-red-800">
              🚑 {t('clinical:opd.emergency')}
            </label>
            <p className="text-xs text-slate-600">{t('clinical:opd.emergency_hint')}</p>
          </div>
          <input
            id="emergency-toggle"
            type="checkbox"
            name="is_emergency"
            value="1"
            className="h-5 w-5"
            onChange={(e) => onEmergencyToggle(e.target.checked)}
          />
        </div>

        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          {t('clinical:opd.payment_hint')}
        </div>

        <div>
          <label className="hms-label">{t('clinical:opd.payment_code')}</label>
          <div className="flex gap-2">
            <input
              name="payment_code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="hms-input font-mono uppercase tracking-wide"
              placeholder={t('opd.payment_code_ph')}
              required
            />
            <button type="button" className="hms-btn-primary shrink-0" disabled={validating} onClick={validateCode}>
              {validating ? '…' : t('clinical:shared.validate')}
            </button>
          </div>
        </div>

        {validated ? (
          <>
            {validated.validity_message ? (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
                {validated.validity_message}
              </div>
            ) : null}
            <div>
              <label className="hms-label">{t('clinical:shared.patient')}</label>
              <input readOnly value={validated.patient_name} className="hms-input bg-emerald-50" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="hms-label">{t('clinical:opd.service')}</label>
                <input readOnly value={validated.service} className="hms-input bg-emerald-50" />
              </div>
              <div>
                <label className="hms-label">{t('clinical:opd.assigned_physician')}</label>
                <input readOnly value={validated.doctor_name} className="hms-input bg-emerald-50" />
              </div>
            </div>
          </>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="hms-label">{t('clinical:opd.priority')}</label>
            <select name="priority" className="hms-input" defaultValue="normal">
              <option value="normal">{t('clinical:shared.normal')}</option>
              <option value="urgent">{t('clinical:shared.urgent')}</option>
            </select>
          </div>
          <div>
            <label className="hms-label">{t('clinical:opd.visit_date')}</label>
            <DateDmyInput name="visit_date" value={visitDate} onChange={setVisitDate} required />
          </div>
          <div>
            <label className="hms-label">{t('clinical:opd.visit_time')}</label>
            <input name="visit_time" type="time" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} className="hms-input" />
          </div>
        </div>
        <div>
          <label className="hms-label">{t('clinical:opd.chief_complaint')}</label>
          <textarea
            name="reason"
            rows={2}
            className="hms-input resize-y"
            defaultValue={validated?.service || ''}
            placeholder={t('clinical:opd.chief_placeholder')}
          />
        </div>
      </form>
    </Modal>
  );
}
