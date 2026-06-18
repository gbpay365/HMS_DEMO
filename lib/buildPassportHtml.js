'use strict';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clip(text, max = 120) {
  const s = String(text || '').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function summaryTable(columns, rows, empty) {
  if (!rows.length) return '';
  const head = columns.map((c) => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('');
  const body = rows
    .map(
      (row) =>
        `<tr>${columns.map((c) => `<td class="${c.cls || ''}">${esc(row[c.key] || '')}</td>`).join('')}</tr>`
    )
    .join('');
  return `<table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function block(title, body) {
  if (!body) return '';
  return `<section class="blk"><h2 class="blk-title">${esc(title)}</h2>${body}</section>`;
}

const TYPE_SHORT = {
  consultation: 'Consult',
  admission: 'Admit',
  discharge: 'Disch',
  laboratory: 'Lab',
  radiology: 'Rad',
  prescription: 'Rx',
  vitals: 'Vitals',
};

function buildPassportHtml(data) {
  const {
    patient,
    allergies,
    chronicMedications,
    insurance,
    timeline,
    diagnosisSummary = [],
    prescriptionSummary = [],
    treatmentSummary = [],
    meta,
  } = data;
  const fmtDt = meta.fmtDateTime || ((v) => String(v || '—'));
  const fmtD = meta.fmtDate || ((v) => String(v || '—'));
  const fmtShort = (v) => {
    const d = v ? new Date(v) : null;
    if (!d || Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(meta.locale === 'fr' ? 'fr-FR' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    });
  };
  const isFr = meta.locale === 'fr';

  const L = isFr
    ? {
        badge: 'Passeport médical',
        title: 'Passeport médical',
        handover: 'Document pour consultation dans un autre établissement.',
        patientId: 'N° patient',
        passportId: 'N° passeport',
        issued: 'Émis',
        dob: 'Naissance',
        identity: 'Identité patient',
        emergency: 'Urgence',
        noEmergency: 'Aucun contact',
        insurance: 'Assurance',
        allergies: 'Allergies',
        meds: 'Traitements chroniques',
        none: 'Aucun',
        clinical: 'Synthèses cliniques',
        diagnosis: 'Diagnostics',
        prescriptions: 'Ordonnances',
        treatments: 'Traitements',
        timeline: 'Chronologie clinique',
        timelineSub: 'Historique condensé',
        colDate: 'Date',
        colSrc: 'Src',
        colType: 'Type',
        colItem: 'Élément',
        colDetail: 'Détail',
        disclaimerTitle: 'Important :',
        disclaimer: `Résumé des dossiers de ${meta.facility_name}. Ne remplace pas le dossier complet.`,
        sourceLabel: (s) => ({ OPD: 'AMB', IPD: 'HOSP', 'Problem list': 'PROB' }[s] || s),
      }
    : {
        badge: 'Medical Passport',
        title: 'Medical Passport',
        handover: 'Handover document for visits to other hospitals or doctors.',
        patientId: 'Patient ID',
        passportId: 'Passport ID',
        issued: 'Issued',
        dob: 'DOB',
        identity: 'Patient identity',
        emergency: 'Emergency',
        noEmergency: 'No contact',
        insurance: 'Insurance',
        allergies: 'Allergies',
        meds: 'Chronic meds',
        none: 'None',
        clinical: 'Clinical summaries',
        diagnosis: 'Diagnoses',
        prescriptions: 'Prescriptions',
        treatments: 'Treatments',
        timeline: 'Clinical timeline',
        timelineSub: 'Condensed history',
        colDate: 'Date',
        colSrc: 'Src',
        colType: 'Type',
        colItem: 'Item',
        colDetail: 'Detail',
        disclaimerTitle: 'Important:',
        disclaimer: `Summary from ${meta.facility_name}. Does not replace complete records.`,
        sourceLabel: (s) => ({ OPD: 'OPD', IPD: 'IPD', 'Problem list': 'Prob' }[s] || s),
      };

  const sumCols = [
    { key: 'date', label: L.colDate, cls: 'c-date' },
    { key: 'source', label: L.colSrc, cls: 'c-src' },
    { key: 'title', label: L.colItem, cls: 'c-title' },
    { key: 'detail', label: L.colDetail, cls: 'c-detail' },
  ];

  const tlCols = [
    { key: 'date', label: L.colDate, cls: 'c-date' },
    { key: 'type', label: L.colType, cls: 'c-type' },
    { key: 'title', label: L.colItem, cls: 'c-title' },
    { key: 'detail', label: L.colDetail, cls: 'c-detail' },
  ];

  const dxRows = diagnosisSummary.map((item) => ({
    date: fmtShort(item.date),
    source: L.sourceLabel(item.source),
    title: item.title,
    detail: clip([item.context, item.provider, item.detail].filter(Boolean).join(' · ')),
  }));

  const rxRows = prescriptionSummary.map((item) => ({
    date: fmtShort(item.date),
    source: L.sourceLabel(item.source),
    title: item.title,
    detail: clip([item.provider, item.detail].filter(Boolean).join(' · '), 120),
  }));

  const txRows = treatmentSummary.map((item) => ({
    date: fmtShort(item.date),
    source: L.sourceLabel(item.source),
    title: item.title,
    detail: clip([item.status, item.provider, item.detail].filter(Boolean).join(' · '), 120),
  }));

  const tlRows = (timeline || []).map((ev) => ({
    date: fmtShort(ev.date),
    type: TYPE_SHORT[ev.type] || ev.type,
    title: ev.title,
    detail: clip([ev.subtitle, ev.provider, ev.detail].filter(Boolean).join(' · '), 120),
  }));

  const allergyList = (allergies || []).length
    ? `<ul class="bullets">${allergies.map((a) => `<li><b>${esc(a.substance)}</b>${a.severity ? ` [${esc(a.severity)}]` : ''}${a.reaction ? ` — ${esc(a.reaction)}` : ''}</li>`).join('')}</ul>`
    : `<p class="empty">${esc(L.none)}</p>`;

  const medList = (chronicMedications || []).length
    ? `<ul class="bullets">${chronicMedications.map((m) => `<li><b>${esc(m.name)}</b>${m.dosage ? ` — ${esc(m.dosage)}` : ''}</li>`).join('')}</ul>`
    : `<p class="empty">${esc(L.none)}</p>`;

  const emergencyHtml = patient.next_of_kin_name
    ? `<div class="grid2">
        <div class="fld"><span class="lbl">${esc(L.emergency)}</span><span class="val">${esc(patient.next_of_kin_name)}</span></div>
        <div class="fld"><span class="lbl">Tel</span><span class="val">${esc(patient.next_of_kin_phone || '')}</span></div>
      </div>`
    : `<p class="empty">${esc(L.noEmergency)}</p>`;

  const clinicalParts = [
    dxRows.length ? `<h3 class="mini">${esc(L.diagnosis)}</h3>${summaryTable(sumCols, dxRows, '')}` : '',
    rxRows.length ? `<h3 class="mini">${esc(L.prescriptions)}</h3>${summaryTable(sumCols, rxRows, '')}` : '',
    txRows.length ? `<h3 class="mini">${esc(L.treatments)}</h3>${summaryTable(sumCols, txRows, '')}` : '',
  ].join('');

  const clinicalBlock = clinicalParts ? block(L.clinical, clinicalParts) : '';
  const timelineBlock = tlRows.length
    ? block(L.timeline, `<p class="sub">${esc(L.timelineSub)}</p>${summaryTable(tlCols, tlRows, '')}`)
    : '';

  return `<!DOCTYPE html>
<html lang="${esc(meta.locale || 'en')}">
<head>
<meta charset="utf-8">
<title>Medical Passport — ${esc(patient.first_name)} ${esc(patient.last_name)}</title>
<style>
  @page { size: A5 portrait; margin: 5mm 6mm 6mm 6mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a; margin: 0; font-size: 6.5px; line-height: 1.25; background: #fff; }
  .flow { padding: 0; }
  .cover { background: linear-gradient(160deg,#0f172a,#1e293b); color: #fff; padding: 4mm 5mm; page-break-after: always; break-after: page; margin-bottom: 3mm; }
  .logo { max-height: 11mm; width: 100%; object-fit: contain; margin-bottom: 3mm; display: block; }
  .badge { display: inline-block; border: 1px solid rgba(251,191,36,.4); color: #fde68a; padding: 1px 6px; border-radius: 999px; font-size: 5.5px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  h1 { font-size: 14px; font-weight: 900; margin: 2mm 0 1mm; }
  .name { font-size: 11px; font-weight: 800; }
  .meta { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 2mm; margin-top: 3mm; font-size: 6.5px; }
  .meta dt { font-size: 5px; text-transform: uppercase; color: #94a3b8; font-weight: 700; }
  .meta dd { margin: 0; font-weight: 700; color: #e2e8f0; }
  .cover-foot { margin-top: 3mm; padding-top: 2mm; border-top: 1px solid rgba(255,255,255,.15); font-size: 6px; color: #94a3b8; }
  .blk { margin-bottom: 3mm; break-inside: auto; }
  .blk-title { font-size: 7px; font-weight: 900; text-transform: uppercase; letter-spacing: .1em; margin: 0 0 2px; padding-bottom: 2px; border-bottom: 1.5px solid #0f172a; }
  .sub { font-size: 5.5px; color: #64748b; margin: 0 0 2px; text-transform: uppercase; }
  .mini { font-size: 6px; font-weight: 800; text-transform: uppercase; color: #475569; margin: 2px 0 1px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 6px; margin-bottom: 2mm; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
  .fld { display: flex; gap: 3px; border-bottom: 1px dotted #e2e8f0; padding: 1px 0; font-size: 6.5px; }
  .lbl { color: #64748b; font-weight: 700; font-size: 5.5px; text-transform: uppercase; min-width: 34px; }
  .val { flex: 1; font-weight: 600; }
  .bullets { margin: 0; padding-left: 9px; font-size: 6.5px; }
  .bullets li { margin-bottom: 1px; }
  .empty { font-size: 6px; color: #94a3b8; font-style: italic; margin: 0; }
  .tbl { width: 100%; border-collapse: collapse; font-size: 6px; table-layout: fixed; margin-bottom: 1mm; }
  .tbl thead { display: table-header-group; }
  .tbl th { background: #0f172a; color: #fde68a; font-size: 5px; font-weight: 800; text-transform: uppercase; padding: 1px 3px; border: 1px solid #0f172a; text-align: left; }
  .tbl td { padding: 1px 3px; border: 1px solid #e2e8f0; vertical-align: top; word-wrap: break-word; }
  .tbl tbody tr:nth-child(even) td { background: #f8fafc; }
  .c-date { width: 14%; } .c-src { width: 9%; } .c-type { width: 10%; } .c-title { width: 27%; font-weight: 700; } .c-detail { width: 40%; color: #475569; }
  .footer { margin-top: 3mm; padding-top: 2mm; border-top: 1px solid #e2e8f0; break-inside: avoid; }
  .disclaimer { font-size: 6px; line-height: 1.35; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; padding: 2mm 3mm; margin-bottom: 2mm; }
  .foot { font-size: 5.5px; color: #64748b; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 3px; }
</style>
</head>
<body>
<article class="flow">
  <header class="cover">
    ${meta.letterhead ? `<img class="logo" src="${esc(meta.letterhead)}" alt="">` : ''}
    <div class="badge">${esc(L.badge)}</div>
    <h1>${esc(L.title)}</h1>
    <div class="name">${esc(patient.first_name)} ${esc(patient.last_name)}</div>
    <dl class="meta">
      <div><dt>${esc(L.patientId)}</dt><dd>${esc(patient.patient_code)}</dd></div>
      <div><dt>${esc(L.passportId)}</dt><dd>${esc(meta.passport_id)}</dd></div>
      <div><dt>${esc(L.issued)}</dt><dd>${esc(fmtDt(meta.issued_at))}</dd></div>
      <div><dt>${esc(L.dob)}</dt><dd>${esc(fmtD(patient.date_of_birth))}</dd></div>
    </dl>
    <div class="cover-foot">${esc(meta.facility_name)}</div>
  </header>

  ${block(
    L.identity,
    `<div class="grid2">
       <div class="fld"><span class="lbl">${esc(L.patientId)}</span><span class="val"><b>${esc(patient.patient_code)}</b></span></div>
       <div class="fld"><span class="lbl">${esc(L.dob)}</span><span class="val">${esc(fmtD(patient.date_of_birth))}</span></div>
       <div class="fld"><span class="lbl">Gender</span><span class="val">${esc(patient.gender || '—')}</span></div>
       <div class="fld"><span class="lbl">Age</span><span class="val">${esc(patient.age_years ?? '—')}</span></div>
       <div class="fld"><span class="lbl">Blood</span><span class="val">${esc(patient.blood_group || '—')}</span></div>
       <div class="fld"><span class="lbl">Phone</span><span class="val">${esc(patient.phone || '—')}</span></div>
       <div class="fld" style="grid-column:1/-1"><span class="lbl">Address</span><span class="val">${esc(patient.address || '—')}</span></div>
       ${insurance ? `<div class="fld" style="grid-column:1/-1"><span class="lbl">${esc(L.insurance)}</span><span class="val">${esc(insurance.carrier)}${insurance.policy ? ` · ${esc(insurance.policy)}` : ''}</span></div>` : ''}
     </div>
     <h3 class="mini">${esc(L.emergency)}</h3>${emergencyHtml}
     <div class="cols2">
       <div><h3 class="mini">${esc(L.allergies)}</h3>${allergyList}</div>
       <div><h3 class="mini">${esc(L.meds)}</h3>${medList}</div>
     </div>`
  )}

  ${clinicalBlock}
  ${timelineBlock}

  <footer class="footer">
    <div class="disclaimer"><b>${esc(L.disclaimerTitle)}</b> ${esc(L.disclaimer)}</div>
    <p class="empty" style="font-style:normal">${esc(L.handover)}</p>
    <div class="foot">
      <span>${esc(meta.issued_by_label)}</span>
      <span>${esc(meta.passport_id)}</span>
      <span>${esc(fmtDt(meta.issued_at))}</span>
    </div>
  </footer>
</article>
</body>
</html>`;
}

module.exports = { buildPassportHtml };
