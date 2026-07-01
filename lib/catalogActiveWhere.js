'use strict';

function catalogStatusTextExpr(alias = '', pool) {
  const a = alias ? `${alias}.` : '';
  return pool?.driver === 'postgres'
    ? `CAST(${a}status AS TEXT)`
    : `CAST(${a}status AS CHAR)`;
}

/** Active catalog rows — portable across MySQL tinyint and PostgreSQL boolean status. */
function catalogActiveWhere(alias = '', pool) {
  const a = alias ? `${alias}.` : '';
  const st = catalogStatusTextExpr(alias, pool);
  if (pool?.driver === 'postgres') {
    return `(
      ${a}status IS NULL
      OR CAST(${a}status AS INTEGER) = 1
      OR LOWER(${st}) IN ('1', 'true', 't', 'yes', 'active')
    )`;
  }
  return `(
    ${a}status IS NULL
    OR ${a}status = 1
    OR LOWER(${st}) IN ('1', 'true', 't', 'yes', 'active')
  )`;
}

module.exports = { catalogActiveWhere, catalogStatusTextExpr };
