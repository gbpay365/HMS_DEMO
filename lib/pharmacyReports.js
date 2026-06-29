'use strict';

const { tableExists } = require('./hmsFinGeneralLedger');
const { resolvePharmacyReportRange } = require('./pharmacyReportsPeriod');
const { listExpiryReport } = require('./pharmacyExpiry');

const REPORT_CATEGORIES = [
  { key: 'sales', label: 'Sales & dispensing', icon: 'fa-shopping-cart' },
  { key: 'inventory', label: 'Inventory & stock', icon: 'fa-cubes' },
  { key: 'procurement', label: 'Procurement', icon: 'fa-truck' },
  { key: 'compliance', label: 'Compliance & quality', icon: 'fa-shield' },
];

const PHARMACY_REPORT_CATALOG = [
  {
    id: 'stock-movement',
    title: 'Stock Movement Ledger',
    subtitle: 'Inbound, outbound, and adjustment transactions with running balances.',
    category: 'inventory',
    icon: 'fa-exchange',
    accent: '#0891b2',
    soft: '#ecfeff',
  },
  {
    id: 'dispensing',
    title: 'Product Dispensing Analysis',
    subtitle: 'PHA-validated sales and served pharmacy lines by patient and product.',
    category: 'sales',
    icon: 'fa-medkit',
    accent: '#7c3aed',
    soft: '#f5f3ff',
  },
  {
    id: 'fast-moving',
    title: 'Fast-Moving Products',
    subtitle: 'Top sellers ranked by dispense volume and revenue velocity.',
    category: 'sales',
    icon: 'fa-line-chart',
    accent: '#d4537e',
    soft: '#fce4ec',
  },
  {
    id: 'dormant',
    title: 'Dormant & Slow-Moving Products',
    subtitle: 'SKUs with little or no movement — candidates for review or write-off.',
    category: 'inventory',
    icon: 'fa-hourglass-half',
    accent: '#d97706',
    soft: '#fffbeb',
  },
  {
    id: 'low-stock',
    title: 'Low Stock & Reorder Alert',
    subtitle: 'Products at or below reorder level requiring replenishment.',
    category: 'inventory',
    icon: 'fa-battery-quarter',
    accent: '#dc2626',
    soft: '#fef2f2',
  },
  {
    id: 'stock-valuation',
    title: 'Inventory Valuation Snapshot',
    subtitle: 'On-hand quantity and extended value by product and category.',
    category: 'inventory',
    icon: 'fa-calculator',
    accent: '#1e40af',
    soft: '#eff6ff',
  },
  {
    id: 'purchase-activity',
    title: 'Purchase & Receipt Activity',
    subtitle: 'Purchase orders confirmed and goods received in the period.',
    category: 'procurement',
    icon: 'fa-file-text-o',
    accent: '#534AB7',
    soft: '#EEEDFE',
  },
  {
    id: 'negative-stock',
    title: ' Negative Stock Exceptions',
    subtitle: 'Products with negative on-hand quantity requiring investigation.',
    category: 'compliance',
    icon: 'fa-exclamation-triangle',
    accent: '#b91c1c',
    soft: '#fef2f2',
  },
  {
    id: 'expiry',
    title: 'Medicine Expiry Horizon',
    subtitle: 'Products approaching or past expiry — linked to full expiry report.',
    category: 'compliance',
    icon: 'fa-calendar-times-o',
    accent: '#7c3aed',
    soft: '#f5f3ff',
  },
];

function getReportMeta(reportId) {
  return PHARMACY_REPORT_CATALOG.find((r) => r.id === reportId) || null;
}

function fmtInt(n) {
  const x = parseInt(n, 10);
  return Number.isFinite(x) ? x.toLocaleString() : '0';
}

function fmtMoney(n) {
  const x = parseFloat(n);
  return Number.isFinite(x) ? x.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '0';
}

function patientLabel(r) {
  const fn = String(r.first_name || '').trim();
  const ln = String(r.last_name || '').trim();
  return (fn + ' ' + ln).trim() || '—';
}

function buildResult(meta, range, kpis, columns, rows, extras = {}) {
  return {
    meta,
    range,
    kpis: kpis || [],
    columns: columns || [],
    rows: rows || [],
    ...extras,
  };
}

async function fetchStockMovementReport(pool, range) {
  if (!(await tableExists(pool, 'tbl_inventory_movement'))) {
    return buildResult(null, range, [], [], []);
  }
  const [rows] = await pool
    .query(
      `SELECT m.id, m.created_at, m.change_qty, m.qty_after, m.reason, m.note,
              i.name AS item_name, i.sku, i.category,
              TRIM(CONCAT(COALESCE(e.first_name,''), ' ', COALESCE(e.last_name,''))) AS user_name
         FROM tbl_inventory_movement m
         INNER JOIN tbl_inventory_item i ON i.id = m.inventory_item_id
         LEFT JOIN tbl_employee e ON e.id = m.user_id
        WHERE DATE(m.created_at) BETWEEN ? AND ?
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 500`,
      [range.start, range.end]
    )
    .catch(() => [[]]);

  let totalIn = 0;
  let totalOut = 0;
  const data = (rows || []).map((r) => {
    const ch = parseInt(r.change_qty, 10) || 0;
    if (ch > 0) totalIn += ch;
    else totalOut += Math.abs(ch);
    return {
      date: String(r.created_at || '').slice(0, 10),
      time: String(r.created_at || '').slice(11, 16),
      sku: r.sku || '—',
      product: r.item_name || '—',
      category: r.category || '—',
      change: (ch > 0 ? '+' : '') + fmtInt(ch),
      qty_after: fmtInt(r.qty_after),
      reason: r.reason || '—',
      note: (r.note || '').slice(0, 80),
      user: r.user_name || '—',
    };
  });

  return buildResult(
    getReportMeta('stock-movement'),
    range,
    [
      { label: 'Movements', value: fmtInt(data.length), tone: 'primary' },
      { label: 'Units in', value: fmtInt(totalIn), tone: 'success' },
      { label: 'Units out', value: fmtInt(totalOut), tone: 'warning' },
      { label: 'Net change', value: fmtInt(totalIn - totalOut), tone: 'muted' },
    ],
    [
      { key: 'date', label: 'Date' },
      { key: 'time', label: 'Time' },
      { key: 'sku', label: 'SKU' },
      { key: 'product', label: 'Product' },
      { key: 'category', label: 'Category' },
      { key: 'change', label: 'Change', align: 'right' },
      { key: 'qty_after', label: 'Qty after', align: 'right' },
      { key: 'reason', label: 'Reason' },
      { key: 'user', label: 'By' },
    ],
    data
  );
}

async function fetchDispensingReport(pool, range) {
  const [rows] = await pool
    .query(
      `SELECT oi.id, oi.item_name, oi.quantity, oi.unit_price, oi.service_code,
              oi.served_at, oi.status,
              p.first_name, p.last_name,
              TRIM(CONCAT(COALESCE(e.first_name,''), ' ', COALESCE(e.last_name,''))) AS pharmacist_name
         FROM tbl_opd_order_item oi
         INNER JOIN tbl_patient p ON p.id = oi.patient_id
         LEFT JOIN tbl_ employee e ON e.id = oi.served_by
        WHERE oi.item_type = 'pharmacy'
          AND oi.served_at IS NOT NULL
          AND DATE(oi.served_at) BETWEEN ? AND ?
        ORDER BY oi.served_at DESC
        LIMIT 500`,
      [range.start, range.end]
    )
    .catch(() => [[]]);

  let totalQty = 0;
  let totalValue = 0;
  const data = (rows || []).map((r) => {
    const qty = parseInt(r.quantity, 10) || 0;
    const price = parseFloat(r.unit_price) || 0;
    totalQty += qty;
    totalValue += qty * price;
    return {
      date: String(r.served_at || '').slice(0, 10),
      time: String(r.served_at || '').slice(11, 16),
      patient: patientLabel(r),
      product: r.item_name || '—',
      qty: fmtInt(qty),
      unit_price: fmtMoney(price),
      line_total: fmtMoney(qty * price),
      code: r.service_code || '—',
      pharmacist: r.pharmacist_name || '—',
      status: r.status || '—',
    };
  });

  return buildResult(
    getReportMeta('dispensing'),
    range,
    [
      { label: 'Lines dispense', value: fmtInt(data.length), tone: 'primary' },
      { label: 'Units dispense', value: fmtInt(totalQty), tone: 'success' },
      { label: 'Retail value', value: fmtMoney(totalValue) + ' XAF', tone: 'accent' },
    ],
    [
      { key: 'date', label: 'Date' },
      { key: 'time', label: 'Time' },
      { key: 'patient', label: 'Patient' },
      { key: 'product', label: 'Product' },
      { key: 'qty', label: 'Qty', align: 'right' },
      { key: 'unit_price', label: 'Unit price', align: 'right' },
      { key: 'line_total', label: 'Line total', align: 'right' },
      { key: 'code', label: 'Service code' },
      { key: 'pharmacist', label: 'Pharmacist' },
    ],
    data
  );
}

async function fetchFastMovingReport(pool, range) {
  const [rows] = await pool
    .query(
      `SELECT COALESCE(i.name, oi.item_name) AS product_name,
              COALESCE(i.sku, '—') AS sku,
              SUM(COALESCE(oi.quantity, 0)) AS total_qty,
              SUM(COALESCE(oi.quantity, 0) * COALESCE(oi.unit_price, 0)) AS total_value,
              COUNT(*) AS line_count
         FROM tbl_opd_order_item oi
         LEFT JOIN tbl_inventory_item i ON i.id = oi.inventory_item_id
        WHERE oi.item_type = 'pharmacy'
          AND oi.served_at IS NOT NULL
          AND DATE(oi.served_at) BETWEEN ? AND ?
        GROUP BY COALESCE(i.id, 0), COALESCE(i.name, oi.item_name), COALESCE(i.sku, '—')
        ORDER BY total_qty DESC, total_value DESC
        LIMIT 100`,
      [range.start, range.end]
    )
    .catch(() => [[]]);

  const data = (rows || []).map((r, idx) => ({
    rank: idx + 1,
    sku: r.sku || '—',
    product: r.product_name || '—',
    dispense_lines: fmtInt(r.line_count),
    total_qty: fmtInt(r.total_qty),
    total_value: fmtMoney(r.total_value) + ' XAF',
  }));

  return buildResult(
    getReportMeta('fast-moving'),
    range,
    [
      { label: 'Products ranked', value: fmtInt(data.length), tone: 'primary' },
      {
        label: 'Top product',
        value: data[0] ? data[0].product.slice(0, 40) : '—',
        tone: 'success',
      },
    ],
    [
      { key: 'rank', label: '#', align: 'right' },
      { key: 'sku', label: 'SKU' },
      { key: 'product', label: 'Product' },
      { key: 'dispense_lines', label: 'Dispense lines', align: 'right' },
      { key: 'total_qty', label: 'Units sold', align: 'right' },
      { key: 'total_value', label: 'Revenue', align: 'right' },
    ],
    data
  );
}

async function fetchDormantReport(pool, range) {
  const [rows] = await pool
    .query(
      `SELECT i.id, i.sku, i.name, i.quantity, i.unit_price, i.category,
              MAX(m.created_at) AS last_movement,
              MAX(oi.served_at) AS last_dispense
         FROM tbl_inventory_item i
         LEFT JOIN tbl_inventory_movement m ON m.inventory_item_id = i.id
         LEFT JOIN tbl_opd_order_item oi ON oi.inventory_item_id = i.id
           AND oi.item_type = 'pharmacy' AND oi.served_at IS NOT NULL
        WHERE COALESCE(i.quantity, 0) > 0
        GROUP BY i.id, i.sku, i.name, i.quantity, i.unit_price, i.category
        HAVING (
          MAX(oi.served_at) IS NULL OR DATE(MAX(oi.served_at)) < ?
        ) AND (
          MAX(m.created_at) IS NULL OR DATE(MAX(m.created_at)) < ?
        )
        ORDER BY COALESCE(MAX(oi.served_at), MAX(m.created_at), i.name) ASC
        LIMIT 200`,
      [range.start, range.start]
    )
    .catch(() => [[]]);

  const data = (rows || []).map((r) => {
    const last = r.last_dispense || r.last_movement;
    return {
      sku: r.sku || '—',
      product: r.name || '—',
      category: r.category || '—',
      on_hand: fmtInt(r.quantity),
      value: fmtMoney((parseInt(r.quantity, 10) || 0) * (parseFloat(r.unit_price) || 0)) + ' XAF',
      last_activity: last ? String(last).slice(0, 10) : 'Never',
    };
  });

  return buildResult(
    getReportMeta('dormant'),
    range,
    [
      { label: 'Dormant SKUs', value: fmtInt(data.length), tone: 'warning' },
      { label: 'Period reviewed', value: range.label, tone: 'muted' },
    ],
    [
      { key: 'sku', label: 'SKU' },
      { key: 'product', label: 'Product' },
      { key: 'category', label: 'Category' },
      { key: 'on_hand', label: 'On hand', align: 'right' },
      { key: 'value', label: 'Stock value', align: 'right' },
      { key: 'last_activity', label: 'Last activity' },
    ],
    data
  );
}

async function fetchLowStockReport(pool, range) {
  void range;
  const [rows] = await pool
    .query(
      `SELECT i.id, i.sku, i.name, i.quantity, i.reorder_level, i.unit_price, i.category
         FROM tbl_inventory_item i
        WHERE COALESCE(i.quantity, 0) <= COALESCE(i.reorder_level, 5)
        ORDER BY (COALESCE(i.quantity,0) - COALESCE(i.reorder_level,5)) ASC, i.name ASC
        LIMIT 300`
    )
    .catch(() => [[]]);

  const data = (rows || []).map((r) => {
    const qty = parseInt(r.quantity, 10) || 0;
    const reorder = parseInt(r.reorder_level, 10) || 5;
    return {
      sku: r.sku || '—',
      product: r.name || '—',
      category: r.category || '—',
      on_hand: fmtInt(qty),
      reorder_level: fmtInt(reorder),
      deficit: fmtInt(Math.max(0, reorder - qty)),
      unit_price: fmtMoney(r.unit_price),
    };
  });

  return buildResult(
    getReportMeta('low-stock'),
    range,
    [{ label: 'Below reorder', value: fmtInt(data.length), tone: 'danger' }],
    [
      { key: 'sku', label: 'SKU' },
      { key: 'product', label: 'Product' },
      { key: 'category', label: 'Category' },
      { key: 'on_hand', label: 'On hand', align: 'right' },
      { key: 'reorder_level', label: 'Reorder at', align: 'right' },
      { key: 'deficit', label: 'Shortfall', align: 'right' },
      { key: 'unit_price', label: 'Unit price', align: 'right' },
    ],
    data
  );
}

async function fetchStockValuationReport(pool, range) {
  void range;
  const [rows] = await pool
    .query(
      `SELECT i.id, i.sku, i.name, i.quantity, i.unit_price, i.category,
              (COALESCE(i.quantity,0) * COALESCE(i.unit_price,0)) AS extended_value
         FROM tbl_inventory_item i
        WHERE COALESCE(i.quantity, 0) <> 0 OR COALESCE(i.unit_price, 0) > 0
        ORDER BY extended_value DESC, i.name ASC
        LIMIT 400`
    )
    .catch(() => [[]]);

  let grandTotal = 0;
  const data = (rows || []).map((r) => {
    const ext = parseFloat(r.extended_value) || 0;
    grandTotal += ext;
    return {
      sku: r.sku || '—',
      product: r.name || '—',
      category: r.category || '—',
      on_hand: fmtInt(r.quantity),
      unit_price: fmtMoney(r.unit_price),
      extended_value: fmtMoney(ext) + ' XAF',
    };
  });

  return buildResult(
    getReportMeta('stock-valuation'),
    range,
    [
      { label: 'SKUs valued', value: fmtInt(data.length), tone: 'primary' },
      { label: 'Total inventory value', value: fmtMoney(grandTotal) + ' XAF', tone: 'accent' },
    ],
    [
      { key: 'sku', label: 'SKU' },
      { key: 'product', label: 'Product' },
      { key: 'category', label: 'Category' },
      { key: 'on_hand', label: 'On hand', align: 'right' },
      { key: 'unit_price', label: 'Unit cost', align: 'right' },
      { key: 'extended_value', label: 'Extended value', align: 'right' },
    ],
    data
  );
}

async function fetchPurchaseActivityReport(pool, fid, range) {
  if (!(await tableExists(pool, 'tbl_purchase_order'))) {
    return buildResult(getReportMeta('purchase-activity'), range, [], [], []);
  }
  const [rows] = await pool
    .query(
      `SELECT po.id, po.po_number, po.supplier_name, po.status, po.total_amount,
              po.created_at, po.issued_at,
              (SELECT COUNT(*) FROM tbl_purchase_order_line l WHERE l.purchase_order_id = po.id) AS line_count
         FROM tbl_purchase_order po
        WHERE po.facility_id = ?
          AND (
            DATE(po.created_at) BETWEEN ? AND ?
            OR (po.issued_at IS NOT NULL AND DATE(po.issued_at) BETWEEN ? AND ?)
          )
        ORDER BY COALESCE(po.issued_at, po.created_at) DESC
        LIMIT 200`,
      [fid, range.start, range.end, range.start, range.end]
    )
    .catch(() => [[]]);

  let received = 0;
  const data = (rows || []).map((r) => {
    if (String(r.status).toLowerCase() === 'received') received++;
    return {
      po_number: r.po_number || '—',
      supplier: r.supplier_name || '—',
      status: r.status || '—',
      lines: fmtInt(r.line_count),
      total: fmtMoney(r.total_amount) + ' XAF',
      created: String(r.created_at || '').slice(0, 10),
      received: r.issued_at ? String(r.issued_at).slice(0, 10) : '—',
    };
  });

  return buildResult(
    getReportMeta('purchase-activity'),
    range,
    [
      { label: 'POs in period', value: fmtInt(data.length), tone: 'primary' },
      { label: 'Received', value: fmtInt(received), tone: 'success' },
    ],
    [
      { key: 'po_number', label: 'PO #' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'status', label: 'Status' },
      { key: 'lines', label: 'Lines', align: 'right' },
      { key: 'total', label: 'Total', align: 'right' },
      { key: 'created', label: 'Created' },
      { key: 'received', label: 'Received' },
    ],
    data
  );
}

async function fetchNegativeStockReport(pool, range) {
  void range;
  const [rows] = await pool
    .query(
      `SELECT i.id, i.sku, i.name, i.quantity, i.unit_price, i.category
         FROM tbl_inventory_item i
        WHERE COALESCE(i.quantity, 0) < 0
        ORDER BY i.quantity ASC, i.name ASC
        LIMIT 100`
    )
    .catch(() => [[]]);

  const data = (rows || []).map((r) => ({
    sku: r.sku || '—',
    product: r.name || '—',
    category: r.category || '—',
    on_hand: fmtInt(r.quantity),
    unit_price: fmtMoney(r.unit_price),
  }));

  return buildResult(
    getReportMeta('negative-stock'),
    range,
    [{ label: 'Exceptions', value: fmtInt(data.length), tone: 'danger' }],
    [
      { key: 'sku', label: 'SKU' },
      { key: 'product', label: 'Product' },
      { key: 'category', label: 'Category' },
      { key: 'on_hand', label: 'On hand', align: 'right' },
      { key: 'unit_price', label: 'Unit price', align: 'right' },
    ],
    data
  );
}

async function fetchExpiryReport(pool, range, query) {
  void range;
  const days = parseInt(query.days, 10) || 30;
  const rows = await listExpiryReport(pool, { days });
  const data = (rows || []).map((r) => ({
    sku: r.sku || '—',
    product: r.name || '—',
    type: r.medicine_type_name || '—',
    category: r.medicine_category_name || '—',
    expiry: r.expiry_date || '—',
    on_hand: fmtInt(r.quantity),
    status: r.expired ? 'Expired' : 'Expiring soon',
  }));

  return buildResult(
    getReportMeta('expiry'),
    { ...range, label: `Next ${days} days` },
    [
      { label: 'Items flagged', value: fmtInt(data.length), tone: 'warning' },
      { label: 'Horizon', value: `${days} days`, tone: 'muted' },
    ],
    [
      { key: 'sku', label: 'SKU' },
      { key: 'product', label: 'Product' },
      { key: 'type', label: 'Type' },
      { key: 'category', label: 'Category' },
      { key: 'expiry', label: 'Expiry' },
      { key: 'on_hand', label: 'On hand', align: 'right' },
      { key: 'status', label: 'Status' },
    ],
    data,
    { expiryDays: days }
  );
}

const FETCHERS = {
  'stock-movement': fetchStockMovementReport,
  dispensing: fetchDispensingReport,
  'fast-moving': fetchFastMovingReport,
  dormant: fetchDormantReport,
  'low-stock': fetchLowStockReport,
  'stock-valuation': fetchStockValuationReport,
  'purchase-activity': fetchPurchaseActivityReport,
  'negative-stock': fetchNegativeStockReport,
  expiry: fetchExpiryReport,
};

async function runPharmacyReport(pool, reportId, query, fid) {
  const meta = getReportMeta(reportId);
  if (!meta) return null;
  const range = resolvePharmacyReportRange(query);
  const fn = FETCHERS[reportId];
  if (!fn) return null;
  if (reportId === 'purchase-activity') {
    return fn(pool, fid, range, query);
  }
  if (reportId === 'expiry') {
    return fn(pool, range, query);
  }
  return fn(pool, range, query);
}

const TYPE_FILTER_COLUMNS = ['reason', 'type', 'category', 'status'];

function detectTypeFilterColumn(columns) {
  const keys = (columns || []).map((c) => c.key);
  return TYPE_FILTER_COLUMNS.find((k) => keys.includes(k)) || null;
}

function buildTypeFilterOptions(rows, columnKey) {
  if (!columnKey) return [];
  const values = new Set();
  for (const row of rows || []) {
    const v = String(row[columnKey] || '').trim();
    if (v && v !== '—') values.add(v);
  }
  return ['all', ...[...values].sort((a, b) => a.localeCompare(b))];
}

function applyRowTypeFilter(reportData, rowtype, columnKey) {
  if (!reportData || !columnKey || !rowtype || rowtype === 'all') return reportData;
  const rows = (reportData.rows || []).filter((r) => String(r[columnKey]) === rowtype);
  return { ...reportData, rows };
}

module.exports = {
  REPORT_CATEGORIES,
  PHARMACY_REPORT_CATALOG,
  getReportMeta,
  runPharmacyReport,
  detectTypeFilterColumn,
  buildTypeFilterOptions,
  applyRowTypeFilter,
};
