'use strict';
const { adaptMysqlSqlToPg } = require('../lib/pgSqlAdapter');

const cases = [
  'SELECT SUM(amount) AS s FROM tbl_transaction WHERE status="completed"',
  'SELECT * FROM `tbl_patient` WHERE status="active"',
  'SELECT t.* FROM `tbl_transaction` t WHERE t.status="completed"',
];

for (const q of cases) {
  console.log('IN :', q);
  console.log('OUT:', adaptMysqlSqlToPg(q));
  console.log('---');
}
