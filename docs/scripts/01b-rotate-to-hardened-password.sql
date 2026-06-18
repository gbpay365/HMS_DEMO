-- ZAIZENS — rotate MySQL user to hardened 15-character password
-- Run ONLY if the database still uses the legacy password (Hellt0cell).
-- mysql -u root -p < 01b-rotate-to-hardened-password.sql

ALTER USER 'root'@'localhost'
  IDENTIFIED BY 'Ts$fSOA2026!Hms';

FLUSH PRIVILEGES;

-- After running: deploy 02-zaizens-demo.env and 03-mysql-backup.cnf, then restart ZAIZENS-HMS.
