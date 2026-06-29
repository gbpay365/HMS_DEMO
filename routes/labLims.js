'use strict';

const labLims = require('../lib/labLims');
const ensureFacilityRow = require('../lib/ensureFacilityRow');

function labOdooLocals(extra) {
  return Object.assign({ laboratoryOdooApp: true }, extra || {});
}

module.exports = function labLimsRoutes(app, pool, requireAuth, requirePerm) {
  const labRead = requirePerm('lab.read', 'lab.write', 'clinical.read', 'clinical.write', 'nursing.read');
  const labWrite = requirePerm('lab.write', 'clinical.write');

  app.get('/lims', requireAuth, labRead, async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const [[stats]] = await pool.query(`
        SELECT
          SUM(CASE WHEN DATE(scheduled_date)=? AND status NOT IN ('done','cancelled') THEN 1 ELSE 0 END) AS today_open,
          SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) AS submitted,
          SUM(CASE WHEN status='in_progress' OR status='accepted' THEN 1 ELSE 0 END) AS in_progress,
          (SELECT COUNT(*) FROM tbl_lab_sample WHERE status='collected') AS samples_collected
        FROM tbl_lab_request`).catch(() => [[{}]]);
      res.render('lims-hub', labOdooLocals({
        title: 'Laboratory (LIMS) — ZAIZENS',
        stats: stats || {},
        flash: req.query.msg || null,
        error: req.query.err || null,
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/lims/requests', requireAuth, labRead, async (req, res) => {
    const filter = String(req.query.filter || 'today');
    let where = '1=1';
    const params = [];
    const today = new Date().toISOString().split('T')[0];
    if (filter === 'today') {
      where = 'DATE(r.scheduled_date) = ? AND r.status NOT IN (\'done\',\'cancelled\')';
      params.push(today);
    } else if (filter === 'pending') {
      where = "r.status IN ('submitted','accepted','in_progress')";
    } else if (filter === 'done') {
      where = "r.status = 'done'";
    } else if (filter === 'all') {
      where = '1=1';
    }
    try {
      const [rows] = await pool.query(
        `SELECT r.id, r.request_no, r.status, r.scheduled_date, r.scheduled_time,
                p.first_name, p.last_name,
                (SELECT COUNT(*) FROM tbl_lab_request_line l WHERE l.request_id=r.id) AS line_count
         FROM tbl_lab_request r
         JOIN tbl_patient p ON p.id = r.patient_id
         WHERE ${where}
         ORDER BY r.scheduled_date DESC, r.id DESC
         LIMIT 200`,
        params
      );
      res.render('lims-requests', labOdooLocals({ title: 'Lab requests', rows: rows || [], filter, flash: req.query.msg, error: req.query.err }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/lims/request/new', requireAuth, labWrite, async (req, res) => {
    try {
      const code = String(req.query.code || '').trim().toUpperCase();
      if (!code) {
        return res.redirect('/lims?err=' + encodeURIComponent('Validate the LAB payment code before creating a new request.'));
      }
      const fid = Math.max(1, parseInt(String(req.session.facilityId || 1), 10) || 1);
      const { authorizeServiceCodeValidate } = require('../lib/authorizeLabTest');
      const { isPaymentCodeFormat } = require('../lib/paymentTicketCode');
      if (!isPaymentCodeFormat(code, 'LAB')) {
        return res.redirect('/lims?err=' + encodeURIComponent('Format: LAB-####-XXXXXXXX (e.g. LAB-4829-K7HM3R9Q).'));
      }
      const auth = await authorizeServiceCodeValidate(pool, code, fid);
      if (!auth.ok) {
        return res.redirect('/lims?err=' + encodeURIComponent(auth.error || 'Code not valid for laboratory work.'));
      }
      if (auth.meta && auth.meta.kind && auth.meta.kind !== 'laboratory') {
        return res.redirect('/lims?err=' + encodeURIComponent(`Code belongs to ${auth.meta.kind}, not laboratory.`));
      }
      const prefPatientId = parseInt(String(auth.meta?.patientId || ''), 10) || null;
      const [patients] = await pool.query(
        `SELECT id, first_name, last_name FROM tbl_patient WHERE status=1 ORDER BY first_name LIMIT 500`
      ).catch(() => [[]]);
      const [doctors] = await pool.query(
        `SELECT id, first_name, last_name FROM tbl_employee WHERE status=1 ORDER BY first_name LIMIT 300`
      ).catch(() => [[]]);
      const [centers] = await pool.query('SELECT id, name FROM tbl_lab_collection_center WHERE active=1 ORDER BY name').catch(() => [[]]);
      const [groups] = await pool.query('SELECT id, code, name FROM tbl_lab_test_group WHERE active=1 ORDER BY name').catch(() => [[]]);
      const [catalog] = await pool.query(
        'SELECT id, code, name, category FROM tbl_lab_catalog WHERE active=1 ORDER BY sort_order, name'
      ).catch(() => [[]]);
      const today = new Date().toISOString().split('T')[0];
      res.render('lims-request-new', {
        title: 'New lab request',
        patients: patients || [],
        doctors: doctors || [],
        centers: centers || [],
        groups: groups || [],
        catalog: catalog || [],
        today,
        validatedCode: code,
        prefPatientId,
        flash: null,
        error: req.query.err,
      });
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.post('/lims/request', requireAuth, labWrite, async (req, res) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const validatedCode = String(req.body.validated_code || '').trim().toUpperCase();
      if (!validatedCode) throw new Error('Payment code validation is required.');
      const fid = await ensureFacilityRow(pool, req.session.facilityId || 1);
      const { authorizeServiceCodeValidate } = require('../lib/authorizeLabTest');
      const auth = await authorizeServiceCodeValidate(pool, validatedCode, fid);
      if (!auth.ok) throw new Error(auth.error || 'Service code not valid.');
      if (auth.meta && auth.meta.kind && auth.meta.kind !== 'laboratory') {
        throw new Error(`Code belongs to ${auth.meta.kind}, not laboratory.`);
      }
      const patientId = parseInt(req.body.patient_id, 10) || 0;
      if (patientId < 1) throw new Error('Patient is required');
      const authPatientId = parseInt(String(auth.meta?.patientId || ''), 10) || 0;
      if (authPatientId > 0 && patientId !== authPatientId) {
        throw new Error('Patient does not match the validated payment code.');
      }
      const uid = req.session.userId || req.session.user?.id || null;
      const requestNo = await labLims.nextRequestNo(conn);
      const scheduledDate = req.body.scheduled_date || new Date().toISOString().split('T')[0];
      const groupId = parseInt(req.body.test_group_id, 10) || null;

      const [insReq] = await conn.query(
        `INSERT INTO tbl_lab_request
         (facility_id, request_no, patient_id, prescribing_doctor_id, collection_center_id, test_group_id,
          scheduled_date, scheduled_time, is_group_request, status, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          fid,
          requestNo,
          patientId,
          parseInt(req.body.prescribing_doctor_id, 10) || null,
          parseInt(req.body.collection_center_id, 10) || null,
          groupId,
          scheduledDate,
          req.body.scheduled_time || null,
          req.body.is_group_request === '1' ? 1 : 0,
          'submitted',
          (req.body.notes || '').trim() || null,
          uid,
        ]
      );
      const requestId = insReq.insertId;

      let lineDefs = [];
      if (groupId) {
        lineDefs = await labLims.getGroupLines(conn, groupId);
      }
      const catalogIds = Array.isArray(req.body.catalog_id)
        ? req.body.catalog_id
        : req.body.catalog_id
          ? [req.body.catalog_id]
          : [];
      if (catalogIds.length) {
        const [catRows] = await conn.query(
          `SELECT id, name FROM tbl_lab_catalog WHERE id IN (${catalogIds.map(() => '?').join(',')})`,
          catalogIds.map((id) => parseInt(id, 10))
        );
        for (const c of catRows || []) {
          if (!lineDefs.find((l) => l.catalog_id === c.id)) {
            lineDefs.push({ catalog_id: c.id, test_name: c.name, template_test_id: null, sort_order: 99 });
          }
        }
      }
      if (!lineDefs.length) throw new Error('Select a test group or at least one test');

      let ord = 0;
      for (const line of lineDefs) {
        const lrId = await labLims.createLabResultForLine(conn, {
          facilityId: fid,
          patientId,
          testName: line.test_name,
          referredById: parseInt(req.body.prescribing_doctor_id, 10) || null,
          appointmentDate: scheduledDate,
          notes: `LIMS request ${requestNo}`,
          createdBy: uid,
        });
        await conn.query(
          `INSERT INTO tbl_lab_request_line
           (request_id, catalog_id, test_name, template_test_id, lab_result_id, line_status, sort_order)
           VALUES (?,?,?,?,?,'pending',?)`,
          [requestId, line.catalog_id || null, line.test_name, line.template_test_id || null, lrId, ord++]
        );
      }

      await conn.commit();
      res.redirect(`/lims/request/${requestId}?msg=Lab+request+created`);
    } catch (e) {
      await conn.rollback();
      res.redirect('/lims?err=' + encodeURIComponent(e.message));
    } finally {
      conn.release();
    }
  });

  app.get('/lims/request/:id', requireAuth, labRead, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    try {
      const detail = await labLims.loadRequestDetail(pool, id);
      if (!detail) return res.redirect('/lims/requests?err=Request+not+found');
      const [sampleTypes] = await pool.query('SELECT id, name FROM tbl_lab_sample_type WHERE active=1 ORDER BY sort_order').catch(() => [[]]);
      const tab = String(req.query.tab || 'workflow');
      res.render('lims-request-detail', {
        title: `Lab request ${detail.req.request_no || id}`,
        ...detail,
        sampleTypes: sampleTypes || [],
        tab,
        flash: req.query.msg,
        error: req.query.err,
      });
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.post('/lims/request/:id/accept', requireAuth, labWrite, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    await pool.query(
      `UPDATE tbl_lab_request SET status='accepted', accepted_at=NOW() WHERE id=? AND status='submitted'`,
      [id]
    );
    res.redirect(`/lims/request/${id}?msg=Request+accepted`);
  });

  app.post('/lims/request/:id/in-progress', requireAuth, labWrite, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    await pool.query(`UPDATE tbl_lab_request SET status='in_progress' WHERE id=?`, [id]);
    res.redirect(`/lims/request/${id}?tab=workflow&msg=Marked+in+progress`);
  });

  app.post('/lims/request/:id/sample', requireAuth, labWrite, async (req, res) => {
    const requestId = parseInt(req.params.id, 10) || 0;
    const uid = req.session.userId || req.session.user?.id || null;
    const containerNo = (req.body.container_no || '').trim();
    const lineId = parseInt(req.body.request_line_id, 10) || null;
    const mark = req.body.mark || 'collected';
    const { nextBarcode } = require('../lib/labLimsOps');
    const barcode = nextBarcode('SMP');
    try {
      await pool.query(
        `INSERT INTO tbl_lab_sample (request_id, request_line_id, sample_type_id, container_no, barcode_no, status, collected_at, collected_by)
         VALUES (?,?,?,?,?,?,NOW(),?)`,
        [
          requestId,
          lineId,
          parseInt(req.body.sample_type_id, 10) || null,
          containerNo || null,
          barcode,
          mark === 'examined' ? 'examined' : 'collected',
          uid,
        ]
      );
      if (lineId) {
        await pool.query(
          `UPDATE tbl_lab_request_line SET line_status='sample_collected' WHERE id=?`,
          [lineId]
        );
        const [[ln]] = await pool.query('SELECT lab_result_id FROM tbl_lab_request_line WHERE id=?', [lineId]);
        if (ln && ln.lab_result_id) {
          await pool.query(`UPDATE tbl_lab_result SET status='in_progress' WHERE id=?`, [ln.lab_result_id]);
          await pool.query(
            `UPDATE tbl_lab_result SET barcode_no=COALESCE(barcode_no, ?) WHERE id=?`,
            [barcode, ln.lab_result_id]
          ).catch(() => {});
        }
      }
      res.redirect(`/lims/request/${requestId}?tab=samples&msg=Sample+recorded+(${encodeURIComponent(barcode)})`);
    } catch (e) {
      res.redirect(`/lims/request/${requestId}?err=${encodeURIComponent(e.message)}`);
    }
  });

  app.post('/lims/request/:id/done', requireAuth, labWrite, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    await pool.query(`UPDATE tbl_lab_request SET status='done', completed_at=NOW() WHERE id=?`, [id]);
    res.redirect(`/lims/request/${id}?msg=Request+completed`);
  });

  app.get('/lims/samples', requireAuth, labRead, async (req, res) => {
    try {
      const sampleFilter = String(req.query.filter || 'all').trim().toLowerCase();
      const sampleSearch = String(req.query.q || '').trim();
      const qLower = sampleSearch.toLowerCase();
      let where = '1=1';
      const params = [];
      if (sampleFilter && sampleFilter !== 'all') {
        where += ' AND s.status = ?';
        params.push(sampleFilter);
      }
      if (qLower) {
        where += ' AND (r.request_no LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ? OR s.container_no LIKE ?)';
        const like = `%${sampleSearch}%`;
        params.push(like, like, like, like);
      }
      const [rows] = await pool.query(
        `SELECT s.*, r.request_no, p.first_name, p.last_name, st.name AS sample_type_name
         FROM tbl_lab_sample s
         JOIN tbl_lab_request r ON r.id = s.request_id
         JOIN tbl_patient p ON p.id = r.patient_id
         LEFT JOIN tbl_lab_sample_type st ON st.id = s.sample_type_id
         WHERE ${where}
         ORDER BY s.id DESC LIMIT 200`,
        params
      );
      const [[stats]] = await pool.query(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'collected' THEN 1 ELSE 0 END) AS collected,
          SUM(CASE WHEN status = 'examined' THEN 1 ELSE 0 END) AS examined
        FROM tbl_lab_sample`).catch(() => [[{}]]);
      res.render('lims-samples', labOdooLocals({
        title: 'Lab samples — ZAIZENS',
        rows: rows || [],
        sampleStats: stats || {},
        sampleFilter,
        sampleSearch,
        flash: req.query.msg || null,
        error: req.query.err || null,
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/lims/results', requireAuth, labRead, (req, res) => {
    res.redirect('/laboratory');
  });

  app.get('/lims/config', requireAuth, requirePerm('lab.write', 'service_catalog.laboratory.write'), async (req, res) => {
    const section = String(req.query.section || 'groups');
    try {
      const [groups] = await pool.query(
        `SELECT g.*, (SELECT COUNT(*) FROM tbl_lab_test_group_line l WHERE l.group_id=g.id) AS line_count
         FROM tbl_lab_test_group g ORDER BY g.name`
      ).catch(() => [[]]);
      const [centers] = await pool.query('SELECT * FROM tbl_lab_collection_center ORDER BY name').catch(() => [[]]);
      const [sampleTypes] = await pool.query('SELECT * FROM tbl_lab_sample_type ORDER BY sort_order').catch(() => [[]]);
      const [catalog] = await pool.query('SELECT id, code, name FROM tbl_lab_catalog WHERE active=1 ORDER BY name LIMIT 200').catch(() => [[]]);
      res.render('lims-config', labOdooLocals({ title: 'LIMS configuration', section, groups: groups || [], centers: centers || [], sampleTypes: sampleTypes || [], catalog: catalog || [] }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.post('/lims/config/center', requireAuth, labWrite, async (req, res) => {
    await pool.query('INSERT INTO tbl_lab_collection_center (name, notes, active) VALUES (?,?,1)', [
      (req.body.name || '').trim(),
      (req.body.notes || '').trim() || null,
    ]);
    res.redirect('/lims/config?section=centers&msg=Center+added');
  });

  app.post('/lims/config/group', requireAuth, labWrite, async (req, res) => {
    const [ins] = await pool.query('INSERT INTO tbl_lab_test_group (code, name, description, active) VALUES (?,?,?,1)', [
      (req.body.code || '').trim() || null,
      (req.body.name || '').trim(),
      (req.body.description || '').trim() || null,
    ]);
    const gid = ins.insertId;
    const catalogIds = Array.isArray(req.body.catalog_id) ? req.body.catalog_id : [];
    let ord = 0;
    for (const cid of catalogIds) {
      const [[c]] = await pool.query('SELECT name FROM tbl_lab_catalog WHERE id=?', [parseInt(cid, 10)]);
      if (c) {
        await pool.query(
          `INSERT INTO tbl_lab_test_group_line (group_id, catalog_id, test_name, sort_order) VALUES (?,?,?,?)`,
          [gid, parseInt(cid, 10), c.name, ord++]
        );
      }
    }
    res.redirect('/lims/config?section=groups&msg=Test+group+created');
  });
};
