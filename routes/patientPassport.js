'use strict';

const { buildPatientMedicalPassport } = require('../lib/patientMedicalPassport');
const { buildPassportHtml } = require('../lib/buildPassportHtml');
const { htmlToPdfBuffer } = require('../lib/passportPdf');
const hmsBrand = require('../lib/hmsBrand');

module.exports = function (app, pool, requireAuth, requirePerm) {
  const chartPerm = requirePerm(
    'patient.directory.chart',
    'chart.read',
    'patient.read',
    'clinical.read',
    'clinical.write',
    'nursing.read'
  );

  async function loadPassportData(req, patientId) {
    const locale = String(resLocalsLang(req) || 'en').startsWith('fr') ? 'fr' : 'en';
    return buildPatientMedicalPassport(pool, patientId, {
      facilityName: hmsBrand.facilityName || hmsBrand.name,
      issuedBy: (req.session.user && (req.session.user.name || req.session.user.username)) || hmsBrand.facilityName,
      locale,
    });
  }

  function resLocalsLang(req) {
    return (req.res && req.res.locals && req.res.locals.lang) || req.session?.lang || 'en';
  }

  app.get('/patient-chart/:id/passport', requireAuth, chartPerm, async (req, res) => {
    const pid = parseInt(req.params.id, 10) || 0;
    if (pid < 1) return res.redirect('/patients?err=Invalid+patient');
    try {
      const data = await loadPassportData(req, pid);
      res.render('print-medical-passport', {
        title: `Medical Passport — ${data.patient.first_name} ${data.patient.last_name}`,
        pageData: {
          ...data,
          locale: data.meta?.locale || 'en',
          pdfUrl: `/patient-chart/${pid}/passport.pdf`,
          backUrl: `/patient-chart/${pid}`,
        },
      });
    } catch (e) {
      console.error('[passport] preview failed:', e.message);
      res.redirect(`/patient-chart/${pid}?err=` + encodeURIComponent(e.message || 'Could not build passport'));
    }
  });

  app.get('/patient-chart/:id/passport.pdf', requireAuth, chartPerm, async (req, res) => {
    const pid = parseInt(req.params.id, 10) || 0;
    if (pid < 1) return res.status(400).send('Invalid patient');
    try {
      const data = await loadPassportData(req, pid);
      const port = process.env.PORT || 3003;
      const base = String(process.env.HMS_PUBLIC_URL || `http://127.0.0.1:${port}`).replace(/\/$/, '');
      if (data.meta.letterhead && data.meta.letterhead.startsWith('/')) {
        data.meta.letterhead = base + data.meta.letterhead.split('?')[0];
      }
      const html = buildPassportHtml(data);
      const pdf = htmlToPdfBuffer(html);
      const fname = `Medical-Passport-${data.patient.patient_code || pid}.pdf`.replace(/[^\w.\-]+/g, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
      res.send(pdf);
    } catch (e) {
      console.error('[passport] pdf failed:', e.message);
      if (String(e.message || '').includes('PDF engine unavailable')) {
        return res.redirect(`/patient-chart/${pid}/passport?err=` + encodeURIComponent(e.message));
      }
      res.status(500).send(e.message || 'PDF generation failed');
    }
  });
};
