'use strict';

const mysql = require('mysql2/promise');
const { loadEnv } = require('./loadEnv');

async function createDbPool() {
  loadEnv();
  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 5,
  });
}

module.exports = { createDbPool };
