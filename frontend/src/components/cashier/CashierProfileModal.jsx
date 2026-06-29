import { useEffect, useMemo, useState } from 'react';
import { EmployeeProfilePicturePicker } from '../EmployeeProfilePicturePicker';
import { FaIcon } from '../FaIcon';

const FORM_ID = 'cashier-self-profile-form';

function normalizeDeptRows(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Map();
  for (const row of rows) {
    const name =
      typeof row === 'string'
        ? row.trim()
        : String(row?.name || row?.department_name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, { name });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

async function fetchDepartmentCatalog() {
  const res = await fetch('/api/profile/departments', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) return [];
  return normalizeDeptRows(data.departments);
}

function buildDepartmentOptions(catalogRows, currentValue) {
  const opts = normalizeDeptRows(catalogRows);
  const current = String(currentValue || '').trim();
  if (current && !opts.some((d) => d.name.toLowerCase() === current.toLowerCase())) {
    opts.unshift({ name: current });
  }
  return opts;
}

function Field({ label, required, children, hint, htmlFor, className = '' }) {
  return (
    <div className={`cs-profile-field${className ? ` ${className}` : ''}`}>
      <label className="cs-profile-field__label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="cs-profile-field__req"> *</span> : null}
      </label>
      {children}
      {hint ? <p className="cs-profile-field__hint">{hint}</p> : null}
    </div>
  );
}

export function CashierProfileModal({
  open,
  mode = 'profile',
  initialProfile = null,
  initialDepartments = [],
  onClose,
  onSaved,
  tOps,
}) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [department, setDepartment] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const departmentOptions = useMemo(
    () => buildDepartmentOptions(departments, department || profile?.primary_department),
    [departments, department, profile?.primary_department]
  );

  const subtitle = useMemo(() => {
    if (!profile) return '';
    const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
    return name ? `${name} · @${profile.username || '—'}` : '';
  }, [profile]);

  useEffect(() => {
    if (!open) return undefined;
    setError('');
    setPassword('');
    setPasswordConfirm('');
    setDepartments(normalizeDeptRows(initialDepartments));

    if (mode === 'password') {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    if (initialProfile && (initialProfile.first_name || initialProfile.last_name || initialProfile.id)) {
      setProfile(initialProfile);
      setDepartment(initialProfile.primary_department || '');
    }

    fetch('/api/profile/self', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok || !data.profile) {
          throw new Error(data.error || tOps('cashier_odoo.profile_load_failed', { defaultValue: 'Could not load profile.' }));
        }
        return data;
      })
      .then(async (data) => {
        if (cancelled) return;
        setProfile(data.profile);
        setDepartment(data.profile.primary_department || '');
        const apiDepts = normalizeDeptRows(data.form?.departments);
        const seedDepts = normalizeDeptRows(initialDepartments);
        let merged = apiDepts.length ? apiDepts : seedDepts;
        if (!merged.length) {
          merged = await fetchDepartmentCatalog();
        }
        if (!cancelled) setDepartments(merged);
      })
      .catch(async (e) => {
        if (cancelled) return;
        if (initialProfile && (initialProfile.first_name || initialProfile.last_name || initialProfile.id)) {
          setProfile(initialProfile);
          setDepartment(initialProfile.primary_department || '');
          let merged = normalizeDeptRows(initialDepartments);
          if (!merged.length) {
            merged = await fetchDepartmentCatalog();
          }
          if (!cancelled) setDepartments(merged);
        } else {
          setError(e.message || String(e));
          setProfile(null);
          setDepartment('');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, mode, tOps, initialProfile, initialDepartments]);

  if (!open) return null;

  const title =
    mode === 'password'
      ? tOps('cashier_odoo.change_password', { defaultValue: 'Change password' })
      : tOps('cashier_odoo.edit_profile', { defaultValue: 'Edit Profile' });

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (mode === 'password') {
      if (!password.trim()) {
        setError(tOps('cashier_odoo.password_required', { defaultValue: 'Enter a new password.' }));
        return;
      }
      if (password !== passwordConfirm) {
        setError(tOps('cashier_odoo.password_mismatch', { defaultValue: 'Passwords do not match.' }));
        return;
      }
    }

    setBusy(true);
    try {
      let res;
      if (mode === 'password') {
        res = await fetch('/api/profile/self', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ pwd: password.trim() }),
        });
      } else {
        const form = document.getElementById(FORM_ID);
        if (!form) throw new Error('Form not ready.');
        const fd = new FormData(form);
        if (password.trim()) {
          fd.set('pwd', password.trim());
        }
        if (!String(fd.get('primary_department') || '').trim()) {
          fd.delete('primary_department');
        }
        res = await fetch('/api/profile/self', {
          method: 'POST',
          credentials: 'same-origin',
          body: fd,
          headers: { Accept: 'application/json' },
        });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || tOps('cashier_odoo.profile_save_failed', { defaultValue: 'Could not save changes.' }));
      }
      if (data.profile) setProfile(data.profile);
      if (onSaved) onSaved(data.profile || null);
      onClose();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cs-profile-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="cashier-profile-modal-title">
      <div className="cs-profile-modal cs-profile-modal--full">
        <div className="cs-profile-modal__head">
          <div className="cs-profile-modal__head-text">
            <h2 id="cashier-profile-modal-title">{title}</h2>
            {mode === 'profile' && subtitle ? <p className="cs-profile-modal__subtitle">{subtitle}</p> : null}
          </div>
          <button type="button" className="cs-profile-modal__close" onClick={onClose} disabled={busy} aria-label="Close">
            <FaIcon name="times" />
          </button>
        </div>

        {error ? <div className="cs-profile-modal__error">{error}</div> : null}

        <form id={FORM_ID} onSubmit={handleSubmit} className="cs-profile-modal__form">
          <div className="cs-profile-modal__body">
            {mode === 'profile' ? (
              loading ? (
                <p className="cs-profile-modal__loading">
                  {tOps('cashier_odoo.loading', { defaultValue: 'Loading…' })}
                </p>
              ) : profile ? (
                <>
                  <h3 className="cs-profile-section__title">
                    <FaIcon name="user" />
                    {tOps('cashier_odoo.profile_section', { defaultValue: 'Profile' })}
                  </h3>
                  <div className="cs-profile-grid">
                    <Field label={tOps('cashier_odoo.profile_first_name', { defaultValue: 'First Name' })} required htmlFor="cs-fn">
                      <input
                        id="cs-fn"
                        className="cs-input cs-profile-input"
                        name="first_name"
                        defaultValue={profile.first_name}
                        required
                        autoComplete="given-name"
                      />
                    </Field>
                    <Field label={tOps('cashier_odoo.profile_last_name', { defaultValue: 'Last Name' })} required htmlFor="cs-ln">
                      <input
                        id="cs-ln"
                        className="cs-input cs-profile-input"
                        name="last_name"
                        defaultValue={profile.last_name}
                        required
                        autoComplete="family-name"
                      />
                    </Field>
                    <Field label={tOps('cashier_odoo.profile_username', { defaultValue: 'Username' })}>
                      <input className="cs-input cs-profile-input cs-profile-input--readonly" value={profile.username || ''} readOnly />
                    </Field>
                    <Field label={tOps('cashier_odoo.profile_email', { defaultValue: 'Email' })} htmlFor="cs-em">
                      <input
                        id="cs-em"
                        className="cs-input cs-profile-input"
                        type="email"
                        name="emailid"
                        defaultValue={profile.emailid}
                        autoComplete="email"
                      />
                    </Field>
                    <Field label={tOps('cashier_odoo.profile_phone', { defaultValue: 'Phone' })} htmlFor="cs-ph">
                      <input
                        id="cs-ph"
                        className="cs-input cs-profile-input"
                        type="text"
                        name="phone"
                        defaultValue={profile.phone}
                        autoComplete="tel"
                      />
                    </Field>
                    <Field
                      label={tOps('cashier_odoo.new_password', { defaultValue: 'New Password' })}
                      htmlFor="cs-pw"
                      hint={tOps('cashier_odoo.password_keep_hint', { defaultValue: 'Leave blank to keep current' })}
                    >
                      <input
                        id="cs-pw"
                        className="cs-input cs-profile-input"
                        type="password"
                        value={password}
                        onChange={(ev) => setPassword(ev.target.value)}
                        autoComplete="new-password"
                        placeholder={tOps('cashier_odoo.password_keep_hint', { defaultValue: 'Leave blank to keep current' })}
                      />
                    </Field>
                    <Field label={tOps('cashier_odoo.profile_gender', { defaultValue: 'Gender' })}>
                      <div className="cs-profile-radios">
                        <label className="cs-profile-radio">
                          <input type="radio" name="gender" value="Male" defaultChecked={profile.gender === 'Male'} />
                          {tOps('cashier_odoo.gender_male', { defaultValue: 'Male' })}
                        </label>
                        <label className="cs-profile-radio">
                          <input type="radio" name="gender" value="Female" defaultChecked={profile.gender === 'Female'} />
                          {tOps('cashier_odoo.gender_female', { defaultValue: 'Female' })}
                        </label>
                      </div>
                    </Field>
                    <Field label={tOps('cashier_odoo.profile_dob', { defaultValue: 'Date of Birth' })} htmlFor="cs-dob">
                      <input
                        id="cs-dob"
                        className="cs-input cs-profile-input"
                        type="date"
                        name="dob"
                        defaultValue={profile.dob || ''}
                      />
                    </Field>
                    <Field
                      label={tOps('cashier_odoo.profile_department', { defaultValue: 'Department' })}
                      htmlFor="cs-dept"
                      hint={tOps('cashier_odoo.department_select_hint', { defaultValue: 'Choose your hospital department' })}
                    >
                      <select
                        id="cs-dept"
                        className="cs-input cs-profile-input"
                        name="primary_department"
                        value={department}
                        onChange={(ev) => setDepartment(ev.target.value)}
                      >
                        <option value="">{tOps('cashier_odoo.department_not_set', { defaultValue: '— Not set —' })}</option>
                        {departmentOptions.map((d) => (
                          <option key={d.name} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={tOps('cashier_odoo.profile_address', { defaultValue: 'Address' })} htmlFor="cs-addr">
                      <input
                        id="cs-addr"
                        className="cs-input cs-profile-input"
                        name="address"
                        defaultValue={profile.address || ''}
                        autoComplete="street-address"
                      />
                    </Field>
                    <Field
                      className="cs-profile-field--full"
                      label={tOps('cashier_odoo.profile_bio', { defaultValue: 'Short summary of the employee' })}
                      htmlFor="cs-bio"
                      hint={tOps('cashier_odoo.profile_bio_hint', {
                        defaultValue: 'Brief description shown on staff profiles and rosters',
                      })}
                    >
                      <textarea
                        id="cs-bio"
                        className="cs-input cs-profile-input cs-profile-textarea"
                        name="bio"
                        rows={3}
                        defaultValue={profile.bio || ''}
                        placeholder={tOps('cashier_odoo.profile_bio_placeholder', {
                          defaultValue: 'e.g. Senior cashier, front desk lead…',
                        })}
                      />
                    </Field>
                  </div>

                  <EmployeeProfilePicturePicker
                    formId={FORM_ID}
                    initialGender={profile.gender || 'Male'}
                    initialEmoji={profile.profile_emoji || ''}
                    initialPhotoPath={profile.photo_path || ''}
                    compact
                  />
                </>
              ) : null
            ) : (
              <div className="cs-profile-grid cs-profile-grid--single">
                <Field label={tOps('cashier_odoo.new_password', { defaultValue: 'New password' })} required htmlFor="cs-pw-only">
                  <input
                    id="cs-pw-only"
                    className="cs-input cs-profile-input"
                    type="password"
                    value={password}
                    onChange={(ev) => setPassword(ev.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </Field>
                <Field label={tOps('cashier_odoo.confirm_password', { defaultValue: 'Confirm password' })} required htmlFor="cs-pw2">
                  <input
                    id="cs-pw2"
                    className="cs-input cs-profile-input"
                    type="password"
                    value={passwordConfirm}
                    onChange={(ev) => setPasswordConfirm(ev.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </Field>
              </div>
            )}
          </div>

          <div className="cs-profile-modal__actions">
            <button type="button" className="cs-btn" onClick={onClose} disabled={busy}>
              {tOps('cashier_odoo.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button type="submit" className="cs-btn cs-btn-primary" disabled={busy || (mode === 'profile' && loading)}>
              {busy
                ? tOps('cashier_odoo.saving', { defaultValue: 'Saving…' })
                : tOps('cashier_odoo.save_changes', { defaultValue: 'Save Changes' })}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
