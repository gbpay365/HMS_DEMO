import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormErrorBanner } from '../components/FormErrorBanner';
import { FormField } from '../components/FormField';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';
import { filterDoctorsForCashierService } from '../lib/doctorClinicalFilter';
import { resolveCashierPaymentMethods } from '../lib/cashierPaymentMethods';
import { notifyError } from '../lib/notifyBridge';

const SERVICE_TYPE_IDS = ['consultation', 'laboratory', 'radiology', 'maternity', 'surgery', 'hospitalisation'];

const PAY_METHOD_KEYS = {
  Cash: 'cash',
  MOMO: 'momo',
  OM: 'om',
  'Mobile Money': 'momo',
  'Orange Money': 'om',
  'Bank Transfer': 'bank_transfer',
  Insurance: 'insurance',
  Wallet: 'wallet',
  BetterPay: 'betterpay',
  'QR Code': 'betterpay',
  Bank: 'bank'};

const PAYMENT_GATE_METHODS = new Set(['Wallet', 'BetterPay']);

function payMethodLabel(method, t) {
  const key = PAY_METHOD_KEYS[method];
  return key ? t(`ipd:modals.pay_methods.${key}`) : method;
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

function computePatientDue(listPrice, coveragePct) {
  const price = Number(listPrice) || 0;
  const pct = Math.min(100, Math.max(0, Number(coveragePct) || 0));
  const insurer = Math.round(price * pct / 100);
  return price - insurer;
}

function getEffectiveCoveragePct(manualIns, manualPct, patientCoveragePct) {
  if (manualIns) return Math.min(100, Math.max(0, parseInt(manualPct, 10) || 0));
  return Math.min(100, Math.max(0, parseInt(patientCoveragePct, 10) || 0));
}

function makeCartLineKey(serviceType, catalogId) {
  return `${serviceType}-${catalogId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function renderQrToCanvas(host, url) {
  if (!host || !url) return;
  host.innerHTML = '';
  if (typeof window.QRCode !== 'undefined') {
    window.QRCode.toCanvas(host, url, { width: 168, margin: 1 }, () => {});
    return;
  }
  const img = document.createElement('img');
  img.alt = 'QR';
  img.width = 168;
  img.height = 168;
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=168x168&data=${encodeURIComponent(url)}`;
  host.appendChild(img);
}

export function CashierPrepayModal({
  open,
  onClose,
  onBetterPayComplete,
  betterPayRetryRef = null,
  prepayDefaults = null,
  consultCatalog = [],
  labCatalog = [],
  imagingCatalog = [],
  maternityCatalog = [],
  surgeryCatalog = [],
  svcCatalog = [],
  doctors = [],
  specialistSpecialisations = [],
  paymentMethods = []}) {
  const { t } = useTranslation(['clinical', 'ipd']);
  const [patientQ, setPatientQ] = useState('');
  const [patientResults, setPatientResults] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [patientLabel, setPatientLabel] = useState('');
  const [serviceType, setServiceType] = useState('consultation');
  const [catalogId, setCatalogId] = useState('');
  const [specialistSpec, setSpecialistSpec] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [manualIns, setManualIns] = useState(false);
  const [manualPct, setManualPct] = useState('0');
  const [patientCoveragePct, setPatientCoveragePct] = useState(0);
  const [cartLines, setCartLines] = useState([]);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [betterPay, setBetterPay] = useState(null);
  const [waitingPay, setWaitingPay] = useState(false);
  const [bpUiStatus, setBpUiStatus] = useState('idle');
  const qrHostRef = useRef(null);
  const pollRef = useRef(null);
  const timeoutRef = useRef(null);

  const serviceTypes = useMemo(
    () => SERVICE_TYPE_IDS.map((id) => ({
      id,
      label: t(`modals.cashierPrepay.service_${id === 'hospitalisation' ? 'other' : id}`)})),
    [t]
  );

  const allCatalogs = useMemo(
    () => ({
      consultation: consultCatalog,
      laboratory: labCatalog,
      radiology: imagingCatalog,
      maternity: maternityCatalog,
      surgery: surgeryCatalog,
      hospitalisation: svcCatalog,
    }),
    [consultCatalog, labCatalog, imagingCatalog, maternityCatalog, surgeryCatalog, svcCatalog]
  );

  const findCatalogItem = useCallback((type, id) => {
    const list = allCatalogs[type] || [];
    return list.find((c) => String(c.id) === String(id)) || null;
  }, [allCatalogs]);

  const coveragePct = useMemo(
    () => getEffectiveCoveragePct(manualIns, manualPct, patientCoveragePct),
    [manualIns, manualPct, patientCoveragePct]
  );

  const serviceTypeLabel = useCallback((typeId) => {
    const st = serviceTypes.find((s) => s.id === typeId);
    return st?.label || typeId;
  }, [serviceTypes]);

  const resetPaymentUi = useCallback(() => {
    setBetterPay(null);
    setWaitingPay(false);
    setBpUiStatus('idle');
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (qrHostRef.current) qrHostRef.current.innerHTML = '';
  }, []);

  const applyBetterPaySession = useCallback((bp) => {
    if (!bp?.ref) return;
    setBetterPay(bp);
    setWaitingPay(true);
    setBpUiStatus('waiting');
    setPayMethod('BetterPay');
  }, []);

  useEffect(() => {
    if (!open || !betterPayRetryRef) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cashier/prepay/betterpay/retry-info?ref=${encodeURIComponent(betterPayRetryRef)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled || !data.ok) return;
        const prepay = data.prepay || {};
        if (prepay.prepay_patient_id) {
          setPatientId(String(prepay.prepay_patient_id));
          setPatientLabel(data.patientName || '');
        }
        if (prepay.prepay_service_type) setServiceType(prepay.prepay_service_type);
        if (prepay.prepay_catalog_id) setCatalogId(String(prepay.prepay_catalog_id));
        if (prepay.prepay_specialist_spec) setSpecialistSpec(prepay.prepay_specialist_spec);
        if (prepay.prepay_assigned_doctor_id) setDoctorId(String(prepay.prepay_assigned_doctor_id));
        if (prepay.manual_insurance_check) {
          setManualIns(true);
          setManualPct(String(prepay.manual_insurance_pct || '0'));
        }
        const retryCoverage = getEffectiveCoveragePct(
          prepay.manual_insurance_check,
          prepay.manual_insurance_pct,
          0
        );
        if (Array.isArray(prepay.prepay_lines) && prepay.prepay_lines.length) {
          setCartLines(prepay.prepay_lines.map((row) => {
            const type = row.prepay_service_type || row.service_type || 'hospitalisation';
            const catId = row.prepay_catalog_id || row.catalog_id;
            const cat = findCatalogItem(type, catId);
            const listPrice = cat ? Number(cat.price || 0) : 0;
            return {
              key: makeCartLineKey(type, catId),
              prepay_service_type: type,
              prepay_catalog_id: String(catId),
              prepay_assigned_doctor_id: row.prepay_assigned_doctor_id || row.assigned_doctor_id || undefined,
              prepay_specialist_spec: row.prepay_specialist_spec || row.specialist_spec || undefined,
              name: cat?.name || t('modals.cashierPrepay.service'),
              listPrice,
              patientDue: computePatientDue(listPrice, retryCoverage),
            };
          }));
        } else if (prepay.prepay_catalog_id && prepay.prepay_service_type) {
          const cat = findCatalogItem(prepay.prepay_service_type, prepay.prepay_catalog_id);
          if (cat) {
            const listPrice = Number(cat.price || 0);
            setCartLines([{
              key: makeCartLineKey(prepay.prepay_service_type, prepay.prepay_catalog_id),
              prepay_service_type: prepay.prepay_service_type,
              prepay_catalog_id: String(prepay.prepay_catalog_id),
              prepay_assigned_doctor_id: prepay.prepay_assigned_doctor_id || undefined,
              prepay_specialist_spec: prepay.prepay_specialist_spec || undefined,
              name: cat.name,
              listPrice,
              patientDue: computePatientDue(listPrice, retryCoverage),
            }]);
          }
        }
        applyBetterPaySession({
          ref: data.ref,
          paymentUrl: data.paymentUrl,
          amount: data.amount,
          patientName: data.patientName,
          serviceName: data.serviceName});
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [open, betterPayRetryRef, applyBetterPaySession, findCatalogItem, t]);

  useEffect(() => {
    if (!open) return;
    setPatientQ('');
    setPatientResults([]);
    setPatientId('');
    setPatientLabel('');
    setPatientCoveragePct(0);
    setCartLines([]);
    setServiceType('consultation');
    setCatalogId('');
    setSpecialistSpec('');
    setDoctorId('');
    setPayMethod('Cash');
    setManualIns(false);
    setManualPct('0');
    setBusy(false);
    resetPaymentUi();
    if (prepayDefaults) {
      if (prepayDefaults.patientId) {
        setPatientId(String(prepayDefaults.patientId));
        fetch(`/api/patients/search?q=${encodeURIComponent(String(prepayDefaults.patientId))}`)
          .then((r) => r.json())
          .then((rows) => {
            const p = (Array.isArray(rows) ? rows : []).find((x) => String(x.id) === String(prepayDefaults.patientId));
            if (p) {
              setPatientLabel(`${p.first_name} ${p.last_name}${p.phone ? ` · ${p.phone}` : ''}`);
              setPatientCoveragePct(parseInt(p.coverage, 10) || 0);
            }
          })
          .catch(() => {});
      }
      if (prepayDefaults.serviceType) setServiceType(prepayDefaults.serviceType);
      if (prepayDefaults.catalogId) setCatalogId(String(prepayDefaults.catalogId));
    }
  }, [open, resetPaymentUi, prepayDefaults]);

  useEffect(() => {
    setCartLines((lines) => lines.map((line) => ({
      ...line,
      patientDue: computePatientDue(line.listPrice, coveragePct),
    })));
  }, [coveragePct]);

  useEffect(() => {
    resetPaymentUi();
  }, [payMethod, resetPaymentUi]);

  useEffect(() => {
    if (!patientQ.trim() || patientId) {
      setPatientResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(patientQ.trim())}`);
        const rows = await res.json();
        setPatientResults(Array.isArray(rows) ? rows : []);
      } catch {
        setPatientResults([]);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [patientQ, patientId]);

  const catalogForType = useMemo(() => {
    if (serviceType === 'consultation') return consultCatalog;
    if (serviceType === 'laboratory') return labCatalog;
    if (serviceType === 'radiology') return imagingCatalog;
    if (serviceType === 'maternity') return maternityCatalog;
    if (serviceType === 'surgery') return surgeryCatalog;
    return svcCatalog;
  }, [serviceType, consultCatalog, labCatalog, imagingCatalog, maternityCatalog, surgeryCatalog, svcCatalog]);

  const selectedCatalog = useMemo(
    () => catalogForType.find((c) => String(c.id) === String(catalogId)) || null,
    [catalogForType, catalogId]
  );

  const showDoctorPicker = serviceType === 'consultation' && selectedCatalog && consultNeedsDoctor(selectedCatalog.name);
  const showSpecialistSpecPicker = showDoctorPicker && isSpecialistConsultation(selectedCatalog?.name);

  const payMethods = useMemo(
    () => resolveCashierPaymentMethods(paymentMethods),
    [paymentMethods],
  );

  const filteredDoctors = useMemo(() => {
    if (!showDoctorPicker) return doctors;
    return filterDoctorsForCashierService(doctors, selectedCatalog, { specialistSpec });
  }, [doctors, selectedCatalog, showDoctorPicker, specialistSpec]);

  useEffect(() => {
    if (!open || !showDoctorPicker) {
      setDoctorId('');
      return;
    }
    if (showSpecialistSpecPicker && !specialistSpec) {
      setDoctorId('');
      return;
    }
    const stillValid = filteredDoctors.some((d) => String(d.id) === String(doctorId));
    if (!stillValid) {
      setDoctorId(filteredDoctors[0]?.id ? String(filteredDoctors[0].id) : '');
    }
  }, [open, showDoctorPicker, showSpecialistSpecPicker, specialistSpec, filteredDoctors, doctorId]);

  const selectPatient = (p) => {
    setPatientId(String(p.id));
    setPatientLabel(`${p.first_name} ${p.last_name}${p.phone ? ` · ${p.phone}` : ''}`);
    setPatientCoveragePct(parseInt(p.coverage, 10) || 0);
    setPatientQ('');
    setPatientResults([]);
  };

  const toPrepayLineRow = useCallback((line) => {
    const row = {
      prepay_service_type: line.prepay_service_type,
      prepay_catalog_id: String(line.prepay_catalog_id ?? '').trim(),
    };
    if (line.prepay_assigned_doctor_id) {
      row.prepay_assigned_doctor_id = String(line.prepay_assigned_doctor_id);
    }
    if (line.prepay_specialist_spec) {
      row.prepay_specialist_spec = line.prepay_specialist_spec;
    }
    return row;
  }, []);

  const prepayLinesPayload = useMemo(
    () => cartLines.map(toPrepayLineRow).filter((row) => row.prepay_catalog_id),
    [cartLines, toPrepayLineRow]
  );

  const validateLineDraft = useCallback(() => {
    if (!catalogId) return t('modals.cashierPrepay.err_service');
    if (showSpecialistSpecPicker && !specialistSpec) return t('modals.cashierPrepay.err_specialisation');
    if (showDoctorPicker && !doctorId) return t('modals.cashierPrepay.err_doctor');
    return '';
  }, [catalogId, showSpecialistSpecPicker, specialistSpec, showDoctorPicker, doctorId, t]);

  const buildDraftLineRow = useCallback(() => {
    if (!catalogId || !selectedCatalog) return null;
    const draftErr = validateLineDraft();
    if (draftErr) return { error: draftErr };
    return toPrepayLineRow({
      prepay_service_type: serviceType,
      prepay_catalog_id: String(catalogId),
      prepay_assigned_doctor_id: showDoctorPicker && doctorId ? doctorId : undefined,
      prepay_specialist_spec: showSpecialistSpecPicker && specialistSpec ? specialistSpec : undefined,
    });
  }, [
    catalogId, selectedCatalog, validateLineDraft, toPrepayLineRow, serviceType,
    showDoctorPicker, doctorId, showSpecialistSpecPicker, specialistSpec,
  ]);

  const buildIssueLines = useCallback((includeDraft = true) => {
    const rows = [...prepayLinesPayload];
    if (!includeDraft || !catalogId || !selectedCatalog) return rows;
    const alreadyInCart = rows.some(
      (row) => String(row.prepay_catalog_id) === String(catalogId)
        && row.prepay_service_type === serviceType
    );
    if (alreadyInCart) return rows;
    const draft = buildDraftLineRow();
    if (!draft || draft.error) return rows;
    return [...rows, draft];
  }, [prepayLinesPayload, catalogId, selectedCatalog, serviceType, buildDraftLineRow]);

  const cartGrouped = useMemo(() => {
    const groups = {};
    for (const line of cartLines) {
      const typeId = line.prepay_service_type;
      if (!groups[typeId]) {
        groups[typeId] = { typeId, label: serviceTypeLabel(typeId), lines: [], subtotal: 0 };
      }
      groups[typeId].lines.push(line);
      groups[typeId].subtotal += line.patientDue;
    }
    return Object.values(groups);
  }, [cartLines, serviceTypeLabel]);

  const grandTotal = useMemo(
    () => cartLines.reduce((sum, line) => sum + (Number(line.patientDue) || 0), 0),
    [cartLines]
  );

  const addServiceToCart = useCallback(() => {
    setFormError('');
    const validationErr = validateLineDraft();
    if (validationErr) {
      setFormError(validationErr);
      return;
    }
    if (!selectedCatalog) return;
    const listPrice = Number(selectedCatalog.price || 0);
    setCartLines((prev) => [
      ...prev,
      {
        key: makeCartLineKey(serviceType, catalogId),
        prepay_service_type: serviceType,
        prepay_catalog_id: String(catalogId),
        prepay_assigned_doctor_id: showDoctorPicker && doctorId ? doctorId : undefined,
        prepay_specialist_spec: showSpecialistSpecPicker && specialistSpec ? specialistSpec : undefined,
        name: selectedCatalog.name,
        listPrice,
        patientDue: computePatientDue(listPrice, coveragePct),
      },
    ]);
    setCatalogId('');
    setSpecialistSpec('');
    setDoctorId('');
    resetPaymentUi();
  }, [
    validateLineDraft, selectedCatalog, serviceType, catalogId, showDoctorPicker, doctorId,
    showSpecialistSpecPicker, specialistSpec, coveragePct, resetPaymentUi,
  ]);

  const removeCartLine = useCallback((key) => {
    setCartLines((prev) => prev.filter((line) => line.key !== key));
    resetPaymentUi();
  }, [resetPaymentUi]);

  const buildPrepayPayload = useCallback((linesOverride) => {
    const lines = linesOverride ?? prepayLinesPayload;
    const payload = {
      prepay_patient_id: patientId,
      prepay_payment_method: payMethod,
      prepay_lines: lines,
    };
    if (lines.length === 1) {
      payload.prepay_service_type = lines[0].prepay_service_type;
      payload.prepay_catalog_id = lines[0].prepay_catalog_id;
      if (lines[0].prepay_assigned_doctor_id) {
        payload.prepay_assigned_doctor_id = lines[0].prepay_assigned_doctor_id;
      }
      if (lines[0].prepay_specialist_spec) {
        payload.prepay_specialist_spec = lines[0].prepay_specialist_spec;
      }
    }
    if (manualIns) {
      payload.manual_insurance_check = 'on';
      payload.manual_insurance_pct = manualPct;
    }
    if (prepayDefaults?.maternityPatientId) {
      payload.prepay_maternity_patient_id = prepayDefaults.maternityPatientId;
    }
    if (prepayDefaults?.maternityEvent) {
      payload.prepay_maternity_event = prepayDefaults.maternityEvent;
    }
    if (betterPay?.ref) {
      payload.prepay_betterpay_ref = betterPay.ref;
    }
    return payload;
  }, [
    patientId, payMethod, prepayLinesPayload, manualIns, manualPct, betterPay, prepayDefaults,
  ]);

  const postPrepayJson = useCallback(async (url, linesOverride) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(buildPrepayPayload(linesOverride))});
    return res.json().catch(() => ({}));
  }, [buildPrepayPayload]);

  const issueTicket = useCallback(async (linesOverride) => {
    const lines = linesOverride ?? buildIssueLines(true);
    const data = await postPrepayJson('/api/cashier/prepay/issue', lines);
    if (!data.ok) {
      throw new Error(data.error || t('modals.cashierPrepay.payment_not_received'));
    }
    return data.ticketCode;
  }, [postPrepayJson, buildIssueLines, t]);

  const startBetterPay = useCallback(async (linesOverride) => {
    const lines = linesOverride ?? buildIssueLines(true);
    const data = await postPrepayJson('/api/cashier/prepay/betterpay/start', lines);
    if (!data.ok) {
      throw new Error(data.error || t('modals.cashierPrepay.betterpay_failed'));
    }
    return data;
  }, [postPrepayJson, t]);

  useEffect(() => {
    if (!betterPay?.paymentUrl) return;
    const scriptId = 'hms-qrcode-vendor';
    const draw = () => {
      if (qrHostRef.current) renderQrToCanvas(qrHostRef.current, betterPay.paymentUrl);
    };
    if (typeof window.QRCode !== 'undefined') {
      draw();
      return undefined;
    }
    let el = document.getElementById(scriptId);
    if (!el) {
      el = document.createElement('script');
      el.id = scriptId;
      el.src = '/vendor/qrcode/qrcode.min.js';
      el.async = true;
      el.onload = draw;
      el.onerror = draw;
      document.head.appendChild(el);
    } else {
      draw();
    }
    return undefined;
  }, [betterPay]);

  const handleBetterPayTimeout = useCallback(async () => {
    if (!betterPay?.ref) return;
    try {
      await fetch('/api/cashier/prepay/betterpay/timeout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: betterPay.ref })});
    } catch {
      /* still show timeout in UI */
    }
    setWaitingPay(false);
    setBpUiStatus('timeout');
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    onBetterPayComplete?.();
  }, [betterPay, onBetterPayComplete]);

  useEffect(() => {
    if (!waitingPay || !betterPay?.ref || bpUiStatus !== 'waiting') return undefined;

    const timeoutMs = (betterPay.timeoutSec || 90) * 1000;
    timeoutRef.current = setTimeout(() => {
      handleBetterPayTimeout();
    }, timeoutMs);

    const check = async () => {
      try {
        const res = await fetch(`/api/cashier/prepay/betterpay/status?ref=${encodeURIComponent(betterPay.ref)}`);
        const data = await res.json().catch(() => ({}));
        if (data.status === 'timeout' || data.expired) {
          handleBetterPayTimeout();
          return;
        }
        if (data.paid) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
          setWaitingPay(false);
          setBpUiStatus('received');
          setBusy(true);
          try {
            const code = await issueTicket();
            window.location.href = `/cashier/print-slip/${encodeURIComponent(code)}`;
          } catch (e) {
            notifyError(e.message || t('modals.cashierPrepay.payment_not_received'));
            setBpUiStatus('waiting');
          } finally {
            setBusy(false);
          }
        }
      } catch {
        /* retry on next poll */
      }
    };

    check();
    pollRef.current = setInterval(check, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    };
  }, [waitingPay, betterPay, bpUiStatus, issueTicket, t, handleBetterPayTimeout]);

  const formIssueLines = useMemo(() => buildIssueLines(true), [buildIssueLines]);

  const issueDisabled = busy || waitingPay;

  const validatePrepay = useCallback((linesOverride) => {
    if (!patientId) return t('modals.cashierPrepay.err_patient');
    const lines = linesOverride ?? buildIssueLines(true);
    if (!lines.length) {
      if (catalogId && selectedCatalog) {
        const draftErr = validateLineDraft();
        if (draftErr) return draftErr;
      }
      return t('modals.cashierPrepay.err_no_lines');
    }
    return '';
  }, [patientId, buildIssueLines, catalogId, selectedCatalog, validateLineDraft, t]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    const issueLines = buildIssueLines(true);
    const validationErr = validatePrepay(issueLines);
    if (validationErr) {
      setFormError(validationErr);
      return;
    }
    if (busy || waitingPay) return;

    if (!PAYMENT_GATE_METHODS.has(payMethod)) {
      setBusy(true);
      try {
        const code = await issueTicket(issueLines);
        window.location.href = `/cashier/print-slip/${encodeURIComponent(code)}`;
      } catch (err) {
        const msg = err.message || t('modals.cashierPrepay.payment_not_received');
        notifyError(msg);
        setFormError(msg);
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      if (payMethod === 'BetterPay') {
        if (!betterPay) {
          const bp = await startBetterPay(issueLines);
          applyBetterPaySession(bp);
          return;
        }
        return;
      }

      if (payMethod === 'Wallet') {
        const code = await issueTicket(issueLines);
        window.location.href = `/cashier/print-slip/${encodeURIComponent(code)}`;
      }
    } catch (err) {
      notifyError(err.message || t('modals.cashierPrepay.payment_not_received'));
    } finally {
      setBusy(false);
    }
  };

  const issueBtnLabel = useMemo(() => {
    if (busy) return t('modals.cashierPrepay.issuing');
    if (payMethod === 'BetterPay' && bpUiStatus === 'received') return t('modals.cashierPrepay.payment_received');
    if (payMethod === 'BetterPay' && bpUiStatus === 'timeout') return t('modals.cashierPrepay.payment_timeout');
    if (payMethod === 'BetterPay' && waitingPay) return t('modals.cashierPrepay.waiting_payment');
    if (payMethod === 'BetterPay' && !betterPay) return t('modals.cashierPrepay.pay_with_betterpay');
    return t('modals.cashierPrepay.issue_ticket');
  }, [busy, payMethod, waitingPay, betterPay, bpUiStatus, t]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modals.cashierPrepay.title')}
      subtitle={t('modals.cashierPrepay.subtitle')}
      size="xl"
      footer={
        <>
          <ModalCancelButton onClick={onClose} disabled={busy} />
          <ModalSubmitButton form="hms-cashier-prepay-form" label={issueBtnLabel} disabled={issueDisabled} />
        </>
      }
    >
      <form id="hms-cashier-prepay-form" method="post" action="/cashier/issue-prepay" className="space-y-4" onSubmit={handleSubmit}>
        <FormErrorBanner message={formError} />
        <input type="hidden" name="prepay_patient_id" value={patientId} />
        <input type="hidden" name="prepay_lines" value={JSON.stringify(formIssueLines)} readOnly />
        {formIssueLines.map((line, idx) => (
          <span key={`prepay-line-${idx}-${line.prepay_catalog_id}`} aria-hidden="true">
            <input type="hidden" name={`prepay_lines[${idx}][prepay_service_type]`} value={line.prepay_service_type} readOnly />
            <input type="hidden" name={`prepay_lines[${idx}][prepay_catalog_id]`} value={line.prepay_catalog_id} readOnly />
            {line.prepay_assigned_doctor_id ? (
              <input type="hidden" name={`prepay_lines[${idx}][prepay_assigned_doctor_id]`} value={line.prepay_assigned_doctor_id} readOnly />
            ) : null}
            {line.prepay_specialist_spec ? (
              <input type="hidden" name={`prepay_lines[${idx}][prepay_specialist_spec]`} value={line.prepay_specialist_spec} readOnly />
            ) : null}
          </span>
        ))}
        {formIssueLines.length === 1 ? (
          <>
            <input type="hidden" name="prepay_service_type" value={formIssueLines[0].prepay_service_type} readOnly />
            <input type="hidden" name="prepay_catalog_id" value={formIssueLines[0].prepay_catalog_id} readOnly />
          </>
        ) : null}
        {prepayDefaults?.maternityPatientId ? (
          <input type="hidden" name="prepay_maternity_patient_id" value={prepayDefaults.maternityPatientId} />
        ) : null}
        {prepayDefaults?.maternityEvent ? (
          <input type="hidden" name="prepay_maternity_event" value={prepayDefaults.maternityEvent} />
        ) : null}
        {betterPay?.ref ? <input type="hidden" name="prepay_betterpay_ref" value={betterPay.ref} /> : null}

        <FormField label={t('shared.patient')} htmlFor="cpp-patient-q" required className="relative">
          {patientId ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              <span className="text-sm font-semibold text-emerald-900">{patientLabel}</span>
              <button
                type="button"
                className="text-xs font-bold text-emerald-700"
                onClick={() => { setPatientId(''); setPatientLabel(''); resetPaymentUi(); setFormError(''); }}
              >
                {t('modals.cashierPrepay.change')}
              </button>
            </div>
          ) : (
            <>
              <input
                id="cpp-patient-q"
                value={patientQ}
                onChange={(e) => { setPatientQ(e.target.value); setFormError(''); }}
                className="hms-input"
                placeholder={t('modals.cashierPrepay.search_ph')}
                autoComplete="off"
              />
              {patientResults.length > 0 ? (
                <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-sky-300 bg-white shadow-lg">
                  {patientResults.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-sky-50"
                        onClick={() => selectPatient(p)}
                      >
                        <span className="font-semibold">
                          {p.first_name} {p.last_name}
                        </span>
                        {p.phone ? <span className="ml-2 text-slate-500">{p.phone}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </FormField>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" name="manual_insurance_check" checked={manualIns} onChange={(e) => setManualIns(e.target.checked)} className="mt-1" />
            <span className="text-sm">
              <span className="font-bold">{t('modals.cashierPrepay.manual_ins_title')}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{t('modals.cashierPrepay.manual_ins_hint')}</span>
            </span>
          </label>
          {manualIns ? (
            <div className="mt-2 flex max-w-[200px] items-center gap-1">
              <input type="number" name="manual_insurance_pct" min={0} max={100} value={manualPct} onChange={(e) => setManualPct(e.target.value)} className="hms-input text-center font-bold" />
              <span className="text-sm font-bold text-slate-500">%</span>
            </div>
          ) : null}
        </div>

        <div>
          <span className="hms-label">{t('modals.cashierPrepay.service_category')}</span>
          <div className="flex flex-wrap gap-1.5">
            {serviceTypes.map((st) => (
              <button
                key={st.id}
                type="button"
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  serviceType === st.id ? 'bg-brand text-white' : 'border border-slate-200 bg-white text-slate-600'
                }`}
                onClick={() => {
                  setServiceType(st.id);
                  setCatalogId('');
                  setSpecialistSpec('');
                  setDoctorId('');
                  resetPaymentUi();
                }}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('modals.cashierPrepay.service')} htmlFor="cpp-service">
            <select
              id="cpp-service"
              value={catalogId}
              onChange={(e) => {
                setCatalogId(e.target.value);
                setSpecialistSpec('');
                setDoctorId('');
                resetPaymentUi();
                setFormError('');
              }}
              className="hms-input"
            >
              <option value="">{t('modals.cashierPrepay.select_service')}</option>
              {catalogForType.map((c) => (
                <option key={c.id} value={c.id}>
                  {t('modals.cashierPrepay.price_fcfa', {
                    name: c.name,
                    price: Number(c.price || 0).toLocaleString()})}
                </option>
              ))}
            </select>
          </FormField>
          {showSpecialistSpecPicker ? (
            <FormField label={t('modals.cashierPrepay.specialisation')} htmlFor="cpp-spec">
              <select
                id="cpp-spec"
                value={specialistSpec}
                onChange={(e) => { setSpecialistSpec(e.target.value); setFormError(''); }}
                className="hms-input"
              >
                <option value="">{t('modals.cashierPrepay.select_specialisation')}</option>
                {specialistSpecialisations.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}
          {showDoctorPicker ? (
            <FormField
              label={t('modals.cashierPrepay.assigned_doctor')}
              htmlFor="cpp-doctor"
              hint={
                !filteredDoctors.length
                  ? t('modals.cashierPrepay.no_doctors_hint', {
                      spec: specialistSpec ? t('modals.cashierPrepay.no_doctors_hint_spec', { spec: specialistSpec }) : ''})
                  : ''
              }
            >
              <select
                id="cpp-doctor"
                value={doctorId}
                onChange={(e) => { setDoctorId(e.target.value); setFormError(''); }}
                className="hms-input"
                disabled={!filteredDoctors.length || (showSpecialistSpecPicker && !specialistSpec)}
              >
                {!filteredDoctors.length ? (
                  <option value="">{t('modals.cashierPrepay.no_matching_doctors')}</option>
                ) : (
                  filteredDoctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {t('modals.bookAppointment.dr_prefix')} {d.first_name} {d.last_name}
                    </option>
                  ))
                )}
              </select>
            </FormField>
          ) : null}
          <div className="flex items-end sm:col-span-2">
            <button
              type="button"
              className="rounded-lg border border-brand bg-white px-4 py-2 text-sm font-bold text-brand hover:bg-emerald-50"
              onClick={addServiceToCart}
            >
              {t('modals.cashierPrepay.add_service')}
            </button>
          </div>
          <FormField label={t('modals.cashierPrepay.payment_method')} htmlFor="cpp-pay-method">
            <select
              id="cpp-pay-method"
              name="prepay_payment_method"
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              className="hms-input"
              disabled={waitingPay}
            >
              {payMethods.map((m) => (
                <option key={m} value={m}>
                  {payMethodLabel(m, t)}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        {cartLines.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              {t('modals.cashierPrepay.cart')}
            </div>
            <div className="space-y-3">
              {cartGrouped.map((group) => (
                <div key={group.typeId} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                  <div className="mb-1.5 text-xs font-bold text-slate-700">{group.label}</div>
                  <ul className="space-y-1">
                    {group.lines.map((line) => (
                      <li key={line.key} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-slate-800">{line.name}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-700">
                          {Number(line.patientDue || 0).toLocaleString('fr-FR')} FCFA
                        </span>
                        <button
                          type="button"
                          className="shrink-0 text-xs font-bold text-red-600 hover:text-red-800"
                          onClick={() => removeCartLine(line.key)}
                        >
                          {t('modals.cashierPrepay.remove')}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-xs font-bold text-slate-600">
                    <span>{t('modals.cashierPrepay.subtotal')}</span>
                    <span className="tabular-nums">{Number(group.subtotal || 0).toLocaleString('fr-FR')} FCFA</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2.5">
              <span className="text-sm font-bold text-emerald-900">{t('modals.cashierPrepay.grand_total')}</span>
              <span className="text-lg font-bold tabular-nums text-emerald-900">
                {Number(grandTotal || 0).toLocaleString('fr-FR')} FCFA
              </span>
            </div>
            {coveragePct > 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                {t('modals.cashierPrepay.insurance_applied', { pct: coveragePct })}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-slate-500">{t('modals.cashierPrepay.cart_empty_hint')}</p>
        )}

        {payMethod === 'BetterPay' && betterPay ? (
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
            <p className="text-sm font-bold text-cyan-900">{t('modals.cashierPrepay.betterpay_scan_title')}</p>
            <p className="mt-1 text-xs text-cyan-800">{t('modals.cashierPrepay.betterpay_scan_hint')}</p>
            <div className="mt-3 flex flex-wrap items-start gap-4">
              <div ref={qrHostRef} className="rounded-lg bg-white p-2 shadow-sm" />
              <div className="min-w-[180px] flex-1 text-sm">
                <div className="font-bold text-slate-800">
                  {Number(betterPay.amount || 0).toLocaleString('fr-FR')} FCFA
                </div>
                <code className="mt-1 block break-all text-xs text-cyan-900">{betterPay.ref}</code>
                <a
                  href={betterPay.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-bold text-cyan-700 underline"
                >
                  {t('modals.cashierPrepay.open_betterpay')}
                </a>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-cyan-400 bg-white px-3 py-1.5 text-xs font-bold text-cyan-900 hover:bg-cyan-100"
                    onClick={() => window.open(`/cashier/betterpay/print-qr/${encodeURIComponent(betterPay.ref)}`, '_blank', 'noopener')}
                  >
                    {t('modals.cashierPrepay.print_qr')}
                  </button>
                </div>
                {bpUiStatus === 'received' ? (
                  <p className="mt-2 text-xs font-semibold text-emerald-800">{t('modals.cashierPrepay.payment_received')}</p>
                ) : null}
                {bpUiStatus === 'timeout' ? (
                  <p className="mt-2 text-xs font-semibold text-red-800">{t('modals.cashierPrepay.payment_timeout')}</p>
                ) : null}
                {waitingPay && bpUiStatus === 'waiting' ? (
                  <p className="mt-2 text-xs font-semibold text-amber-800">{t('modals.cashierPrepay.waiting_payment')}</p>
                ) : null}
                {betterPay.serviceName ? (
                  <p className="mt-2 text-xs text-slate-600">{betterPay.serviceName}</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {payMethod === 'Wallet' ? (
          <p className="text-xs text-slate-600">{t('modals.cashierPrepay.wallet_deduct_hint')}</p>
        ) : null}
      </form>
    </Modal>
  );
}
