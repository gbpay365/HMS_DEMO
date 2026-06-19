'use strict';

/** PostgreSQL on Railway uses pre-migrated schema — skip MySQL CREATE/ALTER boot DDL. */
function skipMysqlSchemaOnPostgres(pool) {
  return !!(pool && pool.driver === 'postgres');
}

module.exports = { skipMysqlSchemaOnPostgres };
