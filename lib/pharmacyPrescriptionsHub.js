'use strict';

function patientInitials(first, last) {
  const f = String(first || '').trim();
  const l = String(last || '').trim();
  return ((f[0] || '') + (l[0] || '')).toUpperCase() || '?';
}

function formatRxNumber(id) {
  const n = parseInt(id, 10) || 0;
  if (!n) return 'RX-—';
  const year = new Date().getFullYear();
  return `RX-${year}-${String(n).padStart(4, '0')}`;
}

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function parseItemsText(items) {
  if (!items || !String(items).trim()) return [];
  return String(items)
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      drug: line,
      qty: null,
      dosage: '',
      inStock: true,
      dispensed: false,
      lineId: null,
    }));
}

function mapLineToDrug(line, inventoryByKey) {
  const name = String(line.medication_name || line.item_name || line.description || '').trim();
  const inv = line.inventory_item_id
    ? inventoryByKey.get(`id:${line.inventory_item_id}`)
    : inventoryByKey.get(`name:${name.toLowerCase()}`);
  const qty = line.quantity != null ? Number(line.quantity) : null;
  const dosage = [line.medication_dose, line.medication_route].filter(Boolean).join(' · ') || '';
  const stockQty = inv ? Number(inv.quantity) || 0 : null;
  const inStock = stockQty == null ? true : stockQty > 0;
  return {
    drug: name || 'Medication',
    qty,
    dosage,
    inStock,
    dispensed: String(line.dispense_status || '').toLowerCase() === 'dispensed',
    lineId: line.id || null,
  };
}

const STATUS_STEP = {
  'rx-new': 0,
  'rx-preparing': 1,
  'rx-out-of-stock': 1,
  'rx-ready': 2,
  'rx-partial': 2,
  'rx-dispensed': 3,
  'rx-cancelled': 0,
};

function mapWorkflowStatus(dbStatus, drugs = []) {
  const s = String(dbStatus || 'active').toLowerCase();
  if (/cancel/.test(s)) return 'rx-cancelled';
  if (/partial/.test(s)) return 'rx-partial';
  if (/dispens|complet|filled/.test(s)) return 'rx-dispensed';
  if (/ready|pickup/.test(s)) return 'rx-ready';
  if (/prepar/.test(s)) return 'rx-preparing';

  const medLines = drugs.filter((d) => d.drug);
  if (medLines.length) {
    const allDispensed = medLines.every((d) => d.dispensed);
    const anyDispensed = medLines.some((d) => d.dispensed);
    const anyOut = medLines.some((d) => d.inStock === false);
    if (allDispensed) return 'rx-dispensed';
    if (anyOut && !allDispensed) return 'rx-out-of-stock';
    if (anyDispensed && !allDispensed) return 'rx-partial';
    if (anyDispensed) return 'rx-preparing';
  }
  return 'rx-new';
}

function computeRxStats(queue) {
  const today = new Date().toISOString().slice(0, 10);
  const counts = {
    today: 0,
    active: 0,
    new: 0,
    preparing: 0,
    ready: 0,
    dispensed: 0,
  };
  for (const rx of queue) {
    const created = rx.created_at ? String(rx.created_at).slice(0, 10) : '';
    if (created === today) counts.today += 1;
    const st = rx.workflowStatus;
    if (st !== 'rx-dispensed' && st !== 'rx-cancelled') counts.active += 1;
    if (st === 'rx-new') counts.new += 1;
    else if (st === 'rx-preparing' || st === 'rx-out-of-stock') counts.preparing += 1;
    else if (st === 'rx-ready' || st === 'rx-partial') counts.ready += 1;
    else if (st === 'rx-dispensed') counts.dispensed += 1;
  }
  return counts;
}

async function loadInventoryLookup(pool) {
  const [rows] = await pool
    .query('SELECT id, name, sku, quantity FROM tbl_inventory_item ORDER BY id DESC LIMIT 2000')
    .catch(() => [[]]);
  const map = new Map();
  for (const r of rows || []) {
    map.set(`id:${r.id}`, r);
    const name = String(r.name || '').trim().toLowerCase();
    if (name && !map.has(`name:${name}`)) map.set(`name:${name}`, r);
  }
  return map;
}

async function loadPharmacyPrescriptionQueue(pool, { limit = 80 } = {}) {
  const lim = Math.max(1, Math.min(200, parseInt(limit, 10) || 80));
  const [rows] = await pool
    .query(
      `SELECT r.id, r.patient_id, r.title, r.notes, r.items, r.status, r.created_at, r.created_by,
              p.first_name, p.last_name, p.patient_code,
              e.first_name AS doc_fn, e.last_name AS doc_ln,
              COALESCE(NULLIF(TRIM(e.primary_department), ''), r.title, '') AS department
       FROM tbl_prescription r
       JOIN tbl_patient p ON p.id = r.patient_id
       LEFT JOIN tbl_employee e ON e.id = r.created_by
       ORDER BY r.id DESC
       LIMIT ${lim}`
    )
    .catch(() => [[]]);

  const rxIds = (rows || []).map((r) => r.id);
  const linesByRx = {};
  if (rxIds.length) {
    const [lines] = await pool
      .query(
        `SELECT pl.*
         FROM tbl_prescription_line pl
         WHERE pl.prescription_id IN (${rxIds.map(() => '?').join(',')})
           AND pl.line_type = 'medication'
         ORDER BY pl.sort_order ASC, pl.id ASC`,
        rxIds
      )
      .catch(() => [[]]);
    for (const pl of lines || []) {
      if (!linesByRx[pl.prescription_id]) linesByRx[pl.prescription_id] = [];
      linesByRx[pl.prescription_id].push(pl);
    }
  }

  const inventoryByKey = await loadInventoryLookup(pool);

  const prescriptions = (rows || []).map((r) => {
    const lines = linesByRx[r.id] || [];
    const drugs = lines.length
      ? lines.map((pl) => mapLineToDrug(pl, inventoryByKey))
      : parseItemsText(r.items);
    const workflowStatus = mapWorkflowStatus(r.status, drugs);
    const doctorName =
      r.doc_fn || r.doc_ln ? `Dr. ${[r.doc_fn, r.doc_ln].filter(Boolean).join(' ')}` : '—';
    const patientName = [r.first_name, r.last_name].filter(Boolean).join(' ') || '—';
    const patientId = r.patient_code ? String(r.patient_code) : `P-${r.patient_id}`;

    return {
      id: r.id,
      rxNumber: formatRxNumber(r.id),
      patient: patientName,
      initials: patientInitials(r.first_name, r.last_name),
      patientId,
      patient_id: r.patient_id,
      doctor: doctorName,
      department: r.department || 'General',
      drugs,
      receivedAt: formatTime(r.created_at),
      created_at: r.created_at,
      status: r.status,
      workflowStatus,
      step: STATUS_STEP[workflowStatus] ?? 0,
      notes: r.notes || '',
      title: r.title || '',
      detailUrl: `/prescriptions/${r.id}`,
      printUrl: `/prescriptions/${r.id}/print`,
    };
  });

  return { prescriptions, rxStats: computeRxStats(prescriptions) };
}

module.exports = {
  loadPharmacyPrescriptionQueue,
  mapWorkflowStatus,
  formatRxNumber,
};
