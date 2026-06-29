Nigeria HMS — Installation
==========================

Location: C:\Nigeria
Database: NG (MySQL, local)
Default URL: http://localhost:3005

Quick start
-----------
1. Clone database from HMS_DEMO:
     cd C:\Nigeria
     node scripts/setup-ng-database.js
2. Install dependencies:
     npm install
     npm install --prefix frontend --include=dev
3. Build UI:
     npm run build:ui
4. Start server:
     npm start
5. Open http://localhost:3005 (hard refresh Ctrl+F5).

Nigeria-specific features
-------------------------
- States + LGA address fields (37 states incl. FCT, 774 LGAs)
- Geopolitical zones filter on patient registration
- Currency: NGN (Naira)
- Chart of accounts: Nigeria IFRS hospital (168 accounts) — seed via Financials → Chart of accounts
- PAYE: Nigeria Tax Act 2026 progressive bands (0%–25%)
- Pension: 8% employee / 10% employer on emoluments; NHF 2.5% on basic
- VAT: 7.5% (accounts 440100 output / 440200 input)
- Timezone default: Africa/Lagos
- Patient ID format: NGH-000001-NGA

Environment
-----------
- HMS_COUNTRY=NG
- DB_NAME=NG
- PORT=3005

Data source for states/LGAs: lib/data/nigeria-lgas.json
(from temikeezy/nigeria-geojson-data, MIT)

Refresh database from HMS_DEMO:
  node scripts/setup-ng-database.js
