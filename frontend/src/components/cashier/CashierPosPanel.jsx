import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import { CsBadge } from './CashierReferenceShell';
import { filterDoctorsForCashierService } from '../../lib/doctorClinicalFilter';
import { resolveHmsPayMethodForPos, resolvePosMobileMethods, POS_GATEWAY_METHODS } from '../../lib/cashierPaymentMethods';
import { formatMoney, priceUnitLabel, isCameroonInstall } from '../../lib/hmsLocale';
import {
  detectCardBrand,
  formatCardNumberInput,
  formatExpiryInput,
  validateCardPayment,
  cardBrandLabel,
} from '../../lib/cardPaymentUtils';
import { notifyError } from '../../lib/notifyBridge';

const CAT_COLORS = {
  Consultation: { bg: 'var(--cs-cat-cons-bg)', color: 'var(--cs-cat-cons)' },
  Laboratory: { bg: 'var(--cs-cat-lab-bg)', color: 'var(--cs-cat-lab)' },
  Radiology: { bg: 'var(--cs-cat-rad-bg)', color: 'var(--cs-cat-rad)' },
  Pharmacy: { bg: 'var(--cs-cat-pharm-bg)', color: 'var(--cs-cat-pharm)' },
  Procedures: { bg: 'var(--cs-cat-proc-bg)', color: 'var(--cs-cat-proc)' },
  Room: { bg: 'var(--cs-cat-room-bg)', color: 'var(--cs-cat-room)' },
  Misc: { bg: 'var(--cs-cat-misc-bg)', color: 'var(--cs-cat-misc)' },
};

const POS_PAY_METHODS_BASE = [
  { id: 'cash', label: 'Cash', icon: 'money' },
  { id: 'card', label: 'Card', icon: 'credit-card' },
  { id: 'mobile', label: 'Mobile', icon: 'mobile' },
  { id: 'wallet', label: 'Wallet', icon: 'briefcase' },
  { id: 'insurance', label: 'Insurance', icon: 'shield' },
];

const POS_PAY_METHOD_CM_BETTERPAY = { id: 'betterpay', label: 'BetterPay', icon: 'qrcode' };

const PAY_METHOD_KEYS = {
  Cash: 'cash',
  MOMO: 'momo',
  OM: 'om',
  'Mobile Money': 'momo',
  'Orange Money': 'om',
  'Bank Transfer': 'bank_transfer',
  POS: 'pos',
  Paystack: 'paystack',
  USSD: 'ussd',
  Insurance: 'insurance',
  Wallet: 'wallet',
  BetterPay: 'betterpay',
  'QR Code': 'betterpay',
  Bank: 'bank',
  CARD: 'pos',
  Card: 'pos',
};

const NUMPAD_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '000', '0', '⌫'];

const GATE_METHODS = POS_GATEWAY_METHODS;

function payMethodDisplayLabel(method, tIpd) {
  const key = PAY_METHOD_KEYS[method];
  return key ? tIpd(`modals.pay_methods.${key}`, { defaultValue: method }) : method;
}

function isSpecialistConsultation(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return n === 'specialist consultation' || /\bspecialist\s+consultation\b/.test(n);
}

function consultNeedsDoctor(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return n === 'general consultation' || n === 'specialist consultation'
    || /\bgeneral\s+consultation\b/.test(n)
    || /\bspecialist\s+consultation\b/.test(n);
}

function cartLineKey(svc, doctorId) {
  if (svc.serviceType === 'consultation' && consultNeedsDoctor(svc.name) && doctorId) {
    return `${svc.id}--dr-${doctorId}`;
  }
  return svc.id;
}

function patientInitials(p) {
  return `${(p.first_name?.[0] || '').toUpperCase()}${(p.last_name?.[0] || '').toUpperCase()}`;
}

function svcRoomCategory(name) {
  return /\b(bed|room|ward)\b/i.test(String(name || ''));
}

function buildPosServices({
  consultCatalog,
  labCatalog,
  imagingCatalog,
  pharmacyCatalog,
  maternityCatalog,
  surgeryCatalog,
  svcCatalog,
}) {
  const rows = [];
  const push = (items, serviceType, cat) => {
    (items || []).forEach((item) => {
      if (!item?.id) return;
      rows.push({
        id: `${serviceType}-${item.id}`,
        serviceType,
        catalogId: String(item.id),
        name: String(item.name || '').trim(),
        price: Number(item.price || 0),
        departmentName: String(item.department_name || '').trim(),
        cat,
      });
    });
  };
  push(consultCatalog, 'consultation', 'Consultation');
  push(labCatalog, 'laboratory', 'Laboratory');
  push(imagingCatalog, 'radiology', 'Radiology');
  push(pharmacyCatalog, 'pharmacy', 'Pharmacy');
  push(maternityCatalog, 'maternity', 'Procedures');
  push(surgeryCatalog, 'surgery', 'Procedures');
  (svcCatalog || []).forEach((item) => {
    if (!item?.id) return;
    const cat = svcRoomCategory(item.name) ? 'Room' : 'Misc';
    rows.push({
      id: `hospitalisation-${item.id}`,
      serviceType: 'hospitalisation',
      catalogId: String(item.id),
      name: String(item.name || '').trim(),
      price: Number(item.price || 0),
      cat,
    });
  });
  return rows.filter((r) => r.name);
}

function resolveHmsPayMethod(posMethod, mobileSubMethod, paymentMethods) {
  return resolveHmsPayMethodForPos(posMethod, mobileSubMethod, paymentMethods);
}

function filterPatientsForPos(list, q, limit = 12) {
  const term = String(q || '').trim().toLowerCase();
  if (!term) return [];
  const out = [];
  for (const p of list || []) {
    if (!p || p.id == null) continue;
    const first = String(p.first_name || '').toLowerCase();
    const last = String(p.last_name || '').toLowerCase();
    const full = `${first} ${last}`.trim();
    const rev = `${last} ${first}`.trim();
    const code = String(p.patient_code || '').toLowerCase();
    const phone = String(p.phone || '').toLowerCase();
    const id = String(p.id || '');
    const hit =
      full.includes(term) ||
      rev.includes(term) ||
      first.includes(term) ||
      last.includes(term) ||
      code.includes(term) ||
      phone.includes(term) ||
      id.includes(term);
    if (hit) out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

function mergePatientResults(primary = [], secondary = [], limit = 12) {
  const seen = new Set();
  const out = [];
  for (const p of [...primary, ...secondary]) {
    const id = parseInt(p?.id, 10) || 0;
    if (id < 1 || seen.has(id)) continue;
    seen.add(id);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

export function CashierPosPanel({
  consultCatalog = [],
  labCatalog = [],
  imagingCatalog = [],
  pharmacyCatalog = [],
  maternityCatalog = [],
  surgeryCatalog = [],
  svcCatalog = [],
  doctors = [],
  specialistSpecialisations = [],
  paymentMethods = [],
  patients = [],
  patientSeed = null,
  onSaveAsBill,
  onNeedsPrepayModal,
}) {
  const { t } = useTranslation('clinical');
  const { t: tOps } = useTranslation('ops');
  const { t: tIpd } = useTranslation('ipd');

  const services = useMemo(
    () => buildPosServices({
      consultCatalog,
      labCatalog,
      imagingCatalog,
      pharmacyCatalog,
      maternityCatalog,
      surgeryCatalog,
      svcCatalog,
    }),
    [consultCatalog, labCatalog, imagingCatalog, pharmacyCatalog, maternityCatalog, surgeryCatalog, svcCatalog],
  );

  const categories = useMemo(
    () => [...new Set(services.map((s) => s.cat))].sort(),
    [services],
  );

  const [patientQ, setPatientQ] = useState('');
  const [patientResults, setPatientResults] = useState([]);
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [patientSearchBusy, setPatientSearchBusy] = useState(false);
  const [patient, setPatient] = useState(null);
  const [activeCat, setActiveCat] = useState('all');
  const [svcSearch, setSvcSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [payMethod, setPayMethod] = useState('cash');
  const [mobileSubMethod, setMobileSubMethod] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardAuthCode, setCardAuthCode] = useState('');
  const [cashTendered, setCashTendered] = useState('');
  const [discount, setDiscount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingConsult, setPendingConsult] = useState(null);
  const [consultDoctorId, setConsultDoctorId] = useState('');
  const [consultSpecialistSpec, setConsultSpecialistSpec] = useState('');

  const mobileMethods = useMemo(
    () => resolvePosMobileMethods(paymentMethods),
    [paymentMethods],
  );

  const posPayMethods = useMemo(() => {
    if (!isCameroonInstall()) return POS_PAY_METHODS_BASE;
    const methods = [...POS_PAY_METHODS_BASE];
    const walletIdx = methods.findIndex((m) => m.id === 'wallet');
    methods.splice(walletIdx >= 0 ? walletIdx + 1 : methods.length, 0, POS_PAY_METHOD_CM_BETTERPAY);
    return methods;
  }, []);

  useEffect(() => {
    if (payMethod !== 'mobile') return;
    if (!mobileMethods.length) {
      setMobileSubMethod('');
      return;
    }
    if (!mobileSubMethod || !mobileMethods.includes(mobileSubMethod)) {
      setMobileSubMethod(mobileMethods[0]);
    }
  }, [payMethod, mobileMethods, mobileSubMethod]);

  const detectedCardBrand = useMemo(() => detectCardBrand(cardNumber), [cardNumber]);

  const cardErrorMessage = (code) => {
    const key = `cashier_odoo.pos_card_err_${code}`;
    const defaults = {
      unknown_card: 'Could not identify card type. Check the number.',
      invalid_length: 'Card number length is invalid for this card type.',
      invalid_number: 'Card number is not valid.',
      holder_required: 'Enter the name on the card.',
      invalid_expiry: 'Enter a valid expiry date (MM/YY).',
      auth_required: 'Enter the POS approval / auth code.',
    };
    return tOps(key, { defaultValue: defaults[code] || 'Invalid card details.' });
  };

  const pendingNeedsSpecialistSpec = pendingConsult
    ? isSpecialistConsultation(pendingConsult.name)
    : false;

  const consultCatalogItem = useMemo(() => {
    if (!pendingConsult) return null;
    return {
      name: pendingConsult.name,
      department_name: pendingConsult.departmentName || '',
    };
  }, [pendingConsult]);

  const filteredConsultDoctors = useMemo(() => {
    if (!pendingConsult || !consultNeedsDoctor(pendingConsult.name)) return [];
    return filterDoctorsForCashierService(doctors, consultCatalogItem, {
      specialistSpec: consultSpecialistSpec,
    });
  }, [pendingConsult, doctors, consultCatalogItem, consultSpecialistSpec]);

  useEffect(() => {
    if (!pendingConsult) return;
    if (pendingNeedsSpecialistSpec && !consultSpecialistSpec) {
      setConsultDoctorId('');
      return;
    }
    const stillValid = filteredConsultDoctors.some((d) => String(d.id) === String(consultDoctorId));
    if (!stillValid) {
      setConsultDoctorId(filteredConsultDoctors[0]?.id ? String(filteredConsultDoctors[0].id) : '');
    }
  }, [pendingConsult, pendingNeedsSpecialistSpec, consultSpecialistSpec, filteredConsultDoctors, consultDoctorId]);

  useEffect(() => {
    const q = patientQ.trim();
    if (!q || patient) {
      setPatientResults([]);
      setPatientSearchBusy(false);
      return undefined;
    }

    const localHits = filterPatientsForPos(patients, q, 12);
    setPatientResults(localHits);
    setPatientSearchBusy(localHits.length === 0);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(q)}`, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        const data = await res.json().catch(() => []);
        const rows = Array.isArray(data) ? data : [];
        setPatientResults(mergePatientResults(localHits, rows, 12));
      } catch {
        setPatientResults(localHits);
      } finally {
        setPatientSearchBusy(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [patientQ, patient, patients]);

  useEffect(() => {
    if (!patientSeed?.id) return;
    setPatient({
      id: patientSeed.id,
      first_name: String(patientSeed.name || '').split(/\s+/)[0] || '',
      last_name: String(patientSeed.name || '').split(/\s+/).slice(1).join(' ') || '',
    });
    setPatientQ('');
    setPatientResults([]);
    setPatientSearchOpen(false);
  }, [patientSeed]);

  useEffect(() => {
    if (!patientSearchOpen) return undefined;
    const onDocClick = (ev) => {
      const root = document.getElementById('pos-patient-search-root');
      if (root && !root.contains(ev.target)) {
        setPatientSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [patientSearchOpen]);

  const filteredServices = useMemo(() => {
    const q = svcSearch.trim().toLowerCase();
    return services.filter((s) => {
      if (activeCat !== 'all' && s.cat !== activeCat) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [services, activeCat, svcSearch]);

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.price * line.qty, 0),
    [cart],
  );

  const discPct = Math.min(100, Math.max(0, parseFloat(discount) || 0));
  const total = Math.round(subtotal * (1 - discPct / 100));
  const tenderedNum = parseFloat(cashTendered) || 0;
  const change = tenderedNum - total;

  const cartCount = cart.reduce((sum, line) => sum + line.qty, 0);

  const selectPatient = (p) => {
    setPatient(p);
    setPatientQ('');
    setPatientResults([]);
    setPatientSearchOpen(false);
  };

  const clearPatient = () => {
    setPatient(null);
    setPatientQ('');
    setPatientResults([]);
    setPatientSearchOpen(false);
  };

  const addToCart = (svc, { doctorId = '', doctorName = '', specialistSpec = '' } = {}) => {
    const lineId = cartLineKey(svc, doctorId);
    setCart((prev) => {
      const existing = prev.find((c) => c.cartLineId === lineId);
      if (existing) {
        return prev.map((c) => (c.cartLineId === lineId ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, {
        ...svc,
        cartLineId: lineId,
        qty: 1,
        doctorId: doctorId || undefined,
        doctorName: doctorName || undefined,
        specialistSpec: specialistSpec || undefined,
      }];
    });
  };

  const handleServiceClick = (svc) => {
    if (svc.serviceType === 'consultation' && consultNeedsDoctor(svc.name)) {
      setPendingConsult(svc);
      setConsultDoctorId('');
      setConsultSpecialistSpec('');
      return;
    }
    addToCart(svc);
  };

  const cancelConsultPicker = () => {
    setPendingConsult(null);
    setConsultDoctorId('');
    setConsultSpecialistSpec('');
  };

  const confirmConsultAdd = () => {
    if (!pendingConsult) return;
    if (pendingNeedsSpecialistSpec && !consultSpecialistSpec) {
      notifyError(t('modals.cashierPrepay.err_specialisation'));
      return;
    }
    if (!consultDoctorId) {
      notifyError(t('modals.cashierPrepay.err_doctor'));
      return;
    }
    const doctor = filteredConsultDoctors.find((d) => String(d.id) === String(consultDoctorId));
    if (!doctor) {
      notifyError(t('modals.cashierPrepay.err_doctor'));
      return;
    }
    const doctorName = `${doctor.first_name || ''} ${doctor.last_name || ''}`.trim();
    addToCart(pendingConsult, {
      doctorId: consultDoctorId,
      doctorName,
      specialistSpec: consultSpecialistSpec,
    });
    cancelConsultPicker();
  };

  const validateCartConsultations = () => {
    for (const line of cart) {
      if (line.serviceType === 'consultation' && consultNeedsDoctor(line.name) && !line.doctorId) {
        return t('modals.cashierPrepay.err_doctor');
      }
    }
    return '';
  };

  const changeQty = (lineId, delta) => {
    setCart((prev) => prev.map((c) => {
      if (c.cartLineId !== lineId) return c;
      return { ...c, qty: Math.max(1, c.qty + delta) };
    }));
  };

  const removeFromCart = (lineId) => {
    setCart((prev) => prev.filter((c) => c.cartLineId !== lineId));
  };

  const clearCart = () => setCart([]);

  const numpadPress = (key) => {
    if (key === '⌫') {
      setCashTendered((v) => v.slice(0, -1));
      return;
    }
    if (key === '000') {
      setCashTendered((v) => `${v}000`);
      return;
    }
    setCashTendered((v) => `${v}${key}`);
  };

  const buildPrepayLines = useCallback(() => {
    const noteText = [
      note.trim(),
      discPct > 0 ? `Discount ${discPct}%` : '',
    ].filter(Boolean).join(' · ');

    return cart.map((line, idx) => {
      const row = {
        prepay_service_type: line.serviceType,
        prepay_catalog_id: line.catalogId,
        prepay_quantity: String(line.qty),
      };
      if (line.doctorId) row.prepay_assigned_doctor_id = String(line.doctorId);
      if (line.specialistSpec) row.prepay_specialist_spec = line.specialistSpec;
      if (noteText && idx === 0) row.prepay_comments = noteText.slice(0, 500);
      return row;
    });
  }, [cart, note, discPct]);

  const processPayment = async () => {
    if (!patient?.id) {
      notifyError(tOps('cashier_odoo.pos_select_patient', { defaultValue: 'Please select a patient.' }));
      return;
    }
    if (!cart.length) {
      notifyError(tOps('cashier_odoo.pos_empty_cart', { defaultValue: 'Please add services to the cart.' }));
      return;
    }
    const consultErr = validateCartConsultations();
    if (consultErr) {
      notifyError(consultErr);
      return;
    }
    if (payMethod === 'cash' && tenderedNum < total) {
      notifyError(tOps('cashier_odoo.pos_cash_short', { defaultValue: 'Cash tendered is less than total.' }));
      return;
    }

    if (payMethod === 'mobile' && !mobileMethods.length) {
      notifyError(tOps('cashier_odoo.pos_no_mobile', { defaultValue: 'No mobile payment methods configured for this country.' }));
      return;
    }

    let cardMeta = null;
    if (payMethod === 'card') {
      const cardCheck = validateCardPayment({
        cardNumber,
        cardHolder,
        cardExpiry,
        authCode: cardAuthCode,
      });
      if (!cardCheck.ok) {
        notifyError(cardErrorMessage(cardCheck.error));
        return;
      }
      cardMeta = cardCheck.meta;
    }

    const hmsMethod = resolveHmsPayMethod(payMethod, mobileSubMethod, paymentMethods);
    if (payMethod === 'wallet' || payMethod === 'betterpay' || GATE_METHODS.has(hmsMethod)) {
      onNeedsPrepayModal?.({
        patientId: patient.id,
        lines: buildPrepayLines(),
        payMethod: payMethod === 'betterpay' ? 'BetterPay' : hmsMethod,
      });
      return;
    }

    setBusy(true);
    try {
      const payload = {
        prepay_patient_id: String(patient.id),
        prepay_payment_method: hmsMethod,
        prepay_lines: buildPrepayLines(),
      };
      if (cardMeta) payload.prepay_card_meta = cardMeta;
      if (payMethod === 'insurance' || (patient.coverage && parseInt(patient.coverage, 10) > 0)) {
        payload.manual_insurance_check = 'on';
        payload.manual_insurance_pct = String(parseInt(patient.coverage, 10) || 0);
      }

      const res = await fetch('/api/cashier/prepay/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
        throw new Error(data.error || t('modals.cashierPrepay.payment_not_received'));
      }
      clearCart();
      setDiscount('');
      setCashTendered('');
      setNote('');
      setCardNumber('');
      setCardHolder('');
      setCardExpiry('');
      setCardAuthCode('');
      window.location.href = `/cashier/print-slip/${encodeURIComponent(data.ticketCode)}`;
    } catch (err) {
      notifyError(err.message || t('modals.cashierPrepay.payment_not_received'));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAsBill = () => {
    if (!patient?.id) {
      notifyError(tOps('cashier_odoo.pos_select_patient', { defaultValue: 'Please select a patient.' }));
      return;
    }
    if (!cart.length) {
      notifyError(tOps('cashier_odoo.pos_empty_cart', { defaultValue: 'Please add services to the cart.' }));
      return;
    }
    const consultErr = validateCartConsultations();
    if (consultErr) {
      notifyError(consultErr);
      return;
    }
    onSaveAsBill?.({ patient, cart, total, note });
  };

  return (
    <div className="pos-shell">
      <div className="pos-col">
        <div className="cs-card pos-patient-card">
          <div className="cs-card-head">
            <div className="cs-card-title">
              <FaIcon name="user" className="pos-card-title-icon" />
              {tOps('cashier_odoo.pos_patient', { defaultValue: 'Patient' })}
            </div>
          </div>
          <div className="cs-card-body pos-patient-card-body">
            <div className="pos-patient-row">
              <div className="cs-search-wrap pos-patient-search" id="pos-patient-search-root">
                <FaIcon name="search" className="cs-search-icon" />
                <input
                  className="cs-search"
                  placeholder={tOps('cashier_odoo.pos_patient_ph', { defaultValue: 'Search name, phone, or patient code…' })}
                  value={patient ? `${patient.first_name} ${patient.last_name}` : patientQ}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (patient) {
                      setPatient(null);
                      setPatientResults([]);
                    }
                    setPatientQ(next);
                    setPatientSearchOpen(true);
                  }}
                  onFocus={() => {
                    if (!patient) setPatientSearchOpen(true);
                  }}
                  autoComplete="off"
                />
                {!patient && patientSearchOpen && patientQ.trim() ? (
                  <ul className="pos-patient-results" role="listbox">
                    {patientSearchBusy && patientResults.length === 0 ? (
                      <li className="pos-patient-results__empty">
                        {tOps('cashier_odoo.pos_patient_searching', { defaultValue: 'Searching…' })}
                      </li>
                    ) : patientResults.length > 0 ? (
                      patientResults.map((p) => (
                        <li key={p.id}>
                          <button type="button" onClick={() => selectPatient(p)}>
                            <span className="pos-patient-results__name">
                              {p.first_name} {p.last_name}
                            </span>
                            <span className="pos-patient-results__meta">
                              #{p.id}
                              {p.patient_code ? ` · ${p.patient_code}` : ''}
                              {p.phone ? ` · ${p.phone}` : ''}
                            </span>
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="pos-patient-results__empty">
                        {tOps('cashier_odoo.pos_patient_none', { defaultValue: 'No patients found' })}
                      </li>
                    )}
                  </ul>
                ) : null}
              </div>
              <button type="button" className="cs-btn cs-btn-sm" onClick={clearPatient} aria-label="Clear patient">
                <FaIcon name="times" />
              </button>
            </div>
            {patient ? (
              <div className="pos-patient-selected">
                <div className="pos-patient-display">
                  <div className="cs-avatar pos-patient-avatar">
                    {patientInitials(patient)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="pos-patient-name">
                      {patient.first_name} {patient.last_name}
                    </div>
                    <div className="pos-patient-meta">
                      #{patient.id}
                      {patient.phone ? ` · ${patient.phone}` : ''}
                      {patient.coverage && parseInt(patient.coverage, 10) > 0 ? ` · ${patient.coverage}% cover` : ''}
                    </div>
                  </div>
                  {patient.coverage && parseInt(patient.coverage, 10) > 0 ? (
                    <span className="cs-badge bg-insurance">{patient.coverage}%</span>
                  ) : (
                    <CsBadge tone="paid">Clear</CsBadge>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="cs-card">
          <div className="cs-card-head">
            <div className="cs-card-title">
              <FaIcon name="th" className="pos-card-title-icon" />
              {tOps('cashier_odoo.pos_services', { defaultValue: 'Services' })}
            </div>
            <div className="cs-search-wrap">
              <FaIcon name="search" className="cs-search-icon" />
              <input
                className="cs-search pos-svc-search"
                placeholder={tOps('cashier_odoo.pos_service_ph', { defaultValue: 'Search service…' })}
                value={svcSearch}
                onChange={(e) => setSvcSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="cs-card-body">
            <div className="pos-svc-cats">
              <button
                type="button"
                className={`cs-btn pos-svc-cat-btn${activeCat === 'all' ? ' cs-btn-primary' : ''}`}
                onClick={() => setActiveCat('all')}
              >
                All
              </button>
              {categories.map((cat) => {
                const c = CAT_COLORS[cat] || CAT_COLORS.Misc;
                const active = activeCat === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`cs-btn pos-svc-cat-btn${active ? ' cs-btn-primary' : ''}`}
                    style={active ? undefined : { borderColor: c.color, color: c.color }}
                    onClick={() => setActiveCat(cat)}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
            <div className="pos-svc-grid">
              {filteredServices.length === 0 ? (
                <div className="cs-empty" style={{ gridColumn: '1 / -1' }}>
                  {tOps('cashier_odoo.pos_no_services', { defaultValue: 'No services match your search.' })}
                </div>
              ) : (
                filteredServices.map((svc) => {
                  const c = CAT_COLORS[svc.cat] || CAT_COLORS.Misc;
                  return (
                    <button
                      key={svc.id}
                      type="button"
                      className={`pos-svc-card${pendingConsult?.id === svc.id ? ' pos-svc-card--active' : ''}`}
                      style={{
                        borderColor: `${c.color}33`,
                        background: c.bg,
                      }}
                      onClick={() => handleServiceClick(svc)}
                    >
                      <div className="pos-svc-name" style={{ color: c.color }}>{svc.name}</div>
                      <div className="pos-svc-price">{formatMoney(svc.price)}</div>
                      <div className="pos-svc-cat">{svc.cat}</div>
                    </button>
                  );
                })
              )}
            </div>
            {pendingConsult ? (
              <div className="pos-consult-picker">
                <div className="pos-consult-picker__head">
                  <FaIcon name="user-md" className="pos-card-title-icon" />
                  <span>{tOps('cashier_odoo.pos_assign_doctor', { defaultValue: 'Assign physician' })}</span>
                  <span className="pos-consult-picker__service">{pendingConsult.name}</span>
                </div>
                {pendingNeedsSpecialistSpec ? (
                  <label className="pos-consult-field">
                    <span className="pos-consult-field__label">{t('modals.cashierPrepay.specialisation')}</span>
                    <select
                      className="cs-input pos-consult-select"
                      value={consultSpecialistSpec}
                      onChange={(e) => setConsultSpecialistSpec(e.target.value)}
                    >
                      <option value="">{t('modals.cashierPrepay.select_specialisation')}</option>
                      {specialistSpecialisations.map((spec) => (
                        <option key={spec} value={spec}>{spec}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="pos-consult-field">
                  <span className="pos-consult-field__label">{t('modals.cashierPrepay.assigned_doctor')}</span>
                  <select
                    className="cs-input pos-consult-select"
                    value={consultDoctorId}
                    onChange={(e) => setConsultDoctorId(e.target.value)}
                    disabled={!filteredConsultDoctors.length || (pendingNeedsSpecialistSpec && !consultSpecialistSpec)}
                  >
                    {!filteredConsultDoctors.length ? (
                      <option value="">{t('modals.cashierPrepay.no_matching_doctors')}</option>
                    ) : (
                      filteredConsultDoctors.map((d) => (
                        <option key={d.id} value={d.id}>
                          {t('modals.bookAppointment.dr_prefix')} {d.first_name} {d.last_name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <div className="pos-consult-picker__actions">
                  <button type="button" className="cs-btn" onClick={cancelConsultPicker}>
                    {t('modals.cashierPrepay.change', { defaultValue: 'Cancel' })}
                  </button>
                  <button type="button" className="cs-btn cs-btn-primary" onClick={confirmConsultAdd}>
                    <FaIcon name="plus" /> {tOps('cashier_odoo.pos_add_consult', { defaultValue: 'Add to cart' })}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="cs-card">
          <div className="cs-card-head">
            <div className="cs-card-title">
              <FaIcon name="shopping-cart" className="pos-card-title-icon" />
              {tOps('cashier_odoo.pos_cart', { defaultValue: 'Cart' })}
              {cartCount > 0 ? (
                <span className="pos-cart-count">
                  ({cartCount} {cartCount === 1 ? 'item' : 'items'})
                </span>
              ) : null}
            </div>
            <button type="button" className="cs-btn cs-btn-sm cs-btn-ghost pos-cart-clear" onClick={clearCart}>
              <FaIcon name="trash" /> {tOps('cashier_odoo.pos_clear', { defaultValue: 'Clear' })}
            </button>
          </div>
          <div className="cs-card-body-0">
            <div style={{ minHeight: 80 }}>
              {!cart.length ? (
                <div className="pos-cart-empty">
                  <FaIcon name="shopping-cart" className="pos-cart-empty-icon" />
                  {tOps('cashier_odoo.pos_cart_empty', { defaultValue: 'Add services to begin' })}
                </div>
              ) : (
                cart.map((line) => (
                  <div key={line.cartLineId} className="pos-cart-line">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pos-cart-line-name">{line.name}</div>
                      {line.doctorName ? (
                        <div className="pos-cart-line-doctor">
                          {t('modals.bookAppointment.dr_prefix')} {line.doctorName}
                        </div>
                      ) : null}
                      <div className="pos-cart-line-unit">
                        {formatMoney(line.price)} × {line.qty}
                      </div>
                    </div>
                    <div className="pos-cart-qty">
                      <button type="button" className="cs-btn cs-btn-sm cs-btn-ghost pos-cart-qty-btn" onClick={() => changeQty(line.cartLineId, -1)}>−</button>
                      <span>{line.qty}</span>
                      <button type="button" className="cs-btn cs-btn-sm cs-btn-ghost pos-cart-qty-btn" onClick={() => changeQty(line.cartLineId, 1)}>+</button>
                    </div>
                    <div className="pos-cart-line-total">
                      {formatMoney(line.price * line.qty)}
                    </div>
                    <button type="button" className="cs-btn cs-btn-sm cs-btn-ghost pos-cart-remove" onClick={() => removeFromCart(line.cartLineId)}>✕</button>
                  </div>
                ))
              )}
            </div>
            {cart.length > 0 ? (
              <div className="pos-cart-summary">
                <div className="pos-cart-summary-row">
                  <span>Subtotal</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
                {discPct > 0 ? (
                  <div className="pos-cart-summary-row pos-cart-summary-row--discount">
                    <span>Discount ({discPct}%)</span>
                    <span>−{formatMoney(subtotal - total)}</span>
                  </div>
                ) : null}
                <div className="pos-cart-summary-total">
                  <span>Total</span>
                  <span>{formatMoney(total)}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="pos-col">
        <div className="cs-card pos-payment-card">
          <div className="cs-card-head">
            <div className="cs-card-title">
              <FaIcon name="credit-card" className="pos-card-title-icon" />
              {tOps('cashier_odoo.pos_payment', { defaultValue: 'Payment' })}
            </div>
          </div>
          <div className="cs-card-body">
            <div className="pos-total-box">
              <div className="pos-total-label">Total due</div>
              <div className="pos-total-amount">{formatMoney(total)}</div>
              {payMethod === 'cash' && tenderedNum > 0 ? (
                <div className={`pos-change ${change >= 0 ? 'pos-change--ok' : 'pos-change--short'}`}>
                  {change >= 0 ? `Change: ${formatMoney(change)}` : `Short: ${formatMoney(Math.abs(change))}`}
                </div>
              ) : null}
            </div>

            <div className="pos-pay-methods">
              {posPayMethods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`pay-method${payMethod === m.id ? ' selected' : ''}`}
                  onClick={() => setPayMethod(m.id)}
                >
                  <FaIcon name={m.icon} />
                  {m.label}
                </button>
              ))}
            </div>

            {payMethod === 'mobile' && mobileMethods.length > 0 ? (
              <div className="pos-pay-submethods" role="group" aria-label="Mobile payment method">
                {mobileMethods.map((method) => (
                  <button
                    key={method}
                    type="button"
                    className={`pay-submethod${mobileSubMethod === method ? ' selected' : ''}`}
                    onClick={() => setMobileSubMethod(method)}
                  >
                    {payMethodDisplayLabel(method, tIpd)}
                  </button>
                ))}
              </div>
            ) : null}

            {payMethod === 'mobile' && !mobileMethods.length ? (
              <p className="pos-pay-submethods-empty">
                {tOps('cashier_odoo.pos_no_mobile', { defaultValue: 'No mobile payment methods configured for this country.' })}
              </p>
            ) : null}

            {payMethod === 'card' ? (
              <div className="pos-card-form">
                <label className="pos-field pos-card-field">
                  <span className="pos-field-label">
                    {tOps('cashier_odoo.pos_card_number', { defaultValue: 'Card number' })}
                  </span>
                  <div className="pos-card-number-wrap">
                    <input
                      className="cs-input pos-card-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-number"
                      placeholder="0000 0000 0000 0000"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(formatCardNumberInput(e.target.value))}
                    />
                    <span className={`pos-card-brand${detectedCardBrand ? ' pos-card-brand--known' : ''}`}>
                      {detectedCardBrand
                        ? cardBrandLabel(detectedCardBrand)
                        : tOps('cashier_odoo.pos_card_brand_unknown', { defaultValue: 'Card type' })}
                    </span>
                  </div>
                </label>
                <label className="pos-field pos-card-field">
                  <span className="pos-field-label">
                    {tOps('cashier_odoo.pos_card_holder', { defaultValue: 'Name on card' })}
                  </span>
                  <input
                    className="cs-input pos-card-input"
                    type="text"
                    autoComplete="cc-name"
                    placeholder={tOps('cashier_odoo.pos_card_holder_ph', { defaultValue: 'As printed on card' })}
                    value={cardHolder}
                    onChange={(e) => setCardHolder(e.target.value)}
                  />
                </label>
                <div className="pos-card-row">
                  <label className="pos-field pos-card-field">
                    <span className="pos-field-label">
                      {tOps('cashier_odoo.pos_card_expiry', { defaultValue: 'Expiry (MM/YY)' })}
                    </span>
                    <input
                      className="cs-input pos-card-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/YY"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(formatExpiryInput(e.target.value))}
                    />
                  </label>
                  <label className="pos-field pos-card-field">
                    <span className="pos-field-label">
                      {tOps('cashier_odoo.pos_card_auth', { defaultValue: 'Auth / approval code' })}
                    </span>
                    <input
                      className="cs-input pos-card-input"
                      type="text"
                      autoComplete="off"
                      placeholder={tOps('cashier_odoo.pos_card_auth_ph', { defaultValue: 'From POS terminal' })}
                      value={cardAuthCode}
                      onChange={(e) => setCardAuthCode(e.target.value.toUpperCase().slice(0, 32))}
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {payMethod === 'cash' ? (
              <div className="pos-field">
                <label className="pos-field-label">
                  {tOps('cashier_odoo.pos_cash_tendered', {
                    defaultValue: 'Cash tendered ({{unit}})',
                    unit: priceUnitLabel() || '—',
                  })}
                </label>
                <input
                  className="cs-input pos-cash-input"
                  type="number"
                  placeholder="0"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                />
              </div>
            ) : null}

            {payMethod === 'cash' ? (
              <div className="pos-numpad pos-field">
                {NUMPAD_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`pos-key${key === '⌫' ? ' danger' : ''}`}
                    onClick={() => numpadPress(key)}
                  >
                    {key === '⌫' ? <FaIcon name="long-arrow-left" /> : key}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="pos-discount-row">
              <label>Discount (%)</label>
              <input
                className="cs-input pos-discount-input"
                type="number"
                min={0}
                max={100}
                placeholder="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
              <label className="pos-note-label">Note</label>
              <input className="cs-input pos-note-input" placeholder="optional" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <button
              type="button"
              className="cs-btn cs-btn-primary pos-charge-btn"
              onClick={processPayment}
              disabled={busy}
            >
              <FaIcon name="check" />
              {busy
                ? t('modals.cashierPrepay.issuing')
                : tOps('cashier_odoo.pos_charge', { defaultValue: 'Charge & print receipt' })}
            </button>

            <button
              type="button"
              className="cs-btn pos-save-bill-btn"
              onClick={handleSaveAsBill}
            >
              <FaIcon name="file-text-o" />
              {tOps('cashier_odoo.pos_save_bill', { defaultValue: 'Save as bill (pay later)' })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
