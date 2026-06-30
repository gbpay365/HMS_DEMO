'use strict';

async function ensureNavAccessSchema(pool) {
  if (pool?.driver === 'postgres') {
    await pool
      .query(`
        CREATE TABLE IF NOT EXISTS tbl_acl_role_nav_grant (
          role VARCHAR(20) NOT NULL,
          nav_code VARCHAR(80) NOT NULL,
          granted SMALLINT NOT NULL DEFAULT 1,
          PRIMARY KEY (role, nav_code)
        )
      `)
      .catch(() => {});
    await pool
      .query(`CREATE INDEX IF NOT EXISTS idx_nav_grant_role ON tbl_acl_role_nav_grant (role)`)
      .catch(() => {});
    return true;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_acl_role_nav_grant (
      role      VARCHAR(20) NOT NULL,
      nav_code  VARCHAR(80) NOT NULL,
      granted   TINYINT(1)  NOT NULL DEFAULT 1,
      PRIMARY KEY (role, nav_code),
      KEY idx_nav_grant_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
  return true;
}

/** Upsert one navigation grant row (MySQL + PostgreSQL). */
async function upsertRoleNavGrant(pool, role, navCode, granted) {
  await ensureNavAccessSchema(pool);
  const grantVal = granted ? 1 : 0;
  if (pool?.driver === 'postgres') {
    await pool.query(
      `INSERT INTO tbl_acl_role_nav_grant (role, nav_code, granted) VALUES (?, ?, ?)
       ON CONFLICT (role, nav_code) DO UPDATE SET granted = EXCLUDED.granted`,
      [String(role), String(navCode), grantVal]
    );
    return;
  }
  await pool.query(
    `INSERT INTO tbl_acl_role_nav_grant (role, nav_code, granted) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE granted = VALUES(granted)`,
    [String(role), String(navCode), grantVal]
  );
}

module.exports = { ensureNavAccessSchema, upsertRoleNavGrant };
