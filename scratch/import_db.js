const fs = require('fs');
const mysql = require('mysql2/promise');

async function run() {
    console.log('Connecting to Railway...');
    const conn = await mysql.createConnection({
        host: 'crossover.proxy.rlwy.net',
        port: 36338,
        user: 'root',
        password: 'qBmmIuVRPkboztvdrtztOUibjhyzPXYQ',
        database: 'railway',
        multipleStatements: true
    });
    
    console.log('Reading SQL file...');
    const sql = fs.readFileSync('c:\\HMS_JS\\hms_export.sql', 'utf8');
    
    console.log('Executing SQL file (this might take a minute)...');
    await conn.query(sql);
    
    console.log('Done!');
    await conn.end();
}

run().catch(console.error);
