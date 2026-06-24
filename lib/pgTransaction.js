'use strict';

function savepointName(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

function isPostgresConn(conn) {
  return !!(conn && conn.driver === 'postgres');
}

/**
 * Run fn inside a SAVEPOINT on PostgreSQL so a failure does not abort the outer transaction.
 * Re-throws on failure after rolling back to the savepoint.
 */
async function withSavepoint(conn, prefix, fn) {
  if (!isPostgresConn(conn)) {
    return fn();
  }
  const sp = savepointName(prefix || 'sp');
  await conn.query(`SAVEPOINT ${sp}`);
  try {
    const result = await fn();
    await conn.query(`RELEASE SAVEPOINT ${sp}`);
    return result;
  } catch (err) {
    await conn.query(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => {});
    await conn.query(`RELEASE SAVEPOINT ${sp}`).catch(() => {});
    throw err;
  }
}

/**
 * Optional step inside an open transaction — failures are swallowed (MySQL .catch parity).
 */
async function optionalInTransaction(conn, prefix, fn) {
  if (!isPostgresConn(conn)) {
    try {
      return await fn();
    } catch (_) {
      return null;
    }
  }
  const sp = savepointName(prefix || 'opt');
  await conn.query(`SAVEPOINT ${sp}`);
  try {
    const result = await fn();
    await conn.query(`RELEASE SAVEPOINT ${sp}`);
    return result;
  } catch (err) {
    await conn.query(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => {});
    await conn.query(`RELEASE SAVEPOINT ${sp}`).catch(() => {});
    const msg = err && err.message ? err.message : String(err);
    if (prefix) console.warn(`[pgTransaction:${prefix}]`, msg);
    return null;
  }
}

module.exports = { withSavepoint, optionalInTransaction, isPostgresConn };
