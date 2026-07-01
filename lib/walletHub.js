'use strict';

const crypto = require('crypto');

let _hasFacilityIdCol = null;

async function walletTableHasFacilityId(pool) {
  if (_hasFacilityIdCol != null) return _hasFacilityIdCol;
  try {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_patient_wallet' AND COLUMN_NAME = 'facility_id'`
    );
    _hasFacilityIdCol = parseInt(row?.c, 10) > 0;
  } catch (_) {
    _hasFacilityIdCol = false;
  }
  return _hasFacilityIdCol;
}

function makeQrToken(patientId, facilityId) {
  return crypto
    .createHash('sha256')
    .update(`wallet:${facilityId}:${patientId}:${Date.now()}:${Math.random()}`)
    .digest('hex');
}

function normalizeFacilityId(facilityId) {
  return Math.max(1, parseInt(facilityId, 10) || 1);
}

async function ensureWalletTables(pool) {
  const hasFac = await walletTableHasFacilityId(pool);
  if (hasFac) return;

  await pool
    .query(
      `CREATE TABLE IF NOT EXISTS tbl_patient_wallet (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id INT NOT NULL,
        balance DECIMAL(12,2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active',
        qr_token VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_wallet_patient (patient_id)
      )`
    )
    .catch(() => {});
  await pool
    .query(
      `CREATE TABLE IF NOT EXISTS tbl_patient_wallet_txn (
        id INT AUTO_INCREMENT PRIMARY KEY,
        wallet_id INT NOT NULL,
        txn_type VARCHAR(40) DEFAULT NULL,
        direction ENUM('cr','dr') NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        balance_after DECIMAL(12,2) DEFAULT 0,
        reference_id VARCHAR(80) DEFAULT NULL,
        notes TEXT,
        created_by INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_wallet (wallet_id),
        KEY idx_created_at (created_at)
      )`
    )
    .catch(() => {});
}

async function findWalletForPatient(pool, patientId, facilityId) {
  const pid = parseInt(patientId, 10) || 0;
  const fid = normalizeFacilityId(facilityId);
  if (pid < 1) return null;

  const hasFac = await walletTableHasFacilityId(pool);
  if (hasFac) {
    const [[row]] = await pool.query(
      `SELECT id, balance, status, qr_token, updated_at
       FROM tbl_patient_wallet
       WHERE patient_id = ? AND facility_id = ?
       ORDER BY (status = 'active') DESC, id DESC
       LIMIT 1`,
      [pid, fid]
    );
    return row || null;
  }

  const [[row]] = await pool.query(
    `SELECT id, balance, status, qr_token, updated_at
     FROM tbl_patient_wallet
     WHERE patient_id = ?
     ORDER BY (status = 'active') DESC, id DESC
     LIMIT 1`,
    [pid]
  );
  return row || null;
}

async function ensureWalletForPatient(pool, patientId, facilityId = 1) {
  const pid = parseInt(patientId, 10) || 0;
  const fid = normalizeFacilityId(facilityId);
  if (pid < 1) return null;

  const existing = await findWalletForPatient(pool, pid, fid);
  if (existing) {
    if (existing.status === 'active') return existing;
    await pool.query(
      "UPDATE tbl_patient_wallet SET status = 'active', updated_at = NOW() WHERE id = ?",
      [existing.id]
    );
    return { ...existing, status: 'active' };
  }

  const token = makeQrToken(pid, fid);
  const hasFac = await walletTableHasFacilityId(pool);

  try {
    if (hasFac) {
      await pool.query(
        `INSERT INTO tbl_patient_wallet (facility_id, patient_id, balance, status, qr_token, created_at, updated_at)
         VALUES (?, ?, 0, 'active', ?, NOW(), NOW())`,
        [fid, pid, token]
      );
    } else {
      await pool.query(
        `INSERT INTO tbl_patient_wallet (patient_id, balance, status, qr_token, created_at, updated_at)
         VALUES (?, 0, 'active', ?, NOW(), NOW())`,
        [pid, token]
      );
    }
  } catch (err) {
    if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
      const again = await findWalletForPatient(pool, pid, fid);
      if (again) {
        if (again.status !== 'active') {
          await pool.query(
            "UPDATE tbl_patient_wallet SET status = 'active', updated_at = NOW() WHERE id = ?",
            [again.id]
          );
          return { ...again, status: 'active' };
        }
        return again;
      }
    }
    throw err;
  }

  return findWalletForPatient(pool, pid, fid);
}

function mapWalletRow(r, wallet) {
  const pid = parseInt(r.patient_id, 10) || 0;
  return {
    id: wallet.id,
    patient_id: pid,
    balance: parseFloat(wallet.balance || 0) || 0,
    status: wallet.status || 'active',
    qr_token: wallet.qr_token || null,
    updated_at: wallet.updated_at || r.updated_at || null,
    first_name: r.first_name || '',
    last_name: r.last_name || '',
    phone: r.phone || '',
    pt_label: `#PT${String(pid).padStart(4, '0')}`,
    has_wallet: true,
  };
}

function mapPatientWithoutWallet(r) {
  const pid = parseInt(r.patient_id, 10) || 0;
  return {
    patient_id: pid,
    first_name: r.first_name || '',
    last_name: r.last_name || '',
    name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
    phone: r.phone || '',
    pt_label: `#PT${String(pid).padStart(4, '0')}`,
    has_wallet: false,
    wallet_id: null,
    balance: 0,
  };
}

async function queryPatients(pool, q, limit, facilityId = 1) {
  const term = String(q || '').trim();
  if (!term) return [];

  const { patientActiveWhere, directorySearchWhere, directorySearchBindings } = require('./patientDirectory');
  const fid = normalizeFacilityId(facilityId);
  const hasFac = await walletTableHasFacilityId(pool);
  const walletJoin = hasFac
    ? 'LEFT JOIN tbl_patient_wallet w ON w.patient_id = p.id AND w.facility_id = ?'
    : 'LEFT JOIN tbl_patient_wallet w ON w.patient_id = p.id';
  const joinParams = hasFac ? [fid] : [];
  const activeWhere = patientActiveWhere('p', pool);
  const searchWhere = directorySearchWhere(pool, 'p');
  const searchBindings = directorySearchBindings(term, pool);
  const qrLike = `%${term.toLowerCase()}%`;
  const [rows] = await pool.query(
    `SELECT
      p.id AS patient_id,
      p.first_name,
      p.last_name,
      p.phone,
      p.patient_code,
      w.id AS wallet_id,
      w.balance,
      w.status AS wallet_status,
      w.qr_token,
      w.updated_at
    FROM tbl_patient p
    ${walletJoin}
    WHERE ${activeWhere}
      AND (${searchWhere} OR LOWER(COALESCE(w.qr_token, '')) LIKE LOWER(?))
    ORDER BY p.last_name, p.first_name
    LIMIT ?`,
    [...joinParams, ...searchBindings, qrLike, Math.min(250, Math.max(1, limit))]
  );
  return rows || [];
}

/**
 * Search active patients — split into those with/without wallets (no auto-create).
 */
async function searchPatients(pool, q, limit = 25, facilityId = 1) {
  const rows = await queryPatients(pool, q, limit, facilityId);
  const withWallet = [];
  const withoutWallet = [];

  for (const r of rows) {
    if (r.wallet_id && String(r.wallet_status || 'active') === 'active') {
      withWallet.push(
        mapWalletRow(r, {
          id: r.wallet_id,
          balance: r.balance,
          status: r.wallet_status || 'active',
          qr_token: r.qr_token,
          updated_at: r.updated_at,
        })
      );
    } else {
      withoutWallet.push(mapPatientWithoutWallet(r));
    }
  }

  return { withWallet, withoutWallet };
}

async function fetchWalletDisplayRow(pool, walletId) {
  const wid = parseInt(walletId, 10) || 0;
  if (wid < 1) return null;
  const [[row]] = await pool.query(
    `SELECT
      w.id,
      w.patient_id,
      w.balance,
      w.status,
      w.qr_token,
      w.updated_at,
      p.first_name,
      p.last_name,
      p.phone
    FROM tbl_patient_wallet w
    JOIN tbl_patient p ON p.id = w.patient_id
    WHERE w.id = ? AND w.status = 'active'
    LIMIT 1`,
    [wid]
  );
  if (!row) return null;
  return mapWalletRow(row, {
    id: row.id,
    balance: row.balance,
    status: row.status,
    qr_token: row.qr_token,
    updated_at: row.updated_at,
  });
}

function mapSearchResult(row) {
  if (!row) return null;
  if (row.has_wallet === false || (!row.id && !row.wallet_id)) {
    return {
      patient_id: row.patient_id,
      wallet_id: null,
      has_wallet: false,
      balance: 0,
      wallet_status: null,
      first_name: row.first_name,
      last_name: row.last_name,
      name: row.name || `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      phone: row.phone || '',
      pt_label: row.pt_label,
    };
  }
  return {
    patient_id: row.patient_id,
    wallet_id: row.id || row.wallet_id,
    has_wallet: true,
    balance: row.balance,
    wallet_status: row.status || 'active',
    first_name: row.first_name,
    last_name: row.last_name,
    name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    phone: row.phone || '',
    pt_label: row.pt_label,
  };
}

/** @deprecated use searchPatients — returns only rows that already have wallets */
async function searchPatientsWithWallets(pool, q, limit = 25, facilityId = 1) {
  const { withWallet } = await searchPatients(pool, q, limit, facilityId);
  return withWallet;
}

module.exports = {
  ensureWalletTables,
  ensureWalletForPatient,
  findWalletForPatient,
  searchPatients,
  searchPatientsWithWallets,
  fetchWalletDisplayRow,
  mapSearchResult,
  mapPatientWithoutWallet,
  walletTableHasFacilityId,
};
