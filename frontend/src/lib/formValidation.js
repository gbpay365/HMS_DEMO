/** Format partial user input as DD/MM/YYYY while typing. */
export function formatDmyInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Parse DD/MM/YYYY → YYYY-MM-DD, or null if invalid. */
export function parseDmyToIso(dmy) {
  const m = String(dmy || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Convert YYYY-MM-DD (or ISO datetime prefix) to DD/MM/YYYY for display. */
export function isoToDmy(value) {
  const s = String(value || '').trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return '';
  return `${iso[3]}/${iso[2]}/${iso[1]}`;
}

const PHONE_INPUT_RX = /[^\d+\s\-()]/g;

/** Keep only phone-format characters while typing. */
export function filterPhoneInput(raw, maxLen = 32) {
  if (raw == null) return '';
  let s = String(raw);
  const leadPlus = s.startsWith('+');
  s = s.replace(PHONE_INPUT_RX, '');
  if (leadPlus) {
    s = `+${s.slice(1).replace(/\+/g, '')}`;
  } else {
    s = s.replace(/\+/g, '');
  }
  return s.slice(0, maxLen);
}

/** Strip formatting; keep digits and optional leading + (matches server normalizePatientPhone). */
export function normalizePhone(raw, maxLen = 32) {
  if (raw == null) return '';
  let s = String(raw).trim();
  if (!s) return '';
  const leadPlus = s.startsWith('+');
  s = s.replace(/[^\d+]/g, '');
  if (leadPlus) {
    s = `+${s.replace(/\+/g, '')}`;
  } else {
    s = s.replace(/\+/g, '');
  }
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

export function isValidPhone(raw) {
  const digits = normalizePhone(raw).replace(/\D/g, '');
  return digits.length >= 6;
}

export function isValidOptionalPhone(raw) {
  const s = String(raw || '').trim();
  if (!s) return true;
  return isValidPhone(s);
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(raw) {
  const s = String(raw || '').trim();
  if (!s) return true;
  return EMAIL_RX.test(s);
}

/** Required email for staff accounts. */
export function isValidRequiredEmail(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  return EMAIL_RX.test(s);
}

/** Client validation for staff/doctor add forms. Returns error message or ''. */
export function validateStaffIdentityFields(fields, messages = {}) {
  const fn = String(fields.first_name || '').trim();
  const ln = String(fields.last_name || '').trim();
  const user = String(fields.username || '').trim();
  const email = String(fields.emailid || fields.email || '').trim();
  const phone = String(fields.phone || '').trim();
  const password = String(fields.password || '');

  if (!fn) return messages.firstName || 'First name is required.';
  if (!ln) return messages.lastName || 'Last name is required.';
  if (!user) return messages.username || 'Username is required.';
  if (password && password.length < 6) return messages.password || 'Password must be at least 6 characters.';
  if (email && !isValidEmail(email)) return messages.email || 'Enter a valid email address.';
  if (phone && !isValidOptionalPhone(phone)) return messages.phone || 'Enter a valid phone number.';
  return '';
}
