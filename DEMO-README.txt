ZAIZENS HMS — Demo Installation
================================

Location: C:\HMS_DEMO
Default URL: http://localhost:3004

Quick start
-----------
1. Create MySQL database:  CREATE DATABASE hms_demo CHARACTER SET utf8mb4;
2. Import your HMS schema/data (or copy from existing `hms` DB).
3. Run branding SQL:  mysql -u root hms_demo < database\demo-rebrand.sql
4. Install dependencies:
     cd C:\HMS_DEMO
     npm install
     npm install --prefix frontend --include=dev
5. Start demo server:
     npm start
6. Open http://localhost:3004 and hard-refresh (Ctrl+F5).

Branding
--------
All TSSF / Shisong / SOA facility names are rebranded to ZAIZENS via:
  - .env HMS_* variables
  - Code defaults in lib/hmsBrand.js
  - database/demo-rebrand.sql for existing DB rows

Patient ID format: ZAI-000001-ZNS (demo prefix/suffix).

To refresh demo from source:
  powershell -ExecutionPolicy Bypass -File C:\HMS_JS\scripts\create-hms-demo.ps1

Last synced from C:\HMS_JS on 2026-06-18.
