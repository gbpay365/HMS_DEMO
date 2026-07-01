'use strict';

function savepointName(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

function isPostgresConn(conn) {
  return !!(conn && conn.driver === 'postgres');
}

/** True when the connection is inside an explicit BEGIN … COMMIT block. */
async function isInPostgresTransaction(conn) {
  if (!isPostgresConn(conn)) return false;
  try {
    const [rows] = await conn.query('SELECT txid_current_if_assigned() AS txid');
    const txid = rows?.[0]?.txid;
    return txid != null && String(txid).trim() !== '';
  } catch {
    return false;
  }
}

/**
 * Run fn inside a SAVEPOINT on PostgreSQL so a failure does not abort the outer transaction.
 * Re-throws on failure after rolling back to the savepoint.
 * Outside a transaction block, runs fn directly (autocommit).
 */
async function withSavepoint(conn, prefix, fn) {
  if (!isPostgresConn(conn)) {
    return fn();
  }
  if (!(await isInPostgresTransaction(conn))) {
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
 * Outside a transaction block, runs fn with try/catch (no SAVEPOINT).
 */
async function optionalInTransaction(conn, prefix, fn) {
  if (!isPostgresConn(conn)) {
    try {
      return await fn();
    } catch (_) {
      return null;
    }
  }
  if (!(await isInPostgresTransaction(conn))) {
    try {
      return await fn();
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (prefix) console.warn(`[pgTransaction:${prefix}]`, msg);
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

module.exports = {
  withSavepoint,
  optionalInTransaction,
  isPostgresConn,
  isInPostgresTransaction,
};
