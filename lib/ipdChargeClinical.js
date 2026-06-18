'use strict';

/**
 * Optional prescription-style instructions on IPD running-bill charges.
 * Stored as JSON in `tbl_ipd_charge.clinical_detail`.
 */

function buildClinicalDetailFromBody(body) {
  if (!body || typeof body !== 'object') return null;
  if (String(body.charge_type || '').trim().toLowerCase() !== 'pharmacy') return null;
  const o = {
    drug_type: String(body.drug_type || 'tablet').trim() || 'tablet',
    dosage: String(body.dosage || '').trim(),
    route: String(body.route || 'oral').trim() || 'oral',
    frequency_label: String(body.frequency_label || 'TDS').trim() || 'TDS',
    times_per_day: Math.min(8, Math.max(1, parseInt(body.times_per_day, 10) || 3)),
    duration_days: Math.min(365, Math.max(1, parseInt(body.duration_days, 10) || 5)),
    scheduled_times: String(body.scheduled_times || '').trim(),
    unit_price: (() => {
      const x = parseFloat(body.unit_price);
      return Number.isFinite(x) && x >= 0 ? x : 0;
    })(),
    notes: String(body.notes || '').trim()
  };
  const boring =
    !o.dosage &&
    !o.notes &&
    !o.scheduled_times &&
    !(o.unit_price > 0) &&
    o.drug_type === 'tablet' &&
    o.route === 'oral' &&
    o.frequency_label === 'TDS' &&
    o.times_per_day === 3 &&
    o.duration_days === 5;
  return boring ? null : JSON.stringify(o);
}

function summarizeChargeClinical(raw) {
  if (!raw) return '';
  let o;
  try {
    o = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return '';
  }
  if (!o || typeof o !== 'object') return '';
  const bits = [];
  if (o.dosage) bits.push('Dose: ' + o.dosage);
  if (o.frequency_label || o.times_per_day)
    bits.push(
      [o.frequency_label || '', o.times_per_day ? o.times_per_day + '×/d' : ''].filter(Boolean).join(' ')
    );
  if (o.duration_days) bits.push(o.duration_days + ' day(s)');
  if (o.route && o.route !== 'oral') bits.push('Route: ' + String(o.route).replace(/_/g, ' '));
  if (o.drug_type && o.drug_type !== 'tablet') bits.push('Form: ' + String(o.drug_type).replace(/_/g, ' '));
  if (o.scheduled_times) bits.push('Times: ' + o.scheduled_times);
  if (o.unit_price > 0) bits.push('Unit/dose: ' + o.unit_price + ' FCFA');
  if (o.notes) bits.push(o.notes);
  return bits.join(' · ');
}

module.exports = { buildClinicalDetailFromBody, summarizeChargeClinical };
