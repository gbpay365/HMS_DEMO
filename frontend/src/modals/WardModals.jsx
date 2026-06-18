import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { FormField } from '../components/FormField';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';
import { PatientSearchField } from '../components/PatientSearchField';
import { confirmModal } from '../lib/modalBridge';

export function WardAdmitModal({ open, onClose, bed, pendingPatient = null, availableBeds = [] }) {
  const { t } = useTranslation('ipd');
  const [code, setCode] = useState('');
  const [validated, setValidated] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [validating, setValidating] = useState(false);
  const [selectedBedId, setSelectedBedId] = useState('');
  const [payLater, setPayLater] = useState(false);
  const [payLaterPatientId, setPayLaterPatientId] = useState('');

  useEffect(() => {
    if (!open) return;
    setCode('');
    setValidated(null);
    setFeedback('');
    setValidating(false);
    setPayLater(false);
    setPayLaterPatientId('');
    setSelectedBedId(bed?.id ? String(bed.id) : '');
  }, [open, bed?.id]);

  const validateCode = async () => {
    const c = code.trim().toUpperCase();
    if (!c) {
      setFeedback(t('modals.enter_code'));
      return;
    }
    setValidating(true);
    setFeedback(t('modals.validating'));
    try {
      const qs = new URLSearchParams({ code: c });
      if (pendingPatient?.patient_id) qs.set('patient_id', String(pendingPatient.patient_id));
      const r = await fetch(`/wards/validate-payment-code?${qs.toString()}`, { credentials: 'same-origin' });
      const d = await r.json();
      if (!d.ok) {
        setValidated(null);
        setFeedback(d.error || t('modals.invalid_code'));
        return;
      }
      if (pendingPatient && Number(d.patient_id) !== Number(pendingPatient.patient_id)) {
        setValidated(null);
        setFeedback(t('modals.patient_code_mismatch'));
        return;
      }
      setPayLater(false);
      setValidated({
        patient_id: d.patient_id,
        patient_name: d.patient_name,
        patient_code: d.patient_code || '',
        doctor_id: d.doctor_id || 0,
        doctor_name: d.doctor_name || '—',
        diagnosis: d.diagnosis || '',
        deposit: d.deposit_amount ?? d.deposit ?? 0});
      setFeedback(
        d.deposit_amount != null || d.deposit != null
          ? t('modals.code_valid_deposit', { amount: d.deposit_amount ?? d.deposit ?? 0 })
          : t('modals.code_validated')
      );
    } catch {
      setFeedback(t('modals.validation_failed'));
      setValidated(null);
    } finally {
      setValidating(false);
    }
  };

  const effectiveBed = bed || availableBeds.find((b) => String(b.id) === selectedBedId) || null;
  const paymentOk = payLater || !!validated;
  const directAdmitPatientOk = !!validated || (payLater && !!payLaterPatientId);
  const canAdmit = pendingPatient
    ? !!(pendingPatient && effectiveBed && paymentOk)
    : !!(effectiveBed && directAdmitPatientOk);

  const paymentCodeBlock = (
    <div className={`rounded-xl border p-4 ${payLater ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-sky-200 bg-sky-50'}`}>
      <label className="hms-label flex items-center gap-2" htmlFor={pendingPatient ? 'assign-code' : 'admit-code'}>
        <i className="fa fa-ticket text-sky-600" aria-hidden="true" />
        {t('modals.step1_code')}
      </label>
      <p className="mb-2 text-xs text-slate-500">{t('modals.hospitalisation_fee_hint')}</p>
      <div className="flex gap-2">
        <input
          id={pendingPatient ? 'assign-code' : 'admit-code'}
          className="hms-input uppercase"
          value={code}
          disabled={payLater}
          onChange={(ev) => {
            setCode(ev.target.value.toUpperCase());
            setValidated(null);
            setFeedback('');
          }}
          placeholder={t('modals.payment_code_ph')}
        />
        <button
          type="button"
          className="hms-btn-primary shrink-0"
          disabled={validating || payLater}
          onClick={validateCode}
        >
          {validating ? '…' : t('shared.validate')}
        </button>
      </div>
      {feedback ? (
        <p className={`mt-2 text-xs ${validated ? 'font-medium text-emerald-700' : 'text-slate-600'}`}>{feedback}</p>
      ) : null}
    </div>
  );

  const payLaterToggle = (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
      <div>
        <div className="flex items-center gap-2 text-sm font-bold text-amber-950">
          <i className="fa fa-clock-o text-amber-600" aria-hidden="true" />
          {t('modals.pay_later')}
        </div>
        <p className="mt-0.5 text-xs text-amber-800">{t('modals.pay_later_hint')}</p>
      </div>
      <span className="relative inline-flex h-[26px] w-12 shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={payLater}
          onChange={(ev) => {
            const on = ev.target.checked;
            setPayLater(on);
            if (on) {
              setValidated(null);
              setFeedback('');
            } else {
              setPayLaterPatientId('');
            }
          }}
        />
        <span className="absolute inset-0 rounded-full bg-slate-300 transition peer-checked:bg-amber-500" />
        <span className="absolute bottom-[3px] left-[3px] h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-[22px]" />
      </span>
    </label>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={pendingPatient ? t('modals.assign_title') : t('modals.admit_title')}
      subtitle={
        effectiveBed
          ? `${effectiveBed.ward_name || ''} · ${effectiveBed.bed_label || ''}`
          : t('modals.select_bed')
      }
      size="lg"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton
            form="ward-admit-form"
            label={pendingPatient ? t('shared.assign') : t('shared.admit')}
            disabled={!canAdmit}
          />
        </>
      }
    >
      <form id="ward-admit-form" method="post" action="/wards/admit" className="grid gap-4">
        <input type="hidden" name="bed_id" value={effectiveBed?.id || ''} />
        {pendingPatient ? (
          <>
            <input type="hidden" name="admission_id" value={pendingPatient.id || ''} />
            <input type="hidden" name="patient_id" value={pendingPatient.patient_id} />
            <input type="hidden" name="admitting_doctor_id" value={pendingPatient.seen_doctor_id || pendingPatient.doctor_id || ''} />
            <input type="hidden" name="admitting_diagnosis" value={pendingPatient.admitting_diagnosis || ''} />
            <input
              type="hidden"
              name="deposit_amount"
              value={validated?.deposit ?? pendingPatient.hosp_deposit_paid ?? pendingPatient.deposit_amount ?? 0}
            />
            {payLater ? <input type="hidden" name="pay_later" value="1" /> : null}
            {validated && !payLater ? (
              <input type="hidden" name="payment_code" value={code.trim().toUpperCase()} />
            ) : null}
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm">
              <i className="fa fa-user mr-1 text-orange-600" aria-hidden="true" />
              {t('modals.assigning')} <strong>{pendingPatient.patient_name}</strong>
            </div>
            {paymentCodeBlock}
            {payLaterToggle}
            <div>
              <label className="hms-label flex items-center gap-2" htmlFor="assign-bed-select">
                <i className="fa fa-bed text-slate-500" aria-hidden="true" />
                {t('modals.select_bed')}
              </label>
              <select
                id="assign-bed-select"
                className="hms-input"
                value={selectedBedId}
                onChange={(ev) => setSelectedBedId(ev.target.value)}
                required
              >
                <option value="">{t('modals.select_bed_placeholder')}</option>
                {availableBeds.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.ward_name} · {b.bed_label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-500">{t('modals.select_bed_hint')}</p>
            </div>
            {validated && !payLater ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                <i className="fa fa-check-circle mr-1" aria-hidden="true" />
                {t('modals.assign_payment_ok', { amount: validated.deposit ?? 0 })}
              </div>
            ) : null}
          </>
        ) : (
          <>
            {paymentCodeBlock}
            {payLaterToggle}
            {payLater && !validated ? (
              <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                <p className="mb-3 text-xs text-violet-900">{t('modals.pay_later_select_patient')}</p>
                <PatientSearchField async
                  id="admit-pay-later-patient"
                  required
                  label={t('modals.patient')}
                  onPatientChange={setPayLaterPatientId}
                />
              </div>
            ) : null}
            {payLater ? <input type="hidden" name="pay_later" value="1" /> : null}
            {validated ? (
              <>
                <input type="hidden" name="patient_id" value={validated.patient_id} />
                <input type="hidden" name="admitting_doctor_id" value={validated.doctor_id || ''} />
                <input type="hidden" name="admitting_diagnosis" value={validated.diagnosis || ''} />
                <input type="hidden" name="deposit_amount" value={validated.deposit} />
                <input type="hidden" name="payment_code" value={code.trim().toUpperCase()} />
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 hms-form-stack">
                  <FormField label={t('modals.patient')}>
                    <input readOnly value={validated.patient_name} className="hms-input bg-white" />
                  </FormField>
                  {validated.patient_code ? (
                    <FormField label={t('modals.patient_id')}>
                      <input readOnly value={validated.patient_code} className="hms-input bg-white font-mono text-sm" />
                    </FormField>
                  ) : null}
                  <div className="hms-form-grid hms-form-grid--2">
                    <FormField label={t('modals.admitting_doctor')}>
                      <input readOnly value={validated.doctor_name} className="hms-input bg-white" />
                    </FormField>
                    <FormField label={t('modals.diagnosis')}>
                      <input readOnly value={validated.diagnosis || '—'} className="hms-input bg-white" />
                    </FormField>
                  </div>
                </div>
              </>
            ) : null}
          </>
        )}
      </form>
    </Modal>
  );
}

export function WardDischargeModal({ open, onClose, mode, admissionId, patientName }) {
  const { t } = useTranslation('ipd');
  const isClinical = mode === 'clinical';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isClinical ? t('modals.clinical_dc_title') : t('modals.call_financial_dc')}
      subtitle={patientName}
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton form="ward-dc-form" label={t('shared.confirm')} />
        </>
      }
    >
      <form id="ward-dc-form" method="post" action="/wards/clinical-discharge" className="grid gap-3">
        <input type="hidden" name="admission_id" value={admissionId || ''} />
        <p className="text-sm text-slate-600">{t('modals.clinical_dc_hint')}</p>
        <div>
          <label className="hms-label" htmlFor="dc-notes">
            {t('modals.notes_optional')}
          </label>
          <textarea id="dc-notes" name="notes" className="hms-input min-h-[80px]" />
        </div>
      </form>
    </Modal>
  );
}

export function WardCallDischargeModal({ open, onClose, admissionId, patientName }) {
  const { t } = useTranslation('ipd');
  const [code, setCode] = useState('');
  const [validated, setValidated] = useState(false);
  const [feedback, setFeedback] = useState('');

  const validate = async () => {
    const c = code.trim().toUpperCase();
    if (!c || !admissionId) return;
    setFeedback(t('modals.validating'));
    try {
      const r = await fetch(
        `/wards/validate-ipd-code?admission_id=${encodeURIComponent(admissionId)}&code=${encodeURIComponent(c)}`,
        { credentials: 'same-origin' }
      );
      const d = await r.json();
      if (!d.ok) {
        setValidated(false);
        setFeedback(d.error || t('modals.invalid_code'));
        return;
      }
      setValidated(true);
      setFeedback(t('modals.validated_balance', { amount: d.balance_due ?? 0 }));
    } catch {
      setValidated(false);
      setFeedback(t('modals.validation_failed'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modals.confirm_discharge_title')}
      subtitle={patientName}
      size="lg"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton
            form="ward-call-dc-form"
            label={t('modals.confirm_discharge_btn')}
            disabled={!validated}
          />
        </>
      }
    >
      <form id="ward-call-dc-form" method="post" action="/wards/confirm-discharge" className="grid gap-4">
        <input type="hidden" name="admission_id" value={admissionId || ''} />
        <input type="hidden" name="payment_code" value={validated ? code.trim().toUpperCase() : ''} />
        <p className="text-sm text-slate-600">{t('modals.ipd_code_hint')}</p>
        <div className="flex gap-2">
          <input
            className="hms-input uppercase"
            value={code}
            onChange={(ev) => {
              setCode(ev.target.value.toUpperCase());
              setValidated(false);
            }}
            placeholder={t('modals.ipd_code_ph')}
          />
          <button type="button" className="hms-btn-primary shrink-0" onClick={validate}>
            {t('shared.validate')}
          </button>
        </div>
        <p className="text-xs text-slate-500">{feedback || t('modals.ipd_code_enter')}</p>
      </form>
    </Modal>
  );
}

export function WardManageBedsModal({ open, onClose, wardName, beds = [] }) {
  const { t } = useTranslation('ipd');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modals.manage_beds', { ward: wardName })}
      size="lg"
      footer={
        <>
          <ModalCancelButton onClick={onClose} label={t('shared.close')} />
          <ModalSubmitButton form="ward-add-bed-form" label={t('modals.add_bed')} />
        </>
      }
    >
      <div className="mb-4 space-y-2">
        {beds.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
            <span className="font-semibold">{b.bed_label}</span>
            <span className="text-xs uppercase text-slate-500">{t(`bed_status.${b.status}`)}</span>
            {b.status === 'available' ? (
              <button
                type="button"
                className="text-xs text-red-600"
                onClick={async () => {
                  const ok = await confirmModal({
                    title: t('modals.remove_bed_title'),
                    message: t('modals.remove_bed_confirm', { label: b.bed_label }),
                    confirmLabel: t('modals.remove_bed_btn'),
                    tone: 'danger'});
                  if (!ok) return;
                  const f = document.createElement('form');
                  f.method = 'POST';
                  f.action = '/wards/bed-delete';
                  const i = document.createElement('input');
                  i.name = 'bed_id';
                  i.value = b.id;
                  f.appendChild(i);
                  document.body.appendChild(f);
                  f.submit();
                }}
              >
                {t('shared.remove')}
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <form id="ward-add-bed-form" method="post" action="/wards/bed-add" className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="hms-label" htmlFor="wm-ward">
            {t('modals.ward_name')}
          </label>
          <input id="wm-ward" name="ward_name" required className="hms-input" defaultValue={wardName} list="ward-names-list" />
          <datalist id="ward-names-list">
            {wardName ? <option value={wardName} /> : null}
          </datalist>
        </div>
        <div className="sm:col-span-2">
          <label className="hms-label" htmlFor="new-bed-label">
            {t('modals.new_bed_label')}
          </label>
          <input id="new-bed-label" name="bed_label" required className="hms-input" placeholder={t('modals.new_bed_ph')} />
        </div>
      </form>
    </Modal>
  );
}

export function WardMessageModal({ open, onClose, admissionId, patientName }) {
  const { t } = useTranslation(['ipd', 'common']);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const fetchMessages = async () => {
    if (!admissionId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/ipd/admission/${admissionId}/messages`, { credentials: 'same-origin' });
      const d = await r.json();
      if (d.ok) {
        setMessages(d.messages || []);
      } else {
        setError(d.error || t('messages.load_failed'));
      }
    } catch {
      setError(t('messages.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setError('');
      setMessages([]);
      setInputText('');
      fetchMessages();
    }
  }, [open, admissionId]);

  const handleSend = async (ev) => {
    ev.preventDefault();
    const txt = inputText.trim();
    if (!txt || !admissionId) return;
    setSending(true);
    try {
      const r = await fetch('/api/ipd/message/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ admission_id: admissionId, body: txt, subject: t('messages.subject_board') })});
      const d = await r.json();
      if (d.ok) {
        setInputText('');
        fetchMessages();
      } else {
        setError(d.error || t('messages.send_failed'));
      }
    } catch {
      setError(t('messages.send_failed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('messages.title')}
      subtitle={patientName}
      size="lg"
      footer={
        <ModalCancelButton onClick={onClose} label={t('shared.close')} />
      }
    >
      <div className="flex flex-col h-[450px]">
        {/* Messages list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 rounded-xl border border-slate-100 bg-slate-50/50 mb-4">
          {loading && messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <i className="fa fa-spinner fa-spin mr-2" /> {t('common:loading')}
            </div>
          ) : null}
          {!loading && messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              {t('messages.empty')}
            </div>
          ) : null}
          {messages.map((m) => {
            const isDoc = m.source === 'doctor_reply' || String(m.subject).toLowerCase().includes('re:') || m.from_to?.toLowerCase().includes('doctor');
            return (
              <div key={m.id} className={`flex flex-col ${isDoc ? 'items-start' : 'items-end'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                  isDoc
                    ? 'bg-white text-slate-800 rounded-tl-none border border-slate-200'
                    : 'bg-emerald-600 text-white rounded-tr-none'
                }`}>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider mb-1 opacity-75">
                    {m.from_name || (isDoc ? t('messages.sender_doctor') : t('messages.sender_nurse'))}
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed">{m.body}</div>
                  <div className="text-[9px] text-right mt-1 opacity-60">
                    {m.sent_at ? new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Error notification */}
        {error ? (
          <div className="mb-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
            {error}
          </div>
        ) : null}

        {/* Input area */}
        <form onSubmit={handleSend} className="flex gap-2">
          <textarea
            value={inputText}
            onChange={(ev) => setInputText(ev.target.value)}
            className="hms-input min-h-[50px] flex-1 resize-none py-2"
            placeholder={t('messages.placeholder')}
            rows={2}
            required
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                handleSend(ev);
              }
            }}
          />
          <button
            type="submit"
            className="hms-btn-primary self-end px-4 py-3 shrink-0 flex items-center justify-center gap-1"
            disabled={sending || !inputText.trim()}
          >
            {sending ? <i className="fa fa-spinner fa-spin" /> : <i className="fa fa-paper-plane" />}
            {t('messages.send')}
          </button>
        </form>
      </div>
    </Modal>
  );
}

