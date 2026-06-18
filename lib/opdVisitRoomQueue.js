'use strict';

const paymentTicketDoctorSubquery = {
  fn: `(SELECT ept.first_name
     FROM tbl_payment_ticket pt
     LEFT JOIN tbl_employee ept ON ept.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(pt.lines_json, '$[0].assigned_doctor_id')) AS UNSIGNED)
    WHERE pt.ticket_code = v.payment_code AND pt.patient_id = v.patient_id
    ORDER BY pt.id DESC
    LIMIT 1)`,
  ln: `(SELECT ept.last_name
     FROM tbl_payment_ticket pt
     LEFT JOIN tbl_employee ept ON ept.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(pt.lines_json, '$[0].assigned_doctor_id')) AS UNSIGNED)
    WHERE pt.ticket_code = v.payment_code AND pt.patient_id = v.patient_id
    ORDER BY pt.id DESC
    LIMIT 1)`,
  id: `(SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(pt.lines_json, '$[0].assigned_doctor_id')) AS UNSIGNED)
     FROM tbl_payment_ticket pt
    WHERE pt.ticket_code = v.payment_code AND pt.patient_id = v.patient_id
    ORDER BY pt.id DESC
    LIMIT 1)`,
};

/**
 * Fill doc_fn/doc_ln and ticket_doctor_id from payment ticket when visit.assigned_doctor_id is empty.
 */
async function enrichOpdVisitsDoctorFromPaymentTicket(pool, visits) {
  if (!Array.isArray(visits) || !visits.length) return;

  const needLookup = visits.filter(
    (v) => !(parseInt(v.assigned_doctor_id, 10) || 0) && v.payment_code && (!v.doc_fn || !v.doc_ln)
  );
  if (!needLookup.length) {
    for (const v of visits) {
      if (!(parseInt(v.ticket_doctor_id, 10) || 0) && (parseInt(v.assigned_doctor_id, 10) || 0)) {
        v.ticket_doctor_id = parseInt(v.assigned_doctor_id, 10);
      }
    }
    return;
  }

  const ids = needLookup.map((v) => v.id).filter(Boolean);
  if (!ids.length) return;

  const [rows] = await pool
    .query(
      `SELECT v.id,
              CAST(JSON_UNQUOTE(JSON_EXTRACT(pt.lines_json, '$[0].assigned_doctor_id')) AS UNSIGNED) AS ticket_doctor_id,
              e.first_name AS ticket_doc_fn,
              e.last_name AS ticket_doc_ln
         FROM tbl_opd_visit v
         JOIN tbl_payment_ticket pt ON pt.ticket_code = v.payment_code AND pt.patient_id = v.patient_id
         LEFT JOIN tbl_employee e ON e.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(pt.lines_json, '$[0].assigned_doctor_id')) AS UNSIGNED)
        WHERE v.id IN (?)
        ORDER BY v.id, pt.id DESC`,
      [ids]
    )
    .catch(() => [[]]);

  const byVisit = new Map();
  for (const row of rows || []) {
    const vid = parseInt(row.id, 10) || 0;
    if (!vid || byVisit.has(vid)) continue;
    byVisit.set(vid, row);
  }

  for (const v of visits) {
    const assigned = parseInt(v.assigned_doctor_id, 10) || 0;
    if (assigned) {
      v.ticket_doctor_id = assigned;
      continue;
    }
    const hit = byVisit.get(v.id);
    if (!hit) continue;
    const tid = parseInt(hit.ticket_doctor_id, 10) || 0;
    if (tid) v.ticket_doctor_id = tid;
    if (!v.doc_fn && hit.ticket_doc_fn) {
      v.doc_fn = hit.ticket_doc_fn;
      v.doc_ln = hit.ticket_doc_ln;
    }
  }
}

/**
 * Resolve consultation room for queue displays:
 * - Explicit: visit.consultation_room_id (manual assign by front desk / nursing)
 * - Auto: first active room for the visit's facility where the assigned doctor is linked
 *   (tbl_consultation_room_doctor and/or legacy tbl_consultation_room.assigned_doctor_id)
 * Then compute per-room queue order (room_queue_no) for visit_date + effective room id within the same facility.
 */
async function enrichOpdVisitsRoomContext(pool, visits) {
  if (!Array.isArray(visits) || !visits.length) return;

  const fids = [...new Set(visits.map((v) => parseInt(String(v.facility_id ?? 1), 10) || 1))];
  const linksByFid = new Map();

  for (const fid of fids) {
    const [rooms] = await pool
      .query(
        `SELECT id, code, name, assigned_doctor_id, sort_order
           FROM tbl_consultation_room
          WHERE facility_id = ? AND status = 1
          ORDER BY sort_order ASC, id ASC`,
        [fid]
      )
      .catch(() => [[]]);
    const roomList = Array.isArray(rooms) ? rooms : [];

    const roomIds = roomList.map((r) => parseInt(r.id, 10)).filter((n) => n > 0);
    let linkRows = [];
    if (roomIds.length) {
      const [lr] = await pool
        .query('SELECT room_id, doctor_id FROM tbl_consultation_room_doctor WHERE room_id IN (?)', [roomIds])
        .catch(() => [[]]);
      linkRows = Array.isArray(lr) ? lr : [];
    }
    const roomToDoctors = new Map();
    for (const row of linkRows) {
      const rid = parseInt(row.room_id, 10) || 0;
      const did = parseInt(row.doctor_id, 10) || 0;
      if (!rid || !did) continue;
      if (!roomToDoctors.has(rid)) roomToDoctors.set(rid, new Set());
      roomToDoctors.get(rid).add(did);
    }
    for (const r of roomList) {
      const rid = parseInt(r.id, 10) || 0;
      const leg = parseInt(r.assigned_doctor_id, 10) || 0;
      if (!rid) continue;
      if (!roomToDoctors.has(rid)) roomToDoctors.set(rid, new Set());
      if (leg) roomToDoctors.get(rid).add(leg);
    }
    linksByFid.set(fid, { roomList, roomToDoctors });
  }

  for (const v of visits) {
    const fid = parseInt(String(v.facility_id ?? 1), 10) || 1;
    const { roomList, roomToDoctors } = linksByFid.get(fid) || { roomList: [], roomToDoctors: new Map() };
    const roomById = new Map(roomList.map((r) => [parseInt(r.id, 10), r]));

    v.suggested_room_id = null;
    v.suggested_room_name = null;
    v.suggested_room_code = null;
    v.display_room_auto = false;
    v.display_room_id = null;
    v.display_room_name = null;
    v.display_room_code = null;

    const explicit = parseInt(v.consultation_room_id, 10) || 0;
    if (explicit) {
      const row = roomById.get(explicit);
      v.display_room_id = explicit;
      v.display_room_name = (v.consultation_room_name || row?.name || '').trim() || null;
      v.display_room_code = (v.consultation_room_code || row?.code || '').trim() || null;
      continue;
    }

    const byDoctor = new Map();
    for (const r of roomList) {
      const rid = parseInt(r.id, 10) || 0;
      const docSet = roomToDoctors.get(rid);
      if (!docSet) continue;
      const so = parseInt(r.sort_order, 10) || 0;
      for (const d of docSet) {
        if (!d) continue;
        const prev = byDoctor.get(d);
        if (!prev) {
          byDoctor.set(d, r);
          continue;
        }
        const pso = parseInt(prev.sort_order, 10) || 0;
        const pid = parseInt(prev.id, 10) || 0;
        if (so < pso || (so === pso && rid < pid)) byDoctor.set(d, r);
      }
    }

    const docId =
      parseInt(v.assigned_doctor_id, 10) || parseInt(v.ticket_doctor_id, 10) || 0;
    const sr = docId ? byDoctor.get(docId) : null;
    if (sr) {
      v.suggested_room_id = parseInt(sr.id, 10);
      v.suggested_room_name = String(sr.name || '').trim() || null;
      v.suggested_room_code = String(sr.code || '').trim() || null;
      v.display_room_id = v.suggested_room_id;
      v.display_room_name = v.suggested_room_name;
      v.display_room_code = v.suggested_room_code;
      v.display_room_auto = true;
    }
  }

  const byKey = new Map();
  const sorted = [...visits].sort((a, b) => {
    const fa = parseInt(String(a.facility_id ?? 1), 10) || 1;
    const fb = parseInt(String(b.facility_id ?? 1), 10) || 1;
    if (fa !== fb) return fa - fb;
    const da = String(a.visit_date || '');
    const db = String(b.visit_date || '');
    if (da !== db) return da.localeCompare(db);
    const ta = new Date(a.queue_started_at || 0).getTime();
    const tb = new Date(b.queue_started_at || 0).getTime();
    if (ta !== tb) return ta - tb;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });
  for (const v of sorted) {
    const rid = v.display_room_id;
    if (!rid) continue;
    const fid = parseInt(String(v.facility_id ?? 1), 10) || 1;
    const dk = `${fid}|${String(v.visit_date || '')}|${rid}`;
    if (!byKey.has(dk)) byKey.set(dk, []);
    byKey.get(dk).push(v);
  }
  for (const v of visits) {
    v.room_queue_no = 0;
    const rid = v.display_room_id;
    if (!rid) continue;
    const fid = parseInt(String(v.facility_id ?? 1), 10) || 1;
    const dk = `${fid}|${String(v.visit_date || '')}|${rid}`;
    const arr = byKey.get(dk) || [];
    const idx = arr.findIndex((x) => x.id === v.id);
    v.room_queue_no = idx >= 0 ? idx + 1 : 0;
  }
}

module.exports = {
  enrichOpdVisitsRoomContext,
  enrichOpdVisitsDoctorFromPaymentTicket,
  paymentTicketDoctorSubquery,
};
