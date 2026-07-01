'use strict';

const { ensureBillingCompanySchema } = require('./ensureBillingCompanySchema');

function companyActiveWhere(alias = '', pool) {
  const a = alias ? `${alias}.` : '';
  if (pool?.driver === 'postgres') {
    return `(${a}status IS NULL OR CAST(${a}status AS INTEGER) = 1)`;
  }
  return `(${a}status IS NULL OR ${a}status = 1)`;
}

function mapCompanyRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    facility_id: row.facility_id,
    name: String(row.name || '').trim(),
    tax_id: row.tax_id != null ? String(row.tax_id).trim() : '',
    billing_address: row.billing_address != null ? String(row.billing_address).trim() : '',
    phone: row.phone != null ? String(row.phone).trim() : '',
    email: row.email != null ? String(row.email).trim() : '',
    created_at: row.created_at || null,
  };
}

/** Multi-line block stored on payment tickets for print. */
function formatCompanyBillingBlock(company) {
  const c = company || {};
  const lines = [String(c.name || '').trim()].filter(Boolean);
  if (c.tax_id) lines.push(`Tax ID: ${c.tax_id}`);
  if (c.billing_address) lines.push(String(c.billing_address).trim());
  const contact = [c.email, c.phone].filter(Boolean).join(' · ');
  if (contact) lines.push(`Contact: ${contact}`);
  return lines.join('\n');
}

function primaryContact(company) {
  return String(company?.email || company?.phone || '').trim();
}

async function searchBillingCompanies(pool, facilityId, q, limit = 20) {
  await ensureBillingCompanySchema(pool);
  const fid = parseInt(String(facilityId || 1), 10) || 1;
  const lim = Math.min(Math.max(parseInt(String(limit), 10) || 20, 1), 50);
  const term = String(q || '').trim();
  const active = companyActiveWhere('c', pool);
  const params = [fid];
  let where = `c.facility_id = ? AND ${active}`;
  if (term) {
    const like = `%${term.replace(/[%_\\]/g, ' ').trim()}%`;
    where += ` AND (
      LOWER(c.name) LIKE LOWER(?)
      OR LOWER(COALESCE(c.tax_id, '')) LIKE LOWER(?)
      OR LOWER(COALESCE(c.email, '')) LIKE LOWER(?)
      OR LOWER(COALESCE(c.phone, '')) LIKE LOWER(?)
    )`;
    params.push(like, like, like, like);
  }
  const [rows] = await pool
    .query(
      `SELECT c.id, c.facility_id, c.name, c.tax_id, c.billing_address, c.phone, c.email, c.created_at
       FROM tbl_billing_company c
       WHERE ${where}
       ORDER BY c.name ASC
       LIMIT ?`,
      [...params, lim]
    )
    .catch(() => [[]]);
  return (rows || []).map(mapCompanyRow).filter(Boolean);
}

async function getBillingCompanyById(pool, id, facilityId) {
  await ensureBillingCompanySchema(pool);
  const cid = parseInt(String(id || ''), 10) || 0;
  const fid = parseInt(String(facilityId || 1), 10) || 1;
  if (cid < 1) return null;
  const active = companyActiveWhere('c', pool);
  const [rows] = await pool
    .query(
      `SELECT c.id, c.facility_id, c.name, c.tax_id, c.billing_address, c.phone, c.email, c.created_at
       FROM tbl_billing_company c
       WHERE c.id = ? AND c.facility_id = ? AND ${active}
       LIMIT 1`,
      [cid, fid]
    )
    .catch(() => [[]]);
  return mapCompanyRow(rows?.[0]);
}

async function createBillingCompany(pool, facilityId, data = {}) {
  await ensureBillingCompanySchema(pool);
  const fid = parseInt(String(facilityId || 1), 10) || 1;
  const name = String(data.name || '').trim().slice(0, 220);
  if (!name) return { ok: false, error: 'Company name is required.', status: 400 };

  const taxId = String(data.tax_id || '').trim().slice(0, 80) || null;
  const billingAddress = String(data.billing_address || '').trim().slice(0, 4000) || null;
  const phone = String(data.phone || '').trim().slice(0, 48) || null;
  const email = String(data.email || '').trim().slice(0, 180) || null;

  const active = companyActiveWhere('', pool);
  const [dupes] = await pool
    .query(
      `SELECT id FROM tbl_billing_company
       WHERE facility_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND ${active}
       LIMIT 1`,
      [fid, name]
    )
    .catch(() => [[]]);
  if (dupes?.length) {
    const existing = await getBillingCompanyById(pool, dupes[0].id, fid);
    return { ok: true, company: existing, created: false };
  }

  const statusVal = pool?.driver === 'postgres' ? 1 : 1;
  const [ins] = await pool
    .query(
      `INSERT INTO tbl_billing_company
       (facility_id, name, tax_id, billing_address, phone, email, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [fid, name, taxId, billingAddress, phone, email, statusVal]
    )
    .catch((e) => {
      throw e;
    });

  const company = await getBillingCompanyById(pool, ins?.insertId, fid);
  return { ok: true, company, created: true };
}

module.exports = {
  searchBillingCompanies,
  getBillingCompanyById,
  createBillingCompany,
  formatCompanyBillingBlock,
  primaryContact,
  mapCompanyRow,
};
