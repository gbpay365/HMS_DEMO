import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '../FormField';
import { Modal } from '../Modal';
import { ModalCancelButton, ModalSubmitButton } from '../ModalActions';
import { confirmModal } from '../../lib/modalBridge';

function monthOptions(months) {
  const names = months && typeof months === 'object' ? months : {};
  return Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    return { value: n, label: names[n] || String(n) };
  });
}

function yearOptions(currentYear) {
  const cy = Number(currentYear) || new Date().getFullYear();
  return [cy - 1, cy, cy + 1];
}

function ProcessMonthModal({ open, onClose, months, currentYear }) {
  const { t } = useTranslation('payroll');
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(Number(currentYear) || now.getFullYear());
  const monthOpts = useMemo(() => monthOptions(months), [months]);
  const years = useMemo(() => yearOptions(currentYear), [currentYear]);

  useEffect(() => {
    if (open) {
      setMonth(now.getMonth() + 1);
      setYear(Number(currentYear) || now.getFullYear());
    }
  }, [open, currentYear]);

  const submit = async (ev) => {
    ev.preventDefault();
    const ok = await confirmModal({
      title: t('modals.process_title'),
      message: t('modals.process_confirm'),
      confirmLabel: t('modals.calculate_save')});
    if (!ok) return;
    ev.target.submit();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modals.process_title')}
      size="md"
      footer={
        <>
          <ModalCancelButton onClick={onClose} label={t('common.cancel')} />
          <ModalSubmitButton form="pay-process-month-form" label={t('modals.calculate_save')} icon="calculator" />
        </>
      }
    >
      <form id="pay-process-month-form" method="POST" action="/payroll/process-month" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <FormField label={t('common.month')} htmlFor="pay-process-month">
          <select id="pay-process-month" name="month" className="hms-input w-full" required value={month} onChange={(ev) => setMonth(Number(ev.target.value))}>
            {monthOpts.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t('common.year')} htmlFor="pay-process-year">
          <select id="pay-process-year" name="year" className="hms-input w-full" required value={year} onChange={(ev) => setYear(Number(ev.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </FormField>
      </form>
    </Modal>
  );
}

function MarkMonthPaidModal({ open, onClose, months, currentYear }) {
  const { t } = useTranslation('payroll');
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(Number(currentYear) || now.getFullYear());
  const monthOpts = useMemo(() => monthOptions(months), [months]);
  const years = useMemo(() => yearOptions(currentYear), [currentYear]);

  useEffect(() => {
    if (open) {
      setMonth(now.getMonth() + 1);
      setYear(Number(currentYear) || now.getFullYear());
    }
  }, [open, currentYear]);

  const submit = async (ev) => {
    ev.preventDefault();
    const ok = await confirmModal({
      title: t('modals.mark_title'),
      message: t('modals.mark_confirm'),
      confirmLabel: t('modals.mark_all_pending'),
      tone: 'primary'});
    if (!ok) return;
    ev.target.submit();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modals.mark_title')}
      size="md"
      footer={
        <>
          <ModalCancelButton onClick={onClose} label={t('common.cancel')} />
          <ModalSubmitButton
            form="pay-mark-month-form"
            label={t('modals.mark_all_pending')}
            icon="check"
            variant="primary"
          />
        </>
      }
    >
      <form id="pay-mark-month-form" method="POST" action="/payroll/mark-month-paid" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <FormField label={t('common.month')} htmlFor="pay-mark-month">
          <select
            id="pay-mark-month"
            name="mark_month"
            className="hms-input w-full"
            required
            value={month}
            onChange={(ev) => setMonth(Number(ev.target.value))}
          >
            {monthOpts.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t('common.year')} htmlFor="pay-mark-year">
          <select
            id="pay-mark-year"
            name="mark_year"
            className="hms-input w-full"
            required
            value={year}
            onChange={(ev) => setYear(Number(ev.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </FormField>
      </form>
    </Modal>
  );
}

export function PayrollModalsHost({ months = {}, currentYear }) {
  const [processOpen, setProcessOpen] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);

  useEffect(() => {
    const onClick = (ev) => {
      const btn = ev.target.closest('[data-hms-payroll-modal]');
      if (!btn) return;
      ev.preventDefault();
      const mode = btn.getAttribute('data-hms-payroll-modal');
      if (mode === 'process') setProcessOpen(true);
      if (mode === 'mark-paid') setMarkOpen(true);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return (
    <>
      <ProcessMonthModal open={processOpen} onClose={() => setProcessOpen(false)} months={months} currentYear={currentYear} />
      <MarkMonthPaidModal open={markOpen} onClose={() => setMarkOpen(false)} months={months} currentYear={currentYear} />
    </>
  );
}
