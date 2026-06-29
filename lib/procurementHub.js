'use strict';

const { tableExists } = require('./hmsFinGeneralLedger');

async function loadRecentPos(pool, fid, limit = 10) {
  if (!(await tableExists(pool, 'tbl_purchase_order'))) return [];
  try {
    const cap = Math.max(1, Math.min(200, parseInt(limit, 10) || 10));
    const [rows] = await pool.query(
      `SELECT id, facility_id, po_number, supplier_name, status, total_amount, created_at
       FROM tbl_purchase_order WHERE facility_id = ? ORDER BY created_at DESC LIMIT ${cap}`,
      [fid]
    );
    return rows || [];
  } catch (_) {
    return [];
  }
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} facilityId
 */
async function loadProcurementHubData(pool, facilityId) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  let stats = { vendors: 0, rfqs: 0 };
  if (await tableExists(pool, 'tbl_procurement_vendor')) {
    try {
      const [[v]] = await pool.query(
        'SELECT COUNT(*) AS c FROM tbl_procurement_vendor WHERE facility_id = ? AND is_active = 1',
        [fid]
      );
      stats.vendors = parseInt(v?.c, 10) || 0;
    } catch (_) {
      /* ignore */
    }
  }
  if (await tableExists(pool, 'tbl_procurement_rfq')) {
    try {
      const [[r]] = await pool.query(
        "SELECT COUNT(*) AS c FROM tbl_procurement_rfq WHERE facility_id = ? AND status IN ('draft','issued')",
        [fid]
      );
      stats.rfqs = parseInt(r?.c, 10) || 0;
    } catch (_) {
      /* ignore */
    }
  }
  const allPosForStats = await loadRecentPos(pool, fid, 200);
  const pos = allPosForStats.slice(0, 10);
  const pendingReceipt = allPosForStats.filter((po) => {
    const st = String(po.status || '').toLowerCase();
    return st === 'approved' || st === 'issued';
  }).length;
  return {
    stats: { ...stats, pending_receipt: pendingReceipt, po_count: allPosForStats.length },
    pos,
  };
}

function userCanProcureWrite(perms, role) {
  const p = Array.isArray(perms) ? perms : [];
  const r = String(role || '');
  if (r === '1' || r === '99') return true;
  return (
    p.includes('*') ||
    p.includes('procurement.write') ||
    p.includes('inventory.write') ||
    p.includes('pharmacy.write')
  );
}

module.exports = {
  loadRecentPos,
  loadProcurementHubData,
  userCanProcureWrite,
};
