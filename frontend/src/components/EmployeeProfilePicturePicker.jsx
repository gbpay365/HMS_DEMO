import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const PICKER_EMOJIS = [
  '👨‍⚕️',
  '👩‍⚕️',
  '👨',
  '👩',
  '👨‍💼',
  '👩‍💼',
  '🧑‍⚕️',
  '🧑',
  '👨‍🔬',
  '👩‍🔬',
  '👨‍🏫',
  '👩‍🏫',
];

function defaultForGender(gender) {
  const g = String(gender || '').trim().toLowerCase();
  if (g === 'female') return '👩‍⚕️';
  if (g === 'male') return '👨‍⚕️';
  return '🧑';
}

function readGenderFromForm(formId) {
  if (!formId || typeof document === 'undefined') return 'Male';
  const form = document.getElementById(formId);
  if (!form) return 'Male';
  const checked = form.querySelector('input[name="gender"]:checked');
  return checked ? checked.value : 'Male';
}

/** Emoji profile avatar picker — syncs to hidden input `profile_emoji`. */
export function EmployeeProfilePicturePicker({
  formId = '',
  initialEmoji = '',
  initialGender = 'Male',
  initialPhotoPath = '',
  hiddenInputId = 'profile_emoji_hidden',
  inputName = 'profile_emoji',
  compact = false,
}) {
  const { t } = useTranslation('ops');
  const [gender, setGender] = useState(initialGender || 'Male');
  const [emoji, setEmoji] = useState(initialEmoji || defaultForGender(initialGender));
  const [custom, setCustom] = useState(Boolean(initialEmoji));
  const [photoPreview, setPhotoPreview] = useState(initialPhotoPath ? `/uploads/${initialPhotoPath}` : '');
  const [removePhoto, setRemovePhoto] = useState(false);

  const preview = useMemo(() => emoji || defaultForGender(gender), [emoji, gender]);

  useEffect(() => {
    const hidden =
      document.getElementById(hiddenInputId) ||
      (formId ? document.querySelector(`#${formId} input[name="${inputName}"]`) : null);
    if (hidden) hidden.value = preview;
  }, [preview, hiddenInputId, inputName, formId]);

  useEffect(() => {
    if (!formId) return undefined;
    const form = document.getElementById(formId);
    if (!form) return undefined;
    const onGender = () => {
      const g = readGenderFromForm(formId);
      setGender(g);
      if (!custom) setEmoji(defaultForGender(g));
    };
    form.addEventListener('change', onGender);
    return () => form.removeEventListener('change', onGender);
  }, [formId, custom]);

  function pick(next) {
    setCustom(true);
    setEmoji(next);
  }

  function useGenderDefault() {
    setCustom(false);
    setEmoji(defaultForGender(gender));
  }

  function handlePhotoChange(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    setRemovePhoto(false);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function clearPhoto() {
    setPhotoPreview('');
    setRemovePhoto(true);
    const input = document.getElementById('staff-profile-photo-input');
    if (input) input.value = '';
  }

  return (
    <div className={`emp-profile-picker${compact ? ' emp-profile-picker--compact' : ' rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm'}`}>
      <div className={`emp-profile-picker__head${compact ? '' : ' mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'}`}>
        <div>
          <div className="emp-profile-picker__title">{t('forms.employeeProfile.title')}</div>
          <div className="emp-profile-picker__hint">{t('forms.employeeProfile.hint')}</div>
        </div>
        <div
          className={`emp-profile-picker__preview${compact ? ' emp-profile-picker__preview--compact' : ' flex h-36 w-36 items-center justify-center overflow-hidden rounded-2xl border-2 border-white bg-white text-7xl shadow-md'}`}
          aria-hidden="true"
        >
          {photoPreview ? <img src={photoPreview} alt="" className="h-full w-full object-cover" /> : preview}
        </div>
      </div>

      <input type="hidden" name={inputName} id={hiddenInputId} value={preview} readOnly />
      <input type="hidden" name="remove_profile_photo" value={removePhoto ? '1' : '0'} readOnly />

      <div className="mb-4 rounded-xl border border-dashed border-slate-300 bg-white p-3">
        <label className="mb-1 block text-xs font-bold text-slate-600" htmlFor="staff-profile-photo-input">
          {t('forms.employeeProfile.upload')}
        </label>
        <input
          id="staff-profile-photo-input"
          type="file"
          name="profile_photo"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
          onChange={handlePhotoChange}
        />
        {photoPreview ? (
          <button type="button" onClick={clearPhoto} className="mt-2 text-xs font-bold text-red-600 hover:underline">
            {t('forms.employeeProfile.remove_photo')}
          </button>
        ) : null}
      </div>

      <div className={`emp-profile-picker__emoji-grid${compact ? ' emp-profile-picker__emoji-grid--compact' : ' mb-2 flex flex-wrap gap-2'}`}>
        {PICKER_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => pick(e)}
            className={
              compact
                ? `emp-profile-picker__emoji-btn${preview === e ? ' emp-profile-picker__emoji-btn--active' : ''}`
                : `flex h-11 w-11 items-center justify-center rounded-xl border-2 text-2xl transition hover:scale-105 ${
                    preview === e
                      ? 'border-brand bg-brand-light shadow-sm ring-2 ring-brand/20'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`
            }
            title={t('forms.employeeProfile.use_emoji', { emoji: e })}
          >
            {e}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={useGenderDefault}
        className="text-xs font-semibold text-brand hover:underline"
      >
        {gender === 'Female'
          ? t('forms.employeeProfile.reset_female', { emoji: defaultForGender(gender) })
          : t('forms.employeeProfile.reset_male', { emoji: defaultForGender(gender) })}
      </button>
    </div>
  );
}
