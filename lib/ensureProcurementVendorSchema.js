'use strict';

/** Extend tbl_procurement_vendor with classification and suspend audit columns. */
async function ensureProcurementVendorSchema(pool) {
  const addCol = async (def) => {
    try {
      await pool.query(`ALTER TABLE tbl_procurement_vendor ADD COLUMN ${def}`);
    } catch (e) {
      const msg = String(e.message || '');
      const ignore =
        e.code === 'ER_DUP_FIELDNAME' ||
        e.errno === 1060 ||
        /Duplicate column/i.test(msg) ||
        /already exists/i.test(msg);
      if (!ignore) console.warn('ensureProcurementVendorSchema:', msg);
    }
  };
  await addCol('vendor_class VARCHAR(64) DEFAULT NULL');
  await addCol('suspended_at DATETIME DEFAULT NULL');
  await addCol('suspended_by INT DEFAULT NULL');
}

module.exports = { ensureProcurementVendorSchema };
