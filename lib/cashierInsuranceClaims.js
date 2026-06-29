'use strict';

const CLAIM_OVERDUE_DAYS = 30;

function inferInsuranceMeta(linesJson) {
  try {
    const lines = typeof linesJson === 'string' ? JSON.parse(linesJson) : linesJson;
    if (!Array.isArray(lines) || !lines.length) return { insurance_pct: 0 };
    let insurancePct = 0;
    for (const ln of lines) {
      const pct = parseFloat(ln.insurer_covered_percent ?? ln.coverage_pct ?? 0) || 0;
      if (pct > insurancePct) insurancePct = pct;
    }
    return { insurance_pct: insurancePct };
  } catch (_) {
    return { insurance_pct: 0 };
  }
}

function claimRefFromId(id, createdAt) {
  const y = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  return `CLM-${y}-${String(id).padStart(3, '0')}`;
}

function policyFallback(carrierName, patientId) {
  const prefix = String(carrierName || 'POL')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 3)
    .toUpperCase() || 'POL';
  return `${prefix}-${String(patientId || 0).padStart(5, '0')}`;
}

function addDays(iso, days) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysSince(iso) {
  if (!iso) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
}

function resolveDisplayStatus(row) {
  const raw = String(row.raw_status || '').toLowerCase();
  const pay = String(row.payment_status || '').toLowerCase();
  if (raw === 'rejected' || raw === 'denied') return 'rejected';
  if (raw === 'clean' || raw === 'approved' || raw === 'paid' || pay === 'paid') return 'paid';
  if (raw === 'warning' || pay === 'partial') return 'partial';
  if ((row.balance_due || 0) > 0 && daysSince(row.submitted_at) >= CLAIM_OVERDUE_DAYS) return 'overdue';
  return 'pending';
}

function bucketForSummary(displayStatus) {
  if (displayStatus === 'paid') return 'approved';
  if (displayStatus === 'rejected') return 'rejected';
  return 'pending';
}

const { ensureCashierInsuranceClaimSchema } = require('./ensureCashierInsuranceClaimSchema');

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} [opts]
 */
async function fetchCashierInsuranceClaims(pool, opts = {}) {
  await ensureCashierInsuranceClaimSchema(pool);

  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 200, 1), 500);
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const [claimRows] = await pool
    .query(
      `SELECT
        c.id,
        c.patient_id,
        c.carrier_id,
        c.billed_amount,
        c.approved_amount,
        c.status,
        c.policy_number AS claim_policy_number,
        c.linked_ticket_code,
        c.cover_type,
        c.created_at,
        p.first_name,
        p.last_name,
        ic.name AS provider_name,
        pi.policy_number
      FROM tbl_insurance_claim c
      LEFT JOIN tbl_patient p ON p.id = c.patient_id
      LEFT JOIN tbl_insurance_carrier ic ON ic.id = c.carrier_id
      LEFT JOIN tbl_patient_insurance pi
        ON pi.patient_id = c.patient_id AND pi.carrier_id = c.carrier_id AND pi.is_primary = 1
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ?`,
      [limit]
    )
    .catch(() => [[]]);

  const [ticketRows] = await pool
    .query(
      `SELECT
        t.id AS ticket_id,
        t.ticket_code,
        t.total_amount,
        t.amount_paid,
        t.status,
        t.claim_status,
        t.created_at,
        t.paid_at,
        t.lines_json,
        p.id AS patient_id,
        p.first_name,
        p.last_name,
        ic.name AS provider_name,
        pi.policy_number,
        pi.insurer_covered_percent
      FROM tbl_payment_ticket t
      JOIN tbl_patient p ON p.id = t.patient_id
      LEFT JOIN tbl_patient_insurance pi ON pi.patient_id = p.id AND pi.is_primary = 1
      LEFT JOIN tbl_insurance_carrier ic ON ic.id = pi.carrier_id
      WHERE t.status NOT IN ('cancelled', 'canceled')
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT ?`,
      [limit]
    )
    .catch(() => [[]]);

  const claims = [];
  const seenTicketIds = new Set();

  for (const r of claimRows || []) {
    const claimed = parseFloat(r.billed_amount) || 0;
    const approved = r.approved_amount != null ? parseFloat(r.approved_amount) : null;
    const submittedAt = r.created_at;
    const row = {
      claim_id: r.id,
      claim_ref: claimRefFromId(r.id, submittedAt),
      patient_id: r.patient_id,
      patient_name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || '—',
      provider_name: r.provider_name || '—',
      policy_number: r.claim_policy_number || r.policy_number || policyFallback(r.provider_name, r.patient_id),
      submitted_at: submittedAt,
      claimed_amount: claimed,
      approved_amount: approved,
      balance_due: approved != null ? Math.max(0, claimed - approved) : claimed,
      raw_status: r.status || 'pending',
      payment_status: approved != null && approved >= claimed - 0.005 ? 'paid' : 'unpaid',
      ticket_code: r.linked_ticket_code || null,
      cover_type: r.cover_type || 'full_cover',
      source: 'claim',
    };
    row.display_status = resolveDisplayStatus(row);
    claims.push(row);
  }

  for (const r of ticketRows || []) {
    const meta = inferInsuranceMeta(r.lines_json);
    const pct = Math.max(meta.insurance_pct, parseFloat(r.insurer_covered_percent) || 0);
    const claimSt = String(r.claim_status || 'not_claimed').toLowerCase();
    if (pct <= 0 && claimSt === 'not_claimed') continue;
    if (seenTicketIds.has(r.ticket_id)) continue;
    seenTicketIds.add(r.ticket_id);

    const total = parseFloat(r.total_amount) || 0;
    const paid = parseFloat(r.amount_paid) || 0;
    const claimed = Math.round(total * (pct / 100) * 100) / 100 || total;
    const ticketPaid = String(r.status).toLowerCase() === 'paid' || paid >= total - 0.005;
    const approved = ticketPaid ? claimed : claimSt === 'claimed' ? Math.min(paid, claimed) : null;
    const row = {
      claim_id: r.ticket_id,
      claim_ref: claimRefFromId(r.ticket_id, r.created_at),
      patient_id: r.patient_id,
      patient_name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || '—',
      provider_name: r.provider_name || '—',
      policy_number: r.policy_number || policyFallback(r.provider_name, r.patient_id),
      submitted_at: r.created_at,
      claimed_amount: claimed,
      approved_amount: approved,
      balance_due: approved != null ? Math.max(0, claimed - approved) : claimed,
      raw_status: claimSt === 'denied' ? 'rejected' : claimSt === 'claimed' && ticketPaid ? 'paid' : claimSt,
      payment_status: ticketPaid ? 'paid' : paid > 0.005 ? 'partial' : 'unpaid',
      ticket_code: r.ticket_code,
      source: 'ticket',
    };
    row.display_status = resolveDisplayStatus(row);
    claims.push(row);
  }

  claims.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

  const monthClaims = claims.filter((c) => {
    const d = c.submitted_at ? new Date(c.submitted_at) : null;
    return d && !Number.isNaN(d.getTime()) && d >= new Date(monthStart);
  });

  const summary = {
    month_count: monthClaims.length,
    month_value: monthClaims.reduce((s, c) => s + (c.claimed_amount || 0), 0),
    approved_count: 0,
    approved_value: 0,
    pending_count: 0,
    pending_value: 0,
    rejected_count: 0,
    rejected_value: 0,
  };

  for (const c of claims) {
    const bucket = bucketForSummary(c.display_status);
    if (bucket === 'approved') {
      summary.approved_count += 1;
      summary.approved_value += c.approved_amount ?? c.claimed_amount ?? 0;
    } else if (bucket === 'rejected') {
      summary.rejected_count += 1;
      summary.rejected_value += c.claimed_amount || 0;
    } else if (c.display_status !== 'rejected') {
      summary.pending_count += 1;
      summary.pending_value += c.balance_due ?? c.claimed_amount ?? 0;
    }
  }

  return {
    claims,
    total: claims.length,
    summary,
    month_label: now.toLocaleString('en', { month: 'short' }),
  };
}

module.exports = {
  fetchCashierInsuranceClaims,
  claimRefFromId,
};
