'use strict';

/** Live counts for top-nav bell / envelope badges. */
async function getNavHeaderExtras(pool, userId) {
  const uid = parseInt(userId, 10) || 0;
  let notifications = 0;
  let messages = 0;

  const [[pendingOrders]] = await pool
    .query(`SELECT COUNT(*) AS c FROM tbl_opd_order_item WHERE status='pending'`)
    .catch(() => [[{ c: 0 }]]);
  const [[pendingTickets]] = await pool
    .query(`SELECT COUNT(*) AS c FROM tbl_payment_ticket WHERE status='pending'`)
    .catch(() => [[{ c: 0 }]]);
  notifications = (Number(pendingOrders?.c) || 0) + (Number(pendingTickets?.c) || 0);

  if (uid > 0) {
    const [[msgs]] = await pool
      .query(
        `SELECT COUNT(*) AS c FROM tbl_ipd_message WHERE to_user_id=? AND read_at IS NULL`,
        [uid]
      )
      .catch(() => [[{ c: 0 }]]);
    messages = Number(msgs?.c) || 0;
  }

  return {
    notifications,
    messages,
    systemOnline: true,
    dbOnline: true,
  };
}

module.exports = { getNavHeaderExtras };
