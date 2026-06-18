'use strict';

/**
 * Surgical procedures tariff — Service Catalog (category: surgery).
 * Bundled price = surgeon + theatre + anaesthesia (per hospital tariff schedule).
 * Source: SURGICAL PROCEDURES — TARIFF SCHEDULE (127 procedures).
 */
const SURGERY_CATALOG_2026 = [
  {
    "sn": 1,
    "name": "Appendectomy (Open)",
    "section": "General Surgery",
    "surgeon": 80000,
    "theatre": 40000,
    "anaesthesia": 30000,
    "price": 150000,
    "code": "SURG001",
    "notes": "",
    "description": "Surgeon: 80,000; Theatre: 40,000; Anaesthesia: 30,000"
  },
  {
    "sn": 2,
    "name": "Appendectomy (Laparoscopic)",
    "section": "General Surgery",
    "surgeon": 100000,
    "theatre": 60000,
    "anaesthesia": 40000,
    "price": 200000,
    "code": "SURG002",
    "notes": "",
    "description": "Surgeon: 100,000; Theatre: 60,000; Anaesthesia: 40,000"
  },
  {
    "sn": 3,
    "name": "Hernia Repair - Inguinal (Open)",
    "section": "General Surgery",
    "surgeon": 75000,
    "theatre": 40000,
    "anaesthesia": 35000,
    "price": 150000,
    "code": "SURG003",
    "notes": "",
    "description": "Surgeon: 75,000; Theatre: 40,000; Anaesthesia: 35,000"
  },
  {
    "sn": 4,
    "name": "Hernia Repair - Inguinal (Laparoscopic)",
    "section": "General Surgery",
    "surgeon": 100000,
    "theatre": 60000,
    "anaesthesia": 40000,
    "price": 200000,
    "code": "SURG004",
    "notes": "",
    "description": "Surgeon: 100,000; Theatre: 60,000; Anaesthesia: 40,000"
  },
  {
    "sn": 5,
    "name": "Hernia Repair - Umbilical/Ventral",
    "section": "General Surgery",
    "surgeon": 80000,
    "theatre": 40000,
    "anaesthesia": 30000,
    "price": 150000,
    "code": "SURG005",
    "notes": "",
    "description": "Surgeon: 80,000; Theatre: 40,000; Anaesthesia: 30,000"
  },
  {
    "sn": 6,
    "name": "Hernia Repair - Pediatric",
    "section": "General Surgery",
    "surgeon": 60000,
    "theatre": 30000,
    "anaesthesia": 20000,
    "price": 110000,
    "code": "SURG006",
    "notes": "",
    "description": "Surgeon: 60,000; Theatre: 30,000; Anaesthesia: 20,000"
  },
  {
    "sn": 7,
    "name": "Hernia Repair - Incisional",
    "section": "General Surgery",
    "surgeon": 75000,
    "theatre": 40000,
    "anaesthesia": 35000,
    "price": 150000,
    "code": "SURG007",
    "notes": "",
    "description": "Surgeon: 75,000; Theatre: 40,000; Anaesthesia: 35,000"
  },
  {
    "sn": 8,
    "name": "Cholecystectomy (Open)",
    "section": "General Surgery",
    "surgeon": 100000,
    "theatre": 60000,
    "anaesthesia": 40000,
    "price": 200000,
    "code": "SURG008",
    "notes": "",
    "description": "Surgeon: 100,000; Theatre: 60,000; Anaesthesia: 40,000"
  },
  {
    "sn": 9,
    "name": "Cholecystectomy (Laparoscopic)",
    "section": "General Surgery",
    "surgeon": 120000,
    "theatre": 70000,
    "anaesthesia": 40000,
    "price": 230000,
    "code": "SURG009",
    "notes": "",
    "description": "Surgeon: 120,000; Theatre: 70,000; Anaesthesia: 40,000"
  },
  {
    "sn": 10,
    "name": "Exploratory Laparotomy",
    "section": "General Surgery",
    "surgeon": 120000,
    "theatre": 80000,
    "anaesthesia": 40000,
    "price": 240000,
    "code": "SURG010",
    "notes": "",
    "description": "Surgeon: 120,000; Theatre: 80,000; Anaesthesia: 40,000"
  },
  {
    "sn": 11,
    "name": "Bowel Resection & Anastomosis",
    "section": "General Surgery",
    "surgeon": 150000,
    "theatre": 90000,
    "anaesthesia": 60000,
    "price": 300000,
    "code": "SURG011",
    "notes": "",
    "description": "Surgeon: 150,000; Theatre: 90,000; Anaesthesia: 60,000"
  },
  {
    "sn": 12,
    "name": "Colostomy Formation",
    "section": "General Surgery",
    "surgeon": 100000,
    "theatre": 60000,
    "anaesthesia": 40000,
    "price": 200000,
    "code": "SURG012",
    "notes": "",
    "description": "Surgeon: 100,000; Theatre: 60,000; Anaesthesia: 40,000"
  },
  {
    "sn": 13,
    "name": "Colostomy Reversal",
    "section": "General Surgery",
    "surgeon": 120000,
    "theatre": 70000,
    "anaesthesia": 40000,
    "price": 230000,
    "code": "SURG013",
    "notes": "",
    "description": "Surgeon: 120,000; Theatre: 70,000; Anaesthesia: 40,000"
  },
  {
    "sn": 14,
    "name": "Hemorrhoidectomy",
    "section": "General Surgery",
    "surgeon": 70000,
    "theatre": 40000,
    "anaesthesia": 30000,
    "price": 140000,
    "code": "SURG014",
    "notes": "",
    "description": "Surgeon: 70,000; Theatre: 40,000; Anaesthesia: 30,000"
  },
  {
    "sn": 15,
    "name": "Fistulectomy - Anal",
    "section": "General Surgery",
    "surgeon": 70000,
    "theatre": 40000,
    "anaesthesia": 30000,
    "price": 140000,
    "code": "SURG015",
    "notes": "",
    "description": "Surgeon: 70,000; Theatre: 40,000; Anaesthesia: 30,000"
  },
  {
    "sn": 16,
    "name": "Excision of Mass (Simple/External)",
    "section": "General Surgery",
    "surgeon": 30000,
    "theatre": 20000,
    "anaesthesia": 15000,
    "price": 65000,
    "code": "SURG016",
    "notes": "",
    "description": "Surgeon: 30,000; Theatre: 20,000; Anaesthesia: 15,000"
  },
  {
    "sn": 17,
    "name": "Incision & Drainage (Large)",
    "section": "General Surgery",
    "surgeon": 20000,
    "theatre": 15000,
    "anaesthesia": 15000,
    "price": 50000,
    "code": "SURG017",
    "notes": "",
    "description": "Surgeon: 20,000; Theatre: 15,000; Anaesthesia: 15,000"
  },
  {
    "sn": 18,
    "name": "Thyroidectomy (Total)",
    "section": "General Surgery",
    "surgeon": 150000,
    "theatre": 90000,
    "anaesthesia": 60000,
    "price": 300000,
    "code": "SURG018",
    "notes": "",
    "description": "Surgeon: 150,000; Theatre: 90,000; Anaesthesia: 60,000"
  },
  {
    "sn": 19,
    "name": "Thyroidectomy (Subtotal/Partial)",
    "section": "General Surgery",
    "surgeon": 120000,
    "theatre": 70000,
    "anaesthesia": 40000,
    "price": 230000,
    "code": "SURG019",
    "notes": "",
    "description": "Surgeon: 120,000; Theatre: 70,000; Anaesthesia: 40,000"
  },
  {
    "sn": 20,
    "name": "Parathyroidectomy",
    "section": "General Surgery",
    "surgeon": 120000,
    "theatre": 70000,
    "anaesthesia": 40000,
    "price": 230000,
    "code": "SURG020",
    "notes": "",
    "description": "Surgeon: 120,000; Theatre: 70,000; Anaesthesia: 40,000"
  },
  {
    "sn": 21,
    "name": "Mastectomy (Simple)",
    "section": "General Surgery",
    "surgeon": 100000,
    "theatre": 60000,
    "anaesthesia": 40000,
    "price": 200000,
    "code": "SURG021",
    "notes": "",
    "description": "Surgeon: 100,000; Theatre: 60,000; Anaesthesia: 40,000"
  },
  {
    "sn": 22,
    "name": "Mastectomy (Modified Radical)",
    "section": "General Surgery",
    "surgeon": 150000,
    "theatre": 90000,
    "anaesthesia": 60000,
    "price": 300000,
    "code": "SURG022",
    "notes": "",
    "description": "Surgeon: 150,000; Theatre: 90,000; Anaesthesia: 60,000"
  },
  {
    "sn": 23,
    "name": "Breast Lumpectomy",
    "section": "General Surgery",
    "surgeon": 60000,
    "theatre": 40000,
    "anaesthesia": 30000,
    "price": 130000,
    "code": "SURG023",
    "notes": "",
    "description": "Surgeon: 60,000; Theatre: 40,000; Anaesthesia: 30,000"
  },
  {
    "sn": 24,
    "name": "Splenectomy",
    "section": "General Surgery",
    "surgeon": 120000,
    "theatre": 70000,
    "anaesthesia": 40000,
    "price": 230000,
    "code": "SURG024",
    "notes": "",
    "description": "Surgeon: 120,000; Theatre: 70,000; Anaesthesia: 40,000"
  },
  {
    "sn": 25,
    "name": "Liver Resection",
    "section": "General Surgery",
    "surgeon": 200000,
    "theatre": 100000,
    "anaesthesia": 60000,
    "price": 360000,
    "code": "SURG025",
    "notes": "",
    "description": "Surgeon: 200,000; Theatre: 100,000; Anaesthesia: 60,000"
  },
  {
    "sn": 26,
    "name": "Gastrectomy (Partial)",
    "section": "General Surgery",
    "surgeon": 150000,
    "theatre": 90000,
    "anaesthesia": 60000,
    "price": 300000,
    "code": "SURG026",
    "notes": "",
    "description": "Surgeon: 150,000; Theatre: 90,000; Anaesthesia: 60,000"
  },
  {
    "sn": 27,
    "name": "Gastrectomy (Total)",
    "section": "General Surgery",
    "surgeon": 250000,
    "theatre": 120000,
    "anaesthesia": 80000,
    "price": 450000,
    "code": "SURG027",
    "notes": "",
    "description": "Surgeon: 250,000; Theatre: 120,000; Anaesthesia: 80,000"
  },
  {
    "sn": 28,
    "name": "Skin Graft (Split thickness)",
    "section": "General Surgery",
    "surgeon": 75000,
    "theatre": 40000,
    "anaesthesia": 35000,
    "price": 150000,
    "code": "SURG028",
    "notes": "",
    "description": "Surgeon: 75,000; Theatre: 40,000; Anaesthesia: 35,000"
  },
  {
    "sn": 29,
    "name": "Wound Debridement (Major)",
    "section": "General Surgery",
    "surgeon": 50000,
    "theatre": 30000,
    "anaesthesia": 20000,
    "price": 100000,
    "code": "SURG029",
    "notes": "",
    "description": "Surgeon: 50,000; Theatre: 30,000; Anaesthesia: 20,000"
  },
  {
    "sn": 30,
    "name": "Lipoma Excision (In-theater)",
    "section": "General Surgery",
    "surgeon": 30000,
    "theatre": 20000,
    "anaesthesia": 15000,
    "price": 65000,
    "code": "SURG030",
    "notes": "",
    "description": "Surgeon: 30,000; Theatre: 20,000; Anaesthesia: 15,000"
  },
  {
    "sn": 31,
    "name": "Sebaceous Cyst Excision (In-theater)",
    "section": "General Surgery",
    "surgeon": 20000,
    "theatre": 15000,
    "anaesthesia": 15000,
    "price": 50000,
    "code": "SURG031",
    "notes": "",
    "description": "Surgeon: 20,000; Theatre: 15,000; Anaesthesia: 15,000"
  },
  {
    "sn": 32,
    "name": "Pilonidal Sinus Excision",
    "section": "General Surgery",
    "surgeon": 75000,
    "theatre": 40000,
    "anaesthesia": 35000,
    "price": 150000,
    "code": "SURG032",
    "notes": "",
    "description": "Surgeon: 75,000; Theatre: 40,000; Anaesthesia: 35,000"
  },
  {
    "sn": 33,
    "name": "Minor Surgical Procedure (OPD)",
    "section": "General Surgery",
    "surgeon": 15000,
    "theatre": 0,
    "anaesthesia": 0,
    "price": 15000,
    "code": "SURG033",
    "notes": "No theatre/anaesthesia",
    "description": "Surgeon: 15,000; Theatre: 0; Anaesthesia: 0; No theatre/anaesthesia"
  },
  {
    "sn": 34,
    "name": "Caesarean Section (Elective)",
    "section": "Obstetrics & Gynecology",
    "surgeon": 120000,
    "theatre": 70000,
    "anaesthesia": 40000,
    "price": 230000,
    "code": "SURG034",
    "notes": "",
    "description": "Surgeon: 120,000; Theatre: 70,000; Anaesthesia: 40,000"
  },
  {
    "sn": 35,
    "name": "Caesarean Section (Emergency)",
    "section": "Obstetrics & Gynecology",
    "surgeon": 150000,
    "theatre": 90000,
    "anaesthesia": 60000,
    "price": 300000,
    "code": "SURG035",
    "notes": "",
    "description": "Surgeon: 150,000; Theatre: 90,000; Anaesthesia: 60,000"
  },
  {
    "sn": 36,
    "name": "Caesarean - Tubal Ligation",
    "section": "Obstetrics & Gynecology",
    "surgeon": 150000,
    "theatre": 90000,
    "anaesthesia": 60000,
    "price": 300000,
    "code": "SURG036",
    "notes": "",
    "description": "Surgeon: 150,000; Theatre: 90,000; Anaesthesia: 60,000"
  },
  {
    "sn": 37,
    "name": "Caesarean Hysterectomy",
    "section": "Obstetrics & Gynecology",
    "surgeon": 200000,
    "theatre": 120000,
    "anaesthesia": 60000,
    "price": 380000,
    "code": "SURG037",
    "notes": "",
    "description": "Surgeon: 200,000; Theatre: 120,000; Anaesthesia: 60,000"
  },
  {
    "sn": 38,
    "name": "Normal Delivery (Supervised SVD)",
    "section": "Obstetrics & Gynecology",
    "surgeon": 25000,
    "theatre": 15000,
    "anaesthesia": 0,
    "price": 40000,
    "code": "SURG038",
    "notes": "No theatre/anaesthesia",
    "description": "Surgeon: 25,000; Theatre: 15,000; Anaesthesia: 0; No theatre/anaesthesia"
  },
  {
    "sn": 39,
    "name": "Instrumental Delivery - Vacuum",
    "section": "Obstetrics & Gynecology",
    "surgeon": 40000,
    "theatre": 20000,
    "anaesthesia": 10000,
    "price": 70000,
    "code": "SURG039",
    "notes": "",
    "description": "Surgeon: 40,000; Theatre: 20,000; Anaesthesia: 10,000"
  },
  {
    "sn": 40,
    "name": "Instrumental Delivery - Forceps",
    "section": "Obstetrics & Gynecology",
    "surgeon": 40000,
    "theatre": 20000,
    "anaesthesia": 10000,
    "price": 70000,
    "code": "SURG040",
    "notes": "",
    "description": "Surgeon: 40,000; Theatre: 20,000; Anaesthesia: 10,000"
  },
  {
    "sn": 41,
    "name": "Manual Removal of Placenta",
    "section": "Obstetrics & Gynecology",
    "surgeon": 40000,
    "theatre": 20000,
    "anaesthesia": 20000,
    "price": 80000,
    "code": "SURG041",
    "notes": "",
    "description": "Surgeon: 40,000; Theatre: 20,000; Anaesthesia: 20,000"
  },
  {
    "sn": 42,
    "name": "Repair - Perineal Tear (2nd Degree)",
    "section": "Obstetrics & Gynecology",
    "surgeon": 20000,
    "theatre": 10000,
    "anaesthesia": 0,
    "price": 30000,
    "code": "SURG042",
    "notes": "",
    "description": "Surgeon: 20,000; Theatre: 10,000; Anaesthesia: 0"
  },
  {
    "sn": 43,
    "name": "Repair - Perineal Tear (3rd/4th Degree)",
    "section": "Obstetrics & Gynecology",
    "surgeon": 60000,
    "theatre": 35000,
    "anaesthesia": 25000,
    "price": 120000,
    "code": "SURG043",
    "notes": "",
    "description": "Surgeon: 60,000; Theatre: 35,000; Anaesthesia: 25,000"
  },
  {
    "sn": 44,
    "name": "Episiotomy & Repair",
    "section": "Obstetrics & Gynecology",
    "surgeon": 20000,
    "theatre": 10000,
    "anaesthesia": 0,
    "price": 30000,
    "code": "SURG044",
    "notes": "",
    "description": "Surgeon: 20,000; Theatre: 10,000; Anaesthesia: 0"
  },
  {
    "sn": 45,
    "name": "Dilation & Curettage (D&C)",
    "section": "Obstetrics & Gynecology",
    "surgeon": 50000,
    "theatre": 30000,
    "anaesthesia": 20000,
    "price": 100000,
    "code": "SURG045",
    "notes": "",
    "description": "Surgeon: 50,000; Theatre: 30,000; Anaesthesia: 20,000"
  },
  {
    "sn": 46,
    "name": "Manual Vacuum Aspiration (MVA)",
    "section": "Obstetrics & Gynecology",
    "surgeon": 45000,
    "theatre": 25000,
    "anaesthesia": 20000,
    "price": 90000,
    "code": "SURG046",
    "notes": "",
    "description": "Surgeon: 45,000; Theatre: 25,000; Anaesthesia: 20,000"
  },
  {
    "sn": 47,
    "name": "Myomectomy (Open)",
    "section": "Obstetrics & Gynecology",
    "surgeon": 120000,
    "theatre": 80000,
    "anaesthesia": 40000,
    "price": 240000,
    "code": "SURG047",
    "notes": "",
    "description": "Surgeon: 120,000; Theatre: 80,000; Anaesthesia: 40,000"
  },
  {
    "sn": 48,
    "name": "Myomectomy (Laparoscopic)",
    "section": "Obstetrics & Gynecology",
    "surgeon": 150000,
    "theatre": 100000,
    "anaesthesia": 50000,
    "price": 300000,
    "code": "SURG048",
    "notes": "",
    "description": "Surgeon: 150,000; Theatre: 100,000; Anaesthesia: 50,000"
  },
  {
    "sn": 49,
    "name": "Hysterectomy (Total Abdominal)",
    "section": "Obstetrics & Gynecology",
    "surgeon": 150000,
    "theatre": 90000,
    "anaesthesia": 60000,
    "price": 300000,
    "code": "SURG049",
    "notes": "",
    "description": "Surgeon: 150,000; Theatre: 90,000; Anaesthesia: 60,000"
  },
  {
    "sn": 50,
    "name": "Hysterectomy (Vaginal)",
    "section": "Obstetrics & Gynecology",
    "surgeon": 130000,
    "theatre": 80000,
    "anaesthesia": 40000,
    "price": 250000,
    "code": "SURG050",
    "notes": "",
    "description": "Surgeon: 130,000; Theatre: 80,000; Anaesthesia: 40,000"
  },
  {
    "sn": 51,
    "name": "Hysterectomy (Laparoscopic Assisted)",
    "section": "Obstetrics & Gynecology",
    "surgeon": 180000,
    "theatre": 110000,
    "anaesthesia": 60000,
    "price": 350000,
    "code": "SURG051",
    "notes": "",
    "description": "Surgeon: 180,000; Theatre: 110,000; Anaesthesia: 60,000"
  },
  {
    "sn": 52,
    "name": "Ovarian Cystectomy (Open)",
    "section": "Obstetrics & Gynecology",
    "surgeon": 120000,
    "theatre": 70000,
    "anaesthesia": 40000,
    "price": 230000,
    "code": "SURG052",
    "notes": "",
    "description": "Surgeon: 120,000; Theatre: 70,000; Anaesthesia: 40,000"
  },
  {
    "sn": 53,
    "name": "Ovarian Cystectomy (Laparoscopic)",
    "section": "Obstetrics & Gynecology",
    "surgeon": 150000,
    "theatre": 100000,
    "anaesthesia": 50000,
    "price": 300000,
    "code": "SURG053",
    "notes": "",
    "description": "Surgeon: 150,000; Theatre: 100,000; Anaesthesia: 50,000"
  },
  {
    "sn": 54,
    "name": "Oophorectomy",
    "section": "Obstetrics & Gynecology",
    "surgeon": 80000,
    "theatre": 55000,
    "anaesthesia": 35000,
    "price": 170000,
    "code": "SURG054",
    "notes": "",
    "description": "Surgeon: 80,000; Theatre: 55,000; Anaesthesia: 35,000"
  },
  {
    "sn": 55,
    "name": "Salpingectomy",
    "section": "Obstetrics & Gynecology",
    "surgeon": 80000,
    "theatre": 55000,
    "anaesthesia": 35000,
    "price": 170000,
    "code": "SURG055",
    "notes": "",
    "description": "Surgeon: 80,000; Theatre: 55,000; Anaesthesia: 35,000"
  },
  {
    "sn": 56,
    "name": "Salpingo-Oophorectomy (Bilateral)",
    "section": "Obstetrics & Gynecology",
    "surgeon": 110000,
    "theatre": 65000,
    "anaesthesia": 40000,
    "price": 215000,
    "code": "SURG056",
    "notes": "",
    "description": "Surgeon: 110,000; Theatre: 65,000; Anaesthesia: 40,000"
  },
  {
    "sn": 57,
    "name": "Tubal Ligation",
    "section": "Obstetrics & Gynecology",
    "surgeon": 60000,
    "theatre": 35000,
    "anaesthesia": 25000,
    "price": 120000,
    "code": "SURG057",
    "notes": "",
    "description": "Surgeon: 60,000; Theatre: 35,000; Anaesthesia: 25,000"
  },
  {
    "sn": 58,
    "name": "Ectopic Pregnancy Surgery",
    "section": "Obstetrics & Gynecology",
    "surgeon": 100000,
    "theatre": 60000,
    "anaesthesia": 40000,
    "price": 200000,
    "code": "SURG058",
    "notes": "",
    "description": "Surgeon: 100,000; Theatre: 60,000; Anaesthesia: 40,000"
  },
  {
    "sn": 59,
    "name": "Diagnostic Laparoscopy (Gynae)",
    "section": "Obstetrics & Gynecology",
    "surgeon": 90000,
    "theatre": 60000,
    "anaesthesia": 50000,
    "price": 200000,
    "code": "SURG059",
    "notes": "",
    "description": "Surgeon: 90,000; Theatre: 60,000; Anaesthesia: 50,000"
  },
  {
    "sn": 60,
    "name": "Cervical Cerclage",
    "section": "Obstetrics & Gynecology",
    "surgeon": 60000,
    "theatre": 35000,
    "anaesthesia": 25000,
    "price": 120000,
    "code": "SURG060",
    "notes": "",
    "description": "Surgeon: 60,000; Theatre: 35,000; Anaesthesia: 25,000"
  },
  {
    "sn": 61,
    "name": "LEEP / Cone Biopsy",
    "section": "Obstetrics & Gynecology",
    "surgeon": 50000,
    "theatre": 30000,
    "anaesthesia": 20000,
    "price": 100000,
    "code": "SURG061",
    "notes": "",
    "description": "Surgeon: 50,000; Theatre: 30,000; Anaesthesia: 20,000"
  },
  {
    "sn": 62,
    "name": "Repair of Vesico-Vaginal Fistula (VVF)",
    "section": "Obstetrics & Gynecology",
    "surgeon": 200000,
    "theatre": 100000,
    "anaesthesia": 50000,
    "price": 350000,
    "code": "SURG062",
    "notes": "",
    "description": "Surgeon: 200,000; Theatre: 100,000; Anaesthesia: 50,000"
  },
  {
    "sn": 63,
    "name": "Repair of Recto-Vaginal Fistula (RVF)",
    "section": "Obstetrics & Gynecology",
    "surgeon": 180000,
    "theatre": 90000,
    "anaesthesia": 45000,
    "price": 315000,
    "code": "SURG063",
    "notes": "",
    "description": "Surgeon: 180,000; Theatre: 90,000; Anaesthesia: 45,000"
  },
  {
    "sn": 64,
    "name": "Bartholin Cyst/Abscess Excision",
    "section": "Obstetrics & Gynecology",
    "surgeon": 40000,
    "theatre": 25000,
    "anaesthesia": 20000,
    "price": 85000,
    "code": "SURG064",
    "notes": "",
    "description": "Surgeon: 40,000; Theatre: 25,000; Anaesthesia: 20,000"
  },
  {
    "sn": 65,
    "name": "Vulvar Biopsy / Perineoplasty",
    "section": "Obstetrics & Gynecology",
    "surgeon": 60000,
    "theatre": 35000,
    "anaesthesia": 25000,
    "price": 120000,
    "code": "SURG065",
    "notes": "",
    "description": "Surgeon: 60,000; Theatre: 35,000; Anaesthesia: 25,000"
  },
  {
    "sn": 66,
    "name": "Fracture Manipulation & Casting",
    "section": "Orthopedics & Trauma",
    "surgeon": 40000,
    "theatre": 30000,
    "anaesthesia": 30000,
    "price": 100000,
    "code": "SURG066",
    "notes": "",
    "description": "Surgeon: 40,000; Theatre: 30,000; Anaesthesia: 30,000"
  },
  {
    "sn": 67,
    "name": "Open Reduction & Internal Fixation",
    "section": "Orthopedics & Trauma",
    "surgeon": 150000,
    "theatre": 80000,
    "anaesthesia": 50000,
    "price": 280000,
    "code": "SURG067",
    "notes": "",
    "description": "Surgeon: 150,000; Theatre: 80,000; Anaesthesia: 50,000"
  },
  {
    "sn": 68,
    "name": "External Fixation",
    "section": "Orthopedics & Trauma",
    "surgeon": 120000,
    "theatre": 70000,
    "anaesthesia": 40000,
    "price": 230000,
    "code": "SURG068",
    "notes": "",
    "description": "Surgeon: 120,000; Theatre: 70,000; Anaesthesia: 40,000"
  },
  {
    "sn": 69,
    "name": "Intramedullary Nailing",
    "section": "Orthopedics & Trauma",
    "surgeon": 170000,
    "theatre": 90000,
    "anaesthesia": 60000,
    "price": 320000,
    "code": "SURG069",
    "notes": "",
    "description": "Surgeon: 170,000; Theatre: 90,000; Anaesthesia: 60,000"
  },
  {
    "sn": 70,
    "name": "Hip Replacement (Total - THR)",
    "section": "Orthopedics & Trauma",
    "surgeon": 300000,
    "theatre": 150000,
    "anaesthesia": 80000,
    "price": 530000,
    "code": "SURG070",
    "notes": "",
    "description": "Surgeon: 300,000; Theatre: 150,000; Anaesthesia: 80,000"
  },
  {
    "sn": 71,
    "name": "Hip Replacement (Partial - Hemi)",
    "section": "Orthopedics & Trauma",
    "surgeon": 220000,
    "theatre": 110000,
    "anaesthesia": 60000,
    "price": 390000,
    "code": "SURG071",
    "notes": "",
    "description": "Surgeon: 220,000; Theatre: 110,000; Anaesthesia: 60,000"
  },
  {
    "sn": 72,
    "name": "Knee Replacement (Total - TKR)",
    "section": "Orthopedics & Trauma",
    "surgeon": 300000,
    "theatre": 150000,
    "anaesthesia": 80000,
    "price": 530000,
    "code": "SURG072",
    "notes": "",
    "description": "Surgeon: 300,000; Theatre: 150,000; Anaesthesia: 80,000"
  },
  {
    "sn": 73,
    "name": "Shoulder Replacement",
    "section": "Orthopedics & Trauma",
    "surgeon": 250000,
    "theatre": 120000,
    "anaesthesia": 70000,
    "price": 440000,
    "code": "SURG073",
    "notes": "",
    "description": "Surgeon: 250,000; Theatre: 120,000; Anaesthesia: 70,000"
  },
  {
    "sn": 74,
    "name": "Knee Arthroscopy (Diagnostic)",
    "section": "Orthopedics & Trauma",
    "surgeon": 90000,
    "theatre": 60000,
    "anaesthesia": 40000,
    "price": 190000,
    "code": "SURG074",
    "notes": "",
    "description": "Surgeon: 90,000; Theatre: 60,000; Anaesthesia: 40,000"
  },
  {
    "sn": 75,
    "name": "Knee Arthroscopy (Therapeutic)",
    "section": "Orthopedics & Trauma",
    "surgeon": 120000,
    "theatre": 80000,
    "anaesthesia": 50000,
    "price": 250000,
    "code": "SURG075",
    "notes": "",
    "description": "Surgeon: 120,000; Theatre: 80,000; Anaesthesia: 50,000"
  },
  {
    "sn": 76,
    "name": "ACL Reconstruction",
    "section": "Orthopedics & Trauma",
    "surgeon": 180000,
    "theatre": 100000,
    "anaesthesia": 60000,
    "price": 340000,
    "code": "SURG076",
    "notes": "",
    "description": "Surgeon: 180,000; Theatre: 100,000; Anaesthesia: 60,000"
  },
  {
    "sn": 77,
    "name": "Amputation - Lower Limb (Below Knee)",
    "section": "Orthopedics & Trauma",
    "surgeon": 120000,
    "theatre": 65000,
    "anaesthesia": 45000,
    "price": 230000,
    "code": "SURG077",
    "notes": "",
    "description": "Surgeon: 120,000; Theatre: 65,000; Anaesthesia: 45,000"
  },
  {
    "sn": 78,
    "name": "Amputation - Lower Limb (Above Knee)",
    "section": "Orthopedics & Trauma",
    "surgeon": 150000,
    "theatre": 80000,
    "anaesthesia": 50000,
    "price": 280000,
    "code": "SURG078",
    "notes": "",
    "description": "Surgeon: 150,000; Theatre: 80,000; Anaesthesia: 50,000"
  },
  {
    "sn": 79,
    "name": "Amputation - Upper Limb",
    "section": "Orthopedics & Trauma",
    "surgeon": 110000,
    "theatre": 60000,
    "anaesthesia": 45000,
    "price": 215000,
    "code": "SURG079",
    "notes": "",
    "description": "Surgeon: 110,000; Theatre: 60,000; Anaesthesia: 45,000"
  },
  {
    "sn": 80,
    "name": "Bone Grafting",
    "section": "Orthopedics & Trauma",
    "surgeon": 120000,
    "theatre": 70000,
    "anaesthesia": 40000,
    "price": 230000,
    "code": "SURG080",
    "notes": "",
    "description": "Surgeon: 120,000; Theatre: 70,000; Anaesthesia: 40,000"
  },
  {
    "sn": 81,
    "name": "Implant Removal",
    "section": "Orthopedics & Trauma",
    "surgeon": 60000,
    "theatre": 35000,
    "anaesthesia": 25000,
    "price": 120000,
    "code": "SURG081",
    "notes": "",
    "description": "Surgeon: 60,000; Theatre: 35,000; Anaesthesia: 25,000"
  },
  {
    "sn": 82,
    "name": "Tendon Repair",
    "section": "Orthopedics & Trauma",
    "surgeon": 75000,
    "theatre": 45000,
    "anaesthesia": 30000,
    "price": 150000,
    "code": "SURG082",
    "notes": "",
    "description": "Surgeon: 75,000; Theatre: 45,000; Anaesthesia: 30,000"
  },
  {
    "sn": 83,
    "name": "Carpal Tunnel Release",
    "section": "Orthopedics & Trauma",
    "surgeon": 55000,
    "theatre": 35000,
    "anaesthesia": 25000,
    "price": 115000,
    "code": "SURG083",
    "notes": "",
    "description": "Surgeon: 55,000; Theatre: 35,000; Anaesthesia: 25,000"
  },
  {
    "sn": 84,
    "name": "Fasciotomy",
    "section": "Orthopedics & Trauma",
    "surgeon": 70000,
    "theatre": 45000,
    "anaesthesia": 30000,
    "price": 145000,
    "code": "SURG084",
    "notes": "",
    "description": "Surgeon: 70,000; Theatre: 45,000; Anaesthesia: 30,000"
  },
  {
    "sn": 85,
    "name": "Spinal Fusion (Posterior)",
    "section": "Orthopedics & Trauma",
    "surgeon": 300000,
    "theatre": 150000,
    "anaesthesia": 80000,
    "price": 530000,
    "code": "SURG085",
    "notes": "",
    "description": "Surgeon: 300,000; Theatre: 150,000; Anaesthesia: 80,000"
  },
  {
    "sn": 86,
    "name": "Discectomy",
    "section": "Orthopedics & Trauma",
    "surgeon": 180000,
    "theatre": 100000,
    "anaesthesia": 60000,
    "price": 340000,
    "code": "SURG086",
    "notes": "",
    "description": "Surgeon: 180,000; Theatre: 100,000; Anaesthesia: 60,000"
  },
  {
    "sn": 87,
    "name": "Laminectomy",
    "section": "Orthopedics & Trauma",
    "surgeon": 120000,
    "theatre": 70000,
    "anaesthesia": 40000,
    "price": 230000,
    "code": "SURG087",
    "notes": "",
    "description": "Surgeon: 120,000; Theatre: 70,000; Anaesthesia: 40,000"
  },
  {
    "sn": 88,
    "name": "Circumcision (Adult)",
    "section": "Urology",
    "surgeon": 40000,
    "theatre": 25000,
    "anaesthesia": 20000,
    "price": 85000,
    "code": "SURG088",
    "notes": "",
    "description": "Surgeon: 40,000; Theatre: 25,000; Anaesthesia: 20,000"
  },
  {
    "sn": 89,
    "name": "Circumcision (Pediatric)",
    "section": "Urology",
    "surgeon": 40000,
    "theatre": 20000,
    "anaesthesia": 20000,
    "price": 80000,
    "code": "SURG089",
    "notes": "",
    "description": "Surgeon: 40,000; Theatre: 20,000; Anaesthesia: 20,000"
  },
  {
    "sn": 90,
    "name": "Hydrocelectomy",
    "section": "Urology",
    "surgeon": 60000,
    "theatre": 35000,
    "anaesthesia": 25000,
    "price": 120000,
    "code": "SURG090",
    "notes": "",
    "description": "Surgeon: 60,000; Theatre: 35,000; Anaesthesia: 25,000"
  },
  {
    "sn": 91,
    "name": "Varicocelectomy",
    "section": "Urology",
    "surgeon": 70000,
    "theatre": 45000,
    "anaesthesia": 30000,
    "price": 145000,
    "code": "SURG091",
    "notes": "",
    "description": "Surgeon: 70,000; Theatre: 45,000; Anaesthesia: 30,000"
  },
  {
    "sn": 92,
    "name": "Orchidopexy",
    "section": "Urology",
    "surgeon": 80000,
    "theatre": 50000,
    "anaesthesia": 30000,
    "price": 160000,
    "code": "SURG092",
    "notes": "",
    "description": "Surgeon: 80,000; Theatre: 50,000; Anaesthesia: 30,000"
  },
  {
    "sn": 93,
    "name": "Orchiectomy (Open)",
    "section": "Urology",
    "surgeon": 80000,
    "theatre": 50000,
    "anaesthesia": 30000,
    "price": 160000,
    "code": "SURG093",
    "notes": "",
    "description": "Surgeon: 80,000; Theatre: 50,000; Anaesthesia: 30,000"
  },
  {
    "sn": 94,
    "name": "Prostatectomy (Open)",
    "section": "Urology",
    "surgeon": 150000,
    "theatre": 90000,
    "anaesthesia": 60000,
    "price": 300000,
    "code": "SURG094",
    "notes": "",
    "description": "Surgeon: 150,000; Theatre: 90,000; Anaesthesia: 60,000"
  },
  {
    "sn": 95,
    "name": "TURP (Trans-Urethral Resection)",
    "section": "Urology",
    "surgeon": 180000,
    "theatre": 110000,
    "anaesthesia": 60000,
    "price": 350000,
    "code": "SURG095",
    "notes": "",
    "description": "Surgeon: 180,000; Theatre: 110,000; Anaesthesia: 60,000"
  },
  {
    "sn": 96,
    "name": "Nephrectomy (Open)",
    "section": "Urology",
    "surgeon": 200000,
    "theatre": 100000,
    "anaesthesia": 60000,
    "price": 360000,
    "code": "SURG096",
    "notes": "",
    "description": "Surgeon: 200,000; Theatre: 100,000; Anaesthesia: 60,000"
  },
  {
    "sn": 97,
    "name": "Nephrectomy (Laparoscopic)",
    "section": "Urology",
    "surgeon": 250000,
    "theatre": 125000,
    "anaesthesia": 70000,
    "price": 445000,
    "code": "SURG097",
    "notes": "",
    "description": "Surgeon: 250,000; Theatre: 125,000; Anaesthesia: 70,000"
  },
  {
    "sn": 98,
    "name": "Nephrolithotomy (PCNL)",
    "section": "Urology",
    "surgeon": 180000,
    "theatre": 100000,
    "anaesthesia": 60000,
    "price": 340000,
    "code": "SURG098",
    "notes": "",
    "description": "Surgeon: 180,000; Theatre: 100,000; Anaesthesia: 60,000"
  },
  {
    "sn": 99,
    "name": "Ureterolithotomy",
    "section": "Urology",
    "surgeon": 120000,
    "theatre": 70000,
    "anaesthesia": 40000,
    "price": 230000,
    "code": "SURG099",
    "notes": "",
    "description": "Surgeon: 120,000; Theatre: 70,000; Anaesthesia: 40,000"
  },
  {
    "sn": 100,
    "name": "Cystolithotomy",
    "section": "Urology",
    "surgeon": 110000,
    "theatre": 60000,
    "anaesthesia": 40000,
    "price": 210000,
    "code": "SURG100",
    "notes": "",
    "description": "Surgeon: 110,000; Theatre: 60,000; Anaesthesia: 40,000"
  },
  {
    "sn": 101,
    "name": "Urethral Stricture Repair",
    "section": "Urology",
    "surgeon": 150000,
    "theatre": 90000,
    "anaesthesia": 60000,
    "price": 300000,
    "code": "SURG101",
    "notes": "",
    "description": "Surgeon: 150,000; Theatre: 90,000; Anaesthesia: 60,000"
  },
  {
    "sn": 102,
    "name": "Urethrotomy (Internal)",
    "section": "Urology",
    "surgeon": 80000,
    "theatre": 50000,
    "anaesthesia": 30000,
    "price": 160000,
    "code": "SURG102",
    "notes": "",
    "description": "Surgeon: 80,000; Theatre: 50,000; Anaesthesia: 30,000"
  },
  {
    "sn": 103,
    "name": "Cystoscopy (Diagnostic)",
    "section": "Urology",
    "surgeon": 50000,
    "theatre": 35000,
    "anaesthesia": 25000,
    "price": 110000,
    "code": "SURG103",
    "notes": "",
    "description": "Surgeon: 50,000; Theatre: 35,000; Anaesthesia: 25,000"
  },
  {
    "sn": 104,
    "name": "ESWL (Shock Wave Lithotripsy)",
    "section": "Urology",
    "surgeon": 150000,
    "theatre": 0,
    "anaesthesia": 0,
    "price": 150000,
    "code": "SURG104",
    "notes": "",
    "description": "Surgeon: 150,000; Theatre: 0; Anaesthesia: 0"
  },
  {
    "sn": 105,
    "name": "Penile Repair (Peyronie)",
    "section": "Urology",
    "surgeon": 90000,
    "theatre": 55000,
    "anaesthesia": 35000,
    "price": 180000,
    "code": "SURG105",
    "notes": "",
    "description": "Surgeon: 90,000; Theatre: 55,000; Anaesthesia: 35,000"
  },
  {
    "sn": 106,
    "name": "Tonsillectomy",
    "section": "ENT",
    "surgeon": 75000,
    "theatre": 45000,
    "anaesthesia": 30000,
    "price": 150000,
    "code": "SURG106",
    "notes": "",
    "description": "Surgeon: 75,000; Theatre: 45,000; Anaesthesia: 30,000"
  },
  {
    "sn": 107,
    "name": "Tonsillectomy + Adenoidectomy",
    "section": "ENT",
    "surgeon": 85000,
    "theatre": 50000,
    "anaesthesia": 35000,
    "price": 170000,
    "code": "SURG107",
    "notes": "",
    "description": "Surgeon: 85,000; Theatre: 50,000; Anaesthesia: 35,000"
  },
  {
    "sn": 108,
    "name": "Rhinoplasty / Septorhinoplasty",
    "section": "ENT",
    "surgeon": 110000,
    "theatre": 65000,
    "anaesthesia": 45000,
    "price": 220000,
    "code": "SURG108",
    "notes": "",
    "description": "Surgeon: 110,000; Theatre: 65,000; Anaesthesia: 45,000"
  },
  {
    "sn": 109,
    "name": "Septoplasty",
    "section": "ENT",
    "surgeon": 80000,
    "theatre": 50000,
    "anaesthesia": 35000,
    "price": 165000,
    "code": "SURG109",
    "notes": "",
    "description": "Surgeon: 80,000; Theatre: 50,000; Anaesthesia: 35,000"
  },
  {
    "sn": 110,
    "name": "FESS (Sinus Surgery)",
    "section": "ENT",
    "surgeon": 120000,
    "theatre": 80000,
    "anaesthesia": 50000,
    "price": 250000,
    "code": "SURG110",
    "notes": "",
    "description": "Surgeon: 120,000; Theatre: 80,000; Anaesthesia: 50,000"
  },
  {
    "sn": 111,
    "name": "Nasal Polypectomy",
    "section": "ENT",
    "surgeon": 70000,
    "theatre": 45000,
    "anaesthesia": 30000,
    "price": 145000,
    "code": "SURG111",
    "notes": "",
    "description": "Surgeon: 70,000; Theatre: 45,000; Anaesthesia: 30,000"
  },
  {
    "sn": 112,
    "name": "Excision Head/Neck Lymph Node",
    "section": "ENT",
    "surgeon": 50000,
    "theatre": 35000,
    "anaesthesia": 25000,
    "price": 110000,
    "code": "SURG112",
    "notes": "",
    "description": "Surgeon: 50,000; Theatre: 35,000; Anaesthesia: 25,000"
  },
  {
    "sn": 113,
    "name": "Mastoidectomy (Radical)",
    "section": "ENT",
    "surgeon": 150000,
    "theatre": 90000,
    "anaesthesia": 60000,
    "price": 300000,
    "code": "SURG113",
    "notes": "",
    "description": "Surgeon: 150,000; Theatre: 90,000; Anaesthesia: 60,000"
  },
  {
    "sn": 114,
    "name": "Foreign Body Removal",
    "section": "ENT",
    "surgeon": 50000,
    "theatre": 35000,
    "anaesthesia": 25000,
    "price": 110000,
    "code": "SURG114",
    "notes": "",
    "description": "Surgeon: 50,000; Theatre: 35,000; Anaesthesia: 25,000"
  },
  {
    "sn": 115,
    "name": "Parotidectomy (Superficial)",
    "section": "ENT",
    "surgeon": 120000,
    "theatre": 80000,
    "anaesthesia": 50000,
    "price": 250000,
    "code": "SURG115",
    "notes": "",
    "description": "Surgeon: 120,000; Theatre: 80,000; Anaesthesia: 50,000"
  },
  {
    "sn": 116,
    "name": "Submandibular Gland Excision",
    "section": "ENT",
    "surgeon": 110000,
    "theatre": 65000,
    "anaesthesia": 45000,
    "price": 220000,
    "code": "SURG116",
    "notes": "",
    "description": "Surgeon: 110,000; Theatre: 65,000; Anaesthesia: 45,000"
  },
  {
    "sn": 117,
    "name": "Direct Laryngoscopy",
    "section": "ENT",
    "surgeon": 80000,
    "theatre": 50000,
    "anaesthesia": 30000,
    "price": 160000,
    "code": "SURG117",
    "notes": "",
    "description": "Surgeon: 80,000; Theatre: 50,000; Anaesthesia: 30,000"
  },
  {
    "sn": 118,
    "name": "Cataract Surgery (Phaco)",
    "section": "Ophthalmology",
    "surgeon": 120000,
    "theatre": 65000,
    "anaesthesia": 35000,
    "price": 220000,
    "code": "SURG118",
    "notes": "IOL extra",
    "description": "Surgeon: 120,000; Theatre: 65,000; Anaesthesia: 35,000; IOL extra"
  },
  {
    "sn": 119,
    "name": "Cataract Surgery (SICS)",
    "section": "Ophthalmology",
    "surgeon": 90000,
    "theatre": 50000,
    "anaesthesia": 30000,
    "price": 170000,
    "code": "SURG119",
    "notes": "",
    "description": "Surgeon: 90,000; Theatre: 50,000; Anaesthesia: 30,000"
  },
  {
    "sn": 120,
    "name": "Trabeculectomy (Glaucoma)",
    "section": "Ophthalmology",
    "surgeon": 110000,
    "theatre": 65000,
    "anaesthesia": 40000,
    "price": 215000,
    "code": "SURG120",
    "notes": "",
    "description": "Surgeon: 110,000; Theatre: 65,000; Anaesthesia: 40,000"
  },
  {
    "sn": 121,
    "name": "Strabismus Correction",
    "section": "Ophthalmology",
    "surgeon": 90000,
    "theatre": 55000,
    "anaesthesia": 35000,
    "price": 180000,
    "code": "SURG121",
    "notes": "",
    "description": "Surgeon: 90,000; Theatre: 55,000; Anaesthesia: 35,000"
  },
  {
    "sn": 122,
    "name": "Pterygium Excision",
    "section": "Ophthalmology",
    "surgeon": 55000,
    "theatre": 35000,
    "anaesthesia": 25000,
    "price": 115000,
    "code": "SURG122",
    "notes": "",
    "description": "Surgeon: 55,000; Theatre: 35,000; Anaesthesia: 25,000"
  },
  {
    "sn": 123,
    "name": "Chalazion Excision",
    "section": "Ophthalmology",
    "surgeon": 30000,
    "theatre": 20000,
    "anaesthesia": 15000,
    "price": 65000,
    "code": "SURG123",
    "notes": "",
    "description": "Surgeon: 30,000; Theatre: 20,000; Anaesthesia: 15,000"
  },
  {
    "sn": 124,
    "name": "Entropion / Ectropion Repair",
    "section": "Ophthalmology",
    "surgeon": 60000,
    "theatre": 35000,
    "anaesthesia": 25000,
    "price": 120000,
    "code": "SURG124",
    "notes": "",
    "description": "Surgeon: 60,000; Theatre: 35,000; Anaesthesia: 25,000"
  },
  {
    "sn": 125,
    "name": "Retinal Detachment Repair",
    "section": "Ophthalmology",
    "surgeon": 200000,
    "theatre": 100000,
    "anaesthesia": 60000,
    "price": 360000,
    "code": "SURG125",
    "notes": "Vitreoretinal",
    "description": "Surgeon: 200,000; Theatre: 100,000; Anaesthesia: 60,000; Vitreoretinal"
  },
  {
    "sn": 126,
    "name": "Lid Laceration Repair",
    "section": "Ophthalmology",
    "surgeon": 50000,
    "theatre": 35000,
    "anaesthesia": 25000,
    "price": 110000,
    "code": "SURG126",
    "notes": "",
    "description": "Surgeon: 50,000; Theatre: 35,000; Anaesthesia: 25,000"
  },
  {
    "sn": 127,
    "name": "Corneal Foreign Body Removal",
    "section": "Ophthalmology",
    "surgeon": 20000,
    "theatre": 0,
    "anaesthesia": 0,
    "price": 20000,
    "code": "SURG127",
    "notes": "OPD procedure",
    "description": "Surgeon: 20,000; Theatre: 0; Anaesthesia: 0; OPD procedure"
  }
];

function normName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function cptForItem(item) {
  if (item.code) return String(item.code).slice(0, 20);
  const sn = parseInt(item.sn, 10) || 0;
  return 'SURG' + String(sn).padStart(3, '0');
}

/**
 * Upsert surgery rows into tbl_service_catalog.
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ deactivateMissing?: boolean, facilityId?: number }} [opts]
 */
async function seedSurgeryServiceCatalog(pool, opts = {}) {
  const category = 'surgery';
  const facilityId = Math.max(0, parseInt(opts.facilityId, 10) || 0);
  let inserted = 0;
  let updated = 0;

  const [existing] = await pool.query(
    `SELECT id, name, price, department_name, status, cpt_code, facility_id, description
     FROM tbl_service_catalog
     WHERE LOWER(TRIM(category)) IN ('surgery', 'procedure') AND facility_id = ?`,
    [facilityId]
  );
  const byName = new Map();
  const byCpt = new Map();
  for (const row of existing || []) {
    byName.set(normName(row.name), row);
    if (row.cpt_code) byCpt.set(String(row.cpt_code), row);
  }

  const seededCodes = new Set();

  for (const item of SURGERY_CATALOG_2026) {
    const name = String(item.name).trim();
    const department = String(item.section || 'Surgery').trim();
    const subcategory = department;
    const sortSn = parseInt(item.sn, 10) || 0;
    const cptCode = cptForItem(item);
    const price = Math.max(0, parseInt(item.price, 10) || 0);
    const description = item.description ? String(item.description).trim() : null;
    seededCodes.add(cptCode);

    const prev = byCpt.get(cptCode) || byName.get(normName(name));
    if (prev) {
      await pool.query(
        `UPDATE tbl_service_catalog
         SET category = ?, subcategory = ?, name = ?, department_name = ?, cpt_code = ?,
             price = ?, description = ?, status = 1, sort_order = ?, currency = 'XAF'
         WHERE id = ? LIMIT 1`,
        [category, subcategory, name, department, cptCode, price, description, sortSn, prev.id]
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO tbl_service_catalog
         (facility_id, category, subcategory, name, department_name, cpt_code, price, currency, status, sort_order, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'XAF', 1, ?, ?)`,
        [facilityId, category, subcategory, name, department, cptCode, price, sortSn, description]
      );
      inserted++;
    }
  }

  let deactivated = 0;
  if (opts.deactivateMissing) {
    for (const row of existing || []) {
      const code = String(row.cpt_code || '');
      if (code.startsWith('SURG') && seededCodes.has(code)) continue;
      if (seededCodes.has(code)) continue;
      if (normName(row.name) && SURGERY_CATALOG_2026.some((i) => normName(i.name) === normName(row.name))) continue;
      if (row.status === 0) continue;
      await pool.query('UPDATE tbl_service_catalog SET status = 0 WHERE id = ? LIMIT 1', [row.id]);
      deactivated++;
    }
  }

  return { total: SURGERY_CATALOG_2026.length, inserted, updated, deactivated };
}

module.exports = {
  SURGERY_CATALOG_2026,
  seedSurgeryServiceCatalog,
};
