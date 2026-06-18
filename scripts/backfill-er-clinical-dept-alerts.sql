-- =============================================================================
-- One-off: backfill tbl_clinical_dept_alert from tbl_opd_order_item for ER visits
-- =============================================================================
-- Run in phpMyAdmin / mysql client against your HMS database after the alert
-- tables exist (first visit to the app creates them, or run once with Node).
--
-- Adjust the lookback window by changing INTERVAL 90 DAY below.
-- Safe to re-run: skips any order line that already has a row in
-- tbl_clinical_dept_alert with the same opd_order_item_id.
--
-- ER visit = opd_visit matches any of:
--   is_emergency = 1, or department contains emergency / a&e / a and e
-- =============================================================================

INSERT INTO tbl_clinical_dept_alert (
  facility_id,
  target_dept,
  context,
  doctor_display,
  patient_display,
  ward_display,
  bed_display,
  test_display,
  patient_id,
  opd_visit_id,
  admission_id,
  consultation_id,
  opd_order_item_id,
  created_by,
  created_at
)
SELECT
  COALESCE(oi.facility_id, v.facility_id, 1) AS facility_id,
  CASE LOWER(TRIM(oi.item_type))
    WHEN 'radiology' THEN 'radiology'
    WHEN 'pharmacy' THEN 'pharmacy'
    ELSE 'laboratory'
  END AS target_dept,
  'er' AS context,
  CASE
    WHEN doc.id IS NULL THEN 'Doctor'
    ELSE LEFT(TRIM(CONCAT('Dr. ', COALESCE(doc.first_name, ''), ' ', COALESCE(doc.last_name, ''))), 255)
  END AS doctor_display,
  CASE
    WHEN p.id IS NULL THEN CONCAT('Patient #', oi.patient_id)
    ELSE LEFT(TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))), 255)
  END AS patient_display,
  'Emergency / A&E' AS ward_display,
  LEFT(
    COALESCE(
      NULLIF(TRIM(b.label), ''),
      NULLIF(TRIM(b.bed_code), ''),
      'No bed assigned'
    ),
    160
  ) AS bed_display,
  LEFT(COALESCE(oi.item_name, CONCAT(oi.item_type, ' order')), 600) AS test_display,
  oi.patient_id,
  v.id AS opd_visit_id,
  NULL AS admission_id,
  oi.consultation_id,
  oi.id AS opd_order_item_id,
  oi.created_by,
  COALESCE(oi.created_at, NOW()) AS created_at
FROM tbl_opd_order_item oi
LEFT JOIN tbl_consultation cn
  ON cn.id = oi.consultation_id
 AND cn.patient_id = oi.patient_id
INNER JOIN tbl_opd_visit v
  ON v.id = COALESCE(oi.opd_visit_id, cn.opd_visit_id)
 AND v.patient_id = oi.patient_id
LEFT JOIN tbl_patient p ON p.id = oi.patient_id
LEFT JOIN tbl_employee doc ON doc.id = oi.created_by
LEFT JOIN tbl_er_bed b ON b.id = v.er_bed_id
WHERE LOWER(TRIM(oi.item_type)) IN ('laboratory', 'radiology', 'pharmacy')
  AND COALESCE(oi.opd_visit_id, cn.opd_visit_id) IS NOT NULL
  AND (
    IFNULL(v.is_emergency, 0) = 1
    OR LOWER(COALESCE(v.department, '')) LIKE '%emergency%'
    OR LOWER(COALESCE(v.department, '')) LIKE '%a&e%'
    OR LOWER(COALESCE(v.department, '')) LIKE '%a and e%'
  )
  AND oi.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
  AND NOT EXISTS (
    SELECT 1 FROM tbl_clinical_dept_alert a WHERE a.opd_order_item_id = oi.id
  );
