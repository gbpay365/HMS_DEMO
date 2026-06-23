'use strict';

const ensureClinicalDeptRequisitionSchema = require('./ensureClinicalDeptRequisitionSchema');
const { ensureProcurementExtendedSchema } = require('./ensureProcurementExtendedSchema');
const { nextPrNumber } = require('./procurementPurchaseRequest');
const { parseQtyWithUom } = require('./procurementQty');
const { normalizeProcurementUom } = require('./procurementUnits');

const ITEM_TYPES = [
  { value: 'reagent', label: 'Reagent' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'spare_part', label: 'Spare part' },
  { value: 'other', label: 'Other' },
];

const DEPT_LABELS = {
  laboratory: 'Laboratory',
  radiology: 'Radiology',
};

const { buildItemOptions } = require('./clinicalDeptItemCatalog');

const DEPT_INVENTORY_HINTS = {
  laboratory: /\b(lab|laboratory|reagent|hematology|chemistry|microbiology|parasit|histolog|immunolog|calibrat|control\s*serum|specimen|pipette|slide|cuvette|buffer|stain|culture|lims)\b/i,
  radiology: /\b(radiolog|x-?ray|xray|imaging|contrast|ultrasound|mri|ct\s|fluoro|film|cassette|lead\s*apron|probe|gel|doppler|mammograph|nuclear)\b/i,
};

function departmentLabel(dept) {
  return DEPT_LABELS[String(dept || '').toLowerCase()] || String(dept || 'Department');
}

async function nextReqNumber(pool, facilityId, department) {
  await ensureClinicalDeptRequisitionSchema(pool);
  const y = new Date().getFullYear();
  const code = String(department || 'dept').toLowerCase() === 'radiology' ? 'RAD' : 'LAB';
  const pfx = `REQ-${code}-${y}-`;
  const [[row]] = await pool
    .query(
      'SELECT req_number FROM tbl_clinical_dept_requisition WHERE facility_id = ? AND req_number LIKE ? ORDER BY id DESC LIMIT 1',
      [facilityId, `${pfx}%`]
    )
    .catch(() => [[null]]);
  let n = 1;
  const last = row && row.req_number ? String(row.req_number) : '';
  const m = last.match(/-(\d+)$/);
  if (m) n = parseInt(m[1], 10) + 1 || 1;
  return pfx + String(n).padStart(4, '0');
}

async function loadInventoryForDepartment(pool, department, limit = 600) {
  const hint = DEPT_INVENTORY_HINTS[String(department || '').toLowerCase()] || null;
  const [rows] = await pool
    .query(
      `SELECT i.id, i.name, i.sku, i.quantity, COALESCE(i.reorder_level, 0) AS reorder_level,
              COALESCE(c.name, '') AS category_name
         FROM tbl_inventory_item i
         LEFT JOIN tbl_inventory_category c ON c.id = i.category_id
        ORDER BY (i.quantity > 0) DESC,
                 (i.quantity > 0 AND i.quantity <= COALESCE(i.reorder_level, 0)) DESC,
                 i.name ASC
        LIMIT ?`,
      [Math.max(50, Math.min(800, limit))]
    )
    .catch(() => [[]]);

  const all = (Array.isArray(rows) ? rows : []).map((r) => {
    const qty = parseInt(r.quantity, 10) || 0;
    const reorder = parseInt(r.reorder_level, 10) || 0;
    let stockLabel = 'In stock';
    if (qty <= 0) stockLabel = 'Out of stock';
    else if (reorder > 0 && qty <= reorder) stockLabel = 'Low stock';
    const sku = String(r.sku || '').trim();
    const name = String(r.name || '').trim();
    const category = String(r.category_name || '').trim();
    const hay = `${name} ${category} ${sku}`;
    const deptMatch = hint ? hint.test(hay) : false;
    return {
      id: r.id,
      name,
      sku,
      qty,
      reorder,
      stockLabel,
      category,
      deptMatch,
      label: `${name}${sku ? ` · ${sku}` : ''} — ${qty} on hand · ${stockLabel}`,
    };
  });

  const matched = all.filter((it) => it.deptMatch);
  const base = matched.length >= 5 ? matched : all;
  return base.slice(0, limit);
}

async function loadRequisitionsForUser(pool, facilityId, department, userId, limit = 80) {
  await ensureClinicalDeptRequisitionSchema(pool);
  await ensureProcurementExtendedSchema(pool);
  const [rows] = await pool.query(
    `SELECT r.*, e.first_name, e.last_name, pr.pr_number AS procurement_pr_number, pr.status AS procurement_pr_status
       FROM tbl_clinical_dept_requisition r
       LEFT JOIN tbl_employee e ON e.id = r.requested_by
       LEFT JOIN tbl_procurement_purchase_request pr ON pr.id = r.procurement_pr_id
      WHERE r.facility_id = ? AND r.department = ? AND r.requested_by = ?
      ORDER BY r.id DESC
      LIMIT ?`,
    [facilityId, department, userId, Math.max(1, Math.min(200, limit))]
  );
  const list = Array.isArray(rows) ? rows : [];
  const ids = list.map((r) => r.id);
  const linesByReq = {};
  if (ids.length) {
    const [lineRows] = await pool.query(
      `SELECT * FROM tbl_clinical_dept_requisition_line WHERE requisition_id IN (${ids.map(() => '?').join(',')}) ORDER BY requisition_id, id`,
      ids
    );
    for (const ln of lineRows || []) {
      if (!linesByReq[ln.requisition_id]) linesByReq[ln.requisition_id] = [];
      linesByReq[ln.requisition_id].push(ln);
    }
  }
  return list.map((r) => ({
    ...r,
    requester_name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
    lines: linesByReq[r.id] || [],
  }));
}

function normalizeItemType(raw) {
  const v = String(raw || 'consumable').toLowerCase();
  return ITEM_TYPES.some((t) => t.value === v) ? v : 'consumable';
}

function parseLinesFromBody(body) {
  const toArr = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);
  const itemTypes = toArr(body.item_type);
  const descriptions = toArr(body.description);
  const invIds = toArr(body.inventory_item_id);
  const qtys = toArr(body.quantity);
  const uoms = toArr(body.uom);
  const remarks = toArr(body.remarks);
  const n = Math.max(itemTypes.length, descriptions.length, invIds.length, qtys.length, uoms.length, remarks.length);
  const lines = [];
  for (let i = 0; i < n; i++) {
    const inventory_item_id = parseInt(invIds[i], 10) || null;
    let description = String(descriptions[i] || '').trim();
    const item_type = normalizeItemType(itemTypes[i]);
    const { quantity, uom } = parseQtyWithUom(qtys[i], uoms[i]);
    const remark = String(remarks[i] || '').trim().slice(0, 500) || null;
    if (!description && inventory_item_id) {
      description = String(body[`inv_name_${inventory_item_id}`] || '').trim();
    }
    if (!description) continue;
    lines.push({
      item_type,
      description: description.slice(0, 512),
      quantity: quantity || 1,
      uom: normalizeProcurementUom(uom),
      inventory_item_id,
      remarks: remark,
    });
  }
  return lines;
}

async function createProcurementPrFromRequisition(pool, { facilityId, userId, department, reqId, reqNumber, notes, neededBy, lines }) {
  await ensureProcurementExtendedSchema(pool);
  const deptLabel = departmentLabel(department);
  const title = `${deptLabel} — supplies ${reqNumber}`.slice(0, 255);
  const prNumber = await nextPrNumber(pool, facilityId);
  const summary = [
    `Department requisition ${reqNumber} (${deptLabel}).`,
    notes ? `Notes: ${notes}` : null,
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 2000);

  const [ins] = await pool.query(
    `INSERT INTO tbl_procurement_purchase_request
      (facility_id, pr_number, title, status, needed_by, summary_description, notes, created_by, issued_at, source_department, source_requisition_id)
     VALUES (?,?,?,'issued',?,?,?,?,NOW(),?,?)`,
    [
      facilityId,
      prNumber,
      title,
      neededBy,
      summary || null,
      `Linked requisition ${reqNumber}`.slice(0, 512),
      userId,
      String(department || '').slice(0, 32),
      reqId,
    ]
  );
  const prId = ins.insertId;
  let lineNo = 0;
  for (const ln of lines) {
    lineNo += 1;
    const desc = `[${ln.item_type}] ${ln.description}${ln.remarks ? ` — ${ln.remarks}` : ''}`.slice(0, 512);
    await pool.query(
      `INSERT INTO tbl_procurement_purchase_request_line
        (purchase_request_id, line_no, description, quantity, uom, inventory_item_id)
       VALUES (?,?,?,?,?,?)`,
      [prId, lineNo, desc, ln.quantity, ln.uom, ln.inventory_item_id]
    );
  }
  await pool.query('UPDATE tbl_clinical_dept_requisition SET procurement_pr_id = ?, status = ? WHERE id = ?', [
    prId,
    'submitted',
    reqId,
  ]);
  return { prId, prNumber };
}

module.exports = {
  ITEM_TYPES,
  DEPT_LABELS,
  departmentLabel,
  nextReqNumber,
  buildItemOptions,
  loadInventoryForDepartment,
  loadRequisitionsForUser,
  parseLinesFromBody,
  createProcurementPrFromRequisition,
};
