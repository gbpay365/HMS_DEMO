// patch_add_patient_route.js
const fs = require('fs');
let src = fs.readFileSync('app.js', 'utf8');

const newAddRoute = `
app.post('/patients/add', requireAuth, async (req, res) => {
  const {
    first_name, last_name, gender, dob, phone, email, address, patient_type,
    cni_number, cni_issue_date,
    next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,
    emergency_contact_name, emergency_contact_phone,
    portal_enabled, status,
    open_credit_line, emergency_credit_pending,
    ins_carrier_id, ins_policy_number, ins_insurer_covered_percent, ins_auto_data
  } = req.body;

  const portalOn = portal_enabled ? 1 : 0;
  const statusVal = parseInt(status) === 0 ? 0 : 1;
  const uid = req.session.userId || req.session.user?.id || 1;

  if (portalOn && !email) {
    return res.redirect('/patients?err=Email+is+required+when+portal+access+is+enabled.');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Create Patient
    const [result] = await conn.query(
      \`INSERT INTO tbl_patient
       (first_name, last_name, gender, dob, phone, email, address, patient_type,
        cni_number, cni_issue_date,
        next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,
        emergency_contact_name, emergency_contact_phone,
        portal_enabled, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())\`,
      [first_name, last_name||null, gender, dob||null, phone, email||null, address||null,
       patient_type, cni_number||null, cni_issue_date||null,
       next_of_kin_name||null, next_of_kin_phone||null, next_of_kin_relationship||null,
       emergency_contact_name||null, emergency_contact_phone||null,
       portalOn, statusVal]
    );
    const newPid = result.insertId;

    if (newPid > 0) {
      // 2. Auto-wallet
      const qrToken = 'GBPAY-' + newPid + '-' + Date.now();
      await conn.query(
        "INSERT IGNORE INTO tbl_patient_wallet (patient_id, balance, status, qr_token, created_at, updated_at) VALUES (?,0,'active',?,NOW(),NOW())",
        [newPid, qrToken]
      ).catch(() => {});

      // 3. Open Credit Line
      if (open_credit_line) {
        const [cr] = await conn.query(
          "INSERT INTO tbl_credit_account (patient_id, status, outstanding_balance, notes, created_by, created_at) VALUES (?, 'active', 0, ?, ?, NOW())",
          [newPid, emergency_credit_pending ? 'Emergency — payment pending' : null, uid]
        );
      }

      // 4. Insurance (Auto or Manual)
      let insCarrier = ins_carrier_id;
      let insPolicy = ins_policy_number;
      let insPct = parseInt(ins_insurer_covered_percent) || 0;
      let apiSrc = null;

      if (ins_auto_data) {
        try {
          const auto = JSON.parse(Buffer.from(ins_auto_data, 'base64').toString());
          insCarrier = auto.carrier_id || insCarrier;
          insPolicy = auto.policy_number || insPolicy;
          insPct = auto.insurer_covered_percent || insPct;
          apiSrc = auto.api_source || 'auto';
        } catch(e) {}
      }

      if (insCarrier && insPct > 0) {
        await conn.query(
          \`INSERT INTO tbl_patient_insurance
           (patient_id, carrier_id, policy_number, insurer_covered_percent, is_primary, api_source, api_last_fetched, created_by, created_at)
           VALUES (?,?,?,?,1,?, NOW(), ?, NOW())\`,
          [newPid, insCarrier, insPolicy||null, insPct, apiSrc, uid]
        );
      }
    }

    await conn.commit();
    res.redirect('/patients?msg=Patient+registered+successfully+with+wallet' + (open_credit_line ? '+and+credit+line' : '') + '.');
  } catch (err) {
    await conn.rollback();
    console.error('ADD PATIENT ERROR:', err.message);
    res.redirect('/patients?err=Registration+failed:+' + encodeURIComponent(err.message));
  } finally {
    conn.release();
  }
});
`;

const markerStart = "app.post('/patients/add'";
const idxStart = src.indexOf(markerStart);
if (idxStart < 0) { console.error('Marker start not found'); process.exit(1); }

// Find end of route
let depth = 0, started = false, idxEnd = -1;
for (let i = idxStart; i < src.length; i++) {
  if (src[i] === '{') { depth++; started = true; }
  else if (src[i] === '}') {
    depth--;
    if (started && depth === 0) { idxEnd = i; break; }
  }
}
let tail = idxEnd + 1;
while (tail < src.length && /[);\r\n ]/.test(src[tail])) tail++;

src = src.slice(0, idxStart) + newAddRoute + src.slice(tail);
fs.writeFileSync('app.js', src, 'utf8');
console.log('Updated app.post("/patients/add") with credit and insurance logic.');
