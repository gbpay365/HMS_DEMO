'use strict';

const hmsRoster = require('./hmsRoster');
const { loadCashierRosterShellLocalsAsync } = require('./cashierOdooShell');

function isRosterAdminUser(req) {
  const dr = String((req.session && req.session.user && req.session.user.role) || '');
  return dr === '1' || dr === '99';
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ pageTitle: Function, renderAppError: Function }} helpers
 */
function createCashierRosterRenderers(pool, { pageTitle, renderAppError }) {
  async function renderNurseRosterPage(req, res, { cashierShell = false } = {}) {
    const view = hmsRoster.parseView(req.query.view);
    let date = String(req.query.date || hmsRoster.isoToday()).slice(0, 10);
    if (req.query.month) date = hmsRoster.firstDayOfMonth(String(req.query.month) + '-01');
    const facilityId = hmsRoster.resolveFacilityId(req);
    const cfg = hmsRoster.rosterKindConfig('nurse');

    try {
      await hmsRoster.ensureNurseRosterSchema(pool);
      const nurses = await hmsRoster.fetchRosterStaff(pool, 'nurse');
      const rosterRows = await hmsRoster.fetchRosterRows(pool, 'nurse', facilityId, view, date);

      const rd = hmsRoster.buildRosterRenderData({
        kind: 'nurse',
        view,
        date,
        dateField: cfg.dateField,
        typeField: cfg.typeField,
        staff: nurses,
        rosterRows,
      });

      const nr = String((req.session.user || {}).role || '');
      const shellLocals = cashierShell
        ? await loadCashierRosterShellLocalsAsync(pool, req, res, 'nurse', {
            userDisplayName: res.locals.user?.name || req.session?.user?.name,
            flash: req.query.msg || null,
            error: req.query.err || null,
          })
        : {};
      res.render('nurse-roster', {
        title: pageTitle(res, 'document_titles.nurse_roster', 'Nurse Shift Roster — ZAIZENS'),
        nurses,
        roster: rd.roster,
        view: rd.view,
        date: rd.date,
        weekStart: rd.weekStart,
        weekDays: rd.weekDays,
        monthMeta: rd.monthMeta,
        monthWeeks: rd.monthWeeks,
        staffWithWeek: rd.staffWithWeek,
        staffDayShift: rd.staffDayShift,
        staffDayDetails: rd.staffDayDetails,
        shiftDefaults: hmsRoster.NURSE_SHIFT_DEFAULTS,
        period: rd.period,
        prevNavDate: rd.prevNavDate,
        nextNavDate: rd.nextNavDate,
        isAdminOrSuper: nr === '1' || nr === '99',
        flash: req.query.msg || null,
        error: req.query.err || null,
        cashierShell,
        ...shellLocals,
      });
    } catch (err) {
      console.error('ROSTER LOAD ERROR:', err);
      renderAppError(res, 500, 'page.load_roster', 'Roster load failure.', { detail: err.message });
    }
  }

  async function renderDoctorRosterPage(req, res, { cashierShell = false } = {}) {
    const view = hmsRoster.parseView(req.query.view);
    let date = String(req.query.date || hmsRoster.isoToday()).slice(0, 10);
    if (req.query.month) date = hmsRoster.firstDayOfMonth(String(req.query.month) + '-01');
    const facilityId = hmsRoster.resolveFacilityId(req);
    const cfg = hmsRoster.rosterKindConfig('doctor');
    const staffEmpId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
    const userPerms = res.locals.userPerms || [];
    const canEditAll = isRosterAdminUser(req);
    const canEditRoster = canEditAll || (userPerms || []).includes('doctor_duty.write');

    try {
      const doctors = await hmsRoster.fetchRosterStaff(pool, 'doctor');
      const rosterRows = await hmsRoster.fetchRosterRows(pool, 'doctor', facilityId, view, date);

      const rd = hmsRoster.buildRosterRenderData({
        kind: 'doctor',
        view,
        date,
        dateField: cfg.dateField,
        typeField: cfg.typeField,
        staff: doctors,
        rosterRows,
      });

      const [consultationRooms] = await pool
        .query(
          'SELECT id, code, name FROM tbl_consultation_room WHERE facility_id = ? AND status = 1 ORDER BY sort_order ASC, id ASC',
          [facilityId]
        )
        .catch(() => [[]]);

      const shellLocals = cashierShell
        ? await loadCashierRosterShellLocalsAsync(pool, req, res, 'doctor', {
            userDisplayName: res.locals.user?.name || req.session?.user?.name,
            flash: req.query.msg || null,
            error: req.query.err || null,
          })
        : {};

      res.render('doctor-roster', {
        title: pageTitle(res, 'document_titles.doctor_duty_roster', 'Doctor Duty Roster — ZAIZENS'),
        doctors,
        roster: rd.roster,
        view: rd.view,
        date: rd.date,
        weekStart: rd.weekStart,
        weekDays: rd.weekDays,
        monthMeta: rd.monthMeta,
        monthWeeks: rd.monthWeeks,
        staffWithWeek: rd.staffWithWeek,
        staffDayShift: rd.staffDayShift,
        staffDayDetails: rd.staffDayDetails || {},
        shiftDefaults: hmsRoster.DOCTOR_SHIFT_DEFAULTS,
        consultationRooms: consultationRooms || [],
        period: rd.period,
        prevNavDate: rd.prevNavDate,
        nextNavDate: rd.nextNavDate,
        isAdminOrSuper: isRosterAdminUser(req),
        canEditRoster,
        canEditAll,
        staffEmpId,
        flash: req.query.msg || null,
        error: req.query.err || null,
        cashierShell,
        ...shellLocals,
      });
    } catch (err) {
      console.error('DOCTOR ROSTER ERROR:', err);
      renderAppError(res, 500, 'page.load_doctor_roster', 'Doctor roster failure.', { detail: err.message });
    }
  }

  return { renderNurseRosterPage, renderDoctorRosterPage, isRosterAdminUser };
}

module.exports = { createCashierRosterRenderers, isRosterAdminUser };
