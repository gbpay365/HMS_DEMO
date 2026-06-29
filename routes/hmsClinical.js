'use strict';

const hmsHub = require('../lib/hmsClinicalHub');
const ensureFacilityRow = require('../lib/ensureFacilityRow');
const hmsWaitingScreen = require('../lib/hmsWaitingScreen');
const prescriptionVerify = require('../lib/prescriptionVerify');
const hmsCommission = require('../lib/hmsCommission');
const hmsOnlineBooking = require('../lib/hmsOnlineBooking');
const ensureHmsExtendedSchema = require('../lib/ensureHmsExtendedSchema');
const { allocateUniquePaymentCode } = require('../lib/paymentTicketCode');

module.exports = function hmsClinicalRoutes(app, pool, requireAuth, requirePerm) {
  const clinicalRead = requirePerm(
    'patient.read',
    'clinical.read',
    'clinical.write',
    'opd.read',
    'nursing.read',
    'lab.read',
    'radiology.read',
    'pharmacy.read',
    'adt.read',
    'cashier.read',
    'billing.read'
  );
  const clinicalWrite = requirePerm('clinical.write', 'opd.write', 'cashier.write', 'billing.write');
  const billingWrite = requirePerm('cashier.write', 'billing.write');

  app.get('/hms', requireAuth, clinicalRead, async (req, res) => {
    try {
      const role = String(req.session.user?.role || '');
      if (role !== '1' && role !== '99') {
        const aclLayout = require('../lib/aclLayout');
        const home = aclLayout.staffHomeUrlFromSession(req.session);
        if (home && home !== '/hms') {
          return res.redirect(home);
        }
      }
      const { stats, todayVisits } = await hmsHub.loadHubPageData(pool);
      const hubTileCatalog = require('../lib/hubTileCatalog');
      const aclLayout = require('../lib/aclLayout');
      const { groupHubCatalogStats, groupHubCatalogModules } = require('../lib/hubLayoutGroups');
      const perms = res.locals.userPerms || [];
      const navOpts = {
        viewerRole: role,
        productSlices: aclLayout.getProductSlices(),
        moduleOverrides: aclLayout.getModuleOverrides(),
      };
      const uiVisible = (code) => aclLayout.uiElementVisible(code, perms, role, navOpts);
      const hubStats = hubTileCatalog.getHubStats();
      const hubModules = hubTileCatalog.getHubModuleCards();
      res.render('hms-hub', {
        title: 'HMS Clinical — ZAIZENS',
        stats,
        todayVisits,
        hubCatalog: {
          stats: hubStats,
          modules: hubModules,
        },
        hubStatBands: groupHubCatalogStats(hubStats, uiVisible),
        hubModuleBands: groupHubCatalogModules(hubModules, uiVisible),
        flash: req.query.msg || null,
        error: req.query.err || null,
      });
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/hms/reports', requireAuth, clinicalRead, async (req, res) => {
    res.render('hms-reports', {
      title: 'Reports & printing — HMS',
      hmsSurfaceBodyClass: ' hms-body--hms-hub',
      flash: req.query.msg || null,
    });
  });

  app.get('/hms-reports', requireAuth, clinicalRead, (req, res) => {
    const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return res.redirect(301, '/hms/reports' + q);
  });

  app.get('/hms/config', requireAuth, requirePerm(
    'clinical.write',
    'service_catalog.write',
    'settings.org_clinical.write',
    'service_catalog.consultation.write',
    'employee.write'
  ), (req, res) => {
    res.redirect('/admin/consultation-rooms');
  });

  app.get('/hms/api/patient/:id/smart', requireAuth, clinicalRead, async (req, res) => {
    const counts = await hmsHub.getPatientSmartCounts(pool, req.params.id);
    if (!counts) return res.status(404).json({ ok: false, error: 'Patient not found' });
    res.json({ ok: true, counts });
  });

  app.get('/hms/api/visit/:id/billing', requireAuth, clinicalRead, async (req, res) => {
    const data = await hmsHub.getVisitBillingPreview(pool, req.params.id);
    if (!data) return res.status(404).json({ ok: false, error: 'Visit not found' });
    res.json({ ok: true, ...data });
  });

  app.post('/hms/api/visit/:id/create-ticket', requireAuth, billingWrite, async (req, res) => {
    const vid = parseInt(req.params.id, 10) || 0;
    const preview = await hmsHub.getVisitBillingPreview(pool, vid);
    if (!preview) {
      return res.status(404).json({ ok: false, error: 'Visit not found' });
    }
    const { visit, pendingItems } = preview;
    if (visit.ticket_id && visit.ticket_status === 'pending') {
      return res.json({
        ok: true,
        redirect: `/cashier/settle/${visit.ticket_id}`,
        ticket_code: visit.ticket_code,
        message: 'Existing pending ticket — open cashier to settle.',
      });
    }
    if (!pendingItems.length) {
      return res.json({
        ok: false,
        error: 'No pending billable items. Consultation fee may already be paid, or add lab/rx orders first.',
      });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const patientId = parseInt(visit.patient_id, 10);
      const facilityId = await ensureFacilityRow(conn, req.session.facilityId || 1);
      const ids = pendingItems.map((it) => it.id);
      const placeholders = ids.map(() => '?').join(',');
      const [rows] = await conn.query(
        `SELECT * FROM tbl_opd_order_item WHERE id IN (${placeholders}) AND status='pending' FOR UPDATE`,
        ids
      );
      const items = rows || [];
      if (!items.length) throw new Error('No pending items remain.');
      const total = items.reduce(
        (s, it) => s + (parseFloat(it.unit_price || 0) || 0) * (parseFloat(it.quantity || 1) || 1),
        0
      );
      const lines = items.map((it) => ({
        kind: String(it.item_type || 'service'),
        description: it.item_name || 'Service',
        unit_price: parseFloat(it.unit_price || 0) || 0,
        quantity: parseFloat(it.quantity || 1) || 1,
        catalog_id: it.catalog_id || null,
        source_module: 'opd_order_item',
        source_pk: it.id,
        opd_visit_id: vid,
      }));
      const ticket_code = await allocateUniquePaymentCode(conn, lines);
      const uid = req.session.userId || req.session.user?.id || 1;
      const [ins] = await conn.query(
        `INSERT INTO tbl_payment_ticket
         (facility_id, ticket_code, patient_id, total_amount, status, lines_json, created_by, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, NOW())`,
        [facilityId, ticket_code, patientId, total, JSON.stringify(lines), uid]
      );
      await conn.query('UPDATE tbl_opd_visit SET payment_code=? WHERE id=?', [ticket_code, vid]).catch(() => {});
      await conn.commit();
      res.json({
        ok: true,
        redirect: `/cashier/settle/${ins.insertId}`,
        ticket_code,
        total,
      });
    } catch (e) {
      await conn.rollback().catch(() => {});
      res.status(400).json({ ok: false, error: e.message });
    } finally {
      conn.release();
    }
  });

  // ── Waiting screen TV (unified with OPD call queue) ─────────────
  app.get('/hms/waiting-screen', (req, res) => {
    const q = new URLSearchParams();
    q.set('mode', 'simple');
    if (req.query.doctor_id) q.set('doctor_id', String(req.query.doctor_id));
    if (req.query.room_id) q.set('room_id', String(req.query.room_id));
    return res.redirect(302, '/portal/call-queue/enter?' + q.toString());
  });

  app.get('/hms/api/waiting-screen', async (req, res) => {
    try {
      const opdCallQueue = require('../lib/opdCallQueue');
      const doctorId = parseInt(req.query.doctor_id, 10) || 0;
      const roomId = parseInt(req.query.room_id, 10) || 0;
      const data = await opdCallQueue.loadOpdCallQueueToday(pool, { doctorId, roomId });
      const { boardRows, highlightIndex } = opdCallQueue.mapQueueToBoardPayload(data);
      res.json({
        ok: true,
        boardRows,
        highlightIndex,
        waiting: data.list.filter((v) => ['registered', 'triage', 'waiting_doctor'].includes(v.queue_status || '')),
        serverTime: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/hms/waiting-screen/config', requireAuth, requirePerm('clinical.write', 'opd.write'), async (req, res) => {
    await ensureHmsExtendedSchema(pool).catch(() => {});
    const config = await hmsWaitingScreen.getConfig(pool);
    res.render('hms-waiting-screen-config', {
      title: 'Waiting screen settings',
      config,
      flash: req.query.msg || null,
    });
  });

  app.post('/hms/waiting-screen/config', requireAuth, requirePerm('clinical.write', 'opd.write'), async (req, res) => {
    await ensureHmsExtendedSchema(pool).catch(() => {});
    await pool.query(
      `UPDATE tbl_waiting_screen_config SET
         welcome_message=?, show_patient_name=?, show_doctor_name=?, show_room=?,
         show_ticket_number=?, refresh_seconds=?, chime_enabled=?
       WHERE id=1`,
      [
        (req.body.welcome_message || '').trim().slice(0, 255),
        req.body.show_patient_name === '1' ? 1 : 0,
        req.body.show_doctor_name === '1' ? 1 : 0,
        req.body.show_room === '1' ? 1 : 0,
        req.body.show_ticket_number === '1' ? 1 : 0,
        Math.min(60, Math.max(3, parseInt(req.body.refresh_seconds, 10) || 5)),
        req.body.chime_enabled === '1' ? 1 : 0,
      ]
    );
    res.redirect('/hms/waiting-screen/config?msg=Settings+saved');
  });

  // ── Appointment slots (staff) ───────────────────────────────────────
  app.get('/hms/api/booking/slots', requireAuth, clinicalRead, async (req, res) => {
    await hmsOnlineBooking.ensureOnlineBookingSchema(pool).catch(() => {});
    const result = await hmsOnlineBooking.getAvailableSlots(pool, {
      doctorId: req.query.doctor_id || '',
      date: req.query.date || '',
    });
    res.json({ ok: true, slots: result.slots, message: result.message });
  });

  app.get('/hms/api/booking/validate-payment', requireAuth, clinicalRead, async (req, res) => {
    try {
      const appointmentPayment = require('../lib/appointmentPayment');
      const patientId = parseInt(req.query.patient_id, 10) || 0;
      const excludeAppointmentId = parseInt(req.query.exclude_appointment_id, 10) || 0;
      const result = await appointmentPayment.validatePaymentForTeleAppointment(pool, {
        patientId,
        paymentCode: req.query.code || req.query.payment_code || '',
        facilityId: req.session.facilityId || 1,
        excludeAppointmentId,
        lang: res.locals.lang || 'en',
      });
      if (!result.ok) return res.json({ ok: false, error: result.error });
      return res.json({
        ok: true,
        code: result.code,
        validity_message: result.validity_message,
        meta: result.meta,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/hms/appointments/slots-config', requireAuth, requirePerm('scheduling.write', 'clinical.write'), async (req, res) => {
    await hmsOnlineBooking.ensureOnlineBookingSchema(pool).catch(() => {});
    const settings = await hmsOnlineBooking.getSettings(pool);
    const [doctors] = await pool.query(
      "SELECT id, first_name, last_name FROM tbl_employee WHERE role=2 AND status=1 ORDER BY last_name"
    );
    const [availability] = await pool.query(
      `SELECT a.*, e.first_name, e.last_name FROM tbl_doctor_availability a
       JOIN tbl_employee e ON e.id = a.doctor_id ORDER BY e.last_name, a.weekday, a.start_time`
    ).catch(() => [[]]);
    res.render('hms-appointment-slots-config', {
      title: 'Appointment slots configuration',
      settings,
      doctors: doctors || [],
      availability: availability || [],
      flash: req.query.msg || null,
    });
  });

  app.post('/hms/appointments/slots-config/settings', requireAuth, requirePerm('scheduling.write', 'clinical.write'), async (req, res) => {
    await hmsOnlineBooking.ensureOnlineBookingSchema(pool).catch(() => {});
    const pairs = [
      ['slot_start_hour', req.body.slot_start_hour],
      ['slot_end_hour', req.body.slot_end_hour],
      ['slot_interval_minutes', req.body.slot_interval_minutes],
      ['max_days_ahead', req.body.max_days_ahead],
      ['min_hours_notice', req.body.min_hours_notice],
    ];
    for (const [k, v] of pairs) {
      await pool.query(
        'INSERT INTO tbl_booking_settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
        [k, String(v || '').trim()]
      );
    }
    res.redirect('/hms/appointments/slots-config?msg=Global+settings+saved');
  });

  app.post('/hms/appointments/slots-config/availability', requireAuth, requirePerm('scheduling.write', 'clinical.write'), async (req, res) => {
    await hmsOnlineBooking.ensureOnlineBookingSchema(pool).catch(() => {});
    await pool.query(
      `INSERT INTO tbl_doctor_availability (doctor_id, weekday, start_time, end_time, slot_minutes, active)
       VALUES (?,?,?,?,?,1)`,
      [
        parseInt(req.body.doctor_id, 10),
        parseInt(req.body.weekday, 10),
        req.body.start_time,
        req.body.end_time,
        parseInt(req.body.slot_minutes, 10) || 30,
      ]
    );
    res.redirect('/hms/appointments/slots-config?msg=Availability+added');
  });

  // ── Prescription QR verify (public + staff) ─────────────────────────
  app.get('/verify/rx/:token', async (req, res) => {
    await ensureHmsExtendedSchema(pool).catch(() => {});
    const rx = await prescriptionVerify.loadByToken(pool, req.params.token);
    const canVerify = !!(req.session && (req.session.userId || req.session.user));
    res.render('verify-prescription', {
      title: 'Prescription verification',
      rx,
      token: req.params.token,
      canVerify,
      layout: false,
    });
  });

  app.post('/verify/rx/:token/confirm', requireAuth, requirePerm('pharmacy.write', 'pharmacy.read'), async (req, res) => {
    const uid = req.session.userId || req.session.user?.id || null;
    const result = await prescriptionVerify.markVerified(pool, req.params.token, uid);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json(result);
    }
    res.redirect(
      '/verify/rx/' +
        req.params.token +
        '?msg=' +
        encodeURIComponent(result.ok ? 'Prescription marked as verified at pharmacy.' : result.error || 'Failed')
    );
  });

  app.get('/hms/prescription-verify', requireAuth, clinicalRead, (req, res) => {
    res.render('hms-prescription-verify', { title: 'Verify prescription QR' });
  });

  const consultationVerify = require('../lib/consultationVerify');

  app.get('/verify/consult/:token', async (req, res) => {
    await ensureHmsExtendedSchema(pool).catch(() => {});
    const consult = await consultationVerify.loadByToken(pool, req.params.token);
    const [items] = consult
      ? await pool
          .query(
            `SELECT item_type, item_name, service_code, unit_price, quantity, status
             FROM tbl_opd_order_item WHERE consultation_id=? ORDER BY item_type, id`,
            [consult.id]
          )
          .catch(() => [[]])
      : [[]];
    res.render('verify-consultation', {
      title: 'Consultation verification',
      consult,
      items: items || [],
      token: req.params.token,
      layout: false,
    });
  });

  // ── Commission rules ────────────────────────────────────────────────
  app.get('/hms/commission', requireAuth, requirePerm('payroll.read', 'financials.read', 'clinical.write'), async (req, res) => {
    await ensureHmsExtendedSchema(pool).catch(() => {});
    const { fetchActiveDoctors } = require('../lib/hmsDoctorStaff');
    const rules = await hmsCommission.listRules(pool);
    const doctors = await fetchActiveDoctors(
      pool,
      'e.id, e.first_name, e.last_name, e.primary_department, e.specialisation'
    );
    const perms = res.locals.userPerms || [];
    const canWrite =
      perms.includes('*') || perms.some((p) => ['payroll.write', 'financials.write'].includes(p));
    res.render('hms-commission', {
      title: 'Doctor commission rules',
      pageData: {
        rules,
        doctors,
        canWrite,
        flash: req.query.msg || null,
        error: req.query.err || null,
      },
      flash: req.query.msg || null,
      error: req.query.err || null,
    });
  });

  app.post('/hms/commission/rule', requireAuth, requirePerm('payroll.write', 'financials.write'), async (req, res) => {
    await ensureHmsExtendedSchema(pool).catch(() => {});
    await pool.query(
      `INSERT INTO tbl_doctor_commission_rule
       (doctor_id, rule_name, service_kind, rate_type, rate_value, active, notes)
       VALUES (?,?,?,?,?,1,?)`,
      [
        parseInt(req.body.doctor_id, 10),
        (req.body.rule_name || 'Commission').trim().slice(0, 120),
        req.body.service_kind || 'consultation',
        req.body.rate_type || 'percent',
        parseFloat(req.body.rate_value) || 0,
        (req.body.notes || '').trim() || null,
      ]
    );
    res.redirect('/hms/commission?msg=Rule+added');
  });

  app.get('/hms/commission/report', requireAuth, requirePerm('payroll.read', 'financials.read'), async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const report = await hmsCommission.buildReport(pool, {
      doctorId: req.query.doctor_id,
      dateFrom: req.query.from || today,
      dateTo: req.query.to || today,
    });
    const { fetchActiveDoctors } = require('../lib/hmsDoctorStaff');
    const doctors = await fetchActiveDoctors(pool, 'e.id, e.first_name, e.last_name');
    res.render('hms-commission-report', {
      title: 'Commission report',
      report,
      doctors: doctors || [],
      filters: { doctor_id: req.query.doctor_id, from: req.query.from || today, to: req.query.to || today },
    });
  });
};
