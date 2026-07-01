'use strict';

/**
 * Next sequential staff code: EMP-{year}-{00001}.
 */
async function nextAutoEmployeeStaffId(pool) {
  const year = new Date().getFullYear();
  const prefix = `EMP-${year}-`;
  const [rows] = await pool.query(
    'SELECT employee_id FROM tbl_employee WHERE employee_id LIKE ? ORDER BY id DESC LIMIT 80',
    [`${prefix}%`]
  ).catch(() => [[]]);
  let maxSeq = 0;
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${esc}(\\d+)$`);
  for (const row of rows || []) {
    const m = String(row.employee_id || '').match(re);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10) || 0);
  }
  return `${prefix}${String(maxSeq + 1).padStart(5, '0')}`;
}

module.exports = { nextAutoEmployeeStaffId };
