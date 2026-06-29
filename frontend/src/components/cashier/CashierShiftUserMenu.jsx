import { useEffect, useRef, useState } from 'react';
import { FaIcon } from '../FaIcon';

export function CashierShiftUserMenu({ cashierName, tOps, onEditProfile, onChangePassword }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(ev) {
      if (wrapRef.current && !wrapRef.current.contains(ev.target)) {
        setOpen(false);
      }
    }
    function onEsc(ev) {
      if (ev.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  if (!cashierName) return null;

  return (
    <span className="shift-bar__user-wrap" ref={wrapRef}>
      <button
        type="button"
        className="shift-bar__user-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        {tOps('cashier_odoo.cashier_label', { defaultValue: 'Cashier' })}: <strong>{cashierName}</strong>
        <FaIcon name="caret-down" className="shift-bar__user-caret" aria-hidden="true" />
      </button>
      {open ? (
        <div className="shift-bar__menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="shift-bar__menu-item"
            onClick={() => {
              setOpen(false);
              onEditProfile();
            }}
          >
            <FaIcon name="user" /> {tOps('cashier_odoo.edit_profile', { defaultValue: 'Edit profile' })}
          </button>
          <button
            type="button"
            role="menuitem"
            className="shift-bar__menu-item"
            onClick={() => {
              setOpen(false);
              onChangePassword();
            }}
          >
            <FaIcon name="lock" /> {tOps('cashier_odoo.change_password', { defaultValue: 'Change password' })}
          </button>
        </div>
      ) : null}
    </span>
  );
}
