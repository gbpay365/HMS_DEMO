'use strict';

/**
 * Import staff list into tbl_employee (local hms).
 * Usage: node scripts/import-staff-batch.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const STAFF = [
  {
    fullName: 'Ha-ani Marie Therese Berinyuy',
    username: 'Berinyuy',
    password: '12345',
    sex: 'F',
    department: 'Pharmacy',
    designation: 'Nurse',
    email: 'mariethereseberinyuy@gmail.com',
    phone: '678986130',
    joinDate: '01/05/2026',
  },
  {
    fullName: 'Wirnkar Jaicomo',
    username: 'Jaicomo',
    password: '12345',
    sex: 'M',
    department: 'Medical unit',
    designation: 'Nurse',
    email: 'wirnkarjacomo@gmail.com',
    phone: '672728261',
    joinDate: '01/05/2026',
  },
  {
    fullName: 'Mahla Mary Gladys',
    username: 'Gladys',
    password: '12345',
    sex: 'F',
    department: 'Medical unit',
    designation: 'Nurse',
    email: 'mahlagladys24@gmail.com',
    phone: '650201276',
    joinDate: '01/05/2026',
  },
  {
    fullName: 'Ekoume Letitia Ndosiri',
    username: 'Letitia',
    password: '12345',
    sex: 'F',
    department: 'Medical unit',
    designation: 'Nurse',
    email: 'ekoumeletitia@gmail.com',
    phone: '650120670',
    joinDate: '01/05/2026',
  },
  {
    fullName: 'Djieukam Sedrick',
    username: 'Sedrick',
    password: '12345',
    sex: 'M',
    department: 'Laboratory',
    designation: 'Lab Tech',
    email: 'sedrickdjieukam032@gmail.com',
    phone: '654467058',
    joinDate: '01/05/2026',
  },
  {
    fullName: 'Achou Atumkeze Boris Ghong',
    username: 'Ghong',
    password: '12345',
    sex: 'M',
    department: 'Medical unit',
    designation: 'Nurse',
    email: 'Batumkeze@gmail.com',
    phone: '676955620',
    joinDate: '01/05/2026',
  },
  {
    fullName: 'Kongnyuy Basil',
    username: 'Basil',
    password: '12345',
    sex: 'M',
    department: 'Medical unit',
    designation: 'Nurse',
    email: 'kongnyuybaskid306@gmail.com',
    phone: '654726694',
    joinDate: '01/05/2026',
  },
  {
    fullName: 'Nkoi Bless',
    username: 'Bless',
    password: '12345',
    sex: 'M',
    department: 'Medical unit',
    designation: 'Nurse',
    email: 'nkolbless4@gmail.com',
    phone: '682950639',
    joinDate: '01/05/2026',
  },
  {
    fullName: 'Lambiv Nadage Awinya',
    username: 'Awinya',
    password: '12345',
    sex: 'F',
    department: 'Maternity',
    designation: 'midwife',
    email: 'nadegelambiv@gmail.com',
    phone: '670812560',
    joinDate: '01/05/2026',
  },
  {
    fullName: 'Issa Massai',
    username: 'Massai',
    password: '12345',
    sex: 'M',
    department: 'Maternity',
    designation: 'midwife',
    email: 'issamassiq55@gmail.com',
    phone: '670539696',
    joinDate: '01/05/2026',
  },
  {
    fullName: 'Djufouo Patricianne',
    username: 'Patricianne',
    password: '12345',
    sex: 'F',
    department: 'Maternity',
    designation: 'midwife',
    email: 'patriciadjufouo@gmail.com',
    phone: '651597042',
    joinDate: '01/05/2026',
  },
];

function splitName(full) {
  const parts = String(full || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] || 'Staff', last: parts[0] || 'User' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

function mapGender(sex) {
  const s = String(sex || '').trim().toUpperCase();
  if (s === 'M') return 'Male';
  if (s === 'F') return 'Female';
  return 'Other';
}

function mapRole(designation) {
  const d = String(designation || '').toLowerCase();
  if (d.includes('lab')) return '4';
  if (d.includes('midwife')) return '7';
  if (d.includes('nurse')) return '7';
  return '7';
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length <= 10) return digits;
  return digits.slice(-10);
}

async function nextEmployeeId(pool) {
  const [[row]] = await pool.query(
    `SELECT employee_id FROM tbl_employee
      WHERE employee_id LIKE 'EMP-2026-%'
      ORDER BY id DESC LIMIT 1`
  );
  let n = 0;
  if (row && row.employee_id) {
    const m = String(row.employee_id).match(/EMP-2026-(\d+)/);
    if (m) n = parseInt(m[1], 10) || 0;
  }
  return `EMP-2026-${String(n + 1).padStart(4, '0')}`;
}

(async () => {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });

  const inserted = [];
  const skipped = [];

  for (const row of STAFF) {
    const username = String(row.username || '').trim();
    const [[exists]] = await pool.query(
      'SELECT id FROM tbl_employee WHERE LOWER(username) = LOWER(?) LIMIT 1',
      [username]
    );
    if (exists) {
      skipped.push({ username, reason: 'username already exists' });
      continue;
    }

    const { first, last } = splitName(row.fullName);
    const hash = await bcrypt.hash(String(row.password || '12345'), 10);
    const employeeId = await nextEmployeeId(pool);
    const role = mapRole(row.designation);
    const gender = mapGender(row.sex);
    const phone = normalizePhone(row.phone);
    const bio = `${row.designation} — ${row.department}`;

    const [result] = await pool.query(
      `INSERT INTO tbl_employee
        (first_name, last_name, username, emailid, password, dob, gender, address, bio,
         employee_id, joining_date, phone, primary_department, role, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
      [
        first,
        last,
        username,
        String(row.email || '').trim().toLowerCase(),
        hash,
        '',
        gender,
        'ZAIZENS',
        bio,
        employeeId,
        row.joinDate || '01/05/2026',
        phone,
        row.department,
        role,
      ]
    );

    inserted.push({
      id: result.insertId,
      username,
      name: `${first} ${last}`,
      role,
      department: row.department,
    });
  }

  console.log(`Inserted ${inserted.length} employee(s):`);
  inserted.forEach((e) => {
    console.log(`  #${e.id} ${e.username} — ${e.name} (role ${e.role}, ${e.department})`);
  });
  if (skipped.length) {
    console.log(`Skipped ${skipped.length}:`, skipped);
  }

  const [all] = await pool.query(
    'SELECT id, first_name, last_name, username, role, primary_department, emailid FROM tbl_employee ORDER BY id'
  );
  console.log('\nAll staff in database:', all.length);
  await pool.end();
})().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
