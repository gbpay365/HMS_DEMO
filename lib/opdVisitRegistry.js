'use strict';

const paymentValidity = require('./paymentValidity');
const hmsFormatDate = require('./hmsFormatDate');
const pagination = require('./pagination');
const { enrichOpdVisitsRoomContext, enrichOpdVisitsDoctorFromPaymentTicket } = require('./opdVisitRoomQueue');

/** Mark paid codes that are past validity or have no uses left (blood-red column). */
async function enrichOpdVisitsPaymentCodeValidity(pool, visitRows, facilityId) {
  const fid = Number(facilityId) || 1;
  const list = (visitRows || []).filter(Boolean);
  const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const byNorm = new Map();
  for (const v of list) {
    v.payment_code_blood_red = false;
    v.payment_code_alert_title = '';
    v.payment_code_remaining_uses = null;
    v.payment_code_stale_reason = null;
    v.payment_code_max_uses = null;
    v.payment_code_uses_so_far = null;
    v.payment_code_valid_until_display = null;
    v.payment_code_validity_tooltip = '';
    const norm = paymentValidity.normalizePaymentCodeInput(v.payment_code);
    if (!norm) continue;
    if (!byNorm.has(norm)) byNorm.set(norm, []);
    byNorm.get(norm).push(v);
  }
  for (const [norm, visits] of byNorm) {
    let ticket = null;
    try {
      ticket = await paymentValidity.findPaidTicketByNormalizedCode(pool, norm);
    } catch (_) {
      ticket = null;
    }
    const st = String((ticket && ticket.status) || '').trim().toLowerCase();
    if (!ticket || st !== 'paid') continue;

    for (const v of visits) {
      let bloodRed = false;
      let title = '';
      let remainingUses = null;
      let staleReason = null;
      let maxUses = null;
      let usesSoFar = null;
      let validUntilDisplay = null;
      let validityTooltip = '';
      try {
        const qs = String(v.queue_status || '').toLowerCase();
        const excludeVisitId =
          qs !== 'completed' && qs !== 'cancelled' ? parseInt(String(v.id || ''), 10) || 0 : 0;
        const win = await paymentValidity.computePaidTicketValidityWindow(pool, ticket, norm, fid, {
          excludeVisitId,
        });
        const usesTimeValidity = paymentValidity.kindUsesConsultationValidity(win.kind);
        remainingUses = Math.max(0, win.maxUses - win.uses);
        maxUses = win.maxUses;
        usesSoFar = win.uses;
        if (usesTimeValidity) {
          try {
            validUntilDisplay = hmsFormatDate.formatDisplayDate(win.expires);
          } catch (_) {
            validUntilDisplay = paymentValidity.toLocalDateISO(win.expires) || '—';
          }
          const polLabel = paymentValidity.intervalPolicyLabel(win.policy);
          validityTooltip =
            'Payment validity · Days (system ' +
            win.systemDays +
            ', effective ' +
            win.effectiveDays +
            ') + Policy: ' +
            polLabel +
            '. Calendar end.';
          const today = startOfDay(new Date());
          if (today > win.expires) {
            bloodRed = true;
            staleReason = 'expired';
            title = 'Payment code expired on ' + hmsFormatDate.formatDisplayDate(win.expires) + '.';
          }
        }
        if (win.uses >= win.maxUses) {
          bloodRed = true;
          staleReason = 'depleted';
          title = 'No remaining uses (' + win.uses + ' of ' + win.maxUses + ' visit(s)).';
        }
      } catch (_) {
        /* ignore */
      }
      v.payment_code_blood_red = bloodRed;
      v.payment_code_alert_title = title;
      v.payment_code_remaining_uses = remainingUses;
      v.payment_code_stale_reason = staleReason;
      v.payment_code_max_uses = maxUses;
      v.payment_code_uses_so_far = usesSoFar;
      v.payment_code_valid_until_display = validUntilDisplay;
      v.payment_code_validity_tooltip = validityTooltip;
    }
  }
}

function defaultDateRange() {
  const today = new Date().toISOString().split('T')[0];
  const d90ago = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return { today, d90ago };
}

/**
 * @param {Record<string, string>} [query]
 */
function parseRegistryFilters(query = {}) {
  const { today, d90ago } = defaultDateRange();
  return {
    q: String(query.q || '').trim(),
    dateFrom: String(query.date_from || query.dateFrom || d90ago).trim() || d90ago,
    dateTo: String(query.date_to || query.dateTo || today).trim() || today,
    status: String(query.status || 'all').trim() || 'all',
    sort: String(query.sort || 'newest').trim() === 'oldest' ? 'oldest' : 'newest',
    dept: String(query.dept || '').trim(),
    doctor: parseInt(String(query.doctor || query.doctor_id || ''), 10) || 0,
  };
}

function buildRegistryWhere(filters, facilityId) {
  let where = 'v.facility_id = ? AND COALESCE(v.is_emergency, 0) = 0';
  const params = [facilityId];

  where += ' AND v.visit_date BETWEEN ? AND ?';
  params.push(filters.dateFrom, filters.dateTo);

  if (filters.q) {
    where +=
      ' AND (p.first_name LIKE ? OR p.last_name LIKE ? OR CONCAT(p.first_name," ",p.last_name) LIKE ? OR v.ticket_number LIKE ? OR COALESCE(v.department,"") LIKE ? OR COALESCE(v.chief_complaint,"") LIKE ? OR COALESCE(v.payment_code,"") LIKE ? OR COALESCE(p.patient_code,"") LIKE ?)';
    const like = `%${filters.q}%`;
    params.push(like, like, like, like, like, like, like, like);
  }
  if (filters.dept) {
    where += ' AND v.department = ?';
    params.push(filters.dept);
  }
  if (filters.doctor > 0) {
    where += ` AND (
      v.assigned_doctor_id = ?
      OR EXISTS (
        SELECT 1 FROM tbl_payment_ticket pt
        WHERE pt.ticket_code = v.payment_code AND pt.patient_id = v.patient_id
          AND CAST(JSON_UNQUOTE(JSON_EXTRACT(pt.lines_json, '$[0].assigned_doctor_id')) AS UNSIGNED) = ?
        LIMIT 1
      )
    )`;
    params.push(filters.doctor, filters.doctor);
  }
  if (filters.status === 'active') {
    where += " AND v.queue_status NOT IN ('completed','cancelled')";
  } else if (filters.status !== 'all') {
    where += ' AND v.queue_status = ?';
    params.push(filters.status);
  }

  const orderSql =
    filters.sort === 'oldest'
      ? 'v.visit_date ASC,  v.queue_started_at ASC,  v.id ASC'
      : 'v.visit_date DESC, v.queue_started_at DESC, v.id DESC';

  return { where, params, orderSql };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ facilityId: number, page?: number, pageSize?: number } & ReturnType<typeof parseRegistryFilters>} opts
 */
async function fetchOpdVisitRegistry(pool, opts) {
  const facilityId = Number(opts.facilityId) || 1;
  const filters = {
    q: opts.q || '',
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    status: opts.status || 'all',
    sort: opts.sort || 'newest',
    dept: opts.dept || '',
    doctor: opts.doctor || 0,
  };
  const page = Math.max(1, parseInt(String(opts.page || ''), 10) || 1);
  const pageSize = Math.min(
    pagination.MAX_PAGE_SIZE || 100,
    Math.max(1, parseInt(String(opts.pageSize || pagination.DEFAULT_PAGE_SIZE), 10) || pagination.DEFAULT_PAGE_SIZE)
  );
  const offset = (page - 1) * pageSize;
  const { where, params, orderSql } = buildRegistryWhere(filters, facilityId);

  const [[countRow]] = await pool.query(
    `SELECT COUNT(DISTINCT v.id) AS total FROM tbl_opd_visit v JOIN tbl_patient p ON p.id = v.patient_id WHERE ${where}`,
    params
  );
  const pager = pagination.metaFromTotal(countRow?.total || 0, page, pageSize);

  const [visits] = await pool.query(
    `SELECT v.*, p.first_name, p.last_name, p.patient_type, p.patient_code,
 doc.id AS doc_id,
 COALESCE(
  doc.first_name,
  (SELECT ept.first_name
     FROM tbl_payment_ticket pt
     LEFT JOIN tbl_employee ept ON ept.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(pt.lines_json, '$[0].assigned_doctor_id')) AS UNSIGNED)
    WHERE pt.ticket_code = v.payment_code AND pt.patient_id = v.patient_id
    ORDER BY pt.id DESC
    LIMIT 1)
 ) AS ref_fn,
 COALESCE(
  doc.last_name,
  (SELECT ept.last_name
     FROM tbl_payment_ticket pt
     LEFT JOIN tbl_employee ept ON ept.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(pt.lines_json, '$[0].assigned_doctor_id')) AS UNSIGNED)
    WHERE pt.ticket_code = v.payment_code AND pt.patient_id = v.patient_id
    ORDER BY pt.id DESC
    LIMIT 1)
 ) AS ref_ln,
 (SELECT es.first_name
    FROM tbl_consultation c2
    JOIN tbl_employee es ON es.id = c2.created_by
   WHERE c2.opd_visit_id = v.id
   ORDER BY c2.id DESC
   LIMIT 1) AS seen_fn,
 (SELECT es.last_name
    FROM tbl_consultation c2
    JOIN tbl_employee es ON es.id = c2.created_by
   WHERE c2.opd_visit_id = v.id
   ORDER BY c2.id DESC
   LIMIT 1) AS seen_ln,
 cr.code AS consultation_room_code,
 cr.name AS consultation_room_name,
 (SELECT MAX(v3.visit_date) FROM tbl_opd_visit v3
 WHERE v3.patient_id = v.patient_id AND v3.id <> v.id) AS prev_visit_date,
 (SELECT COUNT(*) FROM tbl_consultation cx WHERE cx.opd_visit_id = v.id) AS consult_count
 FROM tbl_opd_visit v
 JOIN tbl_patient p ON p.id = v.patient_id
 LEFT JOIN tbl_employee doc ON doc.id = v.assigned_doctor_id
 LEFT JOIN tbl_consultation_room cr ON cr.id = v.consultation_room_id
 WHERE ${where}
 ORDER BY ${orderSql}
 LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset]
  );

  await enrichOpdVisitsPaymentCodeValidity(pool, visits || [], facilityId);
  await enrichOpdVisitsDoctorFromPaymentTicket(pool, visits || []);
  await enrichOpdVisitsRoomContext(pool, visits || []);

  return {
    visits: visits || [],
    filters,
    pager: {
      ...pager,
      basePath: '/opd-queue',
      query: {
        q: filters.q,
        date_from: filters.dateFrom,
        date_to: filters.dateTo,
        status: filters.status,
        sort: filters.sort,
        dept: filters.dept,
        doctor: filters.doctor || undefined,
      },
      pageParam: 'p',
    },
    total: pager.total,
  };
}

module.exports = {
  parseRegistryFilters,
  buildRegistryWhere,
  fetchOpdVisitRegistry,
  enrichOpdVisitsPaymentCodeValidity,
  defaultDateRange,
};
