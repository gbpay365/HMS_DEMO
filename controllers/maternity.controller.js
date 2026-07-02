'use strict';

const mat = require('../lib/hmsMaternity');
const matInt = require('../lib/maternityIntegration');
const matBill = require('../lib/maternityBilling');
const newbornFlow = require('../lib/maternityNewbornFlow');
const { NOT_DISCHARGED } = require('../lib/ipdHospitalization');
const { formatDisplayDate, formatObjectDates, formatRowsDates } = require('../lib/hmsFormatDate');

module.exports = function createMaternityController(pool) {
  const json = (res, status, body) => res.status(status).json(body);
  const ok = (res, data, message) => json(res, 200, { success: true, message, data });
  const created = (res, data, message) => json(res, 201, { success: true, message, data });

  return {
    async registerMaternityPatient(req, res) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const {
          patient_id,
          gravida,
          para,
          abortion,
          lmp,
          blood_group,
          rhesus_factor,
          hiv_status,
          pmtct_enrolled,
        } = req.body;
        const pid = parseInt(patient_id, 10);
        const fid = parseInt(req.session?.facilityId || 1, 10) || 1;
        const uid = parseInt(req.session?.user?.id || req.session?.userId, 10) || null;

        const [ex] = await conn.query('SELECT id FROM maternity_patients WHERE patient_id = ? LIMIT 1', [pid]);
        if (ex.length) {
          await conn.rollback();
          return json(res, 400, { success: false, message: 'Patient already registered in maternity' });
        }

        const antenatal_number = await mat.generateANCNumber(conn, fid);
        const edd = lmp ? mat.calculateEDD(lmp) : null;
        const ega_at_booking = lmp ? mat.calculateEGA(lmp) : null;

        const [ins] = await conn.query(
          `INSERT INTO maternity_patients (
            patient_id, facility_id, gravida, para, abortion, lmp, edd, ega_at_booking,
            blood_group, rhesus_factor, antenatal_number, hiv_status, pmtct_enrolled,
            registered_by, booking_date
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURDATE())`,
          [
            pid,
            fid,
            parseInt(gravida, 10) || 1,
            parseInt(para, 10) || 0,
            parseInt(abortion, 10) || 0,
            lmp || null,
            edd,
            ega_at_booking,
            blood_group || null,
            rhesus_factor || null,
            antenatal_number,
            hiv_status || 'unknown',
            pmtct_enrolled ? 1 : 0,
            uid,
          ]
        );

        await conn.commit();
        const [row] = await pool.query('SELECT * FROM maternity_patients WHERE id = ?', [ins.insertId]);
        return created(res, row[0], 'Maternity patient registered');
      } catch (e) {
        await conn.rollback();
        console.error('[maternity] register', e);
        return json(res, 500, { success: false, message: e.message });
      } finally {
        conn.release();
      }
    },

    async getAllMaternityPatients(req, res) {
      try {
        const { status, risk_level, page = 1, limit = 20, search } = req.query;
        const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const off = (Math.max(1, parseInt(page, 10) || 1) - 1) * lim;
        const params = [];
        let where = 'WHERE 1=1';
        if (status) {
          where += ' AND mp.status = ?';
          params.push(status);
        }
        if (risk_level) {
          where += ' AND mp.risk_level = ?';
          params.push(risk_level);
        }
        if (search) {
          where += ` AND (mp.antenatal_number LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ? OR p.phone LIKE ?)`;
          const like = `%${search}%`;
          params.push(like, like, like, like);
        }
        const [rows] = await pool.query(
          `SELECT mp.*, p.first_name, p.last_name, p.phone, p.dob,
            (SELECT COUNT(*) FROM antenatal_visits av WHERE av.maternity_patient_id = mp.id) AS anc_visits_count,
            (SELECT visit_date FROM antenatal_visits av WHERE av.maternity_patient_id = mp.id ORDER BY visit_date DESC LIMIT 1) AS last_visit_date,
            (SELECT next_visit_date FROM antenatal_visits av WHERE av.maternity_patient_id = mp.id ORDER BY visit_date DESC LIMIT 1) AS next_visit_date
           FROM maternity_patients mp
           JOIN tbl_patient p ON p.id = mp.patient_id
           ${where}
           ORDER BY mp.created_at DESC
           LIMIT ? OFFSET ?`,
          [...params, lim, off]
        );
        const [[{ total }]] = await pool.query(
          `SELECT COUNT(*) AS total FROM maternity_patients mp JOIN tbl_patient p ON p.id = mp.patient_id ${where}`,
          params
        );
        return json(res, 200, {
          success: true,
          data: rows,
          pagination: { page: parseInt(page, 10) || 1, limit: lim, total: parseInt(total, 10) || 0 },
        });
      } catch (e) {
        return json(res, 500, { success: false, message: e.message });
      }
    },

    async getMaternityPatientById(req, res) {
      try {
        const [rows] = await pool.query(
          `SELECT mp.*, p.first_name, p.last_name, p.phone, p.dob, p.gender
           FROM maternity_patients mp JOIN tbl_patient p ON p.id = mp.patient_id WHERE mp.id = ?`,
          [req.params.id]
        );
        if (!rows.length) return json(res, 404, { success: false, message: 'Not found' });
        return ok(res, rows[0]);
      } catch (e) {
        return json(res, 500, { success: false, message: e.message });
      }
    },

    async getByHMSPatientId(req, res) {
      try {
        const [rows] = await pool.query('SELECT * FROM maternity_patients WHERE patient_id = ?', [
          req.params.patientId,
        ]);
        if (!rows.length) return json(res, 404, { success: false, message: 'Not found' });
        return ok(res, rows[0]);
      } catch (e) {
        return json(res, 500, { success: false, message: e.message });
      }
    },

    async getPatientSummary(req, res) {
      try {
        await matInt.ensureMaternityIntegrationSchema(pool);
        const id = req.params.id;
        const [[patient]] = await pool.query(
          `SELECT mp.*, p.first_name, p.last_name, p.phone FROM maternity_patients mp
           JOIN tbl_patient p ON p.id = mp.patient_id WHERE mp.id = ?`,
          [id]
        );
        if (!patient) return json(res, 404, { success: false, message: 'Not found' });

        const [ancVisits] = await pool.query(
          'SELECT * FROM antenatal_visits WHERE maternity_patient_id = ? ORDER BY visit_date DESC',
          [id]
        );
        const [riskAssessments] = await pool.query(
          'SELECT * FROM risk_assessments WHERE maternity_patient_id = ? ORDER BY assessment_date DESC',
          [id]
        );
        const [laborRows] = await pool.query(
          `SELECT lr.*, dr.id AS delivery_id, dr.delivery_type, dr.delivery_date_time, dr.outcome,
                  a.id AS ipd_admission_id, a.ipd_status, a.bed_id, a.hos_payment_deferred,
                  a.clinical_discharged_at, a.discharged_at,
                  b.ward_name AS ipd_ward_name, b.bed_label AS ipd_bed_label
           FROM labor_records lr
           LEFT JOIN delivery_records dr ON dr.labor_record_id = lr.id
           LEFT JOIN tbl_admission a ON a.id = lr.admission_id
             AND ${NOT_DISCHARGED}
           LEFT JOIN tbl_bed b ON b.id = a.bed_id
           WHERE lr.maternity_patient_id = ?
           ORDER BY lr.admission_date DESC LIMIT 1`,
          [id]
        );
        const [scans] = await pool.query(
          'SELECT * FROM ultrasound_scans WHERE maternity_patient_id = ? ORDER BY scan_date DESC',
          [id]
        );
        const [postnatal] = await pool.query(
          'SELECT * FROM postnatal_visits WHERE maternity_patient_id = ? ORDER BY visit_date DESC',
          [id]
        );
        const [complications] = await pool.query(
          'SELECT * FROM maternal_complications WHERE maternity_patient_id = ? ORDER BY complication_date DESC',
          [id]
        );
        let newborns = [];
        if (laborRows[0]?.delivery_id) {
          const [nb] = await pool.query(
            `SELECT nb.*, p.patient_code AS baby_patient_code
             FROM newborn_records nb
             LEFT JOIN tbl_patient p ON p.id = nb.patient_id
             WHERE nb.delivery_record_id = ?`,
            [laborRows[0].delivery_id]
          );
          newborns = nb;
        }

        const patientFmt = formatObjectDates(patient, ['lmp', 'edd', 'booking_date']);
        const laborFmt = laborRows[0]
          ? formatObjectDates(laborRows[0], ['admission_date', 'delivery_date_time'])
          : null;

        return ok(res, {
          patient: patientFmt,
          antenatal_visits: formatRowsDates(ancVisits, ['visit_date', 'next_visit_date']),
          risk_assessments: formatRowsDates(riskAssessments, ['assessment_date']),
          labor_delivery: laborFmt,
          newborns: formatRowsDates(newborns, ['time_of_birth']),
          ultrasound_scans: formatRowsDates(scans, ['scan_date']),
          postnatal_visits: formatRowsDates(postnatal, ['visit_date']),
          complications: formatRowsDates(complications, ['complication_date']),
        });
      } catch (e) {
        return json(res, 500, { success: false, message: e.message });
      }
    },

    async createANCVisit(req, res) {
      try {
        const b = req.body;
        const mid = parseInt(b.maternity_patient_id, 10);
        const [[{ c }]] = await pool.query(
          'SELECT COUNT(*) AS c FROM antenatal_visits WHERE maternity_patient_id = ?',
          [mid]
        );
        const visit_number = parseInt(c, 10) + 1;
        const weight = b.weight != null ? Number(b.weight) : null;
        const height = b.height != null ? Number(b.height) : null;
        const bmi = weight && height ? Number((weight / Math.pow(height / 100, 2)).toFixed(2)) : null;
        const uid = parseInt(req.session?.user?.id, 10) || null;

        const [ins] = await pool.query(
          `INSERT INTO antenatal_visits (
            maternity_patient_id, visit_number, visit_date, ega_weeks, weight, height, bmi,
            blood_pressure_systolic, blood_pressure_diastolic, pulse_rate, temperature,
            fundal_height, fetal_heart_rate, fetal_presentation, fetal_lie, fetal_movement,
            oedema, haemoglobin, malaria_test, syphilis_test, tetanus_toxoid, ipt_dose,
            iron_folate_given, llin_given, urine_protein, urine_glucose, pallor,
            complaints, examination_findings, diagnosis, treatment_given, next_visit_date,
            referral_made, referral_reason, counselling_done, attended_by, notes
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            mid,
            visit_number,
            b.visit_date || new Date().toISOString().slice(0, 10),
            b.ega_weeks || null,
            weight,
            height,
            bmi,
            b.blood_pressure_systolic || null,
            b.blood_pressure_diastolic || null,
            b.pulse_rate || null,
            b.temperature || null,
            b.fundal_height || null,
            b.fetal_heart_rate || null,
            b.fetal_presentation || null,
            b.fetal_lie || null,
            b.fetal_movement || null,
            b.oedema || 'absent',
            b.haemoglobin || null,
            b.malaria_test || null,
            b.syphilis_test || null,
            b.tetanus_toxoid || null,
            b.ipt_dose || null,
            b.iron_folate_given ? 1 : 0,
            b.llin_given ? 1 : 0,
            b.urine_protein || null,
            b.urine_glucose || null,
            b.pallor || null,
            b.complaints || null,
            b.examination_findings || null,
            b.diagnosis || null,
            b.treatment_given || null,
            b.next_visit_date || null,
            b.referral_made ? 1 : 0,
            b.referral_reason || null,
            b.counselling_done || null,
            uid,
            b.notes || null,
          ]
        );

        const sys = parseInt(b.blood_pressure_systolic, 10);
        const dia = parseInt(b.blood_pressure_diastolic, 10);
        if (sys >= 140 || dia >= 90) {
          await pool.query(`UPDATE maternity_patients SET risk_level = 'high' WHERE id = ?`, [mid]);
        }

        const [row] = await pool.query('SELECT * FROM antenatal_visits WHERE id = ?', [ins.insertId]);
        const fid = parseInt(req.session?.facilityId || 1, 10) || 1;
        await matBill.applyMaternityBillingAfterEvent(pool, {
          maternityPatientId: mid,
          eventType: visit_number === 1 ? 'anc_booking' : 'anc_routine',
          userId: uid,
          facilityId: fid,
        }).catch(() => {});
        return created(res, row[0], 'ANC visit recorded');
      } catch (e) {
        return json(res, 500, { success: false, message: e.message });
      }
    },

    async createRiskAssessment(req, res) {
      try {
        const b = req.body;
        const mid = parseInt(b.maternity_patient_id, 10);
        const factors = mat.parseJsonField(b.risk_factors, []);
        const obst = mat.parseJsonField(b.obstetric_history, {});
        const med = mat.parseJsonField(b.medical_history, {});
        const social = mat.parseJsonField(b.social_history, {});
        const { risk_score, risk_level } = mat.scoreRiskFactors(factors, obst, med);
        const uid = parseInt(req.session?.user?.id, 10) || null;

        const [ins] = await pool.query(
          `INSERT INTO risk_assessments (
            maternity_patient_id, risk_factors, obstetric_history, medical_history, social_history,
            overall_risk_score, risk_level, action_plan, reviewed_by
          ) VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            mid,
            mat.stringifyJsonField(factors),
            mat.stringifyJsonField(obst),
            mat.stringifyJsonField(med),
            mat.stringifyJsonField(social),
            risk_score,
            risk_level,
            b.action_plan || null,
            uid,
          ]
        );
        await pool.query('UPDATE maternity_patients SET risk_level = ? WHERE id = ?', [risk_level, mid]);
        const [row] = await pool.query('SELECT * FROM risk_assessments WHERE id = ?', [ins.insertId]);
        return created(res, row[0]);
      } catch (e) {
        return json(res, 500, { success: false, message: e.message });
      }
    },

    async admitToLaborWard(req, res) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await matInt.ensureMaternityIntegrationSchema(conn);
        const b = req.body;
        const mid = parseInt(b.maternity_patient_id, 10);
        const uid = parseInt(req.session?.user?.id, 10) || null;
        const facilityId =
          parseInt(req.session?.facilityId || req.session?.user?.facility_id, 10) || 1;
        const [ins] = await conn.query(
          `INSERT INTO labor_records (
            maternity_patient_id, admission_type, ega_at_admission, cervical_dilation, effacement,
            station, membranes_status, liquor_color, presentation, position,
            contractions_frequency, contractions_duration, contractions_strength,
            fhr_at_admission, bp_systolic, bp_diastolic, pulse, temperature,
            urine_protein, haemoglobin, iv_access, oxytocin_infusion,
            induction_method, reason_for_induction, admitted_by, partograph_started, notes
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            mid,
            b.admission_type,
            b.ega_at_admission || null,
            b.cervical_dilation || null,
            b.effacement || null,
            b.station || null,
            b.membranes_status || null,
            b.liquor_color || null,
            b.presentation || null,
            b.position || null,
            b.contractions_frequency || null,
            b.contractions_duration || null,
            b.contractions_strength || null,
            b.fhr_at_admission || null,
            b.bp_systolic || null,
            b.bp_diastolic || null,
            b.pulse || null,
            b.temperature || null,
            b.urine_protein || null,
            b.haemoglobin || null,
            b.iv_access ? 1 : 0,
            b.oxytocin_infusion ? 1 : 0,
            b.induction_method || null,
            b.reason_for_induction || null,
            uid,
            1,
            b.notes || null,
          ]
        );
        const laborId = ins.insertId;
        await conn.query(`UPDATE maternity_patients SET status = 'active' WHERE id = ?`, [mid]);

        let ipdMeta = null;
        const createIpd =
          b.create_ipd_admission === '1' ||
          b.create_ipd_admission === 1 ||
          b.create_ipd_admission === true ||
          b.create_ipd_admission === 'on';
        if (createIpd) {
          const [[mp]] = await conn.query(
            'SELECT patient_id, facility_id FROM maternity_patients WHERE id = ? LIMIT 1',
            [mid]
          );
          if (mp?.patient_id) {
            ipdMeta = await matInt.createMaternityIpdAdmission(conn, {
              patientId: mp.patient_id,
              laborRecordId: laborId,
              facilityId: mp.facility_id || facilityId,
              userId: uid,
              admittingDoctorId: b.admitting_doctor_id,
              admittingDiagnosis: b.admitting_diagnosis,
              payLater: b.ipd_pay_later !== '0' && b.ipd_pay_later !== 0 && b.ipd_pay_later !== false,
            });
          }
        }

        await matBill.applyMaternityBillingAfterEvent(conn, {
          maternityPatientId: mid,
          eventType: 'labor_admit',
          userId: uid,
          facilityId,
        }).catch(() => {});

        await conn.commit();
        const [row] = await pool.query('SELECT * FROM labor_records WHERE id = ?', [laborId]);
        const payload = row[0] || {};
        if (ipdMeta) {
          payload.ipd_admission_id = ipdMeta.admissionId;
          payload.ipd_bed_label = ipdMeta.bedLabel;
        }
        return created(res, payload, ipdMeta?.bedLabel
          ? 'Admitted to labor ward and Maternity IPD'
          : ipdMeta
            ? 'Admitted to labor ward — assign bed on ward board'
            : 'Admitted to labor ward');
      } catch (e) {
        await conn.rollback();
        return json(res, 500, { success: false, message: e.message });
      } finally {
        conn.release();
      }
    },

    async getActiveLaborPatients(req, res) {
      try {
        const [rows] = await pool.query(
          `SELECT lr.*, mp.antenatal_number, mp.risk_level, mp.gravida, mp.para, mp.lmp,
                  p.first_name, p.last_name
           FROM labor_records lr
           JOIN maternity_patients mp ON mp.id = lr.maternity_patient_id
           JOIN tbl_patient p ON p.id = mp.patient_id
           WHERE lr.status = 'in_labor'
           ORDER BY lr.admission_date ASC`
        );
        return json(res, 200, { success: true, data: rows, count: rows.length });
      } catch (e) {
        return json(res, 500, { success: false, message: e.message });
      }
    },

    async addPartographEntry(req, res) {
      try {
        const laborId = parseInt(req.params.laborId, 10);
        const b = req.body;
        const [[labor]] = await pool.query('SELECT admission_date FROM labor_records WHERE id = ?', [laborId]);
        const lines = mat.partographLineFlags(labor?.admission_date, [], b.cervical_dilation);
        const uid = parseInt(req.session?.user?.id, 10) || null;
        const [ins] = await pool.query(
          `INSERT INTO partograph (
            labor_record_id, time_label, cervical_dilation, descent_station, contractions_in_10min,
            contraction_duration, fhr, bp_systolic, bp_diastolic, pulse, temperature,
            urine_volume, urine_protein, urine_acetone, oxytocin_units, oxytocin_drops,
            drugs_given, liquor, moulding, caput, alert_line_crossed, action_line_crossed,
            recorded_by, notes
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            laborId,
            b.time_label || null,
            b.cervical_dilation || null,
            b.descent_station || null,
            b.contractions_in_10min || null,
            b.contraction_duration || null,
            b.fhr || null,
            b.bp_systolic || null,
            b.bp_diastolic || null,
            b.pulse || null,
            b.temperature || null,
            b.urine_volume || null,
            b.urine_protein || null,
            b.urine_acetone || null,
            b.oxytocin_units || null,
            b.oxytocin_drops || null,
            b.drugs_given || null,
            b.liquor || null,
            b.moulding || null,
            b.caput || null,
            lines.alert_line_crossed,
            lines.action_line_crossed,
            uid,
            b.notes || null,
          ]
        );
        const [row] = await pool.query('SELECT * FROM partograph WHERE id = ?', [ins.insertId]);
        return created(res, row[0]);
      } catch (e) {
        return json(res, 500, { success: false, message: e.message });
      }
    },

    async getPartographData(req, res) {
      try {
        const [rows] = await pool.query(
          'SELECT * FROM partograph WHERE labor_record_id = ? ORDER BY recorded_at ASC',
          [req.params.laborId]
        );
        return json(res, 200, { success: true, data: rows });
      } catch (e) {
        return json(res, 500, { success: false, message: e.message });
      }
    },

    async recordDelivery(req, res) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const b = req.body;
        const laborId = parseInt(b.labor_record_id, 10);
        const mid = parseInt(b.maternity_patient_id, 10);
        const uid = parseInt(req.session?.user?.id, 10) || null;
        const [ins] = await conn.query(
          `INSERT INTO delivery_records (
            labor_record_id, maternity_patient_id, delivery_date_time, delivery_type,
            cs_indication, cs_type, anaesthesia_type, duration_of_labor, duration_second_stage,
            third_stage_management, placenta_delivery_method, placenta_complete,
            episiotomy, episiotomy_type, perineal_tear_degree, repair_done,
            blood_loss_estimated, blood_transfusion, blood_units_transfused,
            oxytocin_given, ergometrine_given, complications, outcome,
            delivered_by, assistant, surgeon, anaesthetist, notes
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            laborId,
            mid,
            b.delivery_date_time || new Date(),
            b.delivery_type,
            b.cs_indication || null,
            b.cs_type || null,
            b.anaesthesia_type || null,
            b.duration_of_labor || null,
            b.duration_second_stage || null,
            b.third_stage_management || null,
            b.placenta_delivery_method || null,
            b.placenta_complete !== false && b.placenta_complete !== '0' ? 1 : 0,
            b.episiotomy ? 1 : 0,
            b.episiotomy_type || null,
            b.perineal_tear_degree || null,
            b.repair_done ? 1 : 0,
            b.blood_loss_estimated || null,
            b.blood_transfusion ? 1 : 0,
            b.blood_units_transfused || null,
            b.oxytocin_given !== false && b.oxytocin_given !== '0' ? 1 : 0,
            b.ergometrine_given ? 1 : 0,
            b.complications || null,
            b.outcome,
            uid,
            b.assistant || null,
            b.surgeon || null,
            b.anaesthetist || null,
            b.notes || null,
          ]
        );
        await conn.query(`UPDATE labor_records SET status = 'delivered' WHERE id = ?`, [laborId]);
        const isMaternalDeath = String(b.outcome || '').toLowerCase() === 'maternal_death';
        if (isMaternalDeath) {
          await conn.query(`UPDATE maternity_patients SET status = 'deceased', para = para + 1 WHERE id = ?`, [mid]);
        } else {
          await conn.query(`UPDATE maternity_patients SET status = 'delivered', para = para + 1 WHERE id = ?`, [mid]);
        }
        const fid = parseInt(req.session?.facilityId || 1, 10) || 1;
        if (!isMaternalDeath) {
          await matBill.applyMaternityBillingAfterEvent(conn, {
            maternityPatientId: mid,
            eventType: 'delivery',
            deliveryType: b.delivery_type,
            userId: uid,
            facilityId: fid,
          }).catch(() => {});
        }
        await conn.commit();
        if (isMaternalDeath) {
          const [[mp]] = await pool.query('SELECT patient_id FROM maternity_patients WHERE id=?', [mid]);
          const { recordDeath } = require('../lib/deathRegistry');
          const dod = b.delivery_date_time
            ? String(b.delivery_date_time).slice(0, 10)
            : new Date().toISOString().slice(0, 10);
          await recordDeath(pool, {
            sourceModule: 'maternity',
            patientId: parseInt(mp?.patient_id, 10) || 0,
            maternityPatientId: mid,
            deliveryRecordId: ins.insertId,
            dateOfDeath: dod,
            causeOfDeath: (b.complications || b.notes || 'Maternal death').trim(),
            reportedBy: uid,
          }).catch((e) => console.error('maternity recordDeath:', e.message));
        }
        const [row] = await pool.query('SELECT * FROM delivery_records WHERE id = ?', [ins.insertId]);
        return created(res, row[0], isMaternalDeath ? 'Maternal death recorded' : 'Delivery recorded');
      } catch (e) {
        await conn.rollback();
        return json(res, 500, { success: false, message: e.message });
      } finally {
        conn.release();
      }
    },

    async registerNewborn(req, res) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await matInt.ensureMaternityIntegrationSchema(conn);
        const b = req.body;
        const maternityPatientId = parseInt(b.maternity_patient_id, 10);
        const birthOutcome = String(b.birth_outcome || 'alive');
        let babyPatientId = null;
        let babyPatientCode = null;
        let neonatalNumber = null;

        const [[mp]] = await conn.query(
          'SELECT patient_id FROM maternity_patients WHERE id = ? LIMIT 1',
          [maternityPatientId]
        );
        const motherPatientId = parseInt(mp?.patient_id, 10) || 0;

        if (birthOutcome === 'alive' && motherPatientId > 0) {
          neonatalNumber = await matInt.generateNeonatalNumber(conn);
          const baby = await matInt.createNewbornPatientRecord(conn, {
            motherPatientId,
            sex: b.sex,
            timeOfBirth: b.time_of_birth || null,
          });
          babyPatientId = baby.patientId;
          babyPatientCode = baby.patientCode;
        }

        const [ins] = await conn.query(
          `INSERT INTO newborn_records (
            delivery_record_id, maternity_patient_id, patient_id, neonatal_number, baby_number, time_of_birth, sex, birth_weight,
            birth_length, head_circumference, gestational_age_at_birth,
            apgar_score_1min, apgar_score_5min, apgar_score_10min,
            resuscitation_needed, resuscitation_type, birth_outcome,
            congenital_anomaly, anomaly_details, vitamin_k_given, eye_prophylaxis_given,
            bcg_given, opv0_given, hep_b_given, breastfeeding_initiated,
            time_to_first_breastfeed, cord_condition, baby_nicu_admission, nicu_reason, notes
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            b.delivery_record_id,
            maternityPatientId,
            babyPatientId,
            neonatalNumber,
            b.baby_number || 1,
            b.time_of_birth || null,
            b.sex,
            b.birth_weight,
            b.birth_length || null,
            b.head_circumference || null,
            b.gestational_age_at_birth || null,
            b.apgar_score_1min,
            b.apgar_score_5min,
            b.apgar_score_10min || null,
            b.resuscitation_needed ? 1 : 0,
            b.resuscitation_type || null,
            birthOutcome,
            b.congenital_anomaly ? 1 : 0,
            b.anomaly_details || null,
            b.vitamin_k_given !== false ? 1 : 0,
            b.eye_prophylaxis_given !== false ? 1 : 0,
            b.bcg_given ? 1 : 0,
            b.opv0_given ? 1 : 0,
            b.hep_b_given ? 1 : 0,
            b.breastfeeding_initiated ? 1 : 0,
            b.time_to_first_breastfeed || null,
            b.cord_condition || null,
            b.baby_nicu_admission ? 1 : 0,
            b.nicu_reason || null,
            b.notes || null,
          ]
        );
        const fid = parseInt(req.session?.facilityId || 1, 10) || 1;
        const uid = parseInt(req.session?.user?.id, 10) || null;

        let clinicalPaths = null;
        if (babyPatientId) {
          const nicuAdmission =
            b.baby_nicu_admission === '1' ||
            b.baby_nicu_admission === 1 ||
            b.baby_nicu_admission === true ||
            b.baby_nicu_admission === 'on';
          const pediatricOpd =
            b.create_pediatric_opd === '1' ||
            b.create_pediatric_opd === 1 ||
            b.create_pediatric_opd === true ||
            b.create_pediatric_opd === 'on' ||
            nicuAdmission;
          clinicalPaths = await newbornFlow.processNewbornClinicalPaths(conn, {
            newbornRecordId: ins.insertId,
            babyPatientId,
            nicuAdmission,
            pediatricOpd,
            nicuReason: b.nicu_reason,
            facilityId: fid,
            userId: uid,
            payLater: true,
          });
        }

        await conn.commit();
        const [row] = await pool.query('SELECT * FROM newborn_records WHERE id = ?', [ins.insertId]);
        const data = row[0] || {};
        if (babyPatientId) {
          data.baby_patient_id = babyPatientId;
          data.baby_patient_code = babyPatientCode;
        }
        if (clinicalPaths?.ipd) {
          data.baby_admission_id = clinicalPaths.ipd.admissionId;
          data.baby_ipd_bed_label = clinicalPaths.ipd.bedLabel;
        }
        if (clinicalPaths?.opd) {
          data.opd_visit_id = clinicalPaths.opd.visitId;
        }
        const msgParts = [babyPatientId ? 'Newborn registered with HMS patient record' : 'Newborn record saved'];
        if (clinicalPaths?.ipd) msgParts.push('NICU IPD admission created');
        if (clinicalPaths?.opd) msgParts.push('Pediatric OPD visit opened');
        return created(res, data, msgParts.join(' — '));
      } catch (e) {
        await conn.rollback();
        return json(res, 500, { success: false, message: e.message });
      } finally {
        conn.release();
      }
    },

    async createPostnatalVisit(req, res) {
      try {
        const b = req.body;
        const uid = parseInt(req.session?.user?.id, 10) || null;
        const [ins] = await pool.query(
          `INSERT INTO postnatal_visits (
            maternity_patient_id, delivery_record_id, visit_date, visit_type, days_postpartum,
            general_condition, bp_systolic, bp_diastolic, pulse, temperature, weight,
            uterine_involution, lochia_type, lochia_amount, perineal_healing, cs_wound_healing,
            breast_condition, breastfeeding_status, bladder_bowel_function, mood_assessment,
            postpartum_depression_score, anaemia_present, haemoglobin,
            baby_weight, baby_general_condition, baby_breastfeeding, baby_cord_condition, baby_jaundice,
            immunizations_given, family_planning_counselled, family_planning_method,
            treatment_given, referral_made, referral_reason, next_appointment, attended_by, notes
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            b.maternity_patient_id,
            b.delivery_record_id || null,
            b.visit_date || new Date().toISOString().slice(0, 10),
            b.visit_type,
            b.days_postpartum || null,
            b.general_condition || null,
            b.bp_systolic || null,
            b.bp_diastolic || null,
            b.pulse || null,
            b.temperature || null,
            b.weight || null,
            b.uterine_involution || null,
            b.lochia_type || null,
            b.lochia_amount || null,
            b.perineal_healing || null,
            b.cs_wound_healing || null,
            b.breast_condition || null,
            b.breastfeeding_status || null,
            b.bladder_bowel_function || null,
            b.mood_assessment || null,
            b.postpartum_depression_score || null,
            b.anaemia_present ? 1 : 0,
            b.haemoglobin || null,
            b.baby_weight || null,
            b.baby_general_condition || null,
            b.baby_breastfeeding || null,
            b.baby_cord_condition || null,
            b.baby_jaundice ? 1 : 0,
            b.immunizations_given || null,
            b.family_planning_counselled ? 1 : 0,
            b.family_planning_method || null,
            b.treatment_given || null,
            b.referral_made ? 1 : 0,
            b.referral_reason || null,
            b.next_appointment || null,
            uid,
            b.notes || null,
          ]
        );
        const epds = parseInt(b.postpartum_depression_score, 10);
        if (epds >= 13) {
          await pool.query(`UPDATE maternity_patients SET risk_level = 'high' WHERE id = ?`, [
            b.maternity_patient_id,
          ]);
        }
        const [row] = await pool.query('SELECT * FROM postnatal_visits WHERE id = ?', [ins.insertId]);
        const fid = parseInt(req.session?.facilityId || 1, 10) || 1;
        await matBill.applyMaternityBillingAfterEvent(pool, {
          maternityPatientId: parseInt(b.maternity_patient_id, 10),
          eventType: 'pnc_routine',
          userId: uid,
          facilityId: fid,
        }).catch(() => {});
        return created(res, row[0]);
      } catch (e) {
        return json(res, 500, { success: false, message: e.message });
      }
    },

    async recordComplication(req, res) {
      try {
        const b = req.body;
        const uid = parseInt(req.session?.user?.id, 10) || null;
        const [ins] = await pool.query(
          `INSERT INTO maternal_complications (
            maternity_patient_id, labor_record_id, phase, complication_type,
            pre_eclampsia, eclampsia, antepartum_haemorrhage, postpartum_haemorrhage, sepsis,
            obstructed_labor, cord_prolapse, placenta_praevia, placental_abruption,
            ruptured_uterus, fistula, severity, description, management_given, outcome,
            blood_transfusion, icu_admission, surgery_performed, surgery_details, reported_by
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            b.maternity_patient_id,
            b.labor_record_id || null,
            b.phase,
            b.complication_type || null,
            b.pre_eclampsia ? 1 : 0,
            b.eclampsia ? 1 : 0,
            b.antepartum_haemorrhage ? 1 : 0,
            b.postpartum_haemorrhage ? 1 : 0,
            b.sepsis ? 1 : 0,
            b.obstructed_labor ? 1 : 0,
            b.cord_prolapse ? 1 : 0,
            b.placenta_praevia ? 1 : 0,
            b.placental_abruption ? 1 : 0,
            b.ruptured_uterus ? 1 : 0,
            b.fistula ? 1 : 0,
            b.severity || null,
            b.description || null,
            b.management_given || null,
            b.outcome || null,
            b.blood_transfusion ? 1 : 0,
            b.icu_admission ? 1 : 0,
            b.surgery_performed ? 1 : 0,
            b.surgery_details || null,
            uid,
          ]
        );
        await pool.query(`UPDATE maternity_patients SET risk_level = 'high' WHERE id = ?`, [
          b.maternity_patient_id,
        ]);
        const [row] = await pool.query('SELECT * FROM maternal_complications WHERE id = ?', [ins.insertId]);
        return created(res, row[0]);
      } catch (e) {
        return json(res, 500, { success: false, message: e.message });
      }
    },

    async getDashboardStats(req, res) {
      try {
        return ok(res, await mat.getDashboardStats(pool));
      } catch (e) {
        return json(res, 500, { success: false, message: e.message });
      }
    },

    async addUltrasoundScan(req, res) {
      try {
        const b = req.body;
        const [ins] = await pool.query(
          `INSERT INTO ultrasound_scans (
            maternity_patient_id, scan_date, scan_type, ega_by_scan, findings, fetal_biometry,
            placenta_position, amniotic_fluid_index, number_of_fetuses,
            fetal_anomaly_detected, anomaly_details, sonographer, report
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            b.maternity_patient_id,
            b.scan_date || new Date().toISOString().slice(0, 10),
            b.scan_type || null,
            b.ega_by_scan || null,
            b.findings || null,
            mat.stringifyJsonField(b.fetal_biometry),
            b.placenta_position || null,
            b.amniotic_fluid_index || null,
            b.number_of_fetuses || 1,
            b.fetal_anomaly_detected ? 1 : 0,
            b.anomaly_details || null,
            b.sonographer || null,
            b.report || null,
          ]
        );
        const [row] = await pool.query('SELECT * FROM ultrasound_scans WHERE id = ?', [ins.insertId]);
        return created(res, row[0]);
      } catch (e) {
        return json(res, 500, { success: false, message: e.message });
      }
    },

    async getANCVisits(req, res) {
      const [rows] = await pool.query(
        'SELECT * FROM antenatal_visits WHERE maternity_patient_id = ? ORDER BY visit_date ASC',
        [req.params.maternityPatientId]
      );
      return json(res, 200, { success: true, data: rows });
    },

    async getUltrasoundScans(req, res) {
      const [rows] = await pool.query(
        'SELECT * FROM ultrasound_scans WHERE maternity_patient_id = ? ORDER BY scan_date DESC',
        [req.params.maternityPatientId]
      );
      return json(res, 200, { success: true, data: rows });
    },

    async getRiskAssessments(req, res) {
      const [rows] = await pool.query(
        'SELECT * FROM risk_assessments WHERE maternity_patient_id = ? ORDER BY assessment_date DESC',
        [req.params.maternityPatientId]
      );
      return json(res, 200, { success: true, data: rows });
    },

    async getPostnatalVisits(req, res) {
      const [rows] = await pool.query(
        'SELECT * FROM postnatal_visits WHERE maternity_patient_id = ? ORDER BY visit_date ASC',
        [req.params.maternityPatientId]
      );
      return json(res, 200, { success: true, data: rows });
    },

    async getComplications(req, res) {
      const [rows] = await pool.query(
        'SELECT * FROM maternal_complications WHERE maternity_patient_id = ? ORDER BY complication_date DESC',
        [req.params.maternityPatientId]
      );
      return json(res, 200, { success: true, data: rows });
    },

    async getHighRiskPatients(req, res) {
      const [rows] = await pool.query(
        `SELECT mp.*, p.first_name, p.last_name,
          (SELECT MAX(visit_date) FROM antenatal_visits av WHERE av.maternity_patient_id = mp.id) AS last_visit,
          (SELECT MAX(next_visit_date) FROM antenatal_visits av WHERE av.maternity_patient_id = mp.id) AS scheduled_visit
         FROM maternity_patients mp
         JOIN tbl_patient p ON p.id = mp.patient_id
         WHERE mp.risk_level = 'high' AND mp.status = 'active'
         ORDER BY mp.edd ASC`
      );
      return json(res, 200, { success: true, data: rows, count: rows.length });
    },
  };
};
