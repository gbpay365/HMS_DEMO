'use strict';

/** URL map for procurement hub links when rendered inside the pharmacy shell. */
const PHARMACY_PROC_LINKS = {
  hub: '/pharmacy/procurement',
  vendors: '/pharmacy/procurement/vendors',
  rfq: '/pharmacy/procurement/rfq',
  purchaseOrders: '/pharmacy/purchase-orders',
  purchaseOrdersNew: '/pharmacy/purchase-orders/new',
  purchaseOrderDetail: '/pharmacy/purchase-orders/',
  purchaseRequests: '/pharmacy/procurement/purchase-requests',
  goodsReceipt: '/pharmacy/purchase-orders',
  products: '/pharmacy?view=products',
};

function pharmacyProcHubLocals(extra = {}) {
  return {
    pharmacyOdooApp: true,
    phaOdooMenu: 'purchase',
    phaOdooSub: extra.phaOdooSub || 'procurement',
    phaOdooTitle: extra.phaOdooTitle || 'Procurement Hub',
    procLinks: PHARMACY_PROC_LINKS,
    procHubUrl: PHARMACY_PROC_LINKS.hub,
    procRfqBase: PHARMACY_PROC_LINKS.rfq,
    procPrBase: PHARMACY_PROC_LINKS.purchaseRequests,
    ...extra,
  };
}

module.exports = {
  PHARMACY_PROC_LINKS,
  pharmacyProcHubLocals,
};
