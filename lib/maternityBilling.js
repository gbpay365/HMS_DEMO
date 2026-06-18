'use strict';

const DELIVERY_CATALOG = {
  svd: 'Supervised Normal Delivery (SND)',
  vacuum: 'Vacuum Extraction',
  forceps: 'Forceps Delivery',
  emergency_cs: 'Caesarean Section (Emergency)',
  elective_cs: 'Caesarean Section (Elective)',
  breech: 'Supervised Normal Delivery (SND)',
};

const EVENT_CATALOG = {
  anc_booking: 'ANC Booking Visit (First Visit)',
  anc_routine: 'ANC Routine Visit — General',
  labor_admit: 'Labour Ward Admission',
  pnc_routine: 'Postnatal Visit — Routine',
  nicu_day: 'NICU Admission — Per Day',
};

const NEONATAL_NAME_RE = /newborn|neonatal|nicu|incubator|phototherapy|bcg|opv|hepatitis b birth|vitamin k|kangaroo/i;

async function ensureMaternityBillingSchema(pool) {
  const q = (sql) =>
    pool.query(sql).catch((e) => {
      const msg = String(e.message || '');
      if (/Duplicate|already exists|ER_DUP|duplicate column/i.test(msg)) return;
      throw e;
    });
  await q('ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS source_module VARCHAR(32) NULL');
  await q('ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS source_pk INT NULL');
  await q('ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS maternity_event VARCHAR(40) NULL');
}

function isNeonatalCatalogItem(cat) {
  const name = String(cat?.name || '');
  const dept = String(cat?.department_name || '');
  return NEONATAL_NAME_RE.test(name) || /neonatal/i.test(dept);
}

function resolveEventCatalogName(eventType, opts = {}) {
  if (eventType === 'delivery') {
    const dt = String(opts.deliveryType || 'svd').toLowerCase();
    return DELIVERY_CATALOG[dt] || DELIVERY_CATALOG.svd;
  }
  return EVENT_CATALOG[eventType] || null;
}

async function findCatalogByName(db, name) {
  if (!name) return null;
  const [rows] = await db.query(
    `SELECT id, name, price, department_name
     FROM tbl_service_catalog
     WHERE status = 1 AND LOWER(TRIM(category)) = 'maternity'
       AND LOWER(TRIM(name)) = LOWER(TRIM(?))
     LIMIT 1`,
    [name]
  );
  return rows[0] || null;
}

async function findLinkedBabyPatientId(pool, motherPatientId) {
  const pid = parseInt(motherPatientId, 10) || 0;
  if (pid < 1) return null;
  const [rows] = await pool.query(
    `SELECT nb.patient_id
     FROM newborn_records nb
     JOIN maternity_patients mp ON mp.id = nb.maternity_patient_id
     WHERE mp.patient_id = ? AND nb.patient_id IS NOT NULL AND nb.birth_outcome = 'alive'
     ORDER BY nb.id DESC
     LIMIT 1`,
    [pid]
  );
  const babyId = parseInt(rows[0]?.patient_id, 10) || 0;
  return babyId > 0 ? babyId : null;
}

async function resolveBillingPatientId(pool, patientId, catalog) {
  const pid = parseInt(patientId, 10) || 0;
  if (pid < 1) return pid;
  const [[pt]] = await pool.query(
    'SELECT id, is_newborn FROM tbl_patient WHERE id = ? LIMIT 1',
    [pid]
  );
  if (!pt) return pid;
  if (parseInt(pt.is_newborn, 10) === 1) return pid;
  if (!isNeonatalCatalogItem(catalog)) return pid;
  const babyId = await findLinkedBabyPatientId(pool, pid);
  return babyId || pid;
}

async function listMaternityTickets(pool, maternityPatientId) {
  const mid = parseInt(maternityPatientId, 10) || 0;
  if (mid < 1) return [];
  await ensureMaternityBillingSchema(pool);
  const [rows] = await pool.query(
    `SELECT id, ticket_code, patient_id, total_amount, status, payment_method,
            maternity_event, paid_at, created_at
     FROM tbl_payment_ticket
     WHERE source_module = 'maternity' AND source_pk = ?
     ORDER BY COALESCE(paid_at, created_at) DESC, id DESC
     LIMIT 40`,
    [mid]
  );
  return rows || [];
}

function buildCashierPrepayUrl(opts = {}) {
  const p = new URLSearchParams({ prepay: '1' });
  if (opts.patientId) p.set('patient_id', String(opts.patientId));
  if (opts.serviceType) p.set('service', opts.serviceType);
  if (opts.catalogId) p.set('catalog_id', String(opts.catalogId));
  if (opts.maternityPatientId) p.set('maternity_id', String(opts.maternityPatientId));
  if (opts.event) p.set('maternity_event', opts.event);
  if (opts.babyPatientId) p.set('baby_patient_id', String(opts.babyPatientId));
  return `/cashier?${p.toString()}`;
}

async function buildBillingSnapshot(pool, summary) {
  await ensureMaternityBillingSchema(pool);
  const mid = parseInt(summary?.patient?.id, 10) || 0;
  const motherPatientId = parseInt(summary?.patient?.patient_id, 10) || 0;
  if (mid < 1) return { tickets: [], suggestions: [] };

  const tickets = await listMaternityTickets(pool, mid);
  const paidEvents = new Set(
    tickets.filter((t) => String(t.status).toLowerCase() === 'paid' && t.maternity_event).map((t) => t.maternity_event)
  );

  const suggestions = [];
  const ancCount = (summary.antenatal_visits || []).length;
  if (ancCount > 0) {
    const event = ancCount === 1 ? 'anc_booking' : 'anc_routine';
    const catName = resolveEventCatalogName(event);
    const cat = await findCatalogByName(pool, catName);
    if (cat) {
      suggestions.push({
        event,
        label: cat.name,
        catalog_id: cat.id,
        price: cat.price,
        paid: paidEvents.has(event),
        cashier_url: buildCashierPrepayUrl({
          patientId: motherPatientId,
          serviceType: 'maternity',
          catalogId: cat.id,
          maternityPatientId: mid,
          event,
        }),
      });
    }
  }

  if (summary.labor_delivery) {
    const laborEvent = 'labor_admit';
    const laborCat = await findCatalogByName(pool, resolveEventCatalogName(laborEvent));
    if (laborCat) {
      suggestions.push({
        event: laborEvent,
        label: laborCat.name,
        catalog_id: laborCat.id,
        price: laborCat.price,
        paid: paidEvents.has(laborEvent),
        cashier_url: buildCashierPrepayUrl({
          patientId: motherPatientId,
          serviceType: 'maternity',
          catalogId: laborCat.id,
          maternityPatientId: mid,
          event: laborEvent,
        }),
      });
    }

    if (summary.labor_delivery.delivery_id) {
      const deliveryEvent = 'delivery';
      const catName = resolveEventCatalogName(deliveryEvent, {
        deliveryType: summary.labor_delivery.delivery_type,
      });
      const delCat = await findCatalogByName(pool, catName);
      if (delCat) {
        suggestions.push({
          event: deliveryEvent,
          label: delCat.name,
          catalog_id: delCat.id,
          price: delCat.price,
          paid: paidEvents.has(deliveryEvent),
          cashier_url: buildCashierPrepayUrl({
            patientId: motherPatientId,
            serviceType: 'maternity',
            catalogId: delCat.id,
            maternityPatientId: mid,
            event: deliveryEvent,
          }),
        });
      }
    }
  }

  const pncCount = (summary.postnatal_visits || []).length;
  if (pncCount > 0) {
    const event = 'pnc_routine';
    const cat = await findCatalogByName(pool, resolveEventCatalogName(event));
    if (cat) {
      suggestions.push({
        event,
        label: cat.name,
        catalog_id: cat.id,
        price: cat.price,
        paid: paidEvents.has(event),
        cashier_url: buildCashierPrepayUrl({
          patientId: motherPatientId,
          serviceType: 'maternity',
          catalogId: cat.id,
          maternityPatientId: mid,
          event,
        }),
      });
    }
  }

  for (const nb of summary.newborns || []) {
    if (!nb.patient_id) continue;
    const nicuCat = await findCatalogByName(pool, EVENT_CATALOG.nicu_day);
    if (nb.baby_nicu_admission && nicuCat) {
      suggestions.push({
        event: 'nicu_day',
        label: nicuCat.name,
        catalog_id: nicuCat.id,
        price: nicuCat.price,
        paid: paidEvents.has(`nicu_day_${nb.id}`),
        baby_patient_id: nb.patient_id,
        cashier_url: buildCashierPrepayUrl({
          patientId: nb.patient_id,
          serviceType: 'maternity',
          catalogId: nicuCat.id,
          maternityPatientId: mid,
          event: `nicu_day_${nb.id}`,
          babyPatientId: nb.patient_id,
        }),
      });
    }
  }

  return { tickets, suggestions, paid_events: [...paidEvents] };
}

async function tagMaternityTicket(conn, ticketId, maternityPatientId, eventType) {
  const tid = parseInt(ticketId, 10) || 0;
  const mid = parseInt(maternityPatientId, 10) || 0;
  if (tid < 1 || mid < 1) return;
  await conn.query('ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS source_module VARCHAR(32) NULL').catch(() => {});
  await conn.query('ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS source_pk INT NULL').catch(() => {});
  await conn.query('ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS maternity_event VARCHAR(40) NULL').catch(() => {});
  await conn.query(
    `UPDATE tbl_payment_ticket
     SET source_module = 'maternity', source_pk = ?, maternity_event = ?
     WHERE id = ?`,
    [mid, eventType || null, tid]
  );
}

async function hasPaidMaternityPrepay(conn, maternityPatientId, eventType) {
  const mid = parseInt(maternityPatientId, 10) || 0;
  const ev = String(eventType || '').trim();
  if (mid < 1 || !ev) return false;
  await ensureMaternityBillingSchema(conn);
  const [[row]] = await conn
    .query(
      `SELECT id FROM tbl_payment_ticket
        WHERE source_module = 'maternity'
          AND source_pk = ?
          AND maternity_event = ?
          AND LOWER(TRIM(status)) = 'paid'
        LIMIT 1`,
      [mid, ev]
    )
    .catch(() => [[null]]);
  return !!(row && row.id);
}

async function postIpdChargeFromCatalog(conn, opts) {
  const admissionId = parseInt(opts.admissionId, 10) || 0;
  const catalogId = parseInt(opts.catalogId, 10) || 0;
  const patientId = parseInt(opts.patientId, 10) || 0;
  const userId = parseInt(opts.userId, 10) || null;
  const facilityId = Math.max(1, parseInt(opts.facilityId, 10) || 1);
  const sourceModule = opts.sourceModule || 'maternity';
  const sourcePk = parseInt(opts.sourcePk, 10) || 0;
  if (admissionId < 1 || catalogId < 1 || patientId < 1) return null;

  const { admissionAcceptsNewCharges } = require('./ipdSettlementGuard');
  const guard = await admissionAcceptsNewCharges(conn, admissionId);
  if (!guard.ok) return null;

  const [[cat]] = await conn.query(
    'SELECT id, name, price FROM tbl_service_catalog WHERE id = ? AND status = 1 LIMIT 1',
    [catalogId]
  );
  if (!cat) return null;

  const amt = parseFloat(cat.price) || 0;
  if (amt <= 0) return null;

  const [[dup]] = await conn.query(
    `SELECT id FROM tbl_ipd_charge
     WHERE admission_id = ? AND source_module = ? AND source_pk = ? AND description = ?
     LIMIT 1`,
    [admissionId, sourceModule, sourcePk, cat.name]
  ).catch(() => [[null]]);
  if (dup?.id) return dup.id;

  await conn.query('ALTER TABLE tbl_ipd_charge ADD COLUMN IF NOT EXISTS catalog_id INT NULL').catch(() => {});

  const [ins] = await conn.query(
    `INSERT INTO tbl_ipd_charge
     (facility_id, admission_id, patient_id, charge_type, description, amount, added_by, source_module, source_pk, catalog_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      facilityId,
      admissionId,
      patientId,
      'maternity',
      cat.name,
      amt,
      userId,
      sourceModule,
      sourcePk,
      catalogId,
    ]
  );
  await conn.query('UPDATE tbl_admission SET running_bill = COALESCE(running_bill,0) + ? WHERE id = ?', [
    amt,
    admissionId,
  ]);
  return ins.insertId;
}

async function getActiveIpdAdmissionId(conn, maternityPatientId) {
  const mid = parseInt(maternityPatientId, 10) || 0;
  const [[row]] = await conn.query(
    `SELECT lr.admission_id
     FROM labor_records lr
     JOIN tbl_admission a ON a.id = lr.admission_id
     WHERE lr.maternity_patient_id = ?
       AND (a.discharged_at IS NULL OR a.discharged_at = '0000-00-00 00:00:00' OR a.discharged_at = '0000-00-00')
     ORDER BY lr.admission_date DESC
     LIMIT 1`,
    [mid]
  );
  const aid = parseInt(row?.admission_id, 10) || 0;
  return aid > 0 ? aid : null;
}

async function applyMaternityBillingAfterEvent(conn, opts) {
  const mid = parseInt(opts.maternityPatientId, 10) || 0;
  const eventType = opts.eventType;
  const deliveryType = opts.deliveryType;
  if (mid < 1 || !eventType) return null;

  const admissionId = await getActiveIpdAdmissionId(conn, mid);
  if (!admissionId) return null;

  if (await hasPaidMaternityPrepay(conn, mid, eventType)) return null;

  const [[mp]] = await conn.query('SELECT patient_id FROM maternity_patients WHERE id = ? LIMIT 1', [mid]);
  const patientId = parseInt(mp?.patient_id, 10) || 0;
  if (patientId < 1) return null;

  const catName = resolveEventCatalogName(eventType, { deliveryType });
  const [[cat]] = await conn.query(
    `SELECT id FROM tbl_service_catalog WHERE status = 1 AND LOWER(TRIM(category)) = 'maternity' AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`,
    [catName]
  );
  if (!cat?.id) return null;

  return postIpdChargeFromCatalog(conn, {
    admissionId,
    catalogId: cat.id,
    patientId,
    userId: opts.userId,
    facilityId: opts.facilityId,
    sourceModule: 'maternity',
    sourcePk: mid,
  });
}

async function loadPatientMaternityEpisode(pool, patientId) {
  const pid = parseInt(patientId, 10) || 0;
  if (pid < 1) return null;

  const [rows] = await pool.query(
    `SELECT mp.*,
            (SELECT lr.status FROM labor_records lr WHERE lr.maternity_patient_id = mp.id ORDER BY lr.admission_date DESC LIMIT 1) AS labor_status,
            (SELECT COUNT(*) FROM antenatal_visits av WHERE av.maternity_patient_id = mp.id) AS anc_visit_count
     FROM maternity_patients mp
     WHERE mp.patient_id = ?
     ORDER BY mp.id DESC
     LIMIT 1`,
    [pid]
  );
  if (!rows.length) return null;
  const ep = rows[0];

  const [babies] = await pool.query(
    `SELECT nb.id, nb.neonatal_number, nb.patient_id, p.patient_code, nb.baby_nicu_admission, nb.baby_admission_id
     FROM newborn_records nb
     LEFT JOIN tbl_patient p ON p.id = nb.patient_id
     WHERE nb.maternity_patient_id = ? AND nb.patient_id IS NOT NULL
     ORDER BY nb.id DESC`,
    [ep.id]
  ).catch(() => [[]]);

  return {
    id: ep.id,
    antenatal_number: ep.antenatal_number,
    status: ep.status,
    risk_level: ep.risk_level,
    gravida: ep.gravida,
    para: ep.para,
    lmp: ep.lmp,
    edd: ep.edd,
    labor_status: ep.labor_status,
    anc_visit_count: parseInt(ep.anc_visit_count, 10) || 0,
    chart_url: `/maternity/chart/${ep.id}`,
    babies: babies || [],
  };
}

module.exports = {
  DELIVERY_CATALOG,
  EVENT_CATALOG,
  ensureMaternityBillingSchema,
  isNeonatalCatalogItem,
  resolveEventCatalogName,
  findCatalogByName,
  findLinkedBabyPatientId,
  resolveBillingPatientId,
  listMaternityTickets,
  buildCashierPrepayUrl,
  buildBillingSnapshot,
  tagMaternityTicket,
  postIpdChargeFromCatalog,
  applyMaternityBillingAfterEvent,
  loadPatientMaternityEpisode,
};
