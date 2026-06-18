'use strict';

const vac = require('../lib/hmsVaccination');
const { formatRowsDates } = require('../lib/hmsFormatDate');

module.exports = function createVaccinationController(pool) {
  const json = (res, status, body) => res.status(status).json(body);
  const ok = (res, data, message) => json(res, 200, { success: true, message, data });
  const created = (res, data, message) => json(res, 201, { success: true, message, data });

  return {
    async getDashboardStats(req, res) {
      try {
        const stats = await vac.getDashboardStats(pool);
        return ok(res, stats);
      } catch (e) {
        console.error('[vaccination] dashboard stats', e);
        return json(res, 500, { success: false, message: e.message });
      }
    },

    async getPatientSummary(req, res) {
      try {
        const pid = parseInt(req.params.patient_id || req.params.id, 10);
        const summary = await vac.loadPatientSummary(pool, pid);
        if (!summary) return json(res, 404, { success: false, message: 'Patient not found' });
        return ok(res, summary);
      } catch (e) {
        console.error('[vaccination] patient summary', e);
        return json(res, 500, { success: false, message: e.message });
      }
    },

    async administerDose(req, res) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const {
          patient_id,
          vaccine_id,
          dose_number,
          administered_date,
          batch_number,
          lot_expiry,
          site,
          route,
          adverse_reaction,
          notes,
        } = req.body;

        const pid = parseInt(patient_id, 10);
        const vid = parseInt(vaccine_id, 10);
        const doseNum = parseInt(dose_number, 10) || 1;
        const adminDate = administered_date || new Date().toISOString().slice(0, 10);
        const uid = parseInt(req.session?.user?.id || req.session?.userId, 10) || null;
        const fid = parseInt(req.session?.facilityId || 1, 10) || 1;

        const [pat] = await conn.query('SELECT id FROM tbl_patient WHERE id = ? LIMIT 1', [pid]);
        if (!pat.length) {
          await conn.rollback();
          return json(res, 400, { success: false, message: 'Patient not found' });
        }

        const [vaccRows] = await conn.query('SELECT * FROM vaccination_vaccines WHERE id = ? AND active = 1 LIMIT 1', [vid]);
        const vaccine = vaccRows[0];
        if (!vaccine) {
          await conn.rollback();
          return json(res, 400, { success: false, message: 'Vaccine not found' });
        }

        const nextDue = vac.calculateNextDoseDue(vaccine, doseNum, adminDate);

        const [ins] = await conn.query(
          `INSERT INTO vaccination_records (
            patient_id, vaccine_id, dose_number, administered_date, batch_number, lot_expiry,
            site, route, administered_by, facility_id, next_dose_due, status,
            adverse_reaction, notes, source
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,'given',?,?,'vaccination')`,
          [
            pid,
            vid,
            doseNum,
            adminDate,
            batch_number || null,
            lot_expiry || null,
            site || vaccine.site || null,
            route || vaccine.route || null,
            uid,
            fid,
            nextDue,
            adverse_reaction || null,
            notes || null,
          ]
        );

        await conn.query(
          `UPDATE vaccination_queue SET status = 'completed', updated_at = NOW()
           WHERE patient_id = ? AND status IN ('waiting','in_progress')`,
          [pid]
        );

        await conn.commit();
        const [row] = await pool.query(
          `SELECT vr.*, vv.name AS vaccine_name FROM vaccination_records vr
           JOIN vaccination_vaccines vv ON vv.id = vr.vaccine_id WHERE vr.id = ?`,
          [ins.insertId]
        );
        return created(res, row[0], 'Vaccine dose recorded');
      } catch (e) {
        await conn.rollback();
        console.error('[vaccination] administer', e);
        return json(res, 500, { success: false, message: e.message });
      } finally {
        conn.release();
      }
    },

    async listPatients(req, res) {
      try {
        const search = String(req.query.q || '').trim();
        const dueOnly = String(req.query.due || '') === '1';
        let where = 'WHERE 1=1';
        const params = [];

        if (search) {
          where += ' AND (p.first_name LIKE ? OR p.last_name LIKE ? OR p.patient_code LIKE ? OR CAST(p.id AS CHAR) LIKE ?)';
          const like = `%${search}%`;
          params.push(like, like, like, like);
        }

        if (dueOnly) {
          where += ` AND EXISTS (
            SELECT 1 FROM vaccination_records vr2
            WHERE vr2.patient_id = p.id AND vr2.next_dose_due <= CURDATE() AND vr2.status = 'given'
          )`;
        } else {
          where += ` AND EXISTS (SELECT 1 FROM vaccination_records vr2 WHERE vr2.patient_id = p.id)`;
        }

        const [rows] = await pool.query(
          `SELECT p.id, p.first_name, p.last_name, p.phone, p.patient_code, p.dob,
            (SELECT COUNT(*) FROM vaccination_records vr WHERE vr.patient_id = p.id AND vr.status = 'given') AS dose_count,
            (SELECT MAX(vr.administered_date) FROM vaccination_records vr WHERE vr.patient_id = p.id) AS last_dose_date,
            (SELECT MIN(vr.next_dose_due) FROM vaccination_records vr
             WHERE vr.patient_id = p.id AND vr.next_dose_due IS NOT NULL AND vr.status = 'given') AS next_due
           FROM tbl_patient p
           ${where}
           ORDER BY next_due IS NULL, next_due ASC, last_dose_date DESC
           LIMIT 100`,
          params
        );
        return ok(res, formatRowsDates(rows));
      } catch (e) {
        console.error('[vaccination] list patients', e);
        return json(res, 500, { success: false, message: e.message });
      }
    },

    async addToQueue(req, res) {
      try {
        const pid = parseInt(req.body.patient_id, 10);
        const appointmentDate = req.body.appointment_date || null;
        const notes = req.body.notes || null;

        const [pat] = await pool.query('SELECT id FROM tbl_patient WHERE id = ? LIMIT 1', [pid]);
        if (!pat.length) return json(res, 400, { success: false, message: 'Patient not found' });

        const [ins] = await pool.query(
          `INSERT INTO vaccination_queue (patient_id, appointment_date, appointment_type, status, notes)
           VALUES (?, ?, 'vaccination', 'waiting', ?)`,
          [pid, appointmentDate, notes]
        );
        return created(res, { id: ins.insertId }, 'Added to vaccination queue');
      } catch (e) {
        console.error('[vaccination] queue', e);
        return json(res, 500, { success: false, message: e.message });
      }
    },
  };
};
