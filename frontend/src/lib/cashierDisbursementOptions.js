/** Cash disbursement dropdown options — keep in sync with lib/cashierDisbursementOptions.js */

import { isNigeriaInstall } from './paymentMethodAccounts';

export const DISBURSEMENT_TYPES = [
  { value: 'expense', labelKey: 'cashier.disbursement.type_expense' },
  { value: 'payout', labelKey: 'cashier.disbursement.type_payout' },
  { value: 'vendor', labelKey: 'cashier.disbursement.type_vendor' },
  { value: 'salary_advance', labelKey: 'cashier.disbursement.type_salary_advance' },
  { value: 'emergency', labelKey: 'cashier.disbursement.type_emergency' },
  { value: 'petty_cash', labelKey: 'cashier.disbursement.type_petty_cash' },
  { value: 'equipment', labelKey: 'cashier.disbursement.type_equipment' },
  { value: 'pharmacy', labelKey: 'cashier.disbursement.type_pharmacy' },
  { value: 'fuel', labelKey: 'cashier.disbursement.type_fuel' },
  { value: 'maintenance', labelKey: 'cashier.disbursement.type_maintenance' },
  { value: 'professional', labelKey: 'cashier.disbursement.type_professional' },
  { value: 'tax_duty', labelKey: 'cashier.disbursement.type_tax_duty' },
  { value: 'bank_charges', labelKey: 'cashier.disbursement.type_bank_charges' },
  { value: 'insurance', labelKey: 'cashier.disbursement.type_insurance' },
  { value: 'cleaning', labelKey: 'cashier.disbursement.type_cleaning' },
  { value: 'security', labelKey: 'cashier.disbursement.type_security' },
  { value: 'catering', labelKey: 'cashier.disbursement.type_catering' },
  { value: 'laundry', labelKey: 'cashier.disbursement.type_laundry' },
  { value: 'communication', labelKey: 'cashier.disbursement.type_communication' },
  { value: 'rent', labelKey: 'cashier.disbursement.type_rent' },
];

export const DISBURSEMENT_CATEGORIES = [
  { value: 'utilities', labelKey: 'cashier.disbursement.cat_utilities' },
  { value: 'supplies', labelKey: 'cashier.disbursement.cat_supplies' },
  { value: 'pharmacy', labelKey: 'cashier.disbursement.cat_pharmacy' },
  { value: 'medical', labelKey: 'cashier.disbursement.cat_medical' },
  { value: 'equipment', labelKey: 'cashier.disbursement.cat_equipment' },
  { value: 'rent', labelKey: 'cashier.disbursement.cat_rent' },
  { value: 'transport', labelKey: 'cashier.disbursement.cat_transport' },
  { value: 'communications', labelKey: 'cashier.disbursement.cat_communications' },
  { value: 'maintenance', labelKey: 'cashier.disbursement.cat_maintenance' },
  { value: 'salary', labelKey: 'cashier.disbursement.cat_salary' },
  { value: 'external', labelKey: 'cashier.disbursement.cat_external' },
  { value: 'professional_fees', labelKey: 'cashier.disbursement.cat_professional_fees' },
  { value: 'insurance', labelKey: 'cashier.disbursement.cat_insurance' },
  { value: 'tax_duty', labelKey: 'cashier.disbursement.cat_tax_duty' },
  { value: 'bank', labelKey: 'cashier.disbursement.cat_bank' },
  { value: 'cleaning', labelKey: 'cashier.disbursement.cat_cleaning' },
  { value: 'security', labelKey: 'cashier.disbursement.cat_security' },
  { value: 'catering', labelKey: 'cashier.disbursement.cat_catering' },
  { value: 'laundry', labelKey: 'cashier.disbursement.cat_laundry' },
  { value: 'fuel', labelKey: 'cashier.disbursement.cat_fuel' },
  { value: 'general', labelKey: 'cashier.disbursement.cat_general' },
];

/** Petty-cash disbursements — country-aware payment methods. */
export const DISBURSEMENT_PAYMENT_METHODS_CM = ['Cash', 'MOMO', 'OM'];
export const DISBURSEMENT_PAYMENT_METHODS_NG = ['Cash', 'Bank', 'CARD', 'Paystack', 'MOMO', 'Wallet'];

export function resolveDisbursementPaymentMethods() {
  return isNigeriaInstall() ? [...DISBURSEMENT_PAYMENT_METHODS_NG] : [...DISBURSEMENT_PAYMENT_METHODS_CM];
}

/** @deprecated Use resolveDisbursementPaymentMethods() */
export const DISBURSEMENT_PAYMENT_METHODS = DISBURSEMENT_PAYMENT_METHODS_CM;
