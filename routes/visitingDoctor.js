'use strict';

const {
  authenticateVisitingDoctor,
  buildSessionUser,
  changePassword,
  completeProfileSetup,
  extendVisitEndDate,
  forceReleaseVisitingDoctorAccount,
  isVisitingDoctorUsername,
  listAccountStatuses,
  listAdminPoolDetails,
  listRecentSessionLog,
  loadVisitingDoctorByUsername,
  loadVisitSummaryForEmployee,
  resetExpiredAccounts,
  VISITING_DOCTOR_USERNAMES,
  DEFAULT_PASSWORD,
} = require('../lib/visitingDoctor');
const { listDoctorSpecialisations } = require('../lib/hmsDoctorSpecialisations');

function setLoginActivity(req) {
  try {
    req.session.loginAt = Date.now();
  } catch (_) {
    /* ignore */
  }
}

function visitingDoctorSetupPath(user) {
  if (!user) return '/visiting-doctor/setup';
  if (user.password_must_change) return '/visiting-doctor/setup';
  if (!user.profile_setup_complete) return '/visiting-doctor/setup';
  return null;
}

function isAllowedDuringSetup(path) {
  const p = String(path || '');
  return (
    p.startsWith('/visiting-doctor/setup') ||
    p === '/visiting-doctor/my-visit' ||
    p.startsWith('/visiting-doctor/my-visit') ||
    p === '/logout'
  );
}

module.exports = function visitingDoctorRoutes(app, pool, requireAuth, requirePerm) {
  const rp =
    typeof requirePerm === 'function'
      ? requirePerm
      : (...keys) => (req, res, next) => next();
  const managePerm = rp('visiting_doctor.manage', 'employee.write', 'access_control.manage', '*');
  const SETUP_PREFIX = '/visiting-doctor/setup';
  const MY_VISIT_PREFIX = '/visiting-doctor/my-visit';

  async function loadSessionVisitingDoctor(req) {
    const username = req.session?.user?.username;
    if (!username || !isVisitingDoctorUsername(username)) return null;
    return loadVisitingDoctorByUsername(pool, username);
  }

  /** Gate visiting doctors until password + profile setup is complete. */
  async function visitingDoctorOnboardingGate(req, res, next) {
    if (!req.session?.user) return next();
    if (!isVisitingDoctorUsername(req.session.user.username)) return next();

    await resetExpiredAccounts(pool);
    const row = await loadSessionVisitingDoctor(req);
    if (!row) {
      req.session.destroy(() => {});
      return res.redirect('/visiting-doctor?err=' + encodeURIComponent('Session expired. Please sign in again.'));
    }

    const path = String(req.path || '');

    if (row.visit_end_date && String(row.visit_end_date).slice(0, 10) < new Date().toISOString().slice(0, 10)) {
      const { resetVisitingDoctorAccount } = require('../lib/visitingDoctor');
      await resetVisitingDoctorAccount(pool, row.id);
      req.session.destroy(() => {});
      return res.redirect('/visiting-doctor?msg=' + encodeURIComponent('Your visit period has ended. This account is available again.'));
    }

    const setupPath = visitingDoctorSetupPath(row);
    if (setupPath && !isAllowedDuringSetup(path)) {
      return res.redirect(setupPath);
    }
    if (!setupPath && path.startsWith(SETUP_PREFIX)) {
      return res.redirect('/portal/hub/doctor');
    }

    req.visitingDoctor = row;
    return next();
  }

  app.use(visitingDoctorOnboardingGate);

  app.get('/visiting-doctor', async (req, res) => {
    try {
      await require('../lib/ensureVisitingDoctorSchema')(pool);
      await resetExpiredAccounts(pool);
      res.render('visiting-doctor', {
        title: 'Visiting Doctor — ZAIZENS',
        layout: false,
        pageData: {
          flash: req.query.msg || null,
          error: req.query.err || null,
          brand: res.locals.brand || {},
        },
      });
    } catch (e) {
      console.error('visiting-doctor page:', e);
      res.status(500).send('Could not load visiting doctor page.');
    }
  });

  app.get('/api/visiting-doctor/accounts', async (req, res) => {
    try {
      await resetExpiredAccounts(pool);
      const accounts = await listAccountStatuses(pool);
      res.json({ ok: true, accounts });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Failed to load accounts.' });
    }
  });

  app.post('/visiting-doctor/login', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!isVisitingDoctorUsername(username)) {
      return res.redirect('/visiting-doctor?err=' + encodeURIComponent('Select a valid visiting doctor account.'));
    }
    try {
      const result = await authenticateVisitingDoctor(pool, username, password);
      if (!result.ok) {
        return res.redirect('/visiting-doctor?err=' + encodeURIComponent(result.error || 'Login failed.'));
      }
      delete req.session.portalPatientId;
      req.session.user = buildSessionUser(result.user);
      req.session.userId = result.user.id;
      setLoginActivity(req);
      return res.redirect(result.nextPath || '/visiting-doctor/setup');
    } catch (e) {
      console.error('visiting-doctor login:', e);
      return res.redirect('/visiting-doctor?err=' + encodeURIComponent('Login failed. Please try again.'));
    }
  });

  app.get('/visiting-doctor/setup', requireAuth, async (req, res) => {
    try {
      const row = await loadSessionVisitingDoctor(req);
      if (!row) return res.redirect('/visiting-doctor');

      const [departments] = await pool
        .query('SELECT department_name AS name FROM tbl_department WHERE status=1 ORDER BY department_name')
        .catch(() => [[]]);
      await require('../lib/ensureConsultationRoomsSchema')(pool);
      const [rooms] = await pool
        .query(`SELECT id, code, name FROM tbl_consultation_room WHERE status=1 ORDER BY sort_order, name`)
        .catch(() => [[]]);
      const specialisations = await listDoctorSpecialisations(pool);
      const specs = ['General Practitioner', ...specialisations.filter((s) => s !== 'General Practitioner')];

      const initialStep = row.password_must_change ? 'password' : 'profile';

      res.render('visiting-doctor-setup', {
        title: 'Visiting Doctor Setup — ZAIZENS',
        reactPage: 'visiting-doctor-setup',
        reactLoadingLabel: 'Loading setup…',
        pageData: {
          username: row.username,
          initialStep,
          departments: departments || [],
          specialisations: specs,
          rooms: rooms || [],
          flash: req.query.msg || null,
          error: req.query.err || null,
        },
      });
    } catch (e) {
      console.error('visiting-doctor setup:', e);
      res.status(500).send('Could not load setup.');
    }
  });

  app.post('/visiting-doctor/setup/password', requireAuth, async (req, res) => {
    const row = await loadSessionVisitingDoctor(req);
    if (!row) return res.status(403).json({ ok: false, error: 'Not a visiting doctor session.' });
    try {
      const pwd = String(req.body?.password || '').trim();
      const confirm = String(req.body?.confirm_password || '').trim();
      if (!pwd || pwd !== confirm) {
        return res.status(400).json({ ok: false, error: 'Passwords do not match.' });
      }
      await changePassword(pool, row.id, pwd);
      return res.json({ ok: true, nextStep: 'profile' });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message || 'Could not update password.' });
    }
  });

  app.post('/visiting-doctor/setup/profile', requireAuth, async (req, res) => {
    const row = await loadSessionVisitingDoctor(req);
    if (!row) return res.status(403).json({ ok: false, error: 'Not a visiting doctor session.' });
    if (row.password_must_change) {
      return res.status(400).json({ ok: false, error: 'Set your password first.' });
    }
    try {
      const body = req.body || {};
      const first_name = String(body.first_name || '').trim();
      const last_name = String(body.last_name || '').trim();
      const phone = String(body.phone || '').trim();
      const emailid = String(body.emailid || '').trim();
      const primary_department = String(body.primary_department || '').trim();
      const specialisation = String(body.specialisation || 'General Practitioner').trim();
      const consultation_room_id = parseInt(body.consultation_room_id, 10) || 0;
      const visit_end_date = String(body.visit_end_date || '').trim();

      if (!first_name || !last_name || !phone || !emailid || !primary_department || !consultation_room_id) {
        return res.status(400).json({ ok: false, error: 'Please complete all required fields.' });
      }

      await completeProfileSetup(pool, row.id, {
        first_name,
        last_name,
        phone,
        emailid,
        primary_department,
        specialisation,
        consultation_room_id,
        visit_start_date: body.visit_start_date,
        visit_end_date,
      });

      const [[fresh]] = await pool.query(
        'SELECT first_name, last_name, username, role, specialisation, profile_emoji, gender, photo_path FROM tbl_employee WHERE id=? LIMIT 1',
        [row.id]
      );
      if (fresh) {
        req.session.user = buildSessionUser({ ...row, ...fresh });
      }

      return res.json({ ok: true, redirect: '/portal/hub/doctor' });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message || 'Could not save profile.' });
    }
  });

  // ── Self-service: my visit & extend stay ─────────────────────
  app.get('/visiting-doctor/my-visit', requireAuth, async (req, res) => {
    try {
      const row = await loadSessionVisitingDoctor(req);
      if (!row) return res.redirect('/visiting-doctor');
      const visit = await loadVisitSummaryForEmployee(pool, row.id);
      res.render('visiting-doctor-my-visit', {
        title: 'My Visit — ZAIZENS',
        visit,
        username: row.username,
        flash: req.query.msg || null,
        error: req.query.err || null,
      });
    } catch (e) {
      console.error('visiting-doctor my-visit:', e);
      res.status(500).send('Could not load visit details.');
    }
  });

  app.post('/visiting-doctor/extend-stay', requireAuth, async (req, res) => {
    const row = await loadSessionVisitingDoctor(req);
    if (!row) return res.status(403).json({ ok: false, error: 'Not a visiting doctor session.' });
    try {
      const newEnd = String(req.body?.visit_end_date || '').trim();
      const result = await extendVisitEndDate(pool, row.id, newEnd);
      return res.json({ ok: true, ...result });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message || 'Could not extend stay.' });
    }
  });

  // ── Admin: pool dashboard, force release, print cards ────────
  app.get('/admin/visiting-doctors', requireAuth, managePerm, async (req, res) => {
    try {
      await require('../lib/ensureVisitingDoctorSchema')(pool);
      const accounts = await listAdminPoolDetails(pool);
      const sessions = await listRecentSessionLog(pool, 40);
      const inUseCount = accounts.filter((a) => a.inUse).length;
      const expiringCount = accounts.filter((a) => a.expiringSoon).length;
      res.render('admin-visiting-doctors', {
        title: 'Visiting Doctors — ZAIZENS',
        accounts,
        sessions,
        summary: {
          total: accounts.length,
          inUse: inUseCount,
          available: accounts.length - inUseCount,
          expiringSoon: expiringCount,
        },
        defaultPassword: DEFAULT_PASSWORD,
        flash: req.query.msg || null,
        error: req.query.err || null,
      });
    } catch (e) {
      console.error('admin visiting-doctors:', e);
      res.status(500).send('Could not load visiting doctor admin page.');
    }
  });

  app.get('/api/admin/visiting-doctors', requireAuth, managePerm, async (req, res) => {
    try {
      await resetExpiredAccounts(pool);
      const accounts = await listAdminPoolDetails(pool);
      const sessions = await listRecentSessionLog(pool, parseInt(req.query.limit, 10) || 40);
      res.json({ ok: true, accounts, sessions });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Failed to load pool.' });
    }
  });

  app.post('/admin/visiting-doctors/:id/release', requireAuth, managePerm, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const wantsJson = String(req.get('accept') || '').includes('application/json');
    try {
      const result = await forceReleaseVisitingDoctorAccount(pool, id);
      if (wantsJson) return res.json({ ok: true, ...result });
      return res.redirect(
        '/admin/visiting-doctors?msg=' +
          encodeURIComponent(`${result.username} has been released and is available again.`)
      );
    } catch (e) {
      if (wantsJson) return res.status(400).json({ ok: false, error: e.message });
      return res.redirect('/admin/visiting-doctors?err=' + encodeURIComponent(e.message || 'Release failed.'));
    }
  });

  app.get('/admin/visiting-doctors/print-cards', requireAuth, managePerm, async (req, res) => {
    try {
      await resetExpiredAccounts(pool);
      const accounts = await listAccountStatuses(pool);
      res.render('visiting-doctor-print-cards', {
        title: 'Visiting Doctor Cards — ZAIZENS',
        layout: false,
        accounts,
        defaultPassword: DEFAULT_PASSWORD,
        usernames: VISITING_DOCTOR_USERNAMES,
      });
    } catch (e) {
      console.error('visiting-doctor print-cards:', e);
      res.status(500).send('Could not load print view.');
    }
  });
};
