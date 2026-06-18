import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

function portalTarget() {
  return document.getElementById('hms-modal-root') || document.body;
}

const MENU_WIDTH = 240;
const VIEWPORT_MARGIN = 8;
const GAP = 6;

export function ActionMenu({ items }) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const skipCloseRef = useRef(false);
  const [pos, setPos] = useState({ top: 0, left: 0, maxHeight: 320 });

  const list = items || [];

  const reposition = useCallback(() => {
    const btn = btnRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return;

    const btnRect = btn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const maxHeight = Math.max(160, window.innerHeight - VIEWPORT_MARGIN * 2);

    let left = btnRect.right - MENU_WIDTH;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
    if (left + MENU_WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
      left = window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN;
    }

    const spaceBelow = window.innerHeight - btnRect.bottom - GAP - VIEWPORT_MARGIN;
    const spaceAbove = btnRect.top - GAP - VIEWPORT_MARGIN;
    const menuHeight = Math.min(menuRect.height || list.length * 40 + 8, maxHeight);

    let top;
    if (spaceBelow >= Math.min(menuHeight, 120) || spaceBelow >= spaceAbove) {
      top = btnRect.bottom + GAP;
    } else {
      top = btnRect.top - menuHeight - GAP;
    }

    if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;
    if (top + menuHeight > window.innerHeight - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, window.innerHeight - menuHeight - VIEWPORT_MARGIN);
    }

    setPos({ top, left, maxHeight });
    setReady(true);
  }, [list.length]);

  useLayoutEffect(() => {
    if (!open) {
      setReady(false);
      return undefined;
    }
    reposition();
    return undefined;
  }, [open, list.length, reposition]);

  useEffect(() => {
    if (!open) return undefined;
    const onScroll = () => reposition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (skipCloseRef.current) {
        skipCloseRef.current = false;
        return;
      }
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', onDoc, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDoc, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (e) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({
        top: r.bottom + GAP,
        left: Math.max(VIEWPORT_MARGIN, r.right - MENU_WIDTH),
        maxHeight: Math.max(160, window.innerHeight - VIEWPORT_MARGIN * 2)});
      setReady(false);
    }
    skipCloseRef.current = true;
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-brand/30 hover:text-brand"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('aria.actions')}
      >
        ⋮
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-[2600] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg animate-fade-in"
              style={{
                top: pos.top,
                left: pos.left,
                width: MENU_WIDTH,
                maxHeight: pos.maxHeight,
                visibility: ready ? 'visible' : 'hidden'}}
            >
              {list.map((item) => {
                const isDanger = item.danger;
                const cls = isDanger
                  ? 'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50'
                  : 'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-brand-light hover:text-brand-dark';
                if (item.onClick) {
                  return (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      className={cls}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(false);
                        item.onClick(e);
                      }}
                    >
                      {item.icon}
                      <span className="min-w-0 flex-1 leading-snug">{item.label}</span>
                    </button>
                  );
                }
                return (
                  <a
                    key={item.label}
                    href={item.href || '#'}
                    role="menuitem"
                    className={cls}
                    onClick={() => setOpen(false)}
                  >
                    {item.icon}
                    <span className="min-w-0 flex-1 leading-snug">{item.label}</span>
                  </a>
                );
              })}
            </div>,
            portalTarget()
          )
        : null}
    </>
  );
}
