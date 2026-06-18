'use strict';

const doctorErAlerts = require('../lib/doctorErAlerts');
const opdDoctorMedAlerts = require('../lib/opdDoctorMedAlerts');
const { pageTitle } = require('../lib/pageTitle');

function sortByCreatedDesc(items) {
  return (items || []).slice().sort((a, b) => {
    const ta = a && a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b && b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
}

function tagEr(items) {
  return (items || []).map((a) => ({ ...a, inbox_kind: 'er' }));
}

function tagOpd(items) {
  return (items || []).map((a) => ({ ...a, inbox_kind: 'opd' }));
}

module.exports = function doctorErAlertsRoutes(app, pool, requireAuth) {
  app.get('/doctor/er-alerts', requireAuth, (req, res) => {
    res.redirect(301, '/portal/doctor/er-alerts');
  });

  app.get('/api/doctor-er-alerts', requireAuth, async (req, res) => {
    try {
      const uid = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
      if (uid < 1) return res.status(401).json({ ok: false, error: 'Unauthorized' });
      const er = tagEr(await doctorErAlerts.listUnackedForDoctor(pool, uid, 35));
      const opd = tagOpd(await opdDoctorMedAlerts.listUnackedForDoctor(pool, uid, 35));
      const items = sortByCreatedDesc([...er, ...opd]);
      return res.json({ ok: true, items });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || 'Server error' });
    }
  });

  app.post('/api/doctor-opd-med-alerts/:id/ack', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10) || 0;
      const uid = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
      if (id < 1 || uid < 1) return res.status(400).json({ ok: false });

      const wantsJson =
        (req.headers.accept || '').includes('application/json') ||
        String(req.body._format || '') === 'json';
      const htmlBackRaw = String(req.body._return || '').trim();
      const htmlBack = htmlBackRaw.startsWith('/') && !htmlBackRaw.startsWith('//') ? htmlBackRaw : '';

      const arow = await opdDoctorMedAlerts.getById(pool, id);
      if (!arow) {
        if (htmlBack) return res.redirect(htmlBack + '?err=Alert+not+found');
        return res.status(404).json({ ok: false, error: 'Not found' });
      }

      const target = parseInt(arow.target_doctor_id, 10) || 0;
      if (target > 0 && target !== uid) {
        if (htmlBack) return res.redirect(htmlBack + '?err=Not+your+alert');
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }

      await opdDoctorMedAlerts.acknowledge(pool, id, uid);

      const action = String(req.body.action || '').trim().toLowerCase();
      if (action === 'open_treatment' && arow.opd_visit_id) {
        return res.redirect('/opd/treatment/' + arow.opd_visit_id);
      }
      if (htmlBack) return res.redirect(htmlBack + '?msg=Alert+dismissed');
      if (wantsJson) return res.json({ ok: true });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || 'Server error' });
    }
  });

  app.post('/api/doctor-er-alerts/:id/ack', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10) || 0;
      const uid = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
      if (id < 1 || uid < 1) return res.status(400).json({ ok: false });

      const wantsJson =
        (req.headers.accept || '').includes('application/json') ||
        String(req.body._format || '') === 'json';
      const htmlBackRaw = String(req.body._return || '').trim();
      const htmlBack = htmlBackRaw.startsWith('/') && !htmlBackRaw.startsWith('//') ? htmlBackRaw : '';

      const [arows] = await pool
        .query('SELECT * FROM tbl_doctor_er_alert WHERE id=? LIMIT 1', [id])
        .catch(() => [[]]);
      const arow = arows && arows[0];
      if (!arow) {
        if (htmlBack) return res.redirect(htmlBack + '?err=Alert+not+found');
        return res.status(404).json({ ok: false, error: 'Not found' });
      }

      const target = parseInt(arow.target_doctor_id, 10) || 0;
      if (target > 0 && target !== uid) {
        if (htmlBack) return res.redirect(htmlBack + '?err=Not+your+alert');
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }

      await doctorErAlerts.acknowledge(pool, id, uid);

      const action = String(req.body.action || '').trim().toLowerCase();
      if (action === 'open_visit' && arow.opd_visit_id) {
        return res.redirect('/emergency/visit/' + arow.opd_visit_id);
      }
      if (htmlBack) return res.redirect(htmlBack + '?msg=Alert+dismissed');
      if (wantsJson) return res.json({ ok: true });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || 'Server error' });
    }
  });

  app.get('/portal/doctor/er-alerts', requireAuth, async (req, res) => {
    try {
      const uid = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
      const unackedEr = tagEr(await doctorErAlerts.listUnackedForDoctor(pool, uid, 80));
      const unackedOpd = tagOpd(await opdDoctorMedAlerts.listUnackedForDoctor(pool, uid, 80));
      const recentEr = tagEr(await doctorErAlerts.listAllRecentForDoctor(pool, uid, 60));
      const recentOpd = tagOpd(await opdDoctorMedAlerts.listAllRecentForDoctor(pool, uid, 60));
      res.render('doctor-er-inbox', {
        title: pageTitle(res, 'document_titles.doctor_er_alerts', 'Doctor · Alerts inbox'),
        pageData: {
          unacked: sortByCreatedDesc([...unackedEr, ...unackedOpd]),
          recent: sortByCreatedDesc([...recentEr, ...recentOpd]),
          flash: req.query.msg || null,
          error: req.query.err || null,
        },
      });
    } catch (e) {
      res.status(500).send('Load failed: ' + (e.message || 'error'));
    }
  });
};
