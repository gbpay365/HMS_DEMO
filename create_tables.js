const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        console.log(`Connected to ${process.env.DB_NAME}. Creating tables...`);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS tbl_nurse_roster (
                id INT AUTO_INCREMENT PRIMARY KEY,
                facility_id INT DEFAULT 1,
                employee_id INT NOT NULL,
                work_date DATE NOT NULL,
                shift_type ENUM('day', 'night', 'off') DEFAULT 'off',
                status TINYINT DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY (employee_id, work_date)
            )
        `);
        console.log('Created tbl_nurse_roster');

        await connection.query(`
            CREATE TABLE IF NOT EXISTS tbl_doctor_roster (
                id INT AUTO_INCREMENT PRIMARY KEY,
                facility_id INT DEFAULT 1,
                employee_id INT NOT NULL,
                duty_date DATE NOT NULL,
                duty_type ENUM('on_duty', 'night', 'off') DEFAULT 'off',
                status TINYINT DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY (employee_id, duty_date)
            )
        `);
        console.log('Created tbl_doctor_roster');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await connection.end();
    }
}

migrate();
