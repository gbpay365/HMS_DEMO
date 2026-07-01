import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmployeeDoctorMultiFields } from '../components/EmployeeDoctorMultiFields';
import { EmployeeProfilePicturePicker } from '../components/EmployeeProfilePicturePicker';
import { FormErrorBanner } from '../components/FormErrorBanner';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';

const FORM_ID = 'hms-edit-employee-profile-form';

const MODAL_TABS = [
  { id: 'profile', icon: 'user', labelKey: 'employee_edit.profile', fallback: 'Profile' },
  { id: 'employment', icon: 'briefcase', labelKey: 'employee_edit.employment', fallback: 'Employment' },
  { id: 'account', icon: 'toggle-on', labelKey: 'employee_edit.account_status', fallback: 'Account' },
];

function SectionTitle({ icon, children }) {
  return (
    <h3 className="emp-edit-profile-section__title">
      <i className={`fa fa-${icon}`} aria-hidden="true" />
      {children}
    </h3>
  );
}

function Field({ label, required, children, hint, htmlFor }) {
  return (
    <div className="emp-edit-profile-field">
      <label className="emp-edit-profile-field__label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="emp-edit-profile-field__req"> *</span> : null}
      </label>
      {children}
      {hint ? <p className="emp-edit-profile-field__hint">{hint}</p> : null}
    </div>
  );
}

export function EditEmployeeProfileModal({ open, employeeId, onClose, onSaved }) {
  const { t: tLegacy } = useTranslation('legacy');
  const { t } = useTranslation('ops');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');

  const emp = payload?.employee || null;
  const formMeta = payload?.form || {};

  const subtitle = useMemo(() => {
    if (!emp) return '';
    const name = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
    return name ? `${name} · @${emp.username || '—'}` : '';
  }, [emp]);

  const loadProfile = useCallback(async (id) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/employees/${encodeURIComponent(id)}/profile`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.error || t('employees.profile_load_failed', { defaultValue: 'Could not load employee profile.' }));
      }
      setPayload(json);
    } catch (e) {
      setError(e.message || String(e));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!open || !employeeId) return;
    setActiveTab('profile');
    loadProfile(employeeId);
  }, [open, employeeId, loadProfile]);

  const resetAndClose = () => {
    setPayload(null);
    setError('');
    setActiveTab('profile');
    onClose();
  };

  const handleClose = () => {
    if (busy) return;
    resetAndClose();
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!employeeId || !emp) return;
    setBusy(true);
    setError('');
    try {
      const form = document.getElementById(FORM_ID);
      if (!form) throw new Error('Form not ready.');
      const fd = new FormData(form);
      const res = await fetch(`/api/employees/${encodeURIComponent(employeeId)}/profile`, {
        method: 'POST',
        credentials: 'same-origin',
        body: fd,
        headers: { Accept: 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.error || t('employees.profile_save_failed', { defaultValue: 'Could not save changes.' }));
      }
      if (onSaved) onSaved(json.employee || null);
      setPayload(null);
      setError('');
      onClose();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('employees.edit_profile', { defaultValue: 'Edit Profile' })}
      subtitle={subtitle}
      size="lg"
      theme="staff"
      bodyClassName="emp-edit-profile-modal__body"
      footerClassName="emp-edit-profile-modal__footer"
      footer={
        <>
          <ModalCancelButton onClick={handleClose} label={tLegacy('employee_edit.cancel', { defaultValue: 'Cancel' })} />
          <ModalSubmitButton
            form={FORM_ID}
            label={
              busy
                ? t('employees.profile_saving', { defaultValue: 'Saving…' })
                : tLegacy('employee_edit.save_changes', { defaultValue: 'Save Changes' })
            }
            disabled={busy || loading || !emp}
          />
        </>
      }
    >
      {loading ? (
        <p className="emp-edit-profile-loading">
          {t('employees.profile_loading', { defaultValue: 'Loading employee profile…' })}
        </p>
      ) : null}

      {!loading && error && !emp ? <FormErrorBanner message={error} /> : null}

      {!loading && emp ? (
        <form id={FORM_ID} onSubmit={handleSubmit} className="emp-edit-profile-form">
          <FormErrorBanner message={error} />

          <div className="emp-edit-profile-tabs" role="tablist">
            {MODAL_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`emp-edit-profile-tab${activeTab === tab.id ? ' emp-edit-profile-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <i className={`fa fa-${tab.icon}`} aria-hidden="true" />
                {tLegacy(tab.labelKey, { defaultValue: tab.fallback })}
              </button>
            ))}
          </div>

          <section className="emp-edit-profile-section" hidden={activeTab !== 'profile'} aria-hidden={activeTab !== 'profile'}>
              <SectionTitle icon="user">{tLegacy('employee_edit.profile', { defaultValue: 'Profile' })}</SectionTitle>
              <div className="emp-edit-profile-grid">
                <Field label={tLegacy('employee_edit.first_name', { defaultValue: 'First Name' })} required htmlFor="emp-fn">
                  <input
                    id="emp-fn"
                    className="hms-input emp-edit-profile-input"
                    name="first_name"
                    defaultValue={emp.first_name}
                    required
                    autoComplete="given-name"
                  />
                </Field>
                <Field label={tLegacy('employee_edit.last_name', { defaultValue: 'Last Name' })} required htmlFor="emp-ln">
                  <input
                    id="emp-ln"
                    className="hms-input emp-edit-profile-input"
                    name="last_name"
                    defaultValue={emp.last_name}
                    required
                    autoComplete="family-name"
                  />
                </Field>
                <Field label={tLegacy('employee_edit.username', { defaultValue: 'Username' })} required htmlFor="emp-un">
                  <input
                    id="emp-un"
                    className="hms-input emp-edit-profile-input"
                    name="username"
                    defaultValue={emp.username}
                    required
                    autoComplete="username"
                  />
                </Field>
                <Field label={tLegacy('employee_edit.email', { defaultValue: 'Email' })} required htmlFor="emp-em">
                  <input
                    id="emp-em"
                    className="hms-input emp-edit-profile-input"
                    type="email"
                    name="emailid"
                    defaultValue={emp.emailid}
                    autoComplete="email"
                  />
                </Field>
                {formMeta.canResetPassword ? (
                  <Field
                    label={tLegacy('employee_edit.new_password', { defaultValue: 'New Password' })}
                    htmlFor="emp-pw"
                    hint={tLegacy('employee_edit.password_placeholder', { defaultValue: 'Leave blank to keep current' })}
                  >
                    <input
                      id="emp-pw"
                      className="hms-input emp-edit-profile-input"
                      type="password"
                      name="pwd"
                      autoComplete="new-password"
                      placeholder={tLegacy('employee_edit.password_placeholder', { defaultValue: 'Leave blank to keep current' })}
                    />
                  </Field>
                ) : (
                  <Field label={tLegacy('employee_edit.new_password', { defaultValue: 'New Password' })}>
                    <p className="emp-edit-profile-note">
                      {tLegacy('employee_edit.password_super_admin_only', {
                        defaultValue: 'Password reset for Super Admin accounts is restricted to Super Admin only.',
                      })}
                    </p>
                  </Field>
                )}
                <div className="emp-edit-profile-field emp-edit-profile-field--spacer" aria-hidden="true" />
                <Field label={tLegacy('employee_edit.gender', { defaultValue: 'Gender' })}>
                  <div className="emp-edit-profile-radios">
                    <label className="emp-edit-profile-radio">
                      <input type="radio" name="gender" value="Male" defaultChecked={emp.gender === 'Male'} />
                      {tLegacy('employee_edit.gender_male', { defaultValue: 'Male' })}
                    </label>
                    <label className="emp-edit-profile-radio">
                      <input type="radio" name="gender" value="Female" defaultChecked={emp.gender === 'Female'} />
                      {tLegacy('employee_edit.gender_female', { defaultValue: 'Female' })}
                    </label>
                  </div>
                </Field>
                <Field label={tLegacy('employee_edit.dob', { defaultValue: 'Date of Birth' })} htmlFor="emp-dob">
                  <input
                    id="emp-dob"
                    className="hms-input emp-edit-profile-input"
                    type="date"
                    name="dob"
                    defaultValue={emp.dob || ''}
                  />
                </Field>
              </div>

              <EmployeeProfilePicturePicker
                formId={FORM_ID}
                initialGender={emp.gender || 'Male'}
                initialEmoji={emp.profile_emoji || ''}
                initialPhotoPath={emp.photo_path || ''}
                compact
              />
          </section>

          <section className="emp-edit-profile-section" hidden={activeTab !== 'employment'} aria-hidden={activeTab !== 'employment'}>
              <SectionTitle icon="briefcase">{tLegacy('employee_edit.employment', { defaultValue: 'Employment' })}</SectionTitle>
              <div className="emp-edit-profile-grid">
                <Field label={tLegacy('employee_edit.employee_id', { defaultValue: 'Employee ID' })} htmlFor="emp-eid">
                  <input id="emp-eid" className="hms-input emp-edit-profile-input" name="employee_id" defaultValue={emp.employee_id || ''} />
                </Field>
                <Field label={tLegacy('employee_edit.joining_date', { defaultValue: 'Joining Date' })} htmlFor="emp-jd">
                  <input
                    id="emp-jd"
                    className="hms-input emp-edit-profile-input"
                    type="date"
                    name="joining_date"
                    defaultValue={emp.joining_date || ''}
                  />
                </Field>
                <Field label={tLegacy('employee_edit.phone', { defaultValue: 'Phone' })} htmlFor="emp-ph">
                  <input
                    id="emp-ph"
                    className="hms-input emp-edit-profile-input"
                    name="phone"
                    defaultValue={emp.phone || ''}
                    autoComplete="tel"
                  />
                </Field>
                <Field label={tLegacy('employee_edit.role', { defaultValue: 'Role' })} htmlFor="emp-role">
                  <select id="emp-role" className="hms-input emp-edit-profile-input" name="role" defaultValue={emp.role || ''} required>
                    <option value="">{tLegacy('employee_edit.select_role', { defaultValue: '— Select Role —' })}</option>
                    {(formMeta.roles || []).map((r) => (
                      <option key={r.role} value={r.role}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="emp-edit-profile-stack">
                <EmployeeDoctorMultiFields
                  formId={FORM_ID}
                  doctorRoleIds={formMeta.doctorRoleIds || []}
                  departments={formMeta.departments || []}
                  specialisationsCatalog={formMeta.doctorSpecialisations || []}
                  initialDepartments={emp.departments || []}
                  initialSpecialisations={emp.specialisations || []}
                  deptWrapId="empProfilePrimaryDepartmentWrap"
                  legacySpecWrapId="empProfileDoctorSpecialisationWrap"
                />

                <div id="empProfilePrimaryDepartmentWrap">
                  <Field label={tLegacy('employee_edit.department', { defaultValue: 'Department' })} htmlFor="emp-dept">
                    <select id="emp-dept" className="hms-input emp-edit-profile-input" name="primary_department" defaultValue={emp.primary_department || ''}>
                      <option value="">{tLegacy('employee_edit.not_set', { defaultValue: '— Not set —' })}</option>
                      {(formMeta.departments || []).map((d) => (
                        <option key={d.name || d} value={d.name || d}>
                          {d.name || d}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <input type="hidden" name="specialisation" defaultValue={emp.specialisation || ''} />

                <Field label={tLegacy('employee_edit.address', { defaultValue: 'Address' })} htmlFor="emp-addr">
                  <input
                    id="emp-addr"
                    className="hms-input emp-edit-profile-input"
                    name="address"
                    defaultValue={emp.address || ''}
                    autoComplete="street-address"
                  />
                </Field>
                <Field label={tLegacy('employee_edit.bio', { defaultValue: 'Short Biography' })}>
                  <textarea
                    className="hms-input emp-edit-profile-input min-h-[88px]"
                    name="bio"
                    rows={3}
                    defaultValue={emp.bio || ''}
                  />
                </Field>
              </div>
          </section>

          <section className="emp-edit-profile-section" hidden={activeTab !== 'account'} aria-hidden={activeTab !== 'account'}>
              <SectionTitle icon="toggle-on">{tLegacy('employee_edit.account_status', { defaultValue: 'Account Status' })}</SectionTitle>
              <div className="emp-edit-profile-radios emp-edit-profile-radios--status">
                <label className="emp-edit-profile-radio emp-edit-profile-radio--active">
                  <input type="radio" name="status" value="1" defaultChecked={Number(emp.status) === 1} />
                  {tLegacy('employee_edit.active', { defaultValue: 'Active' })}
                </label>
                <label className="emp-edit-profile-radio">
                  <input type="radio" name="status" value="0" defaultChecked={Number(emp.status) === 0} />
                  {tLegacy('employee_edit.inactive', { defaultValue: 'Inactive' })}
                </label>
              </div>

              <div className="emp-edit-profile-portal">
                <SectionTitle icon="lock">{tLegacy('employee_edit.portal_access', { defaultValue: 'Portal Access' })}</SectionTitle>
                <p className="emp-edit-profile-note">
                  {tLegacy('employee_edit.portal_access_hint', {
                    defaultValue:
                      'Assign which portals this employee may access under Modules & permissions in Access Control.',
                  })}
                </p>
                <a
                  className="hms-btn-secondary text-xs"
                  href={`/access-control?role=${encodeURIComponent(emp.role || '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i className="fa fa-lock mr-1" aria-hidden="true" />
                  {tLegacy('employee_edit.open_access_control', { defaultValue: 'Open Access Control for this role' })}
                </a>
              </div>
          </section>
        </form>
      ) : null}
    </Modal>
  );
}
