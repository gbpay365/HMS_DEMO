// ============================================================
// STAFF / EMPLOYEES + ACCESS CONTROL — routes/staff.js
// Mirrors PHP: employees.php, add-employee.php, edit-employee.php, access-control.php
// ============================================================
const bcrypt = require('bcryptjs');
const ensureHrPayrollSchema = require('../lib/ensureHrPayrollSchema');
const ensureEmployeeHrSchema = require('../lib/ensureEmployeeHrSchema');
const { normalizeEmployeePhone } = ensureEmployeeHrSchema;

async function replicateEmployeeOut(pool, employeeId, event = 'upsert') {
    try {
        const { syncEmployeeToCoreAccount } = require('../lib/coreAccountEmployeeSync');
        await syncEmployeeToCoreAccount(pool, employeeId, event);
    } catch (_) { /* non-blocking */ }
    try {
        const { syncEmployeeToZaizensPayroll } = require('../lib/zaizensEmployeeSync');
        await syncEmployeeToZaizensPayroll(pool, employeeId, event);
    } catch (_) { /* non-blocking */ }
}
const pagination = require('../lib/pagination');
const { loadAccessControlContext } = require('../lib/loadAccessControlContext');
const hmsStaffAccountGuard = require('../lib/hmsStaffAccountGuard');
const {
    listDoctorSpecialisations,
    resolveDoctorRoleIds,
    requireDoctorSpecialisations,
    requireDoctorDepartments,
    registerDoctorSpecialisation,
    isDoctorRoleId,
} = require('../lib/hmsDoctorSpecialisations');
const {
    ensureEmployeeClinicalLinksSchema,
    parseDepartmentsFromBody,
    parseSpecialisationsFromBody,
    primaryLegacyFields,
    loadEmployeeDepartments,
    loadEmployeeSpecialisations,
    syncEmployeeDepartments,
    syncEmployeeSpecialisations,
    migrateLegacyEmployeeClinicalLinks,
} = require('../lib/hmsEmployeeClinicalLinks');
const { resolveProfileEmoji } = require('../lib/hmsEmployeeProfile');
const {
    staffProfilePhotoMiddleware,
    uploadedStaffPhotoPath,
} = require('../lib/staffProfilePhotoUpload');
const orgClinical = require('../lib/hmsOrgClinicalCatalog');
const employeeDirectoryExport = require('../lib/employeeDirectoryExport');
const { updateEmployeeProfile } = require('../lib/employeeProfileSave');
const { toIsoDatePart } = require('../lib/hmsFormatDate');

module.exports = function(app, pool, requireAuth) {

    // ── admin-only guard ─────────────────────────────────────
    function requireAdmin(req, res, next) {
        const role = String(req.session.user?.role ?? '');
        if (role !== '1' && role !== '99') return res.redirect('/dashboard?err=Access+denied');
        next();
    }

    /** Admin/Super, Director, or ACL employee.write — manage department & specialisation catalogs. */
    function requireOrgClinicalManage(req, res, next) {
        const role = String(req.session.user?.role ?? '');
        if (role === '1' || role === '99') return next();
        const perms = res.locals.userPerms || [];
        if (perms.includes('*') || perms.includes('employee.write')) return next();
        const msg = 'Access denied. Admin or employee management permission required.';
        if (req.method === 'POST' || (req.headers.accept || '').includes('application/json')) {
            return res.status(403).redirect('/employees?err=' + encodeURIComponent(msg));
        }
        return res.redirect('/employees?err=' + encodeURIComponent(msg));
    }

    /** Admin, Super Admin, or ACL access_control.manage */
    function requireAccessControl(req, res, next) {
        const role = String(req.session.user?.role ?? '');
        if (role === '1' || role === '99') return next();
        const perms = res.locals.userPerms || [];
        if (perms.includes('*') || perms.includes('access_control.manage')) return next();
        const msg = 'Access denied. Admin or Access Control permission required.';
        const isAjax =
            req.method === 'POST' ||
            (req.headers.accept || '').includes('application/json') ||
            String(req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest';
        if (isAjax) return res.status(403).json({ ok: false, error: msg });
        return res.redirect('/dashboard?err=' + encodeURIComponent(msg));
    }

    /** Admin/Super or ACL `employee.write` (cannot target privileged accounts — checked per route). */
    function requireEmployeeWrite(req, res, next) {
        const role = String(req.session.user?.role ?? '');
        if (role === '1' || role === '99') return next();
        const perms = res.locals.userPerms || [];
        if (perms.includes('*') || perms.includes('employee.write')) return next();
        const msg = 'Access denied. Employee management permission required.';
        if (req.method === 'POST' || (req.headers.accept || '').includes('application/json')) {
            return res.status(403).json({ ok: false, error: msg });
        }
        return res.redirect('/employees?err=' + encodeURIComponent(msg));
    }

    /** Admin/Super or ACL `employee.password.manage` — reset staff login passwords. */
    function requireEmployeePasswordManage(req, res, next) {
        const role = String(req.session.user?.role ?? '');
        if (role === '1' || role === '99') return next();
        const perms = res.locals.userPerms || [];
        if (perms.includes('*') || perms.includes('employee.password.manage')) return next();
        const msg = 'Access denied. Employee password management permission required.';
        const settingsUrl = '/settings/employee-password';
        if (req.method === 'POST' || (req.headers.accept || '').includes('application/json')) {
            return res.status(403).redirect(settingsUrl + '?err=' + encodeURIComponent(msg));
        }
        return res.redirect(settingsUrl + '?err=' + encodeURIComponent(msg));
    }

    /** Super Admin or System Admin — manage privileged login accounts. */
    function requireSystemUsersAccess(req, res, next) {
        const role = String(req.session.user?.role ?? '');
        if (role === '1' || role === '99') return next();
        return res.redirect('/dashboard?err=' + encodeURIComponent('Access denied. System Users are managed by Admin or Super Admin only.'));
    }

    function systemUserFormLocals(extra = {}) {
        return {
            systemUserMode: true,
            formAction: extra.formAction || '/users/add',
            cancelHref: '/users',
            hideClinicalFields: true,
            ...extra,
        };
    }

    /** Super Admin, System Admin, Hospital Director, or ACL employee.delete. */
    async function requireEmployeeDelete(req, res, next) {
        const role = String(req.session.user?.role ?? '');
        const directorRoleId = await hmsStaffAccountGuard.resolveDirectorRoleId(pool);
        if (hmsStaffAccountGuard.canDeleteEmployeeAccount(role, directorRoleId)) return next();
        const perms = res.locals.userPerms || [];
        if (perms.includes('*') || perms.includes('employee.delete')) return next();
        const msg = 'Access denied. Only Super Admin, Admin, or Director can delete employees.';
        return res.redirect('/employees?err=' + encodeURIComponent(msg));
    }

    function actorCanDeleteEmployees(role, directorRoleId, perms) {
        if (hmsStaffAccountGuard.canDeleteEmployeeAccount(role, directorRoleId)) return true;
        const p = perms || [];
        return p.includes('*') || p.includes('employee.delete');
    }

    async function loadEmployeeOrRedirect(id, res) {
        const [empRows] = await pool.query('SELECT * FROM tbl_employee WHERE id=? LIMIT 1', [id]).catch(() => [[], []]);
        if (!empRows || !empRows[0]) {
            res.redirect('/employees?err=Employee+not+found');
            return null;
        }
        return empRows[0];
    }

    /** Facility attendance grid — Admin/Super or ACL `payroll.write`. */
    function requireAdminOrPayrollWrite(req, res, next) {
        const role = String(req.session.user?.role ?? '');
        if (role === '1' || role === '99') return next();
        const perms = res.locals.userPerms || [];
        if (perms.includes('*') || perms.includes('payroll.write')) return next();
        if (req.method === 'POST' || (req.headers.accept || '').includes('application/json')) {
            return res.status(403).json({ ok: false, error: 'Access denied. Admin or payroll.write required.' });
        }
        return res.redirect('/dashboard?err=' + encodeURIComponent('Access denied. Admin or payroll.write required.'));
    }

    // ── safe SQL helpers ─────────────────────────────────────
    async function sq(sql, params = []) {
        try { const [r] = await pool.query(sql, params); return Array.isArray(r) ? r : []; }
        catch (e) { console.error('[staff]', e.message); return []; }
    }
    async function sc(sql, params = []) {
        const r = await sq(sql, params);
        return parseInt(r[0]?.c ?? r[0]?.count ?? 0) || 0;
    }
    async function run(sql, params = []) {
        try { await pool.query(sql, params); return true; }
        catch (e) { console.error('[staff run]', e.message); return false; }
    }

    async function nextAutoEmployeeStaffId() {
        const year = new Date().getFullYear();
        const prefix = `EMP-${year}-`;
        const rows = await sq(
            'SELECT employee_id FROM tbl_employee WHERE employee_id LIKE ? ORDER BY id DESC LIMIT 80',
            [`${prefix}%`]
        );
        let maxSeq = 0;
        const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`^${esc}(\\d+)$`);
        for (const row of rows || []) {
            const m = String(row.employee_id || '').match(re);
            if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10) || 0);
        }
        return prefix + String(maxSeq + 1).padStart(5, '0');
    }

    // ── AUTO-MIGRATE (call once) ─────────────────────────────
    app.get('/migrate-staff', requireAuth, requireAdmin, async (req, res) => {
        const stmts = [
            // Roles table
            `CREATE TABLE IF NOT EXISTS tbl_role (
                role VARCHAR(10) NOT NULL PRIMARY KEY,
                title VARCHAR(100) NOT NULL
            )`,
            // Portals table
            `CREATE TABLE IF NOT EXISTS tbl_acl_portal (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(40) NOT NULL UNIQUE,
                label VARCHAR(80) NOT NULL,
                sort_order INT DEFAULT 0
            )`,
            // Permissions table
            `CREATE TABLE IF NOT EXISTS tbl_acl_permission (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(120) NOT NULL UNIQUE,
                label VARCHAR(200) NOT NULL,
                gap_area INT DEFAULT 0
            )`,
            // Role <-> Permission mapping
            `CREATE TABLE IF NOT EXISTS tbl_acl_role_permission (
                role VARCHAR(10) NOT NULL,
                permission_id INT UNSIGNED NOT NULL,
                PRIMARY KEY (role, permission_id)
            )`,
            // Workflow steps
            `CREATE TABLE IF NOT EXISTS tbl_workflow_step_roles (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                workflow VARCHAR(20) NOT NULL,
                step_key VARCHAR(80) NOT NULL,
                step_label VARCHAR(120) NOT NULL,
                step_order TINYINT NOT NULL DEFAULT 0,
                portal_codes TEXT,
                perm_ids TEXT,
                step_color VARCHAR(20) DEFAULT '#3182ce',
                is_custom TINYINT(1) DEFAULT 0,
                UNIQUE KEY uniq_step (workflow, step_key)
            )`,
        ];
        for (const s of stmts) await run(s);

        // Seed roles
        const roles = [
            ['1','Admin'],['2','Doctor'],['3','Front Desk'],['4','Lab Technician'],
            ['5','Pharmacist'],['6','Radiology Tech'],['7','Nurse'],['8','Nursing Aid'],
            ['9','Accountant'],['10','Cashier'],['11','Nurse Station'],['12','Nurse Aid'],['99','Super Admin']
        ];
        for (const [id, title] of roles) {
            await run('INSERT IGNORE INTO tbl_role (role,title) VALUES (?,?)', [id, title]);
        }

        // Seed portals (canonical codes — legacy aliases migrated on boot)
        const portals = [
            ['front_desk','Front Desk',20],['doctor','Doctor',30],['nurse','Nurse',40],
            ['labtech','Laboratory Technician',50],['pharmacy','Pharmacy',60],['radiology','Radiology',70],
            ['cashier','Cashier',80],['accountant','Accountant',90],['patient_support','Patient Portal',95]
        ];
        for (const [code, label, sort] of portals) {
            await run('INSERT IGNORE INTO tbl_acl_portal (code,label,sort_order) VALUES (?,?,?)', [code, label, sort]);
        }

        // Seed workflow steps
        const wfSteps = [
            ['opd','patient_reg','Patient Registration',1,'#16a085'],
            ['opd','consult_fee','Consultation Fee Payment',2,'#f39c12'],
            ['opd','triage','Front Desk Triage',3,'#00b5cc'],
            ['opd','opd_queue','OPD Queue & Vitals',4,'#2e62ff'],
            ['opd','doctor_consult','Doctor Consultation',5,'#8e44ad'],
            ['opd','lab_radio_pay','Payment for Lab/Radio/Pharmacy',6,'#c0392b'],
            ['opd','lab_radio_tests','Lab / Radiology Tests',7,'#e84393'],
            ['opd','pharmacy_dispense','Pharmacy Dispensing',8,'#575fcf'],
            ['opd','discharge_opd','Discharge or IPD Admission',9,'#019085'],
            ['ipd','ipd_admission','IPD Admission',1,'#1abc9c'],
            ['ipd','ward_allocation','Ward Allocation',2,'#008ece'],
            ['ipd','nursing_assess','Nursing Assessment',3,'#6c5ce7'],
            ['ipd','doctor_ward_round','Doctor Ward Round',4,'#9b59b6'],
            ['ipd','treatment','Treatment & Medication',5,'#1e65ff'],
            ['ipd','lab_radio_ipd','Lab / Radiology (Inpatient)',6,'#e84393'],
            ['ipd','bill_settlement','Inpatient Bill Settlement',7,'#f39c12'],
            ['ipd','patient_discharge','Patient Discharge',8,'#059c62'],
        ];
        for (const [wf, key, label, order, color] of wfSteps) {
            await run('INSERT IGNORE INTO tbl_workflow_step_roles (workflow,step_key,step_label,step_order,step_color) VALUES (?,?,?,?,?)',
                [wf, key, label, order, color]);
        }

        // Seed sample permissions
        const perms = [
            ['patient.read','View Patients',1],['patient.write','Add/Edit Patients',1],
            ['employee.read','View Employees',2],['employee.write','Add/Edit Employees',2],['employee.password.manage','Set/Reset Passwords',2],
            ['appointment.read','View Appointments',3],['appointment.write','Book Appointments',3],
            ['opd.visit','Access OPD Queue',4],['triage.write','Record Triage/Vitals',4],
            ['consultation.read','View Consultations',5],['consultation.write','Create Consultations',5],
            ['lab.read','View Lab Orders',6],['lab.write','Create Lab Orders',6],
            ['radiology.read','View Radiology Orders',7],['radiology.write','Create Radiology Orders',7],
            ['pharmacy.read','View Prescriptions',8],['pharmacy.write','Dispense Prescriptions',8],
            ['billing.read','View Billing',9],['billing.write','Create Charges',9],
            ['ward.read','View Ward/Beds',10],['ward.write','Admit/Discharge Patients',10],
            ['cashier.read','View Payment Tickets',11],['cashier.write','Process Payments',11],
            ['access_control.manage','Manage Access Control',12],['employee.delete','Delete Employees',2],
        ];
        for (const [code, label, gap] of perms) {
            await run('INSERT IGNORE INTO tbl_acl_permission (code,label,gap_area) VALUES (?,?,?)', [code, label, gap]);
        }

        res.send('<h2 style="font-family:sans-serif;padding:2rem">✅ Staff migration complete! <a href="/employees">View Employees</a> | <a href="/access-control">Access Control</a></h2>');
    });

    // ────────────────────────────────────────────────────────
    // EMPLOYEES LIST
    // ────────────────────────────────────────────────────────
    app.get('/employees', requireAuth, async (req, res) => {
        const [employees] = await pool.query(
             `SELECT e.id, e.first_name, e.last_name, e.username, e.emailid, e.phone, e.gender, e.profile_emoji,
                e.joining_date, e.role, e.primary_department, e.specialisation, e.profile_emoji, e.photo_path, e.status,
                (SELECT GROUP_CONCAT(ed.department_name ORDER BY ed.is_primary DESC, ed.sort_order SEPARATOR ', ')
                   FROM tbl_employee_department ed WHERE ed.employee_id = e.id) AS departments_all,
                (SELECT GROUP_CONCAT(es.specialisation ORDER BY es.is_primary DESC, es.sort_order SEPARATOR ', ')
                   FROM tbl_employee_doctor_specialisation es WHERE es.employee_id = e.id) AS specialisations_all
             FROM tbl_employee e
             WHERE ${hmsStaffAccountGuard.EMPLOYEE_DIRECTORY_ROLE_SQL}
               AND ${require('../lib/visitingDoctor').staffDirectoryExcludeSql('e')}
             ORDER BY e.first_name, e.last_name`
        ).catch(() => [[]]);
        const roles = await sq('SELECT role, title FROM tbl_role ORDER BY CAST(role AS UNSIGNED)');
        const roleMap = {};
        for (const r of roles) roleMap[String(r.role)] = r.title;

        const userRole = String(req.session.user?.role ?? '');
        const userPerms = res.locals.userPerms || [];
        const directorRoleId = await hmsStaffAccountGuard.resolveDirectorRoleId(pool);
        const canDeleteEmployee = actorCanDeleteEmployees(userRole, directorRoleId, userPerms);
        const sessionUserId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
        const lang = employeeDirectoryExport.resolveLang(res.locals.lang);

        res.render('employees', {
            title: 'Employees — ZAIZENS',
            pageData: {
                employees: Array.isArray(employees) ? employees : [],
                roleMap,
                flash: req.query.msg || null,
                error: req.query.err || null,
                userRole,
                userPerms,
                directorRoleId: directorRoleId || '',
                canDeleteEmployee,
                sessionUserId,
                exportColumns: employeeDirectoryExport.getColumnMeta(lang),
                exportDefaultColumns: employeeDirectoryExport.DEFAULT_COLUMNS,
            },
        });
    });

    async function loadEmployeeDirectoryRoleMap() {
        const roles = await sq('SELECT role, title FROM tbl_role ORDER BY CAST(role AS UNSIGNED)');
        const roleMap = {};
        for (const r of roles) roleMap[String(r.role)] = r.title;
        return roleMap;
    }

    async function loadEmployeeDirectoryExportData(req, res) {
        const q = String(req.query.q || '').trim();
        const columnKeys = employeeDirectoryExport.parseColumnKeys(req.query.cols);
        const lang = employeeDirectoryExport.resolveLang(res.locals.lang);
        const roleMap = await loadEmployeeDirectoryRoleMap();
        let employees = await employeeDirectoryExport.fetchEmployeeDirectory(pool);
        employees = employeeDirectoryExport.filterEmployeesBySearch(employees, q, roleMap);
        const table = employeeDirectoryExport.buildExportTable(employees, columnKeys, roleMap, lang);
        return { q, lang, table, count: employees.length };
    }

    app.get('/employees/export/xlsx', requireAuth, async (req, res) => {
        try {
            const { q, lang, table } = await loadEmployeeDirectoryExportData(req, res);
            const isFr = lang === 'fr';
            const title = isFr ? 'Annuaire des employés' : 'Employee directory';
            const subtitle =
                (isFr ? `${table.rows.length} enregistrements` : `${table.rows.length} records`) +
                (q ? (isFr ? ` · filtre : ${q}` : ` · filter: ${q}`) : '');
            const buf = employeeDirectoryExport.buildXlsxBuffer(title, subtitle, table);
            res.setHeader(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${employeeDirectoryExport.exportFilename('xlsx')}"`
            );
            res.send(buf);
        } catch (e) {
            console.error('employees export xlsx:', e);
            res.redirect('/employees?err=' + encodeURIComponent('Could not export employees to Excel.'));
        }
    });

    app.get('/employees/export/print', requireAuth, async (req, res) => {
        try {
            const { q, lang, table } = await loadEmployeeDirectoryExportData(req, res);
            const isFr = lang === 'fr';
            const brand = res.locals.brand || {};
            res.render('print-employees-list', {
                title: isFr ? 'Annuaire des employés' : 'Employee directory',
                layout: false,
                pageData: {
                    columns: table.columns,
                    rows: table.rows,
                    searchQ: q,
                    title: isFr ? 'Annuaire des employés' : 'Employee directory',
                    facilityName: brand.facilityName || brand.name || 'ZAIZENS',
                    generatedAt: new Date().toISOString(),
                    backHref: '/employees',
                    backLabel: isFr ? 'Retour aux employés' : 'Back to employees',
                    recordsLabel: isFr ? '{{count}} enregistrements' : '{{count}} records',
                    filterSuffix: isFr ? ' · filtre : {{q}}' : ' · filter: {{q}}',
                    generatedLabel: isFr ? 'Généré le {{date}}' : 'Generated {{date}}',
                },
            });
        } catch (e) {
            console.error('employees export print:', e);
            res.redirect('/employees?err=' + encodeURIComponent('Could not prepare employee list for print.'));
        }
    });

    async function loadEmployeeFormContext() {
        await ensureEmployeeHrSchema(pool);
        await ensureEmployeeClinicalLinksSchema(pool);
        await migrateLegacyEmployeeClinicalLinks(pool);
        const [doctorSpecialisations, doctorRoleIds] = await Promise.all([
            listDoctorSpecialisations(pool),
            resolveDoctorRoleIds(pool),
        ]);
        return { doctorSpecialisations, doctorRoleIds };
    }

    async function loadDoctorMultiFormLocals(emp, departments, doctorSpecialisations, doctorRoleIds) {
        const id = emp && emp.id ? parseInt(emp.id, 10) : 0;
        let initialDepartments = [];
        let initialSpecialisations = [];
        if (id) {
            initialDepartments = await loadEmployeeDepartments(pool, id);
            initialSpecialisations = await loadEmployeeSpecialisations(pool, id);
        }
        if (!initialDepartments.length && emp && emp.primary_department) {
            initialDepartments = [emp.primary_department];
        }
        if (!initialSpecialisations.length && emp && emp.specialisation) {
            initialSpecialisations = String(emp.specialisation)
                .split(/[,;|]/)
                .map((s) => s.trim())
                .filter(Boolean);
        }
        return {
            formId: 'hms-employee-form',
            doctorRoleIds: doctorRoleIds || [],
            departments: departments || [],
            specialisationsCatalog: doctorSpecialisations || [],
            initialDepartments,
            initialSpecialisations,
        };
    }

    // ────────────────────────────────────────────────────────
    // ADD EMPLOYEE
    // ────────────────────────────────────────────────────────
    app.get('/employees/add', requireAuth, requireEmployeeWrite, async (req, res) => {
        const rolesRaw = await sq('SELECT role, title FROM tbl_role ORDER BY CAST(role AS UNSIGNED)');
        const roles = hmsStaffAccountGuard.filterStaffDirectoryRoles(req.session.user?.role, rolesRaw);
        const departments = await sq('SELECT department_name AS name FROM tbl_department WHERE status=1 ORDER BY department_name');
        const { doctorSpecialisations, doctorRoleIds } = await loadEmployeeFormContext();
        const actorRole = String(req.session.user?.role ?? '');
        const userPerms = res.locals.userPerms || [];
        const canSetPassword = hmsStaffAccountGuard.canManageEmployeePassword(actorRole, '2', userPerms);
        res.render('employee-add', {
            title: 'Add Employee — ZAIZENS',
            roles, departments, doctorSpecialisations, doctorRoleIds,
            employeeProfile: { formId: 'hms-employee-form', initialGender: 'Male', initialEmoji: '', initialPhotoPath: '' },
            doctorMulti: await loadDoctorMultiFormLocals({}, departments, doctorSpecialisations, doctorRoleIds),
            canSetPassword,
            flash: null, error: null
        });
    });

    app.post('/employees/add', requireAuth, requireEmployeeWrite, staffProfilePhotoMiddleware(), async (req, res) => {
        const actorRole = String(req.session.user?.role ?? '');
        const userPerms = res.locals.userPerms || [];
        const { first_name, last_name, username, emailid, pwd, dob,
                employee_id, joining_date, gender, phone, address, bio,
                primary_department, role, status } = req.body;
        if (!hmsStaffAccountGuard.canAssignEmployeeRole(actorRole, role)) {
            return res.redirect('/employees?err=' + encodeURIComponent(hmsStaffAccountGuard.assignDeniedMessage(actorRole, role)));
        }
        if (hmsStaffAccountGuard.isSystemUserRole(role)) {
            return res.redirect('/employees?err=' + encodeURIComponent('Admin and Super Admin accounts must be created under System Users.'));
        }
        if (!hmsStaffAccountGuard.canManageEmployeePassword(actorRole, role, userPerms)) {
            return res.redirect('/employees/add?err=' + encodeURIComponent('You do not have permission to set employee passwords.'));
        }
        const hr = { job_title: '', cnps_number: '', tax_niu: '', nic_number: '', bank_name: '', bank_account_no: '' };
        try {
            const doctorRoleIds = await resolveDoctorRoleIds(pool);
            const isDoc = isDoctorRoleId(role, doctorRoleIds);
            let doctorDepartments = [];
            let staffSpecialisations = parseSpecialisationsFromBody(req.body);
            if (isDoc) {
                doctorDepartments = requireDoctorDepartments(role, req.body, doctorRoleIds);
                staffSpecialisations = requireDoctorSpecialisations(role, req.body, doctorRoleIds);
            }
            for (const spec of staffSpecialisations) {
                await registerDoctorSpecialisation(pool, spec);
            }
            const legacyClinical = primaryLegacyFields(
                isDoc && doctorDepartments.length ? doctorDepartments : parseDepartmentsFromBody(req.body),
                staffSpecialisations
            );
            const specialisation = legacyClinical.specialisation;
            const resolvedPrimaryDepartment = legacyClinical.primary_department || primary_department || '';
            await ensureEmployeeHrSchema(pool);
            await ensureEmployeeClinicalLinksSchema(pool);
            const hash = await bcrypt.hash(pwd || 'changeme', 10);
            let eid = String(employee_id || '').trim();
            if (!eid) eid = await nextAutoEmployeeStaffId();
            const profileEmoji = resolveProfileEmoji(req.body.profile_emoji, gender);
            const photoPath = uploadedStaffPhotoPath(req.file) || null;
            const phoneNorm = normalizeEmployeePhone(phone);
            const [insertResult] = await pool.query(
                `INSERT INTO tbl_employee (
                  first_name,last_name,username,emailid,password,dob,employee_id,joining_date,gender,address,phone,bio,
                  job_title,cnps_number,tax_niu,nic_number,bank_name,bank_account_no,
                  primary_department,specialisation,profile_emoji,photo_path,role,status)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [first_name, last_name, username, emailid, hash, dob||null,
                 eid, joining_date||null, gender, address||'', phoneNorm,
                 bio||'', hr.job_title, hr.cnps_number, hr.tax_niu, hr.nic_number, hr.bank_name, hr.bank_account_no,
                 resolvedPrimaryDepartment, specialisation || null, profileEmoji, photoPath, parseInt(role)||2, parseInt(status??1)]
            );
            const newId = insertResult.insertId;
            if (isDoc) {
                await syncEmployeeDepartments(pool, newId, doctorDepartments);
            }
            if (staffSpecialisations.length) {
                await syncEmployeeSpecialisations(pool, newId, staffSpecialisations);
            }
            try {
                const { ensureCashierOnEmployeeSave } = require('../lib/cashierIdentity');
                await ensureCashierOnEmployeeSave(pool, newId, role, {
                    status: parseInt(status ?? 1, 10),
                    facilityId: parseInt(req.session.facilityId, 10) || 1,
                });
            } catch (_) { /* non-blocking */ }
            try {
                await replicateEmployeeOut(pool, newId, 'upsert');
            } catch (_) { /* non-blocking */ }
            res.redirect('/employees?msg=Employee+created+successfully');
        } catch (e) {
            const roles = await sq('SELECT role, title FROM tbl_role ORDER BY CAST(role AS UNSIGNED)');
            const departments = await sq('SELECT department_name AS name FROM tbl_department WHERE status=1 ORDER BY department_name');
            const { doctorSpecialisations, doctorRoleIds } = await loadEmployeeFormContext();
            res.render('employee-add', {
                title: 'Add Employee — ZAIZENS',
                roles, departments, doctorSpecialisations, doctorRoleIds,
                employeeProfile: { formId: 'hms-employee-form', initialGender: gender || 'Male', initialEmoji: req.body.profile_emoji || '', initialPhotoPath: '' },
                doctorMulti: await loadDoctorMultiFormLocals({}, departments, doctorSpecialisations, doctorRoleIds),
                flash: null, error: e.message
            });
        }
    });

    // ────────────────────────────────────────────────────────
    // EMPLOYEE PROFILE API (modal on /employees)
    // ────────────────────────────────────────────────────────
    async function loadEmployeeProfilePayload(id, req, res) {
        await ensureEmployeeHrSchema(pool);
        const empId = parseInt(String(id), 10);
        if (!empId) return { ok: false, status: 400, error: 'Invalid employee.' };

        const [empRows] = await pool.query('SELECT * FROM tbl_employee WHERE id=? LIMIT 1', [empId]).catch(() => [[], []]);
        const emp = empRows?.[0];
        if (!emp) return { ok: false, status: 404, error: 'Employee not found.' };
        if (hmsStaffAccountGuard.isSystemUserRole(emp.role)) {
            return { ok: false, status: 403, error: 'Manage Admin and Super Admin accounts under System Users.' };
        }

        const actorRole = String(req.session.user?.role ?? '');
        if (!hmsStaffAccountGuard.canManageEmployeeAccount(actorRole, emp.role)) {
            return { ok: false, status: 403, error: hmsStaffAccountGuard.manageDeniedMessage(actorRole, emp.role) };
        }

        const rolesRaw = await sq('SELECT role, title FROM tbl_role ORDER BY CAST(role AS UNSIGNED)');
        const roles = hmsStaffAccountGuard.filterStaffDirectoryRoles(actorRole, rolesRaw);
        const departments = await sq('SELECT department_name AS name FROM tbl_department WHERE status=1 ORDER BY department_name');
        const { doctorSpecialisations, doctorRoleIds } = await loadEmployeeFormContext();
        const userPerms = res.locals.userPerms || [];
        const canResetPassword = hmsStaffAccountGuard.canManageEmployeePassword(actorRole, emp.role, userPerms);
        const departmentsList = await loadEmployeeDepartments(pool, empId);
        const specialisationsList = await loadEmployeeSpecialisations(pool, empId);

        return {
            ok: true,
            employee: {
                id: emp.id,
                first_name: emp.first_name || '',
                last_name: emp.last_name || '',
                username: emp.username || '',
                emailid: emp.emailid || '',
                phone: emp.phone || '',
                gender: emp.gender || 'Male',
                dob: toIsoDatePart(emp.dob) || '',
                employee_id: emp.employee_id || '',
                joining_date: toIsoDatePart(emp.joining_date) || '',
                address: emp.address || '',
                bio: emp.bio || '',
                role: String(emp.role || ''),
                status: emp.status == null ? 1 : Number(emp.status),
                profile_emoji: emp.profile_emoji || '',
                photo_path: emp.photo_path || '',
                primary_department: emp.primary_department || '',
                specialisation: emp.specialisation || '',
                departments: departmentsList,
                specialisations: specialisationsList,
            },
            form: {
                roles: roles.map((r) => ({
                    role: String(r.role),
                    title: r.title || '',
                    isDoctor: /doctor|physician|m[eé]decin|specialist|sp[eé]cialiste/i.test(String(r.title || '')),
                })),
                departments,
                doctorSpecialisations,
                doctorRoleIds: (doctorRoleIds || []).map(String),
                canResetPassword,
            },
        };
    }

    app.get('/api/employees/:id/profile', requireAuth, requireEmployeeWrite, async (req, res) => {
        try {
            const payload = await loadEmployeeProfilePayload(req.params.id, req, res);
            if (!payload.ok) return res.status(payload.status || 400).json(payload);
            return res.json(payload);
        } catch (e) {
            console.error('employees profile GET:', e);
            return res.status(500).json({ ok: false, error: e.message || 'Could not load employee profile.' });
        }
    });

    app.post('/api/employees/:id/profile', requireAuth, requireEmployeeWrite, staffProfilePhotoMiddleware(), async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const userPerms = res.locals.userPerms || [];
            const result = await updateEmployeeProfile(pool, req, id, userPerms);
            if (!result.ok) return res.status(result.status || 400).json(result);

            const payload = await loadEmployeeProfilePayload(id, req, res);
            if (!payload.ok) {
                return res.json({ ok: true, message: 'Employee updated successfully.', employeeId: id });
            }
            return res.json({
                ok: true,
                message: 'Employee updated successfully.',
                employee: payload.employee,
            });
        } catch (e) {
            console.error('employees profile POST:', e);
            return res.status(500).json({ ok: false, error: e.message || 'Could not save employee profile.' });
        }
    });

    // ────────────────────────────────────────────────────────
    // EDIT EMPLOYEE
    // ────────────────────────────────────────────────────────
    app.get('/employees/:id/edit', requireAuth, requireEmployeeWrite, async (req, res) => {
        await ensureEmployeeHrSchema(pool);
        const id = parseInt(req.params.id);
        const emp = await loadEmployeeOrRedirect(id, res);
        if (!emp) return;
        if (hmsStaffAccountGuard.isSystemUserRole(emp.role)) {
            return res.redirect(`/users/${id}/edit`);
        }
        const actorRole = String(req.session.user?.role ?? '');
        if (!hmsStaffAccountGuard.canManageEmployeeAccount(actorRole, emp.role)) {
            return res.redirect('/employees?err=' + encodeURIComponent(hmsStaffAccountGuard.manageDeniedMessage(actorRole, emp.role)));
        }
        const rolesRaw = await sq('SELECT role, title FROM tbl_role ORDER BY CAST(role AS UNSIGNED)');
        const roles = hmsStaffAccountGuard.filterStaffDirectoryRoles(actorRole, rolesRaw);
        const departments = await sq('SELECT department_name AS name FROM tbl_department WHERE status=1 ORDER BY department_name');
        const { doctorSpecialisations, doctorRoleIds } = await loadEmployeeFormContext();
        const userPerms = res.locals.userPerms || [];
        const canResetPassword = hmsStaffAccountGuard.canManageEmployeePassword(actorRole, emp.role, userPerms);
        res.render('employee-edit', {
            title: `Edit Employee — ${emp.first_name} ${emp.last_name}`,
            emp, roles, departments, doctorSpecialisations, doctorRoleIds,
            employeeProfile: {
                formId: 'hms-employee-form',
                initialGender: emp.gender || 'Male',
                initialEmoji: emp.profile_emoji || '',
                initialPhotoPath: emp.photo_path || '',
            },
            doctorMulti: await loadDoctorMultiFormLocals(emp, departments, doctorSpecialisations, doctorRoleIds),
            canResetPassword,
            flash: req.query.msg || null, error: req.query.err || null
        });
    });

    app.post('/employees/:id/edit', requireAuth, requireEmployeeWrite, staffProfilePhotoMiddleware(), async (req, res) => {
        const id = parseInt(req.params.id);
        const userPerms = res.locals.userPerms || [];
        const result = await updateEmployeeProfile(pool, req, id, userPerms);
        if (!result.ok) {
            if (result.status === 404) return res.redirect('/employees?err=Employee+not+found');
            if (result.error && result.error.includes('System Users')) {
                return res.redirect(`/users?err=${encodeURIComponent(result.error)}`);
            }
            return res.redirect(`/employees/${id}/edit?err=${encodeURIComponent(result.error || 'Could not save.')}`);
        }
        res.redirect('/employees?msg=Employee+updated+successfully');
    });

    // ────────────────────────────────────────────────────────
    // SYSTEM USERS (Admin + Super Admin — not in Employees directory)
    // ────────────────────────────────────────────────────────
    app.get('/users', requireAuth, requireSystemUsersAccess, async (req, res) => {
        const [users] = await pool.query(
            `SELECT e.id, e.first_name, e.last_name, e.username, e.emailid, e.phone, e.gender, e.profile_emoji,
                    e.joining_date, e.role, e.status, e.photo_path
               FROM tbl_employee e
              WHERE ${hmsStaffAccountGuard.SYSTEM_USER_ROLE_SQL}
              ORDER BY CAST(e.role AS UNSIGNED) DESC, e.first_name, e.last_name`
        ).catch(() => [[]]);
        const roles = await sq('SELECT role, title FROM tbl_role ORDER BY CAST(role AS UNSIGNED)');
        const roleMap = {};
        for (const r of roles) roleMap[String(r.role)] = r.title;
        const userRole = String(req.session.user?.role ?? '');
        const sessionUserId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
        res.render('users', {
            title: 'System Users — ZAIZENS',
            pageData: {
                users: Array.isArray(users) ? users : [],
                roleMap,
                flash: req.query.msg || null,
                error: req.query.err || null,
                userRole,
                sessionUserId,
                canAddUser: userRole === '1' || userRole === '99',
            },
        });
    });

    app.get('/users/add', requireAuth, requireSystemUsersAccess, async (req, res) => {
        const actorRole = String(req.session.user?.role ?? '');
        const rolesRaw = await sq('SELECT role, title FROM tbl_role ORDER BY CAST(role AS UNSIGNED)');
        const roles = hmsStaffAccountGuard.filterSystemUserRoles(actorRole, rolesRaw);
        if (!roles.length) {
            return res.redirect('/users?err=' + encodeURIComponent('You cannot create system user accounts.'));
        }
        res.render('employee-add', {
            title: 'Add System User — ZAIZENS',
            roles,
            departments: [],
            doctorSpecialisations: [],
            doctorRoleIds: [],
            employeeProfile: { formId: 'hms-employee-form', initialGender: 'Male', initialEmoji: '', initialPhotoPath: '' },
            doctorMulti: { formId: 'hms-employee-form', doctorRoleIds: [], departments: [], specialisationsCatalog: [], initialDepartments: [], initialSpecialisations: [] },
            flash: null,
            error: null,
            ...systemUserFormLocals({ formAction: '/users/add' }),
        });
    });

    app.post('/users/add', requireAuth, requireSystemUsersAccess, staffProfilePhotoMiddleware(), async (req, res) => {
        const actorRole = String(req.session.user?.role ?? '');
        const { first_name, last_name, username, emailid, pwd, dob, joining_date, gender, phone, address, bio, role, status } = req.body;
        if (!hmsStaffAccountGuard.isSystemUserRole(role)) {
            return res.redirect('/users/add?err=' + encodeURIComponent('Select Admin or Super Admin role.'));
        }
        if (!hmsStaffAccountGuard.canAssignEmployeeRole(actorRole, role)) {
            return res.redirect('/users/add?err=' + encodeURIComponent(hmsStaffAccountGuard.assignDeniedMessage(actorRole, role)));
        }
        try {
            await ensureEmployeeHrSchema(pool);
            const hash = await bcrypt.hash(pwd || 'changeme', 10);
            const profileEmoji = resolveProfileEmoji(req.body.profile_emoji, gender);
            const photoPath = uploadedStaffPhotoPath(req.file) || null;
            const phoneNorm = normalizeEmployeePhone(phone);
            const [insertResult] = await pool.query(
                `INSERT INTO tbl_employee (
                  first_name,last_name,username,emailid,password,dob,employee_id,joining_date,gender,address,phone,bio,
                  profile_emoji,photo_path,role,status)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [
                    first_name,
                    last_name,
                    username,
                    emailid,
                    hash,
                    dob || null,
                    `USR-${Date.now()}`,
                    joining_date || null,
                    gender,
                    address || '',
                    phoneNorm,
                    bio || 'System user account',
                    profileEmoji,
                    photoPath,
                    parseInt(role, 10) || 1,
                    parseInt(status ?? 1, 10),
                ]
            );
            try {
                await replicateEmployeeOut(pool, insertResult.insertId, 'upsert');
            } catch (_) { /* non-blocking */ }
            res.redirect('/users?msg=System+user+created+successfully');
        } catch (e) {
            res.redirect('/users/add?err=' + encodeURIComponent(e.message));
        }
    });

    app.get('/users/:id/edit', requireAuth, requireSystemUsersAccess, async (req, res) => {
        await ensureEmployeeHrSchema(pool);
        const id = parseInt(req.params.id, 10);
        const emp = await loadEmployeeOrRedirect(id, res);
        if (!emp) return;
        if (!hmsStaffAccountGuard.isSystemUserRole(emp.role)) {
            return res.redirect(`/employees/${id}/edit`);
        }
        const actorRole = String(req.session.user?.role ?? '');
        if (!hmsStaffAccountGuard.canManageEmployeeAccount(actorRole, emp.role)) {
            return res.redirect('/users?err=' + encodeURIComponent(hmsStaffAccountGuard.manageDeniedMessage(actorRole, emp.role)));
        }
        const rolesRaw = await sq('SELECT role, title FROM tbl_role ORDER BY CAST(role AS UNSIGNED)');
        const roles = hmsStaffAccountGuard.filterSystemUserRoles(actorRole, rolesRaw);
        const userPerms = res.locals.userPerms || [];
        const canResetPassword = hmsStaffAccountGuard.canManageEmployeePassword(actorRole, emp.role, userPerms);
        res.render('employee-edit', {
            title: `Edit System User — ${emp.first_name} ${emp.last_name}`,
            emp,
            roles,
            departments: [],
            doctorSpecialisations: [],
            doctorRoleIds: [],
            employeeProfile: {
                formId: 'hms-employee-form',
                initialGender: emp.gender || 'Male',
                initialEmoji: emp.profile_emoji || '',
                initialPhotoPath: emp.photo_path || '',
            },
            doctorMulti: { formId: 'hms-employee-form', doctorRoleIds: [], departments: [], specialisationsCatalog: [], initialDepartments: [], initialSpecialisations: [] },
            canResetPassword,
            flash: req.query.msg || null,
            error: req.query.err || null,
            ...systemUserFormLocals({ formAction: `/users/${id}/edit` }),
        });
    });

    app.post('/users/:id/edit', requireAuth, requireSystemUsersAccess, staffProfilePhotoMiddleware(), async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const actorRole = String(req.session.user?.role ?? '');
        const userPerms = res.locals.userPerms || [];
        const [[targetRow]] = await pool.query('SELECT id, role FROM tbl_employee WHERE id=? LIMIT 1', [id]).catch(() => [[null]]);
        if (!targetRow) return res.redirect('/users?err=User+not+found');
        if (!hmsStaffAccountGuard.isSystemUserRole(targetRow.role)) {
            return res.redirect(`/employees/${id}/edit`);
        }
        if (!hmsStaffAccountGuard.canManageEmployeeAccount(actorRole, targetRow.role)) {
            return res.redirect('/users?err=' + encodeURIComponent(hmsStaffAccountGuard.manageDeniedMessage(actorRole, targetRow.role)));
        }
        const { first_name, last_name, username, emailid, pwd, dob, joining_date, gender, phone, address, bio, role, status } = req.body;
        if (!hmsStaffAccountGuard.isSystemUserRole(role)) {
            return res.redirect(`/users/${id}/edit?err=${encodeURIComponent('Role must remain Admin or Super Admin.')}`);
        }
        if (!hmsStaffAccountGuard.canAssignEmployeeRole(actorRole, role)) {
            return res.redirect(`/users/${id}/edit?err=${encodeURIComponent(hmsStaffAccountGuard.assignDeniedMessage(actorRole, role))}`);
        }
        try {
            let passField = '';
            let passParam = [];
            const allowPwd = hmsStaffAccountGuard.canManageEmployeePassword(actorRole, targetRow.role, userPerms);
            if (allowPwd && pwd && pwd.trim()) {
                passField = 'password=?,';
                passParam = [await bcrypt.hash(pwd.trim(), 10)];
            }
            const profileEmoji = resolveProfileEmoji(req.body.profile_emoji, gender);
            const uploadedPhotoPath = uploadedStaffPhotoPath(req.file);
            const removePhoto = String(req.body.remove_photo || '') === '1';
            const phoneNorm = normalizeEmployeePhone(phone);
            let photoSql = '';
            const photoParams = [];
            if (uploadedPhotoPath) {
                photoSql = ',photo_path=?';
                photoParams.push(uploadedPhotoPath);
            } else if (removePhoto) {
                photoSql = ',photo_path=NULL';
            }
            await pool.query(
                `UPDATE tbl_employee SET first_name=?,last_name=?,username=?,emailid=?,${passField}
                 dob=?,joining_date=?,gender=?,address=?,phone=?,bio=?,profile_emoji=?${photoSql},role=?,status=? WHERE id=?`,
                [
                    first_name,
                    last_name,
                    username,
                    emailid,
                    ...passParam,
                    dob || null,
                    joining_date || null,
                    gender,
                    address || '',
                    phoneNorm,
                    bio || '',
                    profileEmoji,
                    ...photoParams,
                    parseInt(role, 10) || 1,
                    parseInt(status ?? 1, 10),
                    id,
                ]
            );
            if (String(req.session.userId || req.session.user?.id || '') === String(id)) {
                req.session.user.profile_emoji = profileEmoji;
                if (uploadedPhotoPath) req.session.user.photo = uploadedPhotoPath;
                if (removePhoto) req.session.user.photo = null;
                req.session.user.gender = gender || null;
                req.session.user.name = `${first_name} ${last_name}`.trim();
            }
            try {
                await replicateEmployeeOut(pool, id, 'upsert');
            } catch (_) { /* non-blocking */ }
            res.redirect('/users?msg=System+user+updated+successfully');
        } catch (e) {
            res.redirect(`/users/${id}/edit?err=${encodeURIComponent(e.message)}`);
        }
    });

    app.post('/users/:id/delete', requireAuth, requireSystemUsersAccess, async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const userRole = String(req.session.user?.role ?? '');
        const selfId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
        if (id < 1) return res.redirect('/users?err=' + encodeURIComponent('Invalid user.'));
        if (selfId > 0 && id === selfId) {
            return res.redirect('/users?err=' + encodeURIComponent('You cannot delete your own account.'));
        }
        const [target] = await pool.query('SELECT role FROM tbl_employee WHERE id=? LIMIT 1', [id]).catch(() => [[], []]);
        const targetRole = target[0] ? target[0].role : '';
        if (!target[0] || !hmsStaffAccountGuard.isSystemUserRole(targetRole)) {
            return res.redirect('/users?err=' + encodeURIComponent('System user not found.'));
        }
        if (!hmsStaffAccountGuard.canManageEmployeeAccount(userRole, targetRole)) {
            return res.redirect('/users?err=' + encodeURIComponent(hmsStaffAccountGuard.manageDeniedMessage(userRole, targetRole)));
        }
        await run('DELETE FROM tbl_employee WHERE id=?', [id]);
        try {
            await replicateEmployeeOut(pool, id, 'deleted');
        } catch (_) { /* non-blocking */ }
        res.redirect('/users?msg=System+user+deleted');
    });

    // ────────────────────────────────────────────────────────
    // CREATE EMPLOYEE (Settings alias → same form as /employees/add)
    // ────────────────────────────────────────────────────────
    app.get('/settings/employee-add', requireAuth, requireEmployeeWrite, (req, res) => {
        res.redirect('/employees/add');
    });

    // ────────────────────────────────────────────────────────
    // RESET EMPLOYEE PASSWORD (Settings → ACL employee.password.manage)
    // ────────────────────────────────────────────────────────
    async function loadResetPasswordPage(req, res) {
        const actorRole = String(req.session.user?.role ?? '');
        const userPerms = res.locals.userPerms || [];
        const [employees] = await pool.query(
            `SELECT e.id, e.first_name, e.last_name, e.username, e.emailid, e.phone, e.gender,
                    e.role, e.profile_emoji, e.photo_path, e.status
               FROM tbl_employee e
              WHERE ${hmsStaffAccountGuard.EMPLOYEE_DIRECTORY_ROLE_SQL}
                AND ${require('../lib/visitingDoctor').staffDirectoryExcludeSql('e')}
              ORDER BY e.first_name, e.last_name`
        ).catch(() => [[]]);
        const roles = await sq('SELECT role, title FROM tbl_role ORDER BY CAST(role AS UNSIGNED)');
        const roleMap = {};
        for (const r of roles) roleMap[String(r.role)] = r.title;

        const resettable = (Array.isArray(employees) ? employees : []).filter((e) =>
            hmsStaffAccountGuard.canManageEmployeePassword(actorRole, e.role, userPerms)
        );

        res.render('settings-employee-password', {
            title: 'Reset employee password — ZAIZENS',
            pageData: {
                employees: resettable,
                roleMap,
                flash: req.query.msg || null,
                error: req.query.err || null,
            },
        });
    }

    app.get('/settings/employee-password', requireAuth, requireEmployeePasswordManage, async (req, res) => {
        try {
            await loadResetPasswordPage(req, res);
        } catch (e) {
            console.error('EMPLOYEE PASSWORD PAGE:', e.message);
            res.status(500).render('error', {
                title: 'Reset employee password',
                message: e.message || 'Could not load staff list.',
                status: 500,
            });
        }
    });

    app.get('/employees/reset-password', requireAuth, requireEmployeePasswordManage, async (req, res) => {
        try {
            await loadResetPasswordPage(req, res);
        } catch (e) {
            console.error('EMPLOYEE PASSWORD PAGE (alias):', e.message);
            res.status(500).render('error', {
                title: 'Reset employee password',
                message: e.message || 'Could not load staff list.',
                status: 500,
            });
        }
    });

    app.post('/employees/:id/reset-password', requireAuth, requireEmployeePasswordManage, async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const actorRole = String(req.session.user?.role ?? '');
        const userPerms = res.locals.userPerms || [];
        const back = '/settings/employee-password';
        if (id < 1) {
            return res.redirect(back + '?err=' + encodeURIComponent('Invalid employee.'));
        }

        const [[target]] = await pool.query(
            'SELECT id, role, first_name, last_name, username FROM tbl_employee WHERE id=? LIMIT 1',
            [id]
        ).catch(() => [[null]]);
        if (!target) {
            return res.redirect(back + '?err=' + encodeURIComponent('Employee not found.'));
        }
        if (hmsStaffAccountGuard.isSystemUserRole(target.role)) {
            return res.redirect(
                back + '?err=' + encodeURIComponent('Reset Admin and Super Admin passwords under System Users.')
            );
        }
        if (!hmsStaffAccountGuard.canManageEmployeePassword(actorRole, target.role, userPerms)) {
            return res.redirect(back + '?err=' + encodeURIComponent(hmsStaffAccountGuard.manageDeniedMessage(actorRole, target.role)));
        }

        const password = String(req.body.password || req.body.pwd || '').trim();
        const confirm = String(req.body.password_confirm || req.body.pwd_confirm || '').trim();
        if (password.length < 6) {
            return res.redirect(back + '?err=' + encodeURIComponent('Password must be at least 6 characters.'));
        }
        if (password !== confirm) {
            return res.redirect(back + '?err=' + encodeURIComponent('Password confirmation does not match.'));
        }

        try {
            const hash = await bcrypt.hash(password, 10);
            await pool.query('UPDATE tbl_employee SET password=? WHERE id=?', [hash, id]);
            const name = `${target.first_name || ''} ${target.last_name || ''}`.trim() || target.username || `#${id}`;
            return res.redirect(
                back + '?msg=' + encodeURIComponent(`Password updated for ${name}.`)
            );
        } catch (e) {
            console.error('RESET EMPLOYEE PASSWORD:', e.message);
            return res.redirect(back + '?err=' + encodeURIComponent(e.message || 'Password reset failed.'));
        }
    });

    // ────────────────────────────────────────────────────────
    // DELETE EMPLOYEE
    // ────────────────────────────────────────────────────────
    app.post('/employees/:id/delete', requireAuth, requireEmployeeDelete, async (req, res) => {
        const id = parseInt(req.params.id);
        const userRole = String(req.session.user?.role ?? '');
        const selfId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
        if (id < 1) return res.redirect('/employees?err=' + encodeURIComponent('Invalid employee.'));
        if (selfId > 0 && id === selfId) {
            return res.redirect('/employees?err=' + encodeURIComponent('You cannot delete your own account.'));
        }
        const [target] = await pool.query('SELECT role FROM tbl_employee WHERE id=? LIMIT 1', [id]).catch(() => [[], []]);
        const targetRole = target[0] ? target[0].role : '';
        if (!target[0]) return res.redirect('/employees?err=' + encodeURIComponent('Employee not found.'));
        if (hmsStaffAccountGuard.isSystemUserRole(targetRole)) {
            return res.redirect('/users?err=' + encodeURIComponent('Delete Admin and Super Admin accounts under System Users.'));
        }
        if (!hmsStaffAccountGuard.canManageEmployeeAccount(userRole, targetRole)) {
            return res.redirect('/employees?err=' + encodeURIComponent(hmsStaffAccountGuard.manageDeniedMessage(userRole, targetRole)));
        }
        await run('DELETE FROM tbl_employee WHERE id=?', [id]);
        try {
            await replicateEmployeeOut(pool, id, 'deleted');
        } catch (_) { /* non-blocking */ }
        res.redirect('/employees?msg=Employee+deleted');
    });

    // ────────────────────────────────────────────────────────
    // DEPARTMENTS & SPECIALISATIONS (CRUD)
    // ────────────────────────────────────────────────────────
    function catalogTab(catalog) {
        return catalog === 'specialisation' ? 'specialisations' : 'departments';
    }

    function catalogPageUrl(tab, msg, err) {
        const params = new URLSearchParams();
        if (tab === 'specialisations') params.set('tab', 'specialisations');
        if (msg) params.set('msg', msg);
        if (err) params.set('err', err);
        const q = params.toString();
        return q ? `/departments?${q}` : '/departments';
    }

    app.get('/settings/org-clinical', requireAuth, (req, res) => {
        const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return res.redirect(301, '/departments' + q);
    });

    app.get('/settings/departments-specialisations', requireAuth, (req, res) => {
        const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return res.redirect(301, '/departments' + q);
    });

    app.get('/departments', requireAuth, requireOrgClinicalManage, async (req, res) => {
        const tab = String(req.query.tab || 'departments').trim().toLowerCase() === 'specialisations'
            ? 'specialisations'
            : 'departments';
        const [departments, specialisations] = await Promise.all([
            orgClinical.listDepartments(pool),
            orgClinical.listSpecialisationCatalog(pool),
        ]);
        res.render('departments', {
            title: 'Departments & specialisations — ZAIZENS',
            tab,
            departments,
            specialisations,
            flash: req.query.msg || null,
            error: req.query.err || null,
            user: req.session.user,
        });
    });

    app.post('/departments', requireAuth, requireOrgClinicalManage, async (req, res) => {
        const catalog = String(req.body.catalog || 'department').trim().toLowerCase();
        const tab = catalogTab(catalog);
        const action = String(req.body.action || '');
        const label = catalog === 'specialisation' ? 'Specialisation' : 'Department';
        try {
            if (action === 'add') {
                if (catalog === 'specialisation') await orgClinical.addSpecialisation(pool, req.body.name);
                else await orgClinical.addDepartment(pool, req.body.name);
                return res.redirect(catalogPageUrl(tab, `${label} added.`));
            }
            if (action === 'edit') {
                if (catalog === 'specialisation') await orgClinical.renameSpecialisation(pool, req.body.id, req.body.name);
                else await orgClinical.renameDepartment(pool, req.body.id, req.body.name);
                return res.redirect(catalogPageUrl(tab, `${label} updated.`));
            }
            if (action === 'toggle') {
                const status = catalog === 'specialisation'
                    ? await orgClinical.toggleSpecialisation(pool, req.body.id)
                    : await orgClinical.toggleDepartment(pool, req.body.id);
                return res.redirect(catalogPageUrl(tab, status ? `${label} enabled.` : `${label} disabled.`));
            }
            if (action === 'delete') {
                if (catalog === 'specialisation') await orgClinical.deleteSpecialisation(pool, req.body.id);
                else await orgClinical.deleteDepartment(pool, req.body.id);
                return res.redirect(catalogPageUrl(tab, `${label} deleted.`));
            }
            return res.redirect(catalogPageUrl(tab, null, 'Unknown action.'));
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') {
                return res.redirect(catalogPageUrl(tab, null, 'A record with that name already exists.'));
            }
            return res.redirect(catalogPageUrl(tab, null, e.message || 'Save failed.'));
        }
    });

    // ────────────────────────────────────────────────────────
    // ACCESS CONTROL — legacy URL → modern module
    // ────────────────────────────────────────────────────────
    app.get('/access-control', requireAuth, requireAccessControl, (req, res) => {
        const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return res.redirect(301, '/hms-admin/access' + q);
    });

    app.get('/hms-admin/access', requireAuth, requireAccessControl, async (req, res) => {
        try {
            const ctx = await loadAccessControlContext(pool, req.query);
            const view = String(req.query.view || 'permissions').trim();
            const assignedPermIds = (ctx.assignedPerms || []).map((p) => p.id);
            const isCoreRole = ctx.selRole && ['1', '99'].includes(String(ctx.selRole));
            const actorRole = req.session?.user?.role != null ? String(req.session.user.role) : '';
            res.render('hms-admin-access', {
                title: 'Access & Workflow — ZAIZENS',
                layout: false,
                pageData: {
                    roles: ctx.roles || [],
                    selRole: ctx.selRole || '',
                    selRoleTitle: ctx.selRoleTitle || '',
                    view,
                    permModuleRw: ctx.permModuleRw || [],
                    assignedPermIds,
                    rolePortalRows: ctx.rolePortalRows || [],
                    aclRoleSummary: ctx.aclRoleSummary || null,
                    navGrantCount: ctx.navGrantCount || 0,
                    navAccessTree: ctx.navAccessTree || [],
                    navGrantMode: !!ctx.navGrantMode,
                    navStudioHmsHub: ctx.navStudioHmsHub || null,
                    navStudioDashboard: ctx.navStudioDashboard || null,
                    navStudioAccounting: ctx.navStudioAccounting || null,
                    navStudioTopnav: ctx.navStudioTopnav || null,
                    navStudioSidebar: ctx.navStudioSidebar || null,
                    portals: ctx.portals || [],
                    portalCatalog: ctx.portalCatalog || ctx.portals || [],
                    opdSteps: ctx.opdSteps || [],
                    ipdSteps: ctx.ipdSteps || [],
                    emgSteps: ctx.emgSteps || [],
                    plMap: ctx.plMap || {},
                    allPermsGrouped: ctx.allPermsGrouped || [],
                    allRoles: ctx.allRoles || [],
                    auditRows: ctx.auditRows || [],
                    auditFilter: ctx.auditFilter || {},
                    auditActionOptions: ctx.auditActionOptions || [],
                    flash: req.query.msg || null,
                    error: req.query.err || null,
                    isCoreRole,
                    isSuperAdmin: actorRole === '99',
                },
            });
        } catch (e) {
            console.error('hms-admin/access:', e);
            res.status(500).render('error', { title: 'Error', message: 'Could not load Access & Workflow.', status: 500 });
        }
    });

    app.get('/access-control-legacy', requireAuth, requireAccessControl, async (req, res) => {
        const ctx = await loadAccessControlContext(pool, req.query);
        return res.render('access-control', {
            title: 'Workflow & Access Control — ZAIZENS',
            ...ctx,
            flash: req.query.msg || null,
            error: req.query.err || null,
        });
    });

    // ── ACL audit export (same filters as the Audit Log tab) ─────────────
    app.get('/access-control/audit-export.csv', requireAuth, requireAccessControl, async (req, res) => {
        const esc = (v) => {
            if (v == null || v === '') return '';
            const s = String(v);
            if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
        };
        const auditFilter = {
            role: String(req.query.audit_role || '').trim(),
            action: String(req.query.audit_action || '').trim(),
            actor: String(req.query.audit_actor || '').trim(),
            limit: Math.max(1, Math.min(5000, parseInt(req.query.audit_limit, 10) || 500)),
        };
        try {
            const where = [];
            const params = [];
            if (auditFilter.role) { where.push('role = ?'); params.push(auditFilter.role); }
            if (auditFilter.action) { where.push('action = ?'); params.push(auditFilter.action); }
            if (auditFilter.actor) {
                where.push('(actor_name LIKE ? OR CAST(actor_id AS CHAR) = ?)');
                params.push(`%${auditFilter.actor}%`, auditFilter.actor);
            }
            const whereSql = where.length ? (`WHERE ${where.join(' AND ')}`) : '';
            const rows = await sq(
                `SELECT id, created_at, actor_id, actor_name, action, role, target, detail
                   FROM tbl_acl_audit ${whereSql}
                  ORDER BY id DESC
                  LIMIT ${auditFilter.limit}`,
                params
            );
            const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="acl-audit-${stamp}.csv"`);
            const header = ['id', 'created_at', 'actor_id', 'actor_name', 'action', 'role', 'target', 'detail'];
            let out = '\uFEFF' + header.join(',') + '\r\n';
            for (const r of rows || []) {
                out += [
                    esc(r.id),
                    esc(r.created_at),
                    esc(r.actor_id),
                    esc(r.actor_name),
                    esc(r.action),
                    esc(r.role),
                    esc(r.target),
                    esc(r.detail),
                ].join(',') + '\r\n';
            }
            return res.send(out);
        } catch (e) {
            console.error('[audit-export]', e.message);
            return res.status(500).send('Export failed');
        }
    });

    // ────────────────────────────────────────────────────────
    // ACCESS CONTROL — AJAX API
    // ────────────────────────────────────────────────────────
    app.post('/access-control/api', requireAuth, requireAccessControl, async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const act = String(req.body.wf_action || req.body.action || '');

        // ── ACL audit logger (never throws — best-effort) ─────────────
        // Writes one row per mutation into tbl_acl_audit. Schema lives in
        // lib/ensureAclSchema (section 3b). Caller passes the resolved
        // action name + target identifiers; we capture actor from the
        // session so reviewers can see who did what.
        const actor = req.session && req.session.user ? req.session.user : null;
        const logAcl = async (action, role, target, detail) => {
            try {
                await pool.query(
                    'INSERT INTO tbl_acl_audit (actor_id, actor_name, action, role, target, detail) VALUES (?, ?, ?, ?, ?, ?)',
                    [
                        actor && actor.id != null ? Number(actor.id) || null : null,
                        actor && actor.name ? String(actor.name).slice(0, 120) : null,
                        String(action).slice(0, 40),
                        role == null ? null : String(role).slice(0, 20),
                        target == null ? null : String(target).slice(0, 160),
                        detail == null ? null : (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 4000)
                    ]
                );
            } catch (_) { /* audit must never break a mutation */ }
        };

        try {
            // ── WORKFLOW: assign/unassign portal to step ──
            if (act === 'assign_portal' || act === 'unassign_portal') {
                const { workflow, step_key, portal_code } = req.body;
                const [rows] = await pool.query(
                    'SELECT id, portal_codes FROM tbl_workflow_step_roles WHERE workflow=? AND step_key=?',
                    [workflow, step_key]);
                if (!rows[0]) return res.json({ ok: false, error: 'Step not found' });
                let codes = (rows[0].portal_codes || '').split(',').map(s=>s.trim()).filter(Boolean);
                if (act === 'assign_portal') { if (!codes.includes(portal_code)) codes.push(portal_code); }
                else { codes = codes.filter(c => c !== portal_code); }
                await pool.query('UPDATE tbl_workflow_step_roles SET portal_codes=? WHERE workflow=? AND step_key=?',
                    [codes.join(','), workflow, step_key]);
                const wfAct = act === 'assign_portal' ? 'wf_assign_portal' : 'wf_unassign_portal';
                await logAcl(wfAct, null, `${workflow}:${step_key}`, {
                    workflow, step_key, portal_code,
                    portal_codes: codes.join(','),
                });
                return res.json({ ok: true, portal_codes: codes });
            }

            // ── WORKFLOW: add step ──
            if (act === 'add_step') {
                const { workflow, step_label, step_color } = req.body;
                if (!step_label) return res.json({ ok: false, error: 'Label required' });
                const [mx] = await pool.query('SELECT MAX(step_order) AS m FROM tbl_workflow_step_roles WHERE workflow=?', [workflow]);
                const ord = (parseInt(mx[0]?.m || 0)) + 1;
                const sk = 'custom_' + step_label.toLowerCase().replace(/[^a-z0-9]+/g,'_') + '_' + Date.now();
                const [ins] = await pool.query(
                    'INSERT INTO tbl_workflow_step_roles (workflow,step_key,step_label,step_order,is_custom,step_color) VALUES (?,?,?,?,1,?)',
                    [workflow, sk, step_label, ord, step_color || '#3182ce']);
                await logAcl('wf_add_step', null, `${workflow}:${sk}`, {
                    workflow, step_key: sk, step_label, step_order: ord,
                    step_color: step_color || '#3182ce',
                });
                return res.json({ ok: true, id: ins.insertId, step_key: sk, step_label, step_order: ord, step_color: step_color || '#3182ce' });
            }

            // ── WORKFLOW: rename step ──
            if (act === 'rename_step') {
                const { workflow, step_key, step_label } = req.body;
                let oldLabel = null;
                try {
                    const [pr] = await pool.query(
                        'SELECT step_label FROM tbl_workflow_step_roles WHERE workflow=? AND step_key=? LIMIT 1',
                        [workflow, step_key]);
                    oldLabel = pr[0]?.step_label || null;
                } catch (_) {}
                await pool.query('UPDATE tbl_workflow_step_roles SET step_label=? WHERE workflow=? AND step_key=?',
                    [step_label, workflow, step_key]);
                await logAcl('wf_rename_step', null, `${workflow}:${step_key}`, {
                    workflow, step_key, from: oldLabel, to: step_label,
                });
                return res.json({ ok: true });
            }

            // ── WORKFLOW: delete step ──
            if (act === 'delete_step') {
                const { workflow, step_key } = req.body;
                let oldLabel = null;
                try {
                    const [pr] = await pool.query(
                        'SELECT step_label FROM tbl_workflow_step_roles WHERE workflow=? AND step_key=? LIMIT 1',
                        [workflow, step_key]);
                    oldLabel = pr[0]?.step_label || null;
                } catch (_) {}
                await pool.query('DELETE FROM tbl_workflow_step_roles WHERE workflow=? AND step_key=? AND is_custom=1',
                    [workflow, step_key]);
                await logAcl('wf_delete_step', null, `${workflow}:${step_key}`, {
                    workflow, step_key, step_label: oldLabel,
                });
                return res.json({ ok: true });
            }

            // ── PERMISSIONS: bulk grant/revoke by module (module_code or code prefix) ──
            if (act === 'bulk_module_perms') {
                const role = String(req.body.role_val || '');
                const module_code = String(req.body.module_code || '').trim();
                const grant = String(req.body.grant || '') === '1';
                if (['1', '99'].includes(role)) return res.json({ ok: false, error: 'Cannot modify core roles' });
                if (!module_code) return res.json({ ok: false, error: 'module_code required' });
                const [pids] = await pool.query(
                    'SELECT id FROM tbl_acl_permission WHERE module_code = ? OR code LIKE ?',
                    [module_code, module_code + '.%']
                );
                let affected = 0;
                for (const row of pids || []) {
                    const pid = parseInt(row.id, 10) || 0;
                    if (!pid) continue;
                    if (grant) {
                        const [r] = await pool.query(
                            'INSERT IGNORE INTO tbl_acl_role_permission (role,permission_id) VALUES (?,?)',
                            [role, pid]
                        );
                        affected += r.affectedRows || 0;
                    } else {
                        const [r] = await pool.query(
                            'DELETE FROM tbl_acl_role_permission WHERE role=? AND permission_id=?',
                            [role, pid]
                        );
                        affected += r.affectedRows || 0;
                    }
                }
                await logAcl(grant ? 'bulk_grant_module' : 'bulk_revoke_module', role, module_code, { affected });
                try { await require('../lib/aclLayout').refresh(); } catch (_) {}
                return res.json({ ok: true, affected });
            }

            // ── PERMISSIONS: replace role grants with a copy of another role (not 1/99 targets) ──
            if (act === 'copy_role_perms_from') {
                const role = String(req.body.role_val || '');
                const copyFrom = String(req.body.copy_from_role || '').trim();
                if (['1', '99'].includes(role)) return res.json({ ok: false, error: 'Cannot modify core roles' });
                if (!copyFrom || copyFrom === role) return res.json({ ok: false, error: 'Choose a different source role' });
                const [srcExists] = await pool.query('SELECT role FROM tbl_role WHERE role=? LIMIT 1', [copyFrom]);
                if (!srcExists.length) return res.json({ ok: false, error: 'Source role not found' });
                await pool.query('DELETE FROM tbl_acl_role_permission WHERE role=?', [role]);
                const [ins] = await pool.query(
                    'INSERT IGNORE INTO tbl_acl_role_permission (role, permission_id) ' +
                    'SELECT ?, permission_id FROM tbl_acl_role_permission WHERE role=?',
                    [role, copyFrom]
                );
                const copied = ins.affectedRows || 0;
                await logAcl('copy_role_perms_from', role, copyFrom, { copied });
                try { await require('../lib/aclLayout').refresh(); } catch (_) {}
                return res.json({ ok: true, copied });
            }

            // ── PERMISSIONS: grant/revoke ──
            if (act === 'grant' || act === 'revoke') {
                const role = String(req.body.role_val || '');
                const pid = parseInt(req.body.permission_id || 0);
                if (['1','99'].includes(role)) return res.json({ ok: false, error: 'Cannot modify core roles' });
                if (act === 'grant') {
                    await pool.query('INSERT IGNORE INTO tbl_acl_role_permission (role,permission_id) VALUES (?,?)', [role, pid]);
                } else {
                    await pool.query('DELETE FROM tbl_acl_role_permission WHERE role=? AND permission_id=?', [role, pid]);
                }
                // Resolve the permission code so the audit row is readable to a reviewer.
                let permCode = null;
                try {
                    const [pr] = await pool.query('SELECT code FROM tbl_acl_permission WHERE id=? LIMIT 1', [pid]);
                    permCode = pr[0]?.code || null;
                } catch (_) {}
                await logAcl(act, role, permCode || String(pid), { permission_id: pid });
                try { await require('../lib/aclLayout').refresh(); } catch (_) {}
                return res.json({ ok: true });
            }

            // ── PERMISSION CRUD: add ──
            if (act === 'perm_add') {
                const { code, label, gap_area } = req.body;
                if (!code || !label) return res.json({ ok: false, error: 'Code and label required' });
                await pool.query('INSERT INTO tbl_acl_permission (code,label,gap_area) VALUES (?,?,?)',
                    [code, label, parseInt(gap_area) || 0]);
                await logAcl('perm_add', null, code, { label, gap_area: parseInt(gap_area) || 0 });
                return res.json({ ok: true });
            }

            // ── PERMISSION CRUD: edit ──
            if (act === 'perm_edit') {
                const { id, code, label, gap_area } = req.body;
                await pool.query('UPDATE tbl_acl_permission SET code=?,label=?,gap_area=? WHERE id=?',
                    [code, label, parseInt(gap_area) || 0, parseInt(id)]);
                await logAcl('perm_edit', null, code, { id: parseInt(id) || 0, label, gap_area: parseInt(gap_area) || 0 });
                return res.json({ ok: true });
            }

            // ── PERMISSION CRUD: delete ──
            if (act === 'perm_delete') {
                const pid = parseInt(req.body.id || 0);
                let permCode = null;
                try {
                    const [pr] = await pool.query('SELECT code FROM tbl_acl_permission WHERE id=? LIMIT 1', [pid]);
                    permCode = pr[0]?.code || null;
                } catch (_) {}
                await pool.query('DELETE FROM tbl_acl_role_permission WHERE permission_id=?', [pid]);
                await pool.query('DELETE FROM tbl_acl_permission WHERE id=?', [pid]);
                await logAcl('perm_delete', null, permCode || String(pid), { permission_id: pid });
                return res.json({ ok: true });
            }

            // ── ROLE CRUD: add (with optional clone-from) ──
            if (act === 'role_add') {
                const { title } = req.body;
                const cloneFrom = String(req.body.clone_from || '').trim();
                if (!title) return res.json({ ok: false, error: 'Title required' });

                if (cloneFrom) {
                    if (['1','99'].includes(cloneFrom)) {
                        return res.json({ ok: false, error: 'Cannot clone from core roles. Pick a non-core role.' });
                    }
                    const [src] = await pool.query('SELECT role FROM tbl_role WHERE role=? LIMIT 1', [cloneFrom]);
                    if (!src.length) return res.json({ ok: false, error: 'Source role not found' });
                }

                const [mx] = await pool.query('SELECT MAX(CAST(role AS UNSIGNED)) AS m FROM tbl_role WHERE role < 999');
                const next = String(Math.max(100, parseInt(mx[0]?.m || 99) + 1));

                try {
                    await pool.query('INSERT INTO tbl_role (role,title) VALUES (?,?)', [next, title]);
                } catch (e) {
                    if (e && e.code === 'ER_DUP_ENTRY') {
                        return res.json({ ok: false, error: 'Role number already exists' });
                    }
                    throw e;
                }

                // Clone permissions / portals / UI-hides if a source was chosen.
                // We rely on INSERT … SELECT to keep things atomic-ish; each
                // copy is wrapped in its own catch so a missing legacy table
                // (e.g. tbl_acl_role_ui_hidden on very old DBs) doesn't abort
                // the whole operation.
                let copied = { perms: 0, portals: 0, hides: 0 };
                if (cloneFrom) {
                    try {
                        const [r] = await pool.query(
                            'INSERT IGNORE INTO tbl_acl_role_permission (role, permission_id) ' +
                            'SELECT ?, permission_id FROM tbl_acl_role_permission WHERE role=?',
                            [next, cloneFrom]
                        );
                        copied.perms = r.affectedRows || 0;
                    } catch (_) {}
                    try {
                        const [r] = await pool.query(
                            'INSERT IGNORE INTO tbl_acl_role_portal (role, portal_code, is_home) ' +
                            'SELECT ?, portal_code, is_home FROM tbl_acl_role_portal WHERE role=?',
                            [next, cloneFrom]
                        );
                        copied.portals = r.affectedRows || 0;
                    } catch (_) {}
                    try {
                        const [r] = await pool.query(
                            'INSERT IGNORE INTO tbl_acl_role_ui_hidden (role, element_code) ' +
                            'SELECT ?, element_code FROM tbl_acl_role_ui_hidden WHERE role=?',
                            [next, cloneFrom]
                        );
                        copied.hides = r.affectedRows || 0;
                    } catch (_) {}
                    try { await require('../lib/aclLayout').refresh(); } catch (_) {}
                }

                const summary = cloneFrom
                    ? `Cloned from #${cloneFrom}: ${copied.perms} permissions, ${copied.portals} portals, ${copied.hides} hide-rules.`
                    : '';
                await logAcl('role_add', next, title, cloneFrom ? { clone_from: cloneFrom, copied } : null);
                return res.json({ ok: true, role: next, clone_from: cloneFrom || null, clone_summary: summary });
            }

            // ── ROLE CRUD: edit ──
            if (act === 'role_edit') {
                const { role_id, title } = req.body;
                if (!title) return res.json({ ok: false, error: 'Title required' });
                // Snapshot old title for the audit detail.
                let oldTitle = null;
                try {
                    const [pr] = await pool.query('SELECT title FROM tbl_role WHERE role=? LIMIT 1', [role_id]);
                    oldTitle = pr[0]?.title || null;
                } catch (_) {}
                await pool.query('UPDATE tbl_role SET title=? WHERE role=?', [title, role_id]);
                await logAcl('role_edit', role_id, title, { from: oldTitle, to: title });
                return res.json({ ok: true });
            }

            // ── UI VISIBILITY: hide/show dashboard tile (or any UI element) for a role ──
            //   Granting a permission lets a role *use* a feature; this layer lets
            //   admins additionally curate which CARDS/TILES are visible on the
            //   dashboard for a given role without revoking the permission.
            // ── NAVIGATION: menu bundles (independent of capability permissions) ──
            if (act === 'nav_revoke_all') {
                const role = String(req.body.role_val || '');
                if (!role) return res.json({ ok: false, error: 'role required' });
                if (['1', '99'].includes(role)) {
                    return res.json({ ok: false, error: 'Cannot modify core roles' });
                }
                const { ensureNavAccessSchema } = require('../lib/ensureNavAccessSchema');
                await ensureNavAccessSchema(pool);
                await pool.query(
                    'UPDATE tbl_acl_role_nav_grant SET granted=0 WHERE role=?',
                    [role]
                );
                try {
                    await require('../lib/aclLayout').refresh();
                } catch (_) {}
                await logAcl('nav_revoke_all', role, null, null);
                return res.json({ ok: true });
            }

            if (act === 'nav_toggle' || act === 'nav_grant_bundle') {
                const role = String(req.body.role_val || '');
                const navCode = String(req.body.nav_code || '').trim();
                const grant = String(req.body.grant || '1') === '1';
                if (!role || !navCode) return res.json({ ok: false, error: 'role and nav_code required' });
                if (['1', '99'].includes(role)) {
                    return res.json({ ok: false, error: 'Cannot modify core roles' });
                }
                const { ensureNavAccessSchema } = require('../lib/ensureNavAccessSchema');
                const catalog = require('../lib/navAccessCatalog');
                await ensureNavAccessSchema(pool);
                const codes =
                    act === 'nav_grant_bundle'
                        ? catalog.descendantBundleCodes(navCode)
                        : [navCode];
                if (!codes.length) return res.json({ ok: false, error: 'Unknown navigation bundle' });
                let uiUnhidden = 0;
                for (const c of codes) {
                    if (grant) {
                        await pool.query(
                            `INSERT INTO tbl_acl_role_nav_grant (role, nav_code, granted)
                             VALUES (?,?,1)
                             ON DUPLICATE KEY UPDATE granted=1`,
                            [role, c]
                        );
                        const uiList = catalog.uiCodesForBundle(c);
                        if (uiList.length) {
                            const placeholders = uiList.map(() => '?').join(',');
                            const [del] = await pool.query(
                                `DELETE FROM tbl_acl_role_ui_hidden
                                  WHERE role=? AND element_code IN (${placeholders})`,
                                [role, ...uiList]
                            );
                            uiUnhidden += del.affectedRows || 0;
                        }
                    } else {
                        await pool.query(
                            `INSERT INTO tbl_acl_role_nav_grant (role, nav_code, granted)
                             VALUES (?,?,0)
                             ON DUPLICATE KEY UPDATE granted=0`,
                            [role, c]
                        );
                    }
                }
                try {
                    await require('../lib/aclLayout').refresh();
                } catch (_) {}
                await logAcl(grant ? 'nav_grant' : 'nav_revoke', role, navCode, {
                    codes,
                    ui_unhidden: uiUnhidden,
                });
                return res.json({ ok: true, codes, ui_unhidden: uiUnhidden });
            }

            // ── PERMISSIONS: module read / write columns ──
            if (act === 'perm_set_module_rw') {
                const role = String(req.body.role_val || '');
                const moduleCode = String(req.body.module_code || '').trim();
                const rw = String(req.body.rw || '').trim();
                const grant = String(req.body.grant || '') === '1';
                if (!role || !moduleCode || !['read', 'write'].includes(rw)) {
                    return res.json({ ok: false, error: 'role, module_code, and rw (read|write) required' });
                }
                if (['1', '99'].includes(role)) {
                    return res.json({ ok: false, error: 'Cannot modify core roles' });
                }
                const [perms] = await pool.query(
                    `SELECT id, action FROM tbl_acl_permission
                      WHERE module_code = ? OR (COALESCE(module_code,'') = '' AND SUBSTRING_INDEX(code,'.',1) = ?)`,
                    [moduleCode, moduleCode]
                );
                const targets = (perms || []).filter((p) => String(p.action) === rw);
                let affected = 0;
                for (const p of targets) {
                    if (grant) {
                        const [ins] = await pool.query(
                            'INSERT IGNORE INTO tbl_acl_role_permission (role, permission_id) VALUES (?,?)',
                            [role, p.id]
                        );
                        if (ins.affectedRows) affected++;
                    } else {
                        const [del] = await pool.query(
                            'DELETE FROM tbl_acl_role_permission WHERE role=? AND permission_id=?',
                            [role, p.id]
                        );
                        if (del.affectedRows) affected++;
                    }
                }
                try {
                    await require('../lib/aclLayout').refresh();
                } catch (_) {}
                await logAcl(grant ? 'perm_rw_grant' : 'perm_rw_revoke', role, moduleCode + ':' + rw, {
                    affected,
                    rw,
                });
                return res.json({ ok: true, affected, total: targets.length });
            }

            if (act === 'ui_hide' || act === 'ui_show') {
                const role = String(req.body.role_val || '');
                const code = String(req.body.element_code || '').trim();
                if (!role || !code) return res.json({ ok: false, error: 'role and element_code required' });
                if (['1','99'].includes(role)) return res.json({ ok: false, error: 'Cannot modify core roles' });
                const aclLayout = require('../lib/aclLayout');
                const codesToUpdate =
                    act === 'ui_hide'
                        ? [...new Set([
                            ...aclLayout.descendantCodes(code),
                            ...(typeof aclLayout.urlAliasedCodes === 'function'
                                ? aclLayout.urlAliasedCodes(code)
                                : [code]),
                          ])]
                        : typeof aclLayout.urlAliasedCodes === 'function'
                          ? aclLayout.urlAliasedCodes(code)
                          : [code];
                if (act === 'ui_hide') {
                    for (const c of codesToUpdate) {
                        await pool.query(
                            'INSERT IGNORE INTO tbl_acl_role_ui_hidden (role, element_code) VALUES (?, ?)',
                            [role, c]
                        );
                    }
                } else {
                    await pool.query(
                        `DELETE FROM tbl_acl_role_ui_hidden WHERE role=? AND element_code IN (${codesToUpdate.map(() => '?').join(',')})`,
                        [role, ...codesToUpdate]
                    );
                }
                try { await aclLayout.refresh(); } catch (_) {}
                await logAcl(act, role, code, { cascaded: codesToUpdate.length });
                return res.json({ ok: true });
            }

            if (act === 'ui_bulk_shell') {
                const role = String(req.body.role_val || '');
                const shell = String(req.body.shell || '').trim();
                const show = String(req.body.show || '') === '1';
                if (!role || !shell) return res.json({ ok: false, error: 'role and shell required' });
                if (['1', '99'].includes(role)) return res.json({ ok: false, error: 'Cannot modify core roles' });
                const aclLayout = require('../lib/aclLayout');
                const codes = aclLayout.allCodesForShell(shell);
                if (!codes.length) return res.json({ ok: false, error: 'Unknown shell' });
                if (show) {
                    await pool.query(
                        `DELETE FROM tbl_acl_role_ui_hidden WHERE role=? AND element_code IN (${codes.map(() => '?').join(',')})`,
                        [role, ...codes]
                    );
                } else {
                    for (const code of codes) {
                        await pool.query(
                            'INSERT IGNORE INTO tbl_acl_role_ui_hidden (role, element_code) VALUES (?, ?)',
                            [role, code]
                        );
                    }
                }
                try { await aclLayout.refresh(); } catch (_) {}
                await logAcl(show ? 'ui_bulk_show' : 'ui_bulk_hide', role, shell, { count: codes.length });
                return res.json({ ok: true, count: codes.length });
            }

            // ── ROLE PORTALS: assign / unassign / set-home ──
            //   Manages tbl_acl_role_portal so admins can decide, per role,
            //   which staff portals are accessible and which one is the
            //   default landing page. aclLayout.staffHomeUrl() reads from
            //   the same table, so login & permission redirects pick up
            //   changes immediately after refresh().
            if (act === 'portal_assign' || act === 'portal_unassign' || act === 'portal_set_home') {
                const role = String(req.body.role_val || '');
                const portal_code = String(req.body.portal_code || '').trim();
                if (!role || !portal_code) return res.json({ ok: false, error: 'role and portal_code required' });
                if (['1','99'].includes(role)) return res.json({ ok: false, error: 'Cannot modify core roles' });

                // Validate that this portal_code actually exists in tbl_acl_portal
                const [pchk] = await pool.query('SELECT code FROM tbl_acl_portal WHERE code=? LIMIT 1', [portal_code]);
                if (!pchk.length) return res.json({ ok: false, error: 'Unknown portal_code' });

                if (act === 'portal_assign') {
                    // First assignment for a role automatically becomes home.
                    const [exist] = await pool.query('SELECT COUNT(*) AS n FROM tbl_acl_role_portal WHERE role=?', [role]);
                    const willBeHome = (exist[0]?.n || 0) === 0 ? 1 : 0;
                    await pool.query(
                        'INSERT IGNORE INTO tbl_acl_role_portal (role, portal_code, is_home) VALUES (?, ?, ?)',
                        [role, portal_code, willBeHome]);
                } else if (act === 'portal_unassign') {
                    const [del] = await pool.query(
                        'SELECT is_home FROM tbl_acl_role_portal WHERE role=? AND portal_code=? LIMIT 1',
                        [role, portal_code]);
                    const wasHome = del.length && !!del[0].is_home;
                    await pool.query(
                        'DELETE FROM tbl_acl_role_portal WHERE role=? AND portal_code=?',
                        [role, portal_code]);
                    if (wasHome) {
                        // Promote the alphabetically-first remaining row to home so
                        // the role still has a landing page. tbl_acl_role_portal has
                        // a composite PK (role, portal_code) — no `id` column, so we
                        // order deterministically by portal_code.
                        const [remain] = await pool.query(
                            'SELECT portal_code FROM tbl_acl_role_portal WHERE role=? ORDER BY portal_code LIMIT 1',
                            [role]);
                        if (remain.length) {
                            await pool.query(
                                'UPDATE tbl_acl_role_portal SET is_home=1 WHERE role=? AND portal_code=?',
                                [role, remain[0].portal_code]);
                        }
                    }
                } else { // portal_set_home — exactly one row has is_home=1 per role
                    const [own] = await pool.query(
                        'SELECT 1 FROM tbl_acl_role_portal WHERE role=? AND portal_code=? LIMIT 1',
                        [role, portal_code]);
                    if (!own.length) return res.json({ ok: false, error: 'Assign this portal first, then mark it as home.' });
                    await pool.query('UPDATE tbl_acl_role_portal SET is_home=0 WHERE role=?', [role]);
                    await pool.query(
                        'UPDATE tbl_acl_role_portal SET is_home=1 WHERE role=? AND portal_code=?',
                        [role, portal_code]);
                }
                try { await require('../lib/aclLayout').refresh(); } catch (_) {}
                await logAcl(act, role, portal_code, null);
                return res.json({ ok: true });
            }

            // ── PORTAL CATALOG: create / edit / delete ──
            if (act === 'portal_add' || act === 'portal_edit' || act === 'portal_delete') {
                const portalRegistry = require('../lib/portalRegistry');
                const { seedStarterTiles } = require('../lib/portalStarterTiles');

                if (act === 'portal_delete') {
                    const code = portalRegistry.normalizePortalCode(req.body.portal_code);
                    if (!code) return res.json({ ok: false, error: 'portal_code required' });
                    const [row] = await pool.query(
                        'SELECT code, is_builtin FROM tbl_acl_portal WHERE code=? LIMIT 1',
                        [code]
                    );
                    if (!row.length) return res.json({ ok: false, error: 'Portal not found' });
                    if (row[0].is_builtin) {
                        return res.json({ ok: false, error: 'Built-in portals cannot be deleted.' });
                    }
                    const [used] = await pool.query(
                        'SELECT COUNT(*) AS n FROM tbl_acl_role_portal WHERE portal_code=?',
                        [code]
                    );
                    if ((used[0]?.n || 0) > 0) {
                        return res.json({
                            ok: false,
                            error: 'Portal is assigned to roles. Unassign all roles first.',
                        });
                    }
                    await pool.query('DELETE FROM tbl_acl_ui_element WHERE portal_code=?', [code]);
                    await pool.query('DELETE FROM tbl_acl_portal WHERE code=?', [code]);
                    try { await require('../lib/aclLayout').refresh(); } catch (_) {}
                    await logAcl('portal_delete', null, code, null);
                    return res.json({ ok: true });
                }

                const label = String(req.body.label || '').trim().slice(0, 80);
                if (!label) return res.json({ ok: false, error: 'Portal label is required' });

                if (act === 'portal_add') {
                    const code = portalRegistry.normalizePortalCode(req.body.portal_code);
                    if (!code) {
                        return res.json({
                            ok: false,
                            error: 'Portal code required (letters, numbers, underscore).',
                        });
                    }
                    if (code === 'patient_support') {
                        return res.json({ ok: false, error: 'This portal code is reserved.' });
                    }
                    const [dup] = await pool.query(
                        'SELECT id FROM tbl_acl_portal WHERE code=? LIMIT 1',
                        [code]
                    );
                    if (dup.length) return res.json({ ok: false, error: 'Portal code already exists' });
                    const homeUrl =
                        String(req.body.home_url || '').trim() ||
                        portalRegistry.defaultHomeUrl(code);
                    const icon = String(req.body.icon || 'fa-th-large').trim().slice(0, 64) || 'fa-th-large';
                    const color = String(req.body.color || '#714b67').trim().slice(0, 24) || '#714b67';
                    const description = String(req.body.description || '').trim().slice(0, 2000) || null;
                    const sortOrder = parseInt(req.body.sort_order, 10) || 50;
                    await pool.query(
                        `INSERT INTO tbl_acl_portal
                          (code, label, sort_order, home_url, icon, color, description, enabled, is_builtin)
                         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
                        [code, label, sortOrder, homeUrl, icon, color, description]
                    );
                    const template = String(req.body.starter_template || 'executive').trim();
                    const tiles = await seedStarterTiles(pool, code, template);
                    const assignRole = String(req.body.assign_role || req.body.role_val || '').trim();
                    const setHome = String(req.body.set_home || '0') === '1';
                    if (assignRole && assignRole !== '1' && assignRole !== '99') {
                        const [existRp] = await pool.query(
                            'SELECT 1 FROM tbl_acl_role_portal WHERE role=? AND portal_code=? LIMIT 1',
                            [assignRole, code]
                        );
                        if (!existRp.length) {
                            const [cnt] = await pool.query(
                                'SELECT COUNT(*) AS n FROM tbl_acl_role_portal WHERE role=?',
                                [assignRole]
                            );
                            const isFirst = (cnt[0]?.n || 0) === 0;
                            await pool.query(
                                'INSERT INTO tbl_acl_role_portal (role, portal_code, is_home) VALUES (?, ?, ?)',
                                [assignRole, code, setHome || isFirst ? 1 : 0]
                            );
                            if (setHome) {
                                await pool.query(
                                    'UPDATE tbl_acl_role_portal SET is_home=0 WHERE role=? AND portal_code<>?',
                                    [assignRole, code]
                                );
                                await pool.query(
                                    'UPDATE tbl_acl_role_portal SET is_home=1 WHERE role=? AND portal_code=?',
                                    [assignRole, code]
                                );
                            }
                        } else if (setHome) {
                            await pool.query(
                                'UPDATE tbl_acl_role_portal SET is_home=0 WHERE role=?',
                                [assignRole]
                            );
                            await pool.query(
                                'UPDATE tbl_acl_role_portal SET is_home=1 WHERE role=? AND portal_code=?',
                                [assignRole, code]
                            );
                        }
                    }
                    try { await require('../lib/aclLayout').refresh(); } catch (_) {}
                    await logAcl('portal_add', null, code, { label, home_url: homeUrl, tiles, assign_role: assignRole || null });
                    return res.json({
                        ok: true,
                        code,
                        home_url: homeUrl,
                        tiles_seeded: tiles,
                        assigned_role: assignRole || null,
                    });
                }

                const code = portalRegistry.normalizePortalCode(req.body.portal_code);
                if (!code) return res.json({ ok: false, error: 'portal_code required' });
                const homeUrl = String(req.body.home_url || '').trim();
                const icon = String(req.body.icon || '').trim().slice(0, 64);
                const color = String(req.body.color || '').trim().slice(0, 24);
                const description = String(req.body.description || '').trim().slice(0, 2000) || null;
                const enabled = String(req.body.enabled || '1') === '0' ? 0 : 1;
                const sortOrder = parseInt(req.body.sort_order, 10);
                await pool.query(
                    `UPDATE tbl_acl_portal SET label=?, home_url=?, icon=?, color=?, description=?, enabled=?, sort_order=?
                     WHERE code=?`,
                    [
                        label,
                        homeUrl || portalRegistry.defaultHomeUrl(code),
                        icon || 'fa-th-large',
                        color || '#714b67',
                        description,
                        enabled,
                        Number.isFinite(sortOrder) ? sortOrder : 50,
                        code,
                    ]
                );
                try { await require('../lib/aclLayout').refresh(); } catch (_) {}
                await logAcl('portal_edit', null, code, { label, enabled });
                return res.json({ ok: true, code });
            }

            // ── ROLE CRUD: delete ──
            if (act === 'role_delete') {
                const rid = String(req.body.role_id || '');
                if (['1','99'].includes(rid)) return res.json({ ok: false, error: 'Cannot delete core roles' });
                const [chk] = await pool.query('SELECT id FROM tbl_employee WHERE role=? LIMIT 1', [rid]);
                if (chk.length > 0) return res.json({ ok: false, error: 'Role is in use by staff. Change their role first.' });
                let oldTitle = null;
                try {
                    const [pr] = await pool.query('SELECT title FROM tbl_role WHERE role=? LIMIT 1', [rid]);
                    oldTitle = pr[0]?.title || null;
                } catch (_) {}
                await pool.query('DELETE FROM tbl_acl_role_permission WHERE role=?', [rid]);
                await pool.query('DELETE FROM tbl_acl_role_portal WHERE role=?', [rid]).catch(() => {});
                await pool.query('DELETE FROM tbl_acl_role_ui_hidden WHERE role=?', [rid]).catch(() => {});
                await pool.query('DELETE FROM tbl_role WHERE role=?', [rid]);
                try { await require('../lib/aclLayout').refresh(); } catch (_) {}
                await logAcl('role_delete', rid, oldTitle, null);
                return res.json({ ok: true });
            }

            return res.json({ ok: false, error: 'Unknown action' });

        } catch (e) {
            console.error('[access-control api]', e.message);
            return res.json({ ok: false, error: e.message });
        }
    });

    // ────────────────────────────────────────────────────────
    // HR ATTendance (sidebar Administration → Attendance)
    // ────────────────────────────────────────────────────────
    app.get('/hr/attendance', requireAuth, requireAdminOrPayrollWrite, async (req, res) => {
        try {
            await ensureHrPayrollSchema(pool);
            const fid = Math.max(1, parseInt(req.session.facilityId, 10) || 1);
            const date = String(req.query.date || '').trim() || new Date().toISOString().split('T')[0];

            const [staffRows] = await pool.query(
                'SELECT id, first_name, last_name FROM tbl_employee WHERE status = 1 ORDER BY last_name ASC, first_name ASC'
            ).catch(() => [[[]]]);
            const rows = Array.isArray(staffRows) ? staffRows : [];
            const existing = {};
            if (rows.length) {
                const [attRows] = await pool.query(
                    'SELECT employee_id, status, check_in_time, check_out_time FROM tbl_hms_attendance WHERE facility_id = ? AND att_date = ?',
                    [fid, date]
                ).catch(() => [[]]);
                for (const r of attRows || []) existing[r.employee_id] = r;
            }

            res.render('hr-attendance', {
                title: 'Staff Attendance - ZAIZENS',
                date,
                staff: rows,
                existing,
                hrTablesOk: true,
                flash: req.query.msg || null,
                error: req.query.err || null
            });
        } catch (err) {
            console.error('HR ATTENDANCE GET:', err.message);
            res.status(500).render('error', { title: 'Error', message: err.message || 'Attendance load failed.', status: 500 });
        }
    });

    app.post('/hr/attendance/save', requireAuth, requireAdminOrPayrollWrite, async (req, res) => {
        const fid = Math.max(1, parseInt(req.session.facilityId, 10) || 1);
        const date = String(req.body.date || '').trim() || new Date().toISOString().split('T')[0];
        const attendance = req.body.attendance && typeof req.body.attendance === 'object' ? req.body.attendance : {};
        try {
            await ensureHrPayrollSchema(pool);

            for (const [eidStr, row] of Object.entries(attendance)) {
                const employee_id = parseInt(eidStr, 10) || 0;
                if (employee_id < 1 || !row || typeof row !== 'object') continue;
                const status = String(row.status || 'present').trim().slice(0, 24) || 'present';
                let cin = row.in != null && String(row.in).trim() !== '' ? String(row.in).trim() : null;
                let cout = row.out != null && String(row.out).trim() !== '' ? String(row.out).trim() : null;
                if (cin && cin.length === 5) cin = cin + ':00';
                if (cout && cout.length === 5) cout = cout + ':00';
                await pool.query(
                    `INSERT INTO tbl_hms_attendance (facility_id, employee_id, att_date, check_in_time, check_out_time, status)
     VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE status=VALUES(status), check_in_time=VALUES(check_in_time), check_out_time=VALUES(check_out_time)`,
                    [fid, employee_id, date, cin, cout, status]
                );
            }
            res.redirect('/hr/attendance?date=' + encodeURIComponent(date) + '&msg=' + encodeURIComponent('Attendance saved.'));
        } catch (err) {
            console.error('HR ATTENDANCE SAVE:', err.message);
            res.redirect('/hr/attendance?date=' + encodeURIComponent(date) + '&err=' + encodeURIComponent(err.message));
        }
    });

}; // end module.exports
