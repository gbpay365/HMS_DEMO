'use strict';

/** Normalize staff login username (trim; comparison is case-insensitive). */
function normalizeLoginUsername(raw) {
  return String(raw ?? '').trim();
}

const EMPLOYEE_LOGIN_SELECT_SQL =
  'SELECT id, first_name, last_name, username, password, role, photo_path, specialisation, profile_emoji, gender FROM tbl_employee WHERE LOWER(TRIM(username)) = LOWER(?) AND status = 1 LIMIT 1';

module.exports = { normalizeLoginUsername, EMPLOYEE_LOGIN_SELECT_SQL };
