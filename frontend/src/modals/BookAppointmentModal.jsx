import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';
import { FormField } from '../components/FormField';
import { PatientSearchField } from '../components/PatientSearchField';
import { filterDoctorsForBookingDepartment } from '../lib/doctorClinicalFilter';

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

export function BookAppointmentModal({ open, onClose, patients, doctors, departments }) {
  const { t } = useTranslation('clinical');
  const [formKey, setFormKey] = useState(0);
  const [department, setDepartment] = useState(departments[0]?.department_name || '');
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState([]);
  const [slotMsg, setSlotMsg] = useState('');
  const [slotLoading, setSlotLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [timeFallback, setTimeFallback] = useState('');
  const [visitType, setVisitType] = useState('in_person');
  const [patientId, setPatientId] = useState('');
  const [paymentCode, setPaymentCode] = useState('');
  const [paymentValid, setPaymentValid] = useState(false);
  const [paymentFeedback, setPaymentFeedback] = useState('');
  const [paymentChecking, setPaymentChecking] = useState(false);

  const filteredDoctors = useMemo(
    () => filterDoctorsForBookingDepartment(doctors, department),
    [doctors, department]
  );

  const doctorName = filteredDoctors.find((d) => String(d.id) === String(doctorId))
    || doctors.find((d) => String(d.id) === String(doctorId));
  const doctorLabel = doctorName ? `${doctorName.first_name} ${doctorName.last_name}` : '';
  const isTele = visitType === 'telemedicine';
  const canSubmit = !isTele || paymentValid;

  const loadSlots = useCallback(() => {
    if (!doctorId || !date) return;
    setSlotLoading(true);
    setSelectedSlot('');
    setSlotMsg('');
    fetch(`/hms/api/booking/slots?doctor_id=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`, {
      credentials: 'same-origin'})
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok || !(data.slots && data.slots.length)) {
          setSlots([]);
          setSlotMsg(data.message || t('modals.bookAppointment.no_slots_manual'));
          return;
        }
        setSlots(data.slots);
        setSlotMsg(t('modals.bookAppointment.click_or_manual'));
      })
      .catch(() => {
        setSlots([]);
        setSlotMsg(t('modals.bookAppointment.could_not_load'));
      })
      .finally(() => setSlotLoading(false));
  }, [doctorId, date, t]);

  const validatePayment = async () => {
    const code = paymentCode.trim().toUpperCase();
    if (!patientId) {
      setPaymentValid(false);
      setPaymentFeedback(t('modals.bookAppointment.select_patient_first'));
      return;
    }
    if (!code) {
      setPaymentValid(false);
      setPaymentFeedback(t('modals.bookAppointment.enter_payment_code'));
      return;
    }
    setPaymentChecking(true);
    setPaymentFeedback(t('modals.bookAppointment.validating_payment'));
    try {
      const url =
        `/hms/api/booking/validate-payment?code=${encodeURIComponent(code)}&patient_id=${encodeURIComponent(patientId)}`;
      const res = await fetch(url, { credentials: 'same-origin' });
      const data = await res.json();
      if (!data.ok) {
        setPaymentValid(false);
        setPaymentFeedback(data.error || t('modals.bookAppointment.invalid_payment_code'));
        return;
      }
      setPaymentCode(data.code || code);
      setPaymentValid(true);
      setPaymentFeedback(data.validity_message || t('modals.bookAppointment.payment_accepted'));
    } catch {
      setPaymentValid(false);
      setPaymentFeedback(t('modals.bookAppointment.payment_check_failed'));
    } finally {
      setPaymentChecking(false);
    }
  };

  useEffect(() => {
    if (open) loadSlots();
  }, [open, loadSlots]);

  useEffect(() => {
    if (!open) {
      setSelectedSlot('');
      setTimeFallback('');
      setDate(todayIso());
      setVisitType('in_person');
      setPatientId('');
      setPaymentCode('');
      setPaymentValid(false);
      setPaymentFeedback('');
      return;
    }
    setFormKey((k) => k + 1);
    const initialDept = departments[0]?.department_name || '';
    setDepartment(initialDept);
    const initialDocs = filterDoctorsForBookingDepartment(doctors, initialDept);
    setDoctorId(initialDocs[0]?.id ? String(initialDocs[0].id) : '');
  }, [open, departments, doctors]);

  useEffect(() => {
    if (!open) return;
    const stillValid = filteredDoctors.some((d) => String(d.id) === String(doctorId));
    if (!stillValid) {
      setDoctorId(filteredDoctors[0]?.id ? String(filteredDoctors[0].id) : '');
    }
  }, [open, department, filteredDoctors, doctorId]);

  useEffect(() => {
    setPaymentValid(false);
    setPaymentFeedback('');
  }, [patientId, visitType, paymentCode]);

  const handleSubmit = (ev) => {
    if (isTele && !paymentValid) {
      ev.preventDefault();
      setPaymentFeedback(t('modals.bookAppointment.validate_payment_before_book'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modals.bookAppointment.title')}
      subtitle={t('modals.bookAppointment.subtitle')}
      size="lg"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton
            form="hms-book-appt-form"
            label={isTele ? t('modals.bookAppointment.submit_request') : t('modals.bookAppointment.book_now')}
            disabled={!canSubmit}
          />
        </>
      }
    >
      <form id="hms-book-appt-form" method="post" action="/appointments/add" className="space-y-4" onSubmit={handleSubmit}>
        <input type="hidden" name="doctor" value={doctorLabel} />
        <input type="hidden" name="slot" value={selectedSlot} />
        <input type="hidden" name="visit_type" value={visitType} />
        {isTele && paymentValid ? (
          <input type="hidden" name="payment_code" value={paymentCode.trim().toUpperCase()} />
        ) : null}

        <PatientSearchField
          key={formKey}
          id="appt-patient"
          patients={patients}
          required
          label={t('shared.patient')}
          onPatientChange={setPatientId}
        />

        <div>
          <label className="hms-label">{t('modals.bookAppointment.visit_type')}</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setVisitType('in_person')}
              className={`rounded-xl border p-3 text-left transition ${
                visitType === 'in_person'
                  ? 'border-brand bg-brand-light ring-1 ring-brand/30'
                  : 'border-slate-200 bg-white hover:border-brand/30'
              }`}
            >
              <div className="font-semibold text-ink">{t('modals.bookAppointment.visit_in_person')}</div>
              <div className="mt-1 text-xs text-slate-500">{t('modals.bookAppointment.visit_in_person_hint')}</div>
            </button>
            <button
              type="button"
              onClick={() => setVisitType('telemedicine')}
              className={`rounded-xl border p-3 text-left transition ${
                visitType === 'telemedicine'
                  ? 'border-sky-400 bg-sky-50 ring-1 ring-sky-300'
                  : 'border-slate-200 bg-white hover:border-sky-200'
              }`}
            >
              <div className="font-semibold text-ink">{t('modals.bookAppointment.visit_telemedicine')}</div>
              <div className="mt-1 text-xs text-slate-500">{t('modals.bookAppointment.visit_telemedicine_hint')}</div>
            </button>
          </div>
        </div>

        {isTele ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
            <label className="hms-label" htmlFor="appt-payment-code">
              {t('modals.bookAppointment.payment_code')} <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                id="appt-payment-code"
                className="hms-input uppercase"
                value={paymentCode}
                onChange={(e) => setPaymentCode(e.target.value.toUpperCase())}
                placeholder={t('modals.bookAppointment.payment_code_ph')}
              />
              <button
                type="button"
                className="hms-btn-primary shrink-0"
                onClick={validatePayment}
                disabled={paymentChecking}
              >
                {t('shared.validate', { ns: 'ops' })}
              </button>
            </div>
            {paymentFeedback ? (
              <p className={`mt-2 text-xs ${paymentValid ? 'text-emerald-700' : 'text-slate-600'}`}>{paymentFeedback}</p>
            ) : (
              <p className="mt-2 text-xs text-slate-600">{t('modals.bookAppointment.tele_pending_hint')}</p>
            )}
          </div>
        ) : null}

        <div className="hms-form-grid hms-form-grid--2">
          <FormField label={t('modals.bookAppointment.department')} htmlFor="appt-dept" required>
            <select
              id="appt-dept"
              name="department"
              required
              className="hms-input w-full"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              {departments.map((d) => (
                <option key={d.id || d.department_name} value={d.department_name}>
                  {d.department_name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('modals.bookAppointment.doctor')} htmlFor="appt-doctor" required>
            <select
              id="appt-doctor"
              name="doctor_id"
              required
              className="hms-input w-full"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              disabled={!filteredDoctors.length}
            >
              {!filteredDoctors.length ? (
                <option value="">{t('modals.bookAppointment.no_doctors_dept')}</option>
              ) : (
                filteredDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {t('modals.bookAppointment.dr_prefix')} {d.first_name} {d.last_name}
                  </option>
                ))
              )}
            </select>
            {!filteredDoctors.length ? (
              <p className="mt-1 text-xs text-amber-700">
                {t('modals.bookAppointment.no_doctors_hint', { department: department || t('modals.bookAppointment.department') })}
              </p>
            ) : null}
          </FormField>
          <FormField label={t('modals.bookAppointment.date')} htmlFor="appt-date" required>
            <input
              id="appt-date"
              name="date"
              type="date"
              required
              className="hms-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </FormField>
        </div>

        <div>
          <label className="hms-label">{t('modals.bookAppointment.available_slot')}</label>
          <div className="mb-2 flex min-h-[2rem] flex-wrap gap-2">
            {slotLoading ? (
              <span className="text-sm text-slate-500">{t('modals.bookAppointment.loading_slots')}</span>
            ) : slots.length ? (
              slots.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => {
                    setSelectedSlot(s.value);
                    setTimeFallback(s.value);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                    selectedSlot === s.value
                      ? 'border-brand bg-brand text-white'
                      : 'border-slate-200 bg-white text-brand hover:border-brand/40'
                  }`}
                >
                  {s.label}
                </button>
              ))
            ) : (
              <span className="text-sm text-slate-500">{slotMsg || t('modals.bookAppointment.no_slots')}</span>
            )}
          </div>
          <input
            type="time"
            name="time"
            className="hms-input"
            value={timeFallback}
            onChange={(e) => setTimeFallback(e.target.value)}
          />
          {slotMsg ? <p className="mt-1.5 text-xs text-slate-500">{slotMsg}</p> : null}
        </div>

        <div>
          <label className="hms-label" htmlFor="appt-notes">
            {t('modals.bookAppointment.reason_notes')}
          </label>
          <textarea id="appt-notes" name="message" rows={3} className="hms-input resize-y" placeholder={t('modals.bookAppointment.reason_ph')} />
        </div>
      </form>
    </Modal>
  );
}
