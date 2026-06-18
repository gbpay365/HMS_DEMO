import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { SurfaceHero } from '../components/SurfaceHero';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function VisitingDoctorSetupPageApp({
  username = '',
  initialStep = 'password',
  departments = [],
  specialisations = [],
  rooms = [],
  flash = null,
  error = null}) {
  const { t } = useTranslation('visitingDoctor');
  const [step, setStep] = useState(initialStep === 'profile' ? 'profile' : 'password');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [specialisation, setSpecialisation] = useState(specialisations[0] || 'General Practitioner');
  const [roomId, setRoomId] = useState('');
  const [visitStart, setVisitStart] = useState(todayIso());
  const [visitEnd, setVisitEnd] = useState('');

  const roomOptions = useMemo(() => rooms || [], [rooms]);

  const submitPassword = async (ev) => {
    ev.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      const res = await fetch('/visiting-doctor/setup/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ password, confirm_password: confirmPassword })});
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setFormError(data.error || 'Could not update password.');
        return;
      }
      setStep('profile');
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitProfile = async (ev) => {
    ev.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      const res = await fetch('/visiting-doctor/setup/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          phone,
          emailid: email,
          primary_department: department,
          specialisation,
          consultation_room_id: roomId,
          visit_start_date: visitStart,
          visit_end_date: visitEnd})});
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setFormError(data.error || 'Could not save profile.');
        return;
      }
      window.location.href = data.redirect || '/portal/hub/doctor';
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <FlashMessages flash={flash} error={error || formError} />

        <SurfaceHero icon="user-md" title={t('setup_title')} subtitle={t('setup_subtitle', { username })} />

        <div className="mb-4 flex gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span className={step === 'password' ? 'text-brand' : ''}>{t('step_password')}</span>
          <span>→</span>
          <span className={step === 'profile' ? 'text-brand' : ''}>{t('step_profile')}</span>
        </div>

        {step === 'password' ? (
          <form onSubmit={submitPassword} className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
            <div>
              <label className="hms-label" htmlFor="vd-new-pw">{t('new_password')}</label>
              <input
                id="vd-new-pw"
                type="password"
                className="hms-input"
                required
                minLength={6}
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
              />
            </div>
            <div>
              <label className="hms-label" htmlFor="vd-confirm-pw">{t('confirm_password')}</label>
              <input
                id="vd-confirm-pw"
                type="password"
                className="hms-input"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(ev) => setConfirmPassword(ev.target.value)}
              />
            </div>
            <p className="text-xs text-slate-500">{t('password_rule')}</p>
            <button type="submit" className="hms-btn-primary" disabled={busy}>
              {t('continue')}
            </button>
          </form>
        ) : (
          <form onSubmit={submitProfile} className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="hms-label" htmlFor="vd-fn">{t('first_name')}</label>
                <input id="vd-fn" className="hms-input" required value={firstName} onChange={(ev) => setFirstName(ev.target.value)} />
              </div>
              <div>
                <label className="hms-label" htmlFor="vd-ln">{t('last_name')}</label>
                <input id="vd-ln" className="hms-input" required value={lastName} onChange={(ev) => setLastName(ev.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="hms-label" htmlFor="vd-phone">{t('phone')}</label>
                <input id="vd-phone" className="hms-input" required value={phone} onChange={(ev) => setPhone(ev.target.value)} />
              </div>
              <div>
                <label className="hms-label" htmlFor="vd-email">{t('email')}</label>
                <input id="vd-email" type="email" className="hms-input" required value={email} onChange={(ev) => setEmail(ev.target.value)} />
              </div>
            </div>
            <div>
              <label className="hms-label" htmlFor="vd-dept">{t('department')}</label>
              <select id="vd-dept" className="hms-input" required value={department} onChange={(ev) => setDepartment(ev.target.value)}>
                <option value="">{t('select_department')}</option>
                {departments.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="hms-label" htmlFor="vd-spec">{t('specialisation')}</label>
              <select id="vd-spec" className="hms-input" required value={specialisation} onChange={(ev) => setSpecialisation(ev.target.value)}>
                <option value="">{t('select_specialisation')}</option>
                {specialisations.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="hms-label" htmlFor="vd-room">{t('consultation_room')}</label>
              <select id="vd-room" className="hms-input" required value={roomId} onChange={(ev) => setRoomId(ev.target.value)}>
                <option value="">{t('select_room')}</option>
                {roomOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} — {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="hms-label" htmlFor="vd-start">{t('visit_start')}</label>
                <input
                  id="vd-start"
                  type="date"
                  className="hms-input"
                  required
                  value={visitStart}
                  onChange={(ev) => setVisitStart(ev.target.value)}
                />
              </div>
              <div>
                <label className="hms-label" htmlFor="vd-end">{t('visit_end')}</label>
                <input
                  id="vd-end"
                  type="date"
                  className="hms-input"
                  required
                  min={todayIso()}
                  value={visitEnd}
                  onChange={(ev) => setVisitEnd(ev.target.value)}
                />
              </div>
            </div>
            <button type="submit" className="hms-btn-primary" disabled={busy}>
              {t('save_finish')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
