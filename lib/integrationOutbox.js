'use strict';

const cfg = require('./integrationConfig');

async function enqueue(pool, eventType, payload, direction = 'outbound') {
  const [r] = await pool
    .query(
      `INSERT INTO tbl_integration_outbox (direction, event_type, payload_json, status, next_retry_at)
       VALUES (?, ?, ?, 'pending', NOW())`,
      [direction, eventType, JSON.stringify(payload || {})]
    )
    .catch(() => [{ insertId: 0 }]);
  return r?.insertId || 0;
}

async function markSent(pool, id) {
  await pool
    .query(
      `UPDATE tbl_integration_outbox SET status='sent', sent_at=NOW(), last_error=NULL WHERE id=?`,
      [id]
    )
    .catch(() => {});
}

async function markFailed(pool, id, err, attempts) {
  const delayMin = Math.min((attempts || 1) * 5, 60);
  await pool
    .query(
      `UPDATE tbl_integration_outbox
          SET status=IF(attempts>=10,'dead','failed'),
              attempts=attempts+1,
              last_error=?,
              next_retry_at=DATE_ADD(NOW(), INTERVAL ? MINUTE)
        WHERE id=?`,
      [String(err || '').slice(0, 2000), delayMin, id]
    )
    .catch(() => {});
}

async function processPending(pool, handlerByEvent, limit = 50) {
  const lim = Math.max(1, Math.min(200, parseInt(String(limit), 10) || 50));
  const [rows] = await pool
    .query(
      `SELECT id, event_type, payload_json, attempts
         FROM tbl_integration_outbox
        WHERE status IN ('pending','failed')
          AND (next_retry_at IS NULL OR next_retry_at <= NOW())
        ORDER BY id ASC
        LIMIT ${lim}`
    )
    .catch(() => [[]]);

  let sent = 0;
  let failed = 0;
  for (const row of rows || []) {
    let payload = {};
    try {
      payload = JSON.parse(row.payload_json || '{}');
    } catch (_) {
      payload = {};
    }
    const fn = handlerByEvent?.[row.event_type];
    if (!fn) {
      await markFailed(pool, row.id, `No handler for ${row.event_type}`, row.attempts);
      failed += 1;
      continue;
    }
    try {
      const ok = await fn(payload, row);
      if (ok) {
        await markSent(pool, row.id);
        sent += 1;
      } else {
        await markFailed(pool, row.id, 'handler returned false', row.attempts);
        failed += 1;
      }
    } catch (e) {
      await markFailed(pool, row.id, e.message || String(e), row.attempts);
      failed += 1;
    }
  }
  return { sent, failed, total: (rows || []).length };
}

module.exports = {
  enqueue,
  markSent,
  markFailed,
  processPending,
  isEnabled: cfg.isIntegrationEnabled,
};
