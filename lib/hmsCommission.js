'use strict';

async function listRules(pool, doctorId) {
  let sql = `SELECT r.*, e.first_name, e.last_name
             FROM tbl_doctor_commission_rule r
             JOIN tbl_employee e ON e.id = r.doctor_id
             WHERE r.active = 1`;
  const params = [];
  if (doctorId) {
    sql += ' AND r.doctor_id = ?';
    params.push(doctorId);
  }
  sql += ' ORDER BY e.last_name, r.id';
  const [rows] = await pool.query(sql, params).catch(() => [[]]);
  return rows || [];
}

function pickRule(rules, serviceKind) {
  const kind = String(serviceKind || 'consultation');
  const specific = rules.filter((r) => r.service_kind === kind);
  const all = rules.filter((r) => r.service_kind === 'all');
  const list = specific.length ? specific : all;
  return list[0] || null;
}

function calcCommission(rule, baseAmount) {
  const base = parseFloat(baseAmount) || 0;
  if (!rule || base <= 0) return 0;
  if (rule.rate_type === 'fixed') return parseFloat(rule.rate_value) || 0;
  return Math.round((base * (parseFloat(rule.rate_value) || 0)) / 100);
}

async function buildReport(pool, { doctorId, dateFrom, dateTo }) {
  const docId = parseInt(doctorId, 10) || 0;
  const from = dateFrom || new Date().toISOString().slice(0, 10);
  const to = dateTo || from;
  const rules = await listRules(pool, docId || null);
  const rulesByDoc = new Map();
  for (const r of rules) {
    if (!rulesByDoc.has(r.doctor_id)) rulesByDoc.set(r.doctor_id, []);
    rulesByDoc.get(r.doctor_id).push(r);
  }

  let consultSql = `
    SELECT c.id, c.created_at, c.patient_id, c.created_by AS doctor_id,
           e.first_name, e.last_name,
           p.first_name AS p_fn, p.last_name AS p_ln
    FROM tbl_consultation c
    JOIN tbl_employee e ON e.id = c.created_by
    JOIN tbl_patient p ON p.id = c.patient_id
    WHERE DATE(c.created_at) BETWEEN ? AND ?`;
  const params = [from, to];
  if (docId) {
    consultSql += ' AND c.created_by = ?';
    params.push(docId);
  }
  consultSql += ' ORDER BY c.created_at DESC LIMIT 500';
  const [consults] = await pool.query(consultSql, params).catch(() => [[]]);

  const lines = [];
  let totalCommission = 0;
  for (const c of consults || []) {
    const docRules = rulesByDoc.get(c.doctor_id) || [];
    const rule = pickRule(docRules, 'consultation');
    const base = parseFloat(c.consult_fee || 0) || 0;
    const fee = base > 0 ? base : 5000;
    const comm = calcCommission(rule, fee);
    totalCommission += comm;
    lines.push({
      date: c.created_at,
      doctor_id: c.doctor_id,
      doctor_name: `Dr. ${c.first_name} ${c.last_name}`,
      patient_name: `${c.p_fn} ${c.p_ln}`,
      service_kind: 'consultation',
      base_amount: fee,
      commission: comm,
      rule_name: rule ? rule.rule_name : '—',
    });
  }

  const [orderItems] = await pool.query(
    `SELECT oi.*, c.created_by AS doctor_id,
            e.first_name, e.last_name, p.first_name AS p_fn, p.last_name AS p_ln
     FROM tbl_opd_order_item oi
     LEFT JOIN tbl_consultation c ON c.id = oi.consultation_id
     LEFT JOIN tbl_employee e ON e.id = c.created_by
     JOIN tbl_patient p ON p.id = oi.patient_id
     WHERE oi.status IN ('paid','served','dispensed')
       AND DATE(oi.created_at) BETWEEN ? AND ?
       ${docId ? ' AND c.created_by = ?' : ''}
     ORDER BY oi.id DESC LIMIT 500`,
    docId ? [from, to, docId] : [from, to]
  ).catch(() => [[]]);

  for (const oi of orderItems || []) {
    if (!oi.doctor_id) continue;
    const docRules = rulesByDoc.get(oi.doctor_id) || [];
    const kind =
      oi.item_type === 'laboratory'
        ? 'laboratory'
        : oi.item_type === 'radiology'
          ? 'radiology'
          : oi.item_type === 'pharmacy'
            ? 'pharmacy'
            : 'all';
    const rule = pickRule(docRules, kind);
    const base =
      (parseFloat(oi.unit_price) || 0) * (parseFloat(oi.quantity) || 1);
    const comm = calcCommission(rule, base);
    if (comm <= 0) continue;
    totalCommission += comm;
    lines.push({
      date: oi.created_at,
      doctor_id: oi.doctor_id,
      doctor_name: `Dr. ${oi.first_name} ${oi.last_name}`,
      patient_name: `${oi.p_fn} ${oi.p_ln}`,
      service_kind: kind,
      base_amount: base,
      commission: comm,
      rule_name: rule ? rule.rule_name : '—',
    });
  }

  lines.sort((a, b) => new Date(b.date) - new Date(a.date));
  return { lines, totalCommission, dateFrom: from, dateTo: to };
}

async function logCommissionEntry(pool, entry) {
  const { doctorId, patientId, sourceType, sourceId, baseAmount, commissionAmount, ruleId, notes } =
    entry;
  if (!doctorId || commissionAmount <= 0) return false;
  const [[dup]] = await pool
    .query(
      'SELECT id FROM tbl_doctor_commission_log WHERE source_type=? AND source_id=? LIMIT 1',
      [sourceType, sourceId]
    )
    .catch(() => [[null]]);
  if (dup && dup.id) return false;
  await pool.query(
    `INSERT INTO tbl_doctor_commission_log
     (doctor_id, patient_id, source_type, source_id, base_amount, commission_amount, rule_id, notes)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      doctorId,
      patientId || null,
      sourceType,
      sourceId,
      baseAmount,
      commissionAmount,
      ruleId || null,
      notes || null,
    ]
  );
  return true;
}

/**
 * Accrue doctor commission after cashier settlement (ticket paid).
 */
async function accrueFromPaymentSettlement(pool, opts) {
  const ticketId = parseInt(opts.ticketId, 10) || 0;
  const patientId = parseInt(opts.patientId, 10) || 0;
  const lines = Array.isArray(opts.lines) ? opts.lines : [];
  if (ticketId < 1 || !lines.length) return { accrued: 0 };

  const rules = await listRules(pool);
  const rulesByDoc = new Map();
  for (const r of rules) {
    if (!rulesByDoc.has(r.doctor_id)) rulesByDoc.set(r.doctor_id, []);
    rulesByDoc.get(r.doctor_id).push(r);
  }

  let accrued = 0;
  let lineIdx = 0;

  for (const ln of lines) {
    const base =
      parseFloat(ln.patient_due != null ? ln.patient_due : 0) ||
      (parseFloat(ln.unit_price || ln.amount || 0) || 0) * (parseFloat(ln.quantity || 1) || 1);
    if (base <= 0) {
      lineIdx++;
      continue;
    }

    if (ln.source_module === 'opd_order_item' && ln.source_pk) {
      const oid = parseInt(ln.source_pk, 10);
      const [[oi]] = await pool
        .query(
          `SELECT oi.item_type, oi.consultation_id, c.created_by AS doctor_id, c.patient_id
           FROM tbl_opd_order_item oi
           LEFT JOIN tbl_consultation c ON c.id = oi.consultation_id
           WHERE oi.id=? LIMIT 1`,
          [oid]
        )
        .catch(() => [[null]]);
      if (!oi || !oi.doctor_id) {
        lineIdx++;
        continue;
      }
      const kind =
        oi.item_type === 'laboratory'
          ? 'laboratory'
          : oi.item_type === 'radiology'
            ? 'radiology'
            : oi.item_type === 'pharmacy'
              ? 'pharmacy'
              : 'all';
      const rule = pickRule(rulesByDoc.get(oi.doctor_id) || [], kind);
      const comm = calcCommission(rule, base);
      if (
        comm > 0 &&
        (await logCommissionEntry(pool, {
          doctorId: oi.doctor_id,
          patientId: oi.patient_id || patientId,
          sourceType: 'opd_order_item',
          sourceId: oid,
          baseAmount: base,
          commissionAmount: comm,
          ruleId: rule ? rule.id : null,
          notes: `Ticket #${ticketId}`,
        }))
      ) {
        accrued++;
      }
    } else {
      let doctorId = parseInt(ln.doctor_id || ln.assigned_doctor_id, 10) || 0;
      let serviceKind = 'consultation';
      if (String(ln.kind || '').includes('lab')) serviceKind = 'laboratory';
      else if (String(ln.kind || '').includes('rad')) serviceKind = 'radiology';
      else if (String(ln.kind || '').includes('pha') || String(ln.kind || '').includes('pharm')) {
        serviceKind = 'pharmacy';
      }

      if (!doctorId && opts.consultationId) {
        const [[c]] = await pool
          .query('SELECT created_by FROM tbl_consultation WHERE id=? LIMIT 1', [
            opts.consultationId,
          ])
          .catch(() => [[null]]);
        doctorId = c ? parseInt(c.created_by, 10) || 0 : 0;
      }

      if (doctorId) {
        const rule = pickRule(rulesByDoc.get(doctorId) || [], serviceKind);
        const comm = calcCommission(rule, base);
        if (
          comm > 0 &&
          (await logCommissionEntry(pool, {
            doctorId,
            patientId,
            sourceType: 'payment_ticket_line',
            sourceId: `${ticketId}-${lineIdx}`,
            baseAmount: base,
            commissionAmount: comm,
            ruleId: rule ? rule.id : null,
            notes: (ln.description || ln.kind || 'Service') + ` · ticket #${ticketId}`,
          }))
        ) {
          accrued++;
        }
      }
    }
    lineIdx++;
  }

  if (opts.consultationId) {
    const cid = parseInt(opts.consultationId, 10);
    const [[c]] = await pool
      .query('SELECT created_by, patient_id FROM tbl_consultation WHERE id=? LIMIT 1', [cid])
      .catch(() => [[null]]);
    if (c && c.created_by) {
      const hasConsultLine = lines.some(
        (ln) =>
          String(ln.kind || '').toLowerCase().includes('consult') ||
          String(ln.description || '').toLowerCase().includes('consult')
      );
      if (!hasConsultLine) {
        const ticketTotal = lines.reduce(
          (s, ln) =>
            s +
            (parseFloat(ln.patient_due != null ? ln.patient_due : 0) ||
              (parseFloat(ln.unit_price || 0) || 0) * (parseFloat(ln.quantity || 1) || 1)),
          0
        );
        if (ticketTotal > 0) {
          const rule = pickRule(rulesByDoc.get(c.created_by) || [], 'consultation');
          const comm = calcCommission(rule, ticketTotal);
          if (
            comm > 0 &&
            (await logCommissionEntry(pool, {
              doctorId: c.created_by,
              patientId: c.patient_id || patientId,
              sourceType: 'consultation_ticket',
              sourceId: ticketId,
              baseAmount: ticketTotal,
              commissionAmount: comm,
              ruleId: rule ? rule.id : null,
              notes: `Consultation settlement ticket #${ticketId}`,
            }))
          ) {
            accrued++;
          }
        }
      }
    }
  }

  return { accrued };
}

module.exports = {
  listRules,
  pickRule,
  calcCommission,
  buildReport,
  logCommissionEntry,
  accrueFromPaymentSettlement,
};
