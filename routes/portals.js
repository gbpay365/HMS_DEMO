// ============================================================
// STAFF PORTALS — routes/portals.js
// 9 role-specific dashboards mirroring PHP portal-*.php
// ============================================================
const {
    enrichOpdVisitsRoomContext,
    enrichOpdVisitsDoctorFromPaymentTicket,
    paymentTicketDoctorSubquery,
} = require('../lib/opdVisitRoomQueue');
const opdCallQueue = require('../lib/opdCallQueue');
const { flashT, translateFlashErr } = require('../lib/flashI18n');

module.exports = function(app, pool, requireAuth) {

    // ── HELPER: safe query with fallback ──────────────────────
    async function sq(pool, sql, params=[]) {
        try { const [r] = await pool.query(sql, params); return Array.isArray(r) ? r : []; }
        catch(e) { return []; }
    }
    async function sc(pool, sql, params=[]) {
        const r = await sq(pool, sql, params);
        return (r[0] && r[0].c !== undefined) ? parseInt(r[0].c) || 0 : 0;
    }
    async function ss(pool, sql, params=[]) {
        const r = await sq(pool, sql, params);
        return (r[0] && r[0].s !== undefined) ? parseFloat(r[0].s) || 0 : 0;
    }

    async function loadVisitingVisitForSession(req) {
        try {
            const username = req.session?.user?.username;
            if (!username) return null;
            const { isVisitingDoctorUsername, loadVisitSummaryForEmployee } = require('../lib/visitingDoctor');
            if (!isVisitingDoctorUsername(username)) return null;
            const uid = req.session.userId || req.session.user?.id || 0;
            if (!uid) return null;
            return await loadVisitSummaryForEmployee(pool, uid);
        } catch (_) {
            return null;
        }
    }

    // ── FRONT DESK ────────────────────────────────────────────
    app.get('/portal/front-desk', requireAuth, (req, res) => {
        const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return res.redirect(301, '/portal/hub/front_desk' + q);
    });

    // ── DOCTOR ───────────────────────────────────────────────
    app.get('/portal/doctor', requireAuth, async (req, res) => {
        const today = new Date().toISOString().split('T')[0];
        const uid = req.session.userId || req.session.user?.id || 0;
        const meRows = await sq(pool, 'SELECT first_name, last_name, bio, primary_department FROM tbl_employee WHERE id=? LIMIT 1', [uid]);
        const me = meRows[0] || {};
        const myName = `${me.first_name||''} ${me.last_name||''}`.trim();

        // Try to add the columns we want — if the DB user lacks DDL
        // permission these silently fail and we fall back to legacy schema.
        const ensureCols = [
            "ALTER TABLE tbl_appointment ADD COLUMN visit_type VARCHAR(20) NOT NULL DEFAULT 'in_person'",
            "ALTER TABLE tbl_appointment ADD COLUMN meeting_room VARCHAR(120) DEFAULT NULL",
            "ALTER TABLE tbl_appointment ADD COLUMN doctor_id INT DEFAULT NULL",
            "ALTER TABLE tbl_appointment ADD COLUMN department_name VARCHAR(120) DEFAULT NULL",
            "ALTER TABLE tbl_appointment ADD COLUMN confirmed_at DATETIME DEFAULT NULL",
            "ALTER TABLE tbl_appointment ADD COLUMN declined_at DATETIME DEFAULT NULL",
            "ALTER TABLE tbl_appointment ADD COLUMN cancel_reason VARCHAR(255) DEFAULT NULL",
            "ALTER TABLE tbl_appointment ADD COLUMN portal_state VARCHAR(20) DEFAULT NULL"
        ];
        for (const s of ensureCols) { await pool.query(s).catch(() => {}); }

        // Detect which columns are actually available so we can build a query
        // that works even when the DB user doesn't have ALTER permission.
        let cols;
        try {
            const [c] = await pool.query(
                `SELECT COLUMN_NAME FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='tbl_appointment'`
            );
            cols = new Set((c || []).map(r => String(r.COLUMN_NAME).toLowerCase()));
        } catch (e) {
            cols = new Set(['id','appointment_id','patient_id','patient_name','department','doctor','date','time','message','status','created_at']);
        }
        const has = (col) => cols.has(String(col).toLowerCase());

        // Self-heal: only run if the relevant columns exist
        if (has('portal_state') && has('confirmed_at') && has('declined_at')) {
            await pool.query(
                `UPDATE tbl_appointment
                    SET portal_state = 'pending'
                  WHERE portal_state IS NULL
                    AND confirmed_at IS NULL
                    AND declined_at IS NULL
                    AND (
                           ${has('visit_type') ? "visit_type = 'telemedicine' OR " : ''}
                           status = 3
                        OR (appointment_id IS NOT NULL AND appointment_id LIKE 'APT-%')
                    )`
            ).catch(() => {});
        }

        // ── Build "pending" / "confirmed" predicates that work either way ──
        // With portal_state column: use it as source of truth.
        // Without it: use legacy heuristics (status=3 OR APT-* + status NOT IN
        // (0,1,2)) for pending, and status=1 for confirmed.
        const PENDING_SQL = has('portal_state')
            ? "a.portal_state = 'pending'"
            : "(a.status = 3 OR (a.status NOT IN (0,1,2) AND a.appointment_id LIKE 'APT-%'))";
        const CONFIRMED_SQL = has('portal_state')
            ? "(a.portal_state = 'confirmed' OR (a.portal_state IS NULL AND a.status = 1))"
            : "a.status = 1";

        // Doctor-matching predicates (portable: only use columns we know exist)
        const docIdMatch = has('doctor_id') ? "a.doctor_id = ?" : "1=0";
        const docNameMatch = "a.doctor LIKE ?";
        const mineWhere = `(${docIdMatch} OR ${docNameMatch})`;
        const unassignedWhere = has('doctor_id')
            ? "(a.doctor_id IS NULL AND (a.doctor IS NULL OR a.doctor = ''))"
            : "(a.doctor IS NULL OR a.doctor = '')";
        const mineOrUnassignedWhere = `(${mineWhere} OR ${unassignedWhere})`;
        const mineParams = has('doctor_id')
            ? [uid, `%${myName || '\u0000'}%`]
            : [`%${myName || '\u0000'}%`];

        // Diagnostic so we can see exactly what's being matched
        try {
            const [[totals]] = await pool.query(
                `SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN ${PENDING_SQL}   THEN 1 ELSE 0 END) AS pending,
                    SUM(CASE WHEN ${CONFIRMED_SQL} THEN 1 ELSE 0 END) AS confirmed
                 FROM tbl_appointment a`
            );
            console.log('[portal-doctor] uid=%s name="%s" cols(portal_state=%s,doctor_id=%s) totals=%j',
                uid, myName, has('portal_state'), has('doctor_id'), totals);
        } catch (e) {
            console.log('[portal-doctor] uid=%s name="%s" diag err=%s', uid, myName, e.message);
        }

        const departmentExpr = has('department_name')
            ? 'COALESCE(a.department, a.department_name)'
            : 'a.department';
        const visitTypeCol  = has('visit_type')   ? 'a.visit_type'    : "'in_person' AS visit_type";
        const meetingRoomCol = has('meeting_room') ? 'a.meeting_room' : 'NULL AS meeting_room';
        const confirmedAtCol = has('confirmed_at') ? 'a.confirmed_at' : 'NULL AS confirmed_at';
        const doctorIdCol   = has('doctor_id')    ? 'a.doctor_id'     : 'NULL AS doctor_id';

        const [statAppts, statConsults, statPending, statPats] = await Promise.all([
            sc(pool, `SELECT COUNT(*) AS c FROM tbl_appointment a WHERE ${CONFIRMED_SQL} AND a.date=? AND ${mineWhere}`,
                [today, ...mineParams]),
            sc(pool, "SELECT COUNT(*) AS c FROM tbl_consultation WHERE 1=1"),
            sc(pool, `SELECT COUNT(*) AS c FROM tbl_appointment a WHERE ${PENDING_SQL} AND ${mineOrUnassignedWhere}`, mineParams),
            sc(pool, "SELECT COUNT(*) AS c FROM tbl_patient WHERE status=1"),
        ]);

        // Today's confirmed schedule
        const todayAppts = await sq(pool,
            `SELECT a.patient_name, a.time,
                    ${departmentExpr} AS department,
                    ${visitTypeCol}, ${meetingRoomCol}, a.id, a.appointment_id
             FROM tbl_appointment a
             WHERE ${CONFIRMED_SQL}
               AND a.date=? AND ${mineWhere}
             ORDER BY a.time ASC LIMIT 15`,
            [today, ...mineParams]);

        // Pending requests (any date) — mine or unassigned, with is_mine flag.
        const isMineExpr = has('doctor_id')
            ? `CASE WHEN (a.doctor_id = ? OR a.doctor LIKE ?) THEN 1 ELSE 0 END`
            : `CASE WHEN a.doctor LIKE ? THEN 1 ELSE 0 END`;
        const isMineParams = has('doctor_id')
            ? [uid, `%${myName || '\u0000'}%`]
            : [`%${myName || '\u0000'}%`];
        const pendingAppts = await sq(pool,
            `SELECT a.id, a.appointment_id, a.patient_id, a.patient_name,
                    ${departmentExpr} AS department,
                    a.date, a.time, a.message, ${visitTypeCol},
                    a.doctor, ${doctorIdCol}, a.created_at,
                    ${isMineExpr} AS is_mine
             FROM tbl_appointment a
             WHERE ${PENDING_SQL}
               AND ${mineOrUnassignedWhere}
             ORDER BY is_mine DESC, a.date ASC, a.time ASC, a.id DESC LIMIT 80`,
            [...isMineParams, ...mineParams]);

        // Confirmed upcoming + recent (last 30 days back, all forward)
        const confirmedAppts = await sq(pool,
            `SELECT a.id, a.appointment_id, a.patient_id, a.patient_name,
                    ${departmentExpr} AS department,
                    a.date, a.time, a.message, ${visitTypeCol},
                    ${meetingRoomCol}, ${confirmedAtCol}
             FROM tbl_appointment a
             WHERE ${CONFIRMED_SQL} AND ${mineWhere}
                AND (a.date IS NULL OR a.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY))
             ORDER BY (a.date >= CURDATE()) DESC, a.date ASC, a.time ASC, a.id DESC
             LIMIT 80`,
            mineParams);

        const recentConsults = await sq(pool, `
            SELECT c.id, c.patient_id, c.created_at, p.first_name, p.last_name
            FROM tbl_consultation c LEFT JOIN tbl_patient p ON p.id=c.patient_id
            ORDER BY c.id DESC LIMIT 8`);
        const visitingVisit = await loadVisitingVisitForSession(req);
  res.render('portal-doctor', {
            title: 'Doctor Portal — ZAIZENS', me,
            pageData: {
              me,
              stats: { appts: statAppts, consults: statConsults, pending: statPending, patients: statPats },
              todayAppts, recentConsults, pendingAppts, confirmedAppts,
              visitingVisit,
              tab: req.query.tab || null,
              flash: req.query.msg || null, error: req.query.err || null,
            },
        });
    });

    // ── NURSE ─────────────────────────────────────────────────
    app.get('/portal/nurse', requireAuth, (req, res) => {
        const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return res.redirect(301, '/portal/hub/nursing' + q);
    });

    // ── LABORATORY ───────────────────────────────────────────
    app.get('/portal/lab', requireAuth, (req, res) => {
        const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return res.redirect(301, '/portal/hub/laboratory' + q);
    });

    // ── PHARMACY ─────────────────────────────────────────────
    app.get('/portal/pharmacy', requireAuth, (req, res) => {
        const qv = req.query.view ? String(req.query.view) : 'overview';
        return res.redirect('/pharmacy?view=' + encodeURIComponent(qv));
    });

    // ── RADIOLOGY ────────────────────────────────────────────
    app.get('/portal/radiology', requireAuth, (req, res) => {
        const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return res.redirect(301, '/portal/hub/radiology' + q);
    });

    // ── ACCOUNTANT ───────────────────────────────────────────
    app.get('/portal/accountant', requireAuth, async (req, res) => {
        const financeStaffUi = require('../lib/financeStaffUi');
        const role = String((req.session.user && req.session.user.role) || '');
        const acl = res.locals.aclLayout;
        if (financeStaffUi.isFinanceStaffUser(role, acl)) {
            return res.redirect('/financials');
        }
        const today = new Date().toISOString().split('T')[0];
        const monthStart = today.slice(0, 8) + '01';
        const [txnToday, txnTodayXaf] = await Promise.all([
            sc(pool, "SELECT COUNT(*) AS c FROM tbl_transaction WHERE DATE(created_at)=?", [today]),
            ss(pool, "SELECT COALESCE(SUM(amount),0) AS s FROM tbl_transaction WHERE status='completed' AND DATE(created_at)=?", [today]),
        ]);
        let expensesMtd = 0;
        let receiptsToday = 0;
        try {
            expensesMtd = await sc(pool, "SELECT COUNT(*) AS c FROM tbl_expense WHERE expense_date >= ? AND expense_date <= ?", [monthStart, today]);
        } catch (_) { /* tbl_expense may be absent */ }
        try {
            receiptsToday = await sc(pool, "SELECT COUNT(*) AS c FROM tbl_billing_document WHERE DATE(created_at)=?", [today]);
        } catch (_) {
            receiptsToday = await sc(pool, "SELECT COUNT(*) AS c FROM tbl_transaction WHERE status='completed' AND DATE(created_at)=?", [today]);
        }
        const recentTxn = await sq(pool, `
            SELECT t.id, t.amount, t.payment_method, t.status, t.description, t.billing_document_id,
                   t.created_at, p.first_name, p.last_name
            FROM tbl_transaction t LEFT JOIN tbl_patient p ON p.id=t.patient_id
            ORDER BY t.id DESC LIMIT 12`);
        res.render('portal-accountant', {
            title: 'Accountant Portal — ZAIZENS',
            stats: { txnToday, txnTodayXaf, expensesMtd, receiptsToday },
            recentTxn,
            flash: req.query.msg || null, error: req.query.err || null
        });
    });

    // ── CASHIER ──────────────────────────────────────────────
    app.get('/portal/cashier', requireAuth, (req, res) => {
        const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return res.redirect(301, '/cashier?page=dashboard' + q);
    });

    // ── PATIENT (self-service) ───────────────────────────────
    app.get('/portal/patient', requireAuth, async (req, res) => {
        const uid = req.session.userId || req.session.user?.id || 0;
        // For staff viewing patient portal, show patient directory-linked view
        const patients = await sq(pool,
            'SELECT id, first_name, last_name, gender, dob, phone, patient_type FROM tbl_patient WHERE status=1 ORDER BY last_name, first_name LIMIT 100');
        res.render('portal-patient', {
            title: 'Patient Portal — ZAIZENS',
            patients,
            flash: req.query.msg || null, error: req.query.err || null
        });
    });

    // ── QUEUE (lobby / TV display) ──────────────────────────────
    // One-tap entry — session persists indefinitely for lobby / TV displays (renewed on each request).
    const CALL_QUEUE_SESSION_MS = 10 * 365 * 24 * 60 * 60 * 1000;

    function clearCallQueuePortalSession(req) {
        if (!req.session) return;
        delete req.session.callQueueDisplay;
        delete req.session.callQueueDisplayUntil;
    }

    function renewCallQueuePortalSession(req) {
        if (!req.session) return;
        req.session.callQueueDisplay = true;
        delete req.session.callQueueDisplayUntil;
        if (req.session.cookie) {
            req.session.cookie.maxAge = CALL_QUEUE_SESSION_MS;
        }
    }

    /** True if Queue display is signed in (no expiry — renewed on every hit). */
    function callQueuePortalAuthenticated(req) {
        if (!req.session || !req.session.callQueueDisplay) return false;
        renewCallQueuePortalSession(req);
        return true;
    }

    function startCallQueuePortalSession(req) {
        renewCallQueuePortalSession(req);
    }

    function visitBoardPublicName(v) {
        return opdCallQueue.visitBoardPublicName(v);
    }

    function formatQueueDoctorParts(fn, ln) {
        return opdCallQueue.formatQueueDoctorParts(fn, ln);
    }

    function formatQueueSeeingDoctor(rawConcat) {
        return opdCallQueue.formatQueueSeeingDoctor(rawConcat);
    }

    async function loadOpdCallQueueToday(pool, opts) {
        return opdCallQueue.loadOpdCallQueueToday(pool, opts);
    }

    app.get('/portal/call-queue/login', (req, res) => {
        if (callQueuePortalAuthenticated(req)) {
            return res.redirect('/portal/call-queue');
        }
        res.render('portal-queue', {
            title: 'OPD Queue — TSSF SOA',
            flash: req.query.msg || null,
            error: req.query.err || null
        });
    });

    /** One-tap lobby entry — no username or password. */
    app.get('/portal/call-queue/enter', (req, res) => {
        startCallQueuePortalSession(req);
        const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return res.redirect('/portal/call-queue' + q);
    });

    app.post('/portal/call-queue/login', (req, res) => {
        startCallQueuePortalSession(req);
        return res.redirect('/portal/call-queue');
    });

    app.get('/portal/call-queue/logout', (req, res) => {
        clearCallQueuePortalSession(req);
        res.redirect('/portal/call-queue/login?msg=' + encodeURIComponent('Signed out from Queue.'));
    });

    app.get('/portal/call-queue/data.json', async (req, res) => {
        if (!callQueuePortalAuthenticated(req)) {
            return res.status(401).json({ ok: false, error: 'auth' });
        }
        try {
            const doctorId = parseInt(req.query.doctor_id, 10) || 0;
            const roomId = parseInt(req.query.room_id, 10) || 0;
            const payload = await opdCallQueue.buildCallQueueApiPayload(pool, { doctorId, roomId });
            res.json(payload);
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message || 'Server error' });
        }
    });

    app.get('/portal/call-queue', async (req, res) => {
        if (!callQueuePortalAuthenticated(req)) {
            return res.redirect('/portal/call-queue/login');
        }
        try {
            const doctorId = parseInt(req.query.doctor_id, 10) || 0;
            const roomId = parseInt(req.query.room_id, 10) || 0;
            const mode = String(req.query.mode || '');
            const simpleMode = mode === 'simple';
            const focusMode = mode === 'focus';
            const data = await loadOpdCallQueueToday(pool, { doctorId, roomId });
            const { boardRows, highlightIndex } = opdCallQueue.mapQueueToBoardPayload(data);
            const adSlides = simpleMode || focusMode
                ? []
                : (() => {
                    try {
                        return require('../lib/tssfCallQueueAds').TSSF_CALL_QUEUE_ADS || [];
                    } catch (e) {
                        console.warn('call-queue ads module:', e.message);
                        return [];
                    }
                })();
            const hmsWaitingScreen = require('../lib/hmsWaitingScreen');
            const displayConfig = await hmsWaitingScreen.getConfig(pool);
            let boardTitle = focusMode ? 'Now serving' : (simpleMode ? 'Waiting room display' : 'OPD Queue — TSSF SOA');
            if (doctorId) {
                const [[doc]] = await pool.query('SELECT first_name, last_name FROM tbl_employee WHERE id=? LIMIT 1', [doctorId]).catch(() => [[null]]);
                if (doc) boardTitle = `Dr. ${doc.first_name || ''} ${doc.last_name || ''}`.trim();
            } else if (roomId) {
                const [[rm]] = await pool.query('SELECT name, code FROM tbl_consultation_room WHERE id=? LIMIT 1', [roomId]).catch(() => [[null]]);
                if (rm) boardTitle = rm.name || rm.code || boardTitle;
            }
            res.render('portal-call-queue-board', {
                title: boardTitle,
                pageData: {
                  boardRows,
                  highlightIndex,
                  adSlides,
                  simpleMode,
                  focusMode,
                  pollSeconds: focusMode ? 6 : (simpleMode ? 8 : 12),
                  title: boardTitle,
                  displayConfig: {
                    chimeEnabled: parseInt(displayConfig.chime_enabled, 10) !== 0,
                    ttsEnabled: parseInt(displayConfig.tts_enabled, 10) !== 0,
                    welcomeMessage: displayConfig.welcome_message || '',
                  },
                  doctorId,
                  roomId,
                },
            });
        } catch (e) {
            console.error('queue board:', e);
            res.status(500).send('Could not load queue.');
        }
    });

    app.get('/portal/call-queue/launcher', async (req, res) => {
        if (!callQueuePortalAuthenticated(req)) {
            return res.redirect('/portal/call-queue/enter?next=' + encodeURIComponent('/portal/call-queue/launcher'));
        }
        try {
            const { loadCallQueueLauncherData } = require('../lib/opdCallQueueLauncher');
            const facilityId = parseInt(req.session.facilityId, 10) || 1;
            const launcher = await loadCallQueueLauncherData(pool, facilityId);
            res.render('portal-call-queue-launcher', {
                title: 'Lobby displays',
                pageData: { launcher },
            });
        } catch (e) {
            console.error('call-queue launcher:', e);
            res.status(500).send('Could not load lobby launcher.');
        }
    });

    // ── DIRECTOR DAILY DASHBOARD (live, ACL-gated tabs/KPIs/panels) ──
    app.get('/portal/api/director-dashboard', requireAuth, async (req, res) => {
        try {
            const aclLayout = require('../lib/aclLayout');
            const { fetchDirectorDailyDashboard } = require('../lib/directorDailyDashboard');
            const { buildVisibleDashboardModel } = require('../lib/directorDashboardCatalog');
            const { resolveReportRange, defaultRangeForSection } = require('../lib/hmsDirectorReportsPeriod');
            const perms = res.locals.userPerms || [];
            const role = String(req.session.user?.role || '');
            const directorPack = aclLayout.forPortal('director', perms, role) || {};
            const model = buildVisibleDashboardModel(directorPack);
            if (!model.hasShell && !model.tabs.length) {
                return res.status(403).json({ ok: false, error: 'You do not have access to the director dashboard.' });
            }

            const periodKey = String(req.query.period || 'day').toLowerCase();
            const sectionMap = { day: 'daily', week: 'weekly', month: 'monthly' };
            let range = resolveReportRange(req.query);
            if (!range) {
                range = defaultRangeForSection(sectionMap[periodKey] || 'daily');
            }

            const data = await fetchDirectorDailyDashboard(pool, range, {
                aclPack: directorPack,
                revenueStatCodes: model.revenueStats.map((s) => s.code),
            });
            return res.json({ ok: true, ...data });
        } catch (e) {
            console.error('portal director-dashboard:', e);
            return res.status(500).json({ ok: false, error: e.message || 'Failed to load director dashboard' });
        }
    });

    // ── ASSISTANT DIRECTOR DASHBOARD ──
    app.get('/portal/api/assistant-director-dashboard', requireAuth, async (req, res) => {
        try {
            const aclLayout = require('../lib/aclLayout');
            const { fetchAssistantDirectorDashboard } = require('../lib/assistantDirectorDashboard');
            const { buildVisibleDashboardModel } = require('../lib/assistantDirectorDashboardCatalog');
            const { resolveReportRange, defaultRangeForSection } = require('../lib/hmsDirectorReportsPeriod');
            const perms = res.locals.userPerms || [];
            const role = String(req.session.user?.role || '');
            const pack = aclLayout.forPortal('assistant_director', perms, role) || {};
            const model = buildVisibleDashboardModel(pack);
            if (!model.hasShell && !model.tabs.length) {
                return res.status(403).json({ ok: false, error: 'You do not have access to the assistant director dashboard.' });
            }
            let range = resolveReportRange(req.query);
            if (!range) range = defaultRangeForSection('daily');
            const data = await fetchAssistantDirectorDashboard(pool, range, { aclPack: pack });
            return res.json({ ok: true, ...data });
        } catch (e) {
            console.error('portal assistant-director-dashboard:', e);
            return res.status(500).json({ ok: false, error: e.message || 'Failed to load assistant director dashboard' });
        }
    });

    // ── FRONT DESK DASHBOARD ──
    app.get('/portal/api/front-desk-dashboard', requireAuth, async (req, res) => {
        try {
            const aclLayout = require('../lib/aclLayout');
            const { fetchFrontDeskDashboard } = require('../lib/frontDeskDashboard');
            const { buildVisibleDashboardModel } = require('../lib/frontDeskDashboardCatalog');
            const perms = res.locals.userPerms || [];
            const role = String(req.session.user?.role || '');
            const pack = aclLayout.forPortal('front_desk', perms, role) || {};
            const model = buildVisibleDashboardModel(pack);
            if (!model.hasShell && !model.tabs.length) {
                return res.status(403).json({ ok: false, error: 'You do not have access to the front desk dashboard.' });
            }
            const data = await fetchFrontDeskDashboard(pool, { aclPack: pack });
            return res.json(data);
        } catch (e) {
            console.error('portal front-desk-dashboard:', e);
            return res.status(500).json({ ok: false, error: e.message || 'Failed to load front desk dashboard' });
        }
    });

    // ── CASHIER DASHBOARD ──
    app.get('/portal/api/cashier-dashboard', requireAuth, async (req, res) => {
        try {
            const aclLayout = require('../lib/aclLayout');
            const { fetchCashierDashboard, resolveCashierScope } = require('../lib/cashierDashboard');
            const { buildVisibleDashboardModel } = require('../lib/cashierDashboardCatalog');
            const perms = res.locals.userPerms || [];
            const role = String(req.session.user?.role || '');
            const pack = aclLayout.forPortal('cashier', perms, role) || {};
            const model = buildVisibleDashboardModel(pack);
            if (!model.hasShell && !model.tabs.length) {
                return res.status(403).json({ ok: false, error: 'You do not have access to the cashier dashboard.' });
            }
            const scope = resolveCashierScope(req, res);
            const data = await fetchCashierDashboard(pool, { aclPack: pack, scope });
            return res.json(data);
        } catch (e) {
            console.error('portal cashier-dashboard:', e);
            return res.status(500).json({ ok: false, error: e.message || 'Failed to load cashier dashboard' });
        }
    });

    // ── SECRETARY DASHBOARD ──
    app.get('/portal/api/secretary-dashboard', requireAuth, async (req, res) => {
        try {
            const aclLayout = require('../lib/aclLayout');
            const { fetchSecretaryDashboard } = require('../lib/secretaryDashboard');
            const { buildVisibleDashboardModel } = require('../lib/secretaryDashboardCatalog');
            const perms = res.locals.userPerms || [];
            const role = String(req.session.user?.role || '');
            const pack = aclLayout.forPortal('secretary', perms, role) || {};
            const model = buildVisibleDashboardModel(pack);
            if (!model.hasShell && !model.tabs.length) {
                return res.status(403).json({ ok: false, error: 'You do not have access to the secretary dashboard.' });
            }
            const data = await fetchSecretaryDashboard(pool, { aclPack: pack });
            return res.json(data);
        } catch (e) {
            console.error('portal secretary-dashboard:', e);
            return res.status(500).json({ ok: false, error: e.message || 'Failed to load secretary dashboard' });
        }
    });

    // ── HMS DAILY DASHBOARD API (granular ACL-gated routes) ──
    const { mountDailyDashboardRoutes } = require('../lib/hmsDailyDashboard');
    mountDailyDashboardRoutes(app, {
        pool,
        requireAuth,
        getDirectorPack: (req, res) => {
            const aclLayout = require('../lib/aclLayout');
            const perms = res.locals.userPerms || [];
            const role = String(req.session.user?.role || '');
            return aclLayout.forPortal('director', perms, role) || {};
        },
    });

    // ── DIRECTOR ANNUAL SCORECARD (live, ACL-gated domains/panels) ──
    app.get('/portal/api/director-annual-scorecard', requireAuth, async (req, res) => {
        try {
            const aclLayout = require('../lib/aclLayout');
            const { fetchDirectorAnnualScorecard, resolveYear } = require('../lib/directorAnnualScorecard');
            const { buildVisibleAnnualModel } = require('../lib/directorAnnualScorecardCatalog');
            const perms = res.locals.userPerms || [];
            const role = String(req.session.user?.role || '');
            const directorPack = aclLayout.forPortal('director', perms, role) || {};
            const model = buildVisibleAnnualModel(directorPack);
            if (!model.hasShell && !model.panels.length && !model.domains.length) {
                return res.status(403).json({ ok: false, error: 'You do not have access to the annual scorecard.' });
            }

            const range = resolveYear(req.query);
            const data = await fetchDirectorAnnualScorecard(pool, range, { aclPack: directorPack });
            return res.json({ ok: true, ...data });
        } catch (e) {
            console.error('portal director-annual-scorecard:', e);
            return res.status(500).json({ ok: false, error: e.message || 'Failed to load annual scorecard' });
        }
    });

    // ── DIRECTOR MONTHLY P&L (live, ACL-gated KPIs/panels) ──
    app.get('/portal/api/director-monthly-pl', requireAuth, async (req, res) => {
        try {
            const aclLayout = require('../lib/aclLayout');
            const { fetchDirectorMonthlyPL, resolveMonthRange } = require('../lib/directorMonthlyPL');
            const { buildVisibleMonthlyModel } = require('../lib/directorMonthlyPLCatalog');
            const perms = res.locals.userPerms || [];
            const role = String(req.session.user?.role || '');
            const directorPack = aclLayout.forPortal('director', perms, role) || {};
            const model = buildVisibleMonthlyModel(directorPack);
            if (!model.hasShell && !model.kpis.length && !model.panels.length) {
                return res.status(403).json({ ok: false, error: 'You do not have access to the monthly P&L report.' });
            }

            const range = resolveMonthRange(req.query);
            const data = await fetchDirectorMonthlyPL(pool, range, { aclPack: directorPack });
            return res.json({ ok: true, ...data });
        } catch (e) {
            console.error('portal director-monthly-pl:', e);
            return res.status(500).json({ ok: false, error: e.message || 'Failed to load monthly P&L report' });
        }
    });

    app.get('/portal/api/director-monthly-pl/costs', requireAuth, async (req, res) => {
        try {
            const aclLayout = require('../lib/aclLayout');
            const { buildVisibleMonthlyModel } = require('../lib/directorMonthlyPLCatalog');
            const { fetchMonthlyCostsBundle } = require('../lib/directorPLManualCosts');
            const perms = res.locals.userPerms || [];
            const role = String(req.session.user?.role || '');
            const directorPack = aclLayout.forPortal('director', perms, role) || {};
            const model = buildVisibleMonthlyModel(directorPack);
            if (!model.hasShell && !model.kpis.length) {
                return res.status(403).json({ ok: false, error: 'You do not have access to monthly P&L costs.' });
            }
            const month = String(req.query.month || '').trim() || new Date().toISOString().slice(0, 7);
            const data = await fetchMonthlyCostsBundle(pool, month);
            return res.json({ ok: true, ...data });
        } catch (e) {
            console.error('portal director-monthly-pl/costs GET:', e);
            return res.status(e.status || 500).json({ ok: false, error: e.message || 'Failed to load cost entries' });
        }
    });

    app.put('/portal/api/director-monthly-pl/costs', requireAuth, async (req, res) => {
        try {
            const aclLayout = require('../lib/aclLayout');
            const { buildVisibleMonthlyModel } = require('../lib/directorMonthlyPLCatalog');
            const { saveMonthlyCosts } = require('../lib/directorPLManualCosts');
            const perms = res.locals.userPerms || [];
            const role = String(req.session.user?.role || '');
            if (!perms.includes('director.monthly.costs.write') && !perms.includes('director.monthly.read') && !perms.includes('*')) {
                return res.status(403).json({ ok: false, error: 'You do not have permission to edit monthly P&L costs.' });
            }
            const directorPack = aclLayout.forPortal('director', perms, role) || {};
            const model = buildVisibleMonthlyModel(directorPack);
            if (!model.hasShell && !model.kpis.length) {
                return res.status(403).json({ ok: false, error: 'You do not have access to monthly P&L costs.' });
            }
            const month = String(req.query.month || req.body?.month || '').trim();
            if (!month) return res.status(400).json({ ok: false, error: 'month query (YYYY-MM) is required.' });
            const userId = req.session?.user?.id || null;
            const data = await saveMonthlyCosts(pool, month, req.body || {}, userId);
            return res.json({ ok: true, ...data });
        } catch (e) {
            console.error('portal director-monthly-pl/costs PUT:', e);
            return res.status(e.status || 500).json({ ok: false, error: e.message || 'Failed to save cost entries' });
        }
    });

    // ── DIRECTOR WEEKLY REPORT (live, ACL-gated KPIs/panels) ──
    app.get('/portal/api/director-weekly-report', requireAuth, async (req, res) => {
        try {
            const aclLayout = require('../lib/aclLayout');
            const { fetchDirectorWeeklyReport, resolveWeekRange } = require('../lib/directorWeeklyReport');
            const { buildVisibleWeeklyModel } = require('../lib/directorWeeklyReportCatalog');
            const perms = res.locals.userPerms || [];
            const role = String(req.session.user?.role || '');
            const directorPack = aclLayout.forPortal('director', perms, role) || {};
            const model = buildVisibleWeeklyModel(directorPack);
            if (!model.hasShell && !model.kpis.length && !model.panels.length) {
                return res.status(403).json({ ok: false, error: 'You do not have access to the weekly report.' });
            }

            const range = resolveWeekRange(req.query);
            const data = await fetchDirectorWeeklyReport(pool, range, { aclPack: directorPack });
            return res.json({ ok: true, ...data });
        } catch (e) {
            console.error('portal director-weekly-report:', e);
            return res.status(500).json({ ok: false, error: e.message || 'Failed to load weekly report' });
        }
    });

    // ── DIRECTOR CASHIER REVENUE (live, ACL-gated per card) ──
    app.get('/portal/api/director-revenue', requireAuth, async (req, res) => {
        try {
            const aclLayout = require('../lib/aclLayout');
            const { fetchDirectorCashierRevenue } = require('../lib/directorCashierRevenue');
            const { resolveReportRange, defaultRangeForSection } = require('../lib/hmsDirectorReportsPeriod');
            const perms = res.locals.userPerms || [];
            const role = String(req.session.user?.role || '');
            const directorPack = aclLayout.forPortal('director', perms, role) || {};
            const revenueStatItems = directorPack.stats || [];
            const showSection = (directorPack.sections || []).some((s) => s.code === 'dir.section.cashier_revenue');
            if (!showSection && !revenueStatItems.length) {
                return res.status(403).json({ ok: false, error: 'You do not have access to director revenue data.' });
            }

            const periodKey = String(req.query.period || 'day').toLowerCase();
            const sectionMap = { day: 'daily', week: 'weekly', month: 'monthly' };
            let range = resolveReportRange(req.query);
            if (!range) {
                range = defaultRangeForSection(sectionMap[periodKey] || 'daily');
            }

            const data = await fetchDirectorCashierRevenue(pool, range, {
                visibleStatCodes: revenueStatItems.map((s) => s.code),
            });
            return res.json({ ok: true, ...data });
        } catch (e) {
            console.error('portal director-revenue:', e);
            return res.status(500).json({ ok: false, error: e.message || 'Failed to load revenue data' });
        }
    });

    // ── EXECUTIVE HUB STATS (live refresh for director / management portals) ──
    app.get('/portal/api/hub-stats', requireAuth, async (req, res) => {
        try {
            const hmsHub = require('../lib/hmsClinicalHub');
            const stats = await hmsHub.getHubStats(pool);
            res.json({ ok: true, stats });
        } catch (e) {
            console.error('portal hub-stats:', e);
            res.status(500).json({ ok: false, error: e.message || 'Failed to load hub stats' });
        }
    });

    // ── GENERIC PORTAL HUB (custom portals from Access & Workflow) ──
    app.get('/portal/hub/:portalCode', requireAuth, async (req, res) => {
        const portalRegistry = require('../lib/portalRegistry');
        const portalOverviewPolicy = require('../lib/portalOverviewPolicy');
        const hmsHub = require('../lib/hmsClinicalHub');
        const rawSlug = portalRegistry.normalizePortalCode(req.params.portalCode);
        const code = portalRegistry.resolvePortalCode(req.params.portalCode);
        if (!code) {
            return res.redirect('/profile?err=' + encodeURIComponent(flashT(res, 'portal.invalid')));
        }
        const dedicated = portalOverviewPolicy.dedicatedPortalRedirect(code);
        if (dedicated) {
            return res.redirect(dedicated);
        }
        if (String(code || '').toLowerCase() === 'cashier') {
            return res.redirect(302, '/cashier?page=dashboard');
        }
        let rows = await pool.query(
            `SELECT code, label, home_url, icon, color, description, enabled
               FROM tbl_acl_portal WHERE code=? LIMIT 1`,
            [code]
        ).then(([r]) => r).catch(() => []);
        if (!rows.length && rawSlug !== code) {
            rows = await pool.query(
                `SELECT code, label, home_url, icon, color, description, enabled
                   FROM tbl_acl_portal WHERE code=? LIMIT 1`,
                [rawSlug]
            ).then(([r]) => r).catch(() => []);
        }
        if (!rows.length) {
            return res.redirect('/profile?err=' + encodeURIComponent(flashT(res, 'portal.not_found')));
        }
        const meta = rows[0];
        const portalCode = String(meta.code || code);
        if (meta.enabled === 0) {
            return res.redirect('/profile?err=' + encodeURIComponent(flashT(res, 'portal.disabled')));
        }
        const role = String(req.session.user?.role || '');
        if (role !== '1' && role !== '99') {
            const [ok] = await pool.query(
                'SELECT 1 FROM tbl_acl_role_portal WHERE role=? AND portal_code IN (?, ?) LIMIT 1',
                [role, portalCode, code]
            ).catch(() => [[]]);
            if (!ok.length) {
                return res.redirect(
                    '/profile?err=' + encodeURIComponent(flashT(res, 'portal.no_access'))
                );
            }
        }
        const uid = req.session.userId || req.session.user?.id || 0;
        const meRows = await sq(
            pool,
            'SELECT first_name, last_name, primary_department, specialisation FROM tbl_employee WHERE id=? LIMIT 1',
            [uid]
        );
        const me = meRows[0] || {};

        const showHmsHub = portalOverviewPolicy.shouldShowHospitalOverview(portalCode, role, {
            homePortalCode: (() => {
                try {
                    const aclLayout = require('../lib/aclLayout');
                    return aclLayout.homePortal(role, { specialisation: me.specialisation || null });
                } catch (_) {
                    return null;
                }
            })(),
        });

        let stats = null;
        let todayVisits = [];
        let hubStatItems = [];
        let hubModuleCards = [];
        let showOpdToday = false;
        if (showHmsHub) {
            try {
                const hubData = await hmsHub.loadHubPageData(pool);
                stats = hubData.stats;
                todayVisits = hubData.todayVisits;
            } catch (_) { /* hub widgets optional */ }
        }

        // Custom hub portals reuse the clinical tile catalog (nur.tile.*, doc.tile.*, …).
        const tilePortalMap = {
            doctor: 'doctors',
            nurse: 'nursing',
            nurse_station: 'nursing',
            labtech: 'laboratory',
            lab_tech: 'laboratory',
            cashier: 'cashier',
            front_desk: 'front_desk',
            doctors: 'doctors',
            nursing: 'nursing',
            laboratory: 'laboratory',
            pharmacy: 'pharmacy',
            radiology: 'radiology',
            accountant: 'accountant',
            director: 'director',
            assistant_director: 'assistant_director',
            secretary: 'secretary',
            inventory: 'inventory',
            procurement: 'procurement',
            hr: 'hr',
            emergency: 'emergency',
        };
        const tilePortal = tilePortalMap[portalCode] || tilePortalMap[code] || portalCode;

        let tiles = [];
        let showDailyDashboard = false;
        let showWeeklyReport = false;
        let showMonthlyReport = false;
        let showAnnualScorecard = false;
        let showStaffDashboard = false;
        let staffDashboardProfile = '';
        let staffDashboardTabs = [];
        let staffDashboardKpis = [];
        let staffDashboardPanels = [];
        let dashboardTabs = [];
        let dashboardKpis = [];
        let dashboardPanels = [];
        let weeklyKpis = [];
        let weeklyPanels = [];
        let monthlyKpis = [];
        let monthlyPanels = [];
        let annualPanels = [];
        let annualDomains = [];
        try {
            const aclLayout = require('../lib/aclLayout');
            const perms = res.locals.userPerms || [];
            tiles = (aclLayout.forPortal(tilePortal, perms, role) || {}).tiles || [];
            const isDirectorPortal = portalCode === 'director' || code === 'director';
            if (isDirectorPortal) {
                const { buildVisibleDashboardModel } = require('../lib/directorDashboardCatalog');
                const { buildVisibleWeeklyModel } = require('../lib/directorWeeklyReportCatalog');
                const { buildVisibleMonthlyModel } = require('../lib/directorMonthlyPLCatalog');
                const { buildVisibleAnnualModel } = require('../lib/directorAnnualScorecardCatalog');
                const directorPack = aclLayout.forPortal('director', perms, role) || {};
                const dashModel = buildVisibleDashboardModel(directorPack);
                const weeklyModel = buildVisibleWeeklyModel(directorPack);
                const monthlyModel = buildVisibleMonthlyModel(directorPack);
                const annualModel = buildVisibleAnnualModel(directorPack);
                showDailyDashboard = dashModel.hasShell && dashModel.tabs.length > 0;
                showWeeklyReport = weeklyModel.hasShell && (weeklyModel.kpis.length > 0 || weeklyModel.panels.length > 0);
                showMonthlyReport = monthlyModel.hasShell && (monthlyModel.kpis.length > 0 || monthlyModel.panels.length > 0);
                showAnnualScorecard = annualModel.hasShell && (annualModel.panels.length > 0 || annualModel.domains.length > 0);
                dashboardTabs = dashModel.tabs;
                dashboardKpis = dashModel.kpis;
                dashboardPanels = dashModel.panels;
                weeklyKpis = weeklyModel.kpis;
                weeklyPanels = weeklyModel.panels;
                monthlyKpis = monthlyModel.kpis;
                monthlyPanels = monthlyModel.panels;
                annualPanels = annualModel.panels;
                annualDomains = annualModel.domains;
            }

            const staffProfileMap = {
                assistant_director: 'assistant_director',
                front_desk: 'front_desk',
                secretary: 'secretary',
                cashier: 'cashier',
            };
            const staffPortalKey = staffProfileMap[portalCode] || staffProfileMap[code] || null;
            if (staffPortalKey) {
                const { buildVisibleDashboardModel: buildAssistantDirectorModel } = require('../lib/assistantDirectorDashboardCatalog');
                const { buildVisibleDashboardModel: buildFrontDeskModel } = require('../lib/frontDeskDashboardCatalog');
                const { buildVisibleDashboardModel: buildSecretaryModel } = require('../lib/secretaryDashboardCatalog');
                const { buildVisibleDashboardModel: buildCashierModel } = require('../lib/cashierDashboardCatalog');
                const buildByKey = {
                    assistant_director: buildAssistantDirectorModel,
                    front_desk: buildFrontDeskModel,
                    secretary: buildSecretaryModel,
                    cashier: buildCashierModel,
                };
                const staffPack = aclLayout.forPortal(staffPortalKey, perms, role) || {};
                const staffModel = buildByKey[staffPortalKey](staffPack);
                showStaffDashboard = staffModel.hasShell && (staffModel.tabs.length > 0 || staffModel.kpis.length > 0);
                staffDashboardProfile = staffPortalKey;
                staffDashboardTabs = staffModel.tabs;
                staffDashboardKpis = staffModel.kpis;
                staffDashboardPanels = staffModel.panels;
            }
            if (showHmsHub) {
                const hmsPack = aclLayout.forPortal('hms', perms, role) || {};
                hubStatItems = hmsPack.stats || [];
                hubModuleCards = hmsPack.cards || [];
                showOpdToday = (hmsPack.sections || []).some((s) => s.code === 'hub.panel.opd_today');
            }
        } catch (_) { /* optional */ }

        const heroActions = [];
        if (res.locals.uiVisible && res.locals.uiVisible('sb.guides')) {
            heroActions.push({
                href: '/workflow-guides',
                label: 'Workflow guides',
                labelKey: 'portal_shared.workflow_guides',
                variant: 'outline',
            });
        }
        if (showHmsHub) {
            heroActions.push({
                href: '/hms',
                label: 'HMS Hub',
                labelKey: 'nav.hms_hub',
                variant: 'light',
            });
        }

        const visitingVisit =
            portalCode === 'doctor' || code === 'doctor'
                ? await loadVisitingVisitForSession(req)
                : null;

        const portalSurfaceBodyClass =
            { front_desk: ' hms-body--front-desk', nursing: ' hms-body--portal', cashier: ' hms-body--cashier' }[portalCode]
            || { front_desk: ' hms-body--front-desk', nursing: ' hms-body--portal', cashier: ' hms-body--cashier' }[code]
            || ' hms-body--portal';

        res.render('portal-generic', {
            title: meta.label + ' — ZAIZENS',
            portal: tilePortal,
            portalMeta: meta,
            portalSurfaceBodyClass,
            me,
            showHmsHub,
            stats,
            todayVisits,
            pageData: {
                portalMeta: meta,
                me,
                tiles,
                heroActions,
                showHmsHub,
                hubStats: stats,
                hubStatItems,
                hubModuleCards,
                showDailyDashboard,
                showWeeklyReport,
                showMonthlyReport,
                showAnnualScorecard,
                dashboardTabs,
                dashboardKpis,
                dashboardPanels,
                weeklyKpis,
                weeklyPanels,
                monthlyKpis,
                monthlyPanels,
                annualPanels,
                annualDomains,
                initialReport: String(req.query.report || '').toLowerCase(),
                showStaffDashboard,
                staffDashboardProfile,
                staffDashboardTabs,
                staffDashboardKpis,
                staffDashboardPanels,
                showOpdToday,
                todayVisits,
                visitingVisit,
                flash: translateFlashErr(res, req.query.msg, req.query.msgKey, req.query),
                error: translateFlashErr(res, req.query.err, req.query.errKey, req.query),
            },
            flash: translateFlashErr(res, req.query.msg, req.query.msgKey, req.query),
            error: translateFlashErr(res, req.query.err, req.query.errKey, req.query),
        });
    });

}; // end module.exports
