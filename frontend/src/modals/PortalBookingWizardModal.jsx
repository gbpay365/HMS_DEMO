import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { HmsButton } from '../components/HmsButton';
import { FaIcon } from '../components/FaIcon';
import { notifyError } from '../lib/notifyBridge';
import {
  fetchBookingSlots,
  validateBookingPaymentCode} from '../lib/portalBookingApi';
import {
  filterDoctorsBySpecialisation,
  filterDoctorsForBookingDepartment} from '../lib/doctorClinicalFilter';

const STEP_NS = ['step_visit', 'step_care_team', 'step_type', 'step_schedule', 'step_confirm'];

const DEFAULT_TYPES = [
  { id: 'consultation', icon: 'stethoscope', labelKey: 'type_consultation' },
  { id: 'follow_up', icon: 'refresh', labelKey: 'type_follow_up' },
  { id: 'prescription', icon: 'medkit', labelKey: 'type_prescription' },
  { id: 'results_review', icon: 'flask', labelKey: 'type_results' },
  { id: 'vaccination', icon: 'plus-square', labelKey: 'type_vaccination' },
  { id: 'other', icon: 'ellipsis-h', labelKey: 'type_other' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function maxDateIso() {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  return d.toISOString().slice(0, 10);
}

function doctorOptionLabel(doc) {
  const depts = (doc.departments && doc.departments.length ? doc.departments : [doc.primary_department])
    .filter(Boolean)
    .join(', ');
  return `Dr. ${doc.first_name || ''} ${doc.last_name || ''}${depts ? ` — ${depts}` : ''}`.trim();
}

export function PortalBookingWizardModal({ open, onClose, config = {} }) {
  const { t } = useTranslation('portal');
  const departments = config.departments || [];
  const doctors = config.doctors || [];
  const specialisations = config.specialisations || [];
  const reschedule = config.reschedule || null;
  const rescheduleId = reschedule?.id ? Number(reschedule.id) : 0;

  const formAction = rescheduleId
    ? `/portal/appointments/${rescheduleId}/reschedule`
    : '/portal/book-appointment';

  const [step, setStep] = useState(0);
  const [visitType, setVisitType] = useState('in_person');
  const [department, setDepartment] = useState('');
  const [specialisation, setSpecialisation] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [appointmentType, setAppointmentType] = useState('consultation');
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState('');
  const [message, setMessage] = useState('');
  const [paymentCode, setPaymentCode] = useState('');
  const [paymentValid, setPaymentValid] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState('');
  const [paymentChecking, setPaymentChecking] = useState(false);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsMessage, setSlotsMessage] = useState('');

  const apptTypes = useMemo(() => DEFAULT_TYPES, []);
  const isTele = visitType === 'telemedicine';

  const visibleDoctors = useMemo(() => {
    let list = doctors;
    if (department) list = filterDoctorsForBookingDepartment(list, department);
    if (specialisation) list = filterDoctorsBySpecialisation(list, specialisation);
    return list;
  }, [doctors, department, specialisation]);

  const applyReschedule = useCallback((data) => {
    if (!data) return;
    setVisitType(data.visit_type === 'telemedicine' ? 'telemedicine' : 'in_person');
    setAppointmentType(data.appointment_type || 'consultation');
    setDepartment(data.department || data.department_name || '');
    setDoctorId(data.doctor_id ? String(data.doctor_id) : '');
    setDate(data.date || '');
    setSlot(data.time || data.slot_start || '');
    if (data.payment_code) {
      setPaymentCode(data.payment_code);
      setPaymentValid(true);
    }
    setStep(3);
  }, []);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setVisitType('in_person');
    setDepartment('');
    setSpecialisation('');
    setDoctorId('');
    setAppointmentType('consultation');
    setDate('');
    setSlot('');
    setMessage('');
    setPaymentCode('');
    setPaymentValid(false);
    setPaymentStatus('');
    setSlots([]);
    if (reschedule) applyReschedule(reschedule);
  }, [open, reschedule, applyReschedule]);

  const loadSlots = useCallback(async () => {
    if (!date) {
      setSlots([]);
      setSlotsMessage(t('booking_wizard.slots_pick_date'));
      return;
    }
    setSlotsLoading(true);
    setSlot('');
    try {
      const data = await fetchBookingSlots(date, doctorId);
      const list = data.slots || [];
      setSlots(list);
      setSlotsMessage(list.length ? '' : data.message || t('booking_wizard.slots_none'));
    } catch (e) {
      setSlots([]);
      setSlotsMessage(e.message || t('booking_wizard.slots_error'));
    } finally {
      setSlotsLoading(false);
    }
  }, [date, doctorId, t]);

  useEffect(() => {
    if (open && step === 3) loadSlots();
  }, [open, step, loadSlots]);

  const validatePayment = async () => {
    const code = String(paymentCode || '').trim();
    if (!code) {
      setPaymentStatus(t('booking_wizard.payment_code_required'));
      setPaymentValid(false);
      return;
    }
    setPaymentChecking(true);
    setPaymentStatus(t('booking_wizard.payment_checking'));
    try {
      const data = await validateBookingPaymentCode(code, rescheduleId || '');
      setPaymentCode(data.code || code.toUpperCase());
      setPaymentValid(true);
      setPaymentStatus(data.validity_message || t('booking_wizard.payment_accepted'));
    } catch (e) {
      setPaymentValid(false);
      setPaymentStatus(e.message || t('booking_wizard.payment_invalid'));
    } finally {
      setPaymentChecking(false);
    }
  };

  const validateStep = (idx) => {
    if (idx === 1 && isTele && !doctorId) {
      notifyError(t('booking_wizard.err_tele_doctor'));
      return false;
    }
    if (idx === 3) {
      if (!date) {
        notifyError(t('booking_wizard.err_date'));
        return false;
      }
      if (!slot) {
        notifyError(t('booking_wizard.err_slot'));
        return false;
      }
    }
    if (idx === 4 && isTele && !paymentValid) {
      notifyError(t('booking_wizard.err_payment'));
      return false;
    }
    return true;
  };

  const deptLabel =
    department || t('booking_wizard.any_department');
  const docLabel = doctorId
    ? (() => {
        const doc = visibleDoctors.find((d) => String(d.id) === String(doctorId));
        return doc ? doctorOptionLabel(doc) : t('booking_wizard.any_physician');
      })()
    : t('booking_wizard.any_physician');
  const typeLabel = t(`booking_wizard.${apptTypes.find((x) => x.id === appointmentType)?.labelKey || 'type_other'}`);
  const visitLabel =
    visitType === 'telemedicine' ? t('booking_wizard.visit_tele_summary') : t('booking_wizard.visit_in_person_summary');

  const footer = (
    <>
      <HmsButton
        type="button"
        variant="ghost"
        className={step === 0 ? 'invisible' : ''}
        onClick={() => setStep((s) => Math.max(0, s - 1))}
      >
        {t('booking.back')}
      </HmsButton>
      <div className="flex flex-wrap gap-2">
        <HmsButton type="button" variant="secondary" onClick={onClose}>
          {t('booking.cancel')}
        </HmsButton>
        {step < STEP_NS.length - 1 ? (
          <HmsButton
            type="button"
            variant="primary"
            onClick={() => {
              if (!validateStep(step)) return;
              setStep((s) => s + 1);
            }}
          >
            {t('booking_wizard.continue')}
          </HmsButton>
        ) : (
          <HmsButton type="submit" form="portal-booking-form" variant="primary" icon="check">
            {rescheduleId ? t('booking_wizard.confirm_reschedule') : t('booking_wizard.confirm_booking')}
          </HmsButton>
        )}
      </div>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={rescheduleId ? t('booking.reschedule_title') : t('booking.book_title')}
      subtitle={rescheduleId ? t('booking.reschedule_sub') : t('booking.book_sub')}
      size="lg"
      headerClassName="!border-0 !bg-gradient-to-r !from-teal-600 !to-blue-700"
      footer={footer}
    >
      <div className="obk-steps -mx-4 mb-4 border-b border-slate-100 sm:-mx-6">
        {STEP_NS.map((key, i) => (
          <div
            key={key}
            className={`obk-step${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}`}
          >
            <span className="obk-step-num">{i + 1}</span>
            {t(`booking.${key}`)}
          </div>
        ))}
      </div>

      <form
        id="portal-booking-form"
        method="POST"
        action={formAction}
        onSubmit={(e) => {
          if (!validateStep(4)) e.preventDefault();
        }}
      >
        <input type="hidden" name="visit_type" value={visitType} />
        <input type="hidden" name="department" value={department} />
        <input type="hidden" name="doctor_id" value={doctorId} />
        <input type="hidden" name="appointment_type" value={appointmentType} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="time" value={slot} />
        <input type="hidden" name="slot" value={slot} />
        <input type="hidden" name="message" value={message} />
        <input type="hidden" name="payment_code" value={isTele ? paymentCode : ''} />

        {step === 0 ? (
          <div>
            <p className="mb-3 text-sm text-slate-500">{t('booking_wizard.visit_prompt')}</p>
            <div className="obk-visit-grid">
              <button
                type="button"
                className={`obk-visit-card text-left${visitType === 'in_person' ? ' is-selected' : ''}`}
                onClick={() => {
                  setVisitType('in_person');
                  setPaymentValid(false);
                  setPaymentCode('');
                }}
              >
                <h6 className="font-bold">
                  <FaIcon name="hospital-o" className="mr-1" /> {t('booking_wizard.in_person_title')}
                </h6>
                <p className="mb-0 text-sm text-slate-600">{t('booking_wizard.in_person_desc')}</p>
              </button>
              <button
                type="button"
                className={`obk-visit-card text-left${visitType === 'telemedicine' ? ' is-selected' : ''}`}
                onClick={() => {
                  setVisitType('telemedicine');
                  setPaymentValid(false);
                  setPaymentCode('');
                }}
              >
                <h6 className="font-bold">
                  <FaIcon name="video-camera" className="mr-1" /> {t('booking_wizard.telemedicine_title')}
                </h6>
                <p className="mb-0 text-sm text-slate-600">{t('booking_wizard.telemedicine_desc')}</p>
              </button>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-ink">
              {t('booking_wizard.department')}
              <select className="hms-input mt-1 w-full" value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="">{t('booking_wizard.any_department')}</option>
                {departments.map((d) => (
                  <option key={d.department_name || d.id} value={d.department_name}>
                    {d.department_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-ink">
              {t('booking_wizard.specialisation')}
              <select
                className="hms-input mt-1 w-full"
                value={specialisation}
                onChange={(e) => setSpecialisation(e.target.value)}
              >
                <option value="">{t('booking_wizard.any_specialisation')}</option>
                {specialisations.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-ink">
              {t('booking_wizard.physician')}{' '}
              <span className={`text-xs font-semibold ${isTele ? 'text-red-600' : 'text-slate-400'}`}>
                {isTele ? t('booking_wizard.required') : t('booking_wizard.optional')}
              </span>
              <select
                className="hms-input mt-1 w-full"
                value={doctorId}
                required={isTele}
                onChange={(e) => setDoctorId(e.target.value)}
              >
                <option value="">{t('booking_wizard.any_physician')}</option>
                {visibleDoctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doctorOptionLabel(doc)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <p className="mb-3 text-sm text-slate-500">{t('booking_wizard.type_prompt')}</p>
            <div className="obk-type-grid">
              {apptTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  className={`obk-type-chip${appointmentType === type.id ? ' is-selected' : ''}`}
                  onClick={() => setAppointmentType(type.id)}
                >
                  <FaIcon name={type.icon} className="mr-1" />
                  {t(`booking_wizard.${type.labelKey}`)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <label className="mb-3 block text-sm font-semibold text-ink">
              {t('booking_wizard.date')} <span className="text-red-600">*</span>
              <input
                type="date"
                className="hms-input mt-1 w-full"
                value={date}
                min={todayIso()}
                max={maxDateIso()}
                required
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <p className="mb-1 text-sm font-semibold text-ink">{t('booking_wizard.available_slots')}</p>
            <p className="mb-2 text-xs text-slate-500">
              {slotsLoading ? t('booking_wizard.slots_loading') : t('booking.select_doctor_date')}
            </p>
            <div className="obk-slots">
              {slotsLoading ? (
                <div className="obk-slots-empty">
                  <FaIcon name="spinner" className="fa-spin mr-1" /> {t('booking_wizard.slots_loading')}
                </div>
              ) : slots.length ? (
                slots.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className={`obk-slot${slot === s.value ? ' is-selected' : ''}`}
                    onClick={() => setSlot(s.value)}
                  >
                    {s.label}
                  </button>
                ))
              ) : (
                <div className="obk-slots-empty">{slotsMessage || t('booking_wizard.slots_none')}</div>
              )}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div>
            <dl className="obk-summary">
              <dt>{t('booking_wizard.visit_mode')}</dt>
              <dd>{visitLabel}</dd>
              <dt>{t('booking_wizard.department')}</dt>
              <dd>{deptLabel}</dd>
              <dt>{t('booking_wizard.physician')}</dt>
              <dd>{docLabel}</dd>
              <dt>{t('booking_wizard.appointment_type')}</dt>
              <dd>{typeLabel}</dd>
              <dt>{t('booking_wizard.date')}</dt>
              <dd>{date || '—'}</dd>
              <dt>{t('booking_wizard.time')}</dt>
              <dd>{slot || '—'}</dd>
            </dl>
            {isTele ? (
              <div className="obk-payment-panel mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
                <label className="mb-1 block text-xs font-bold text-ink">
                  {t('booking_wizard.payment_code_label')} <span className="text-red-600">*</span>
                </label>
                <p className="mb-2 text-xs text-slate-600">{t('booking_wizard.payment_code_hint')}</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    className="hms-input max-w-xs uppercase"
                    value={paymentCode}
                    placeholder={t('booking_wizard.payment_code_ph')}
                    onChange={(e) => {
                      setPaymentCode(e.target.value);
                      setPaymentValid(false);
                    }}
                  />
                  <HmsButton type="button" variant="secondary" disabled={paymentChecking} onClick={validatePayment}>
                    {t('booking_wizard.validate_code')}
                  </HmsButton>
                </div>
                {paymentStatus ? (
                  <p className={`mb-0 mt-2 text-xs ${paymentValid ? 'text-emerald-700' : 'text-red-600'}`}>
                    {paymentStatus}
                  </p>
                ) : null}
              </div>
            ) : null}
            <label className="mt-3 block text-sm font-semibold text-ink">
              {t('booking_wizard.notes_optional')}
              <textarea
                className="hms-input mt-1 w-full"
                rows={3}
                value={message}
                placeholder={t('booking_wizard.notes_ph')}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
