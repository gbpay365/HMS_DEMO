-- ZAIZENS / ZAIZENS HMS — MySQL database setup
-- Run as MySQL root:  mysql -u root -p < 01-create-mysql-database.sql

CREATE DATABASE IF NOT EXISTS hms_demo
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'root'@'localhost'
  IDENTIFIED BY 'Ts$fSOA2026!Hms';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP,
      CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE, CREATE VIEW,
      SHOW VIEW, CREATE ROUTINE, ALTER ROUTINE, TRIGGER, EVENT
  ON hms_demo.* TO 'root'@'localhost';

FLUSH PRIVILEGES;

-- Verify:
-- SHOW DATABASES LIKE 'hms_demo';
-- SELECT user, host FROM mysql.user WHERE user = 'root';
