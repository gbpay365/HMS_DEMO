'use strict';

const XLSX = require('xlsx');
const hmsStaffAccountGuard = require('./hmsStaffAccountGuard');
const visitingDoctor = require('./visitingDoctor');

const EXPORT_COLUMNS = [
  { key: 'name', labelEn: 'Name', labelFr: 'Nom' },
  { key: 'username', labelEn: 'Username', labelFr: 'Identifiant' },
  { key: 'email', labelEn: 'Email', labelFr: 'E-mail' },
  { key: 'phone', labelEn: 'Phone', labelFr: 'Téléphone' },
  { key: 'department', labelEn: 'Department', labelFr: 'Service' },
  { key: 'specialisation', labelEn: 'Specialisation', labelFr: 'Spécialisation' },
  { key: 'role', labelEn: 'Role', labelFr: 'Rôle' },
  { key: 'status', labelEn: 'Status', labelFr: 'Statut' },
  { key: 'joined', labelEn: 'Joined', labelFr: 'Arrivée' },
  { key: 'gender', labelEn: 'Gender', labelFr: 'Genre' },
];

const DEFAULT_COLUMNS = ['name', 'username', 'department', 'role', 'status'];

const COLUMN_KEYS = new Set(EXPORT_COLUMNS.map((c) => c.key));

function resolveLang(lang) {
  return String(lang || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

function columnLabel(col, lang) {
  return resolveLang(lang) === 'fr' ? col.labelFr : col.labelEn;
}

function getColumnMeta(lang) {
  return EXPORT_COLUMNS.map((c) => ({ key: c.key, label: columnLabel(c, lang) }));
}

function parseColumnKeys(raw) {
  const parts = String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const keys = parts.filter((k) => COLUMN_KEYS.has(k));
  return keys.length ? keys : [...DEFAULT_COLUMNS];
}

function statusLabel(status, lang) {
  const on = String(status) === '1' || status === 1 || status === true;
  if (resolveLang(lang) === 'fr') return on ? 'Actif' : 'Inactif';
  return on ? 'Active' : 'Inactive';
}

function formatJoined(val) {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return String(val).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function employeeFieldValue(emp, key, roleMap, lang) {
  switch (key) {
    case 'name':
      return `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
    case 'username':
      return emp.username || '';
    case 'email':
      return emp.emailid || '';
    case 'phone':
      return emp.phone || '';
    case 'department':
      return emp.departments_all || emp.primary_department || '';
    case 'specialisation':
      return emp.specialisations_all || emp.specialisation || '';
    case 'role':
      return roleMap[String(emp.role)] || String(emp.role || '');
    case 'status':
      return statusLabel(emp.status, lang);
    case 'joined':
      return formatJoined(emp.joining_date);
    case 'gender':
      return emp.gender || '';
    default:
      return '';
  }
}

function filterEmployeesBySearch(employees, q, roleMap) {
  const query = String(q || '').trim().toLowerCase();
  if (!query) return employees;
  return employees.filter((e) => {
    const roleLabel = roleMap[String(e.role)] || String(e.role || '');
    const hay = [
      e.first_name,
      e.last_name,
      e.username,
      e.emailid,
      e.phone,
      e.primary_department,
      e.specialisation,
      e.departments_all,
      e.specialisations_all,
      roleLabel,
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(query);
  });
}

async function fetchEmployeeDirectory(pool) {
  const [employees] = await pool
    .query(
      `SELECT e.id, e.first_name, e.last_name, e.username, e.emailid, e.phone, e.gender,
              e.joining_date, e.role, e.primary_department, e.specialisation, e.status,
              (SELECT GROUP_CONCAT(ed.department_name ORDER BY ed.is_primary DESC, ed.sort_order SEPARATOR ', ')
                 FROM tbl_employee_department ed WHERE ed.employee_id = e.id) AS departments_all,
              (SELECT GROUP_CONCAT(es.specialisation ORDER BY es.is_primary DESC, es.sort_order SEPARATOR ', ')
                 FROM tbl_employee_doctor_specialisation es WHERE es.employee_id = e.id) AS specialisations_all
         FROM tbl_employee e
        WHERE ${hmsStaffAccountGuard.EMPLOYEE_DIRECTORY_ROLE_SQL}
          AND ${visitingDoctor.staffDirectoryExcludeSql('e')}
        ORDER BY e.first_name, e.last_name`
    )
    .catch(() => [[]]);
  return Array.isArray(employees) ? employees : [];
}

function buildExportTable(employees, columnKeys, roleMap, lang) {
  const cols = EXPORT_COLUMNS.filter((c) => columnKeys.includes(c.key)).map((c) => ({
    key: c.key,
    label: columnLabel(c, lang),
  }));
  const rows = employees.map((emp) => {
    const row = {};
    for (const col of cols) {
      row[col.key] = employeeFieldValue(emp, col.key, roleMap, lang);
    }
    return row;
  });
  return { columns: cols, rows };
}

function buildXlsxBuffer(title, subtitle, table) {
  const wb = XLSX.utils.book_new();
  const aoa = [
    [title],
    [subtitle],
    [],
    table.columns.map((c) => c.label),
    ...table.rows.map((row) => table.columns.map((c) => row[c.key] ?? '')),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function exportFilename(ext) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `employees-${stamp}.${ext}`;
}

module.exports = {
  EXPORT_COLUMNS,
  DEFAULT_COLUMNS,
  getColumnMeta,
  parseColumnKeys,
  fetchEmployeeDirectory,
  filterEmployeesBySearch,
  buildExportTable,
  buildXlsxBuffer,
  exportFilename,
  resolveLang,
};
