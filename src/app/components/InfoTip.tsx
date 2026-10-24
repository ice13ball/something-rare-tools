// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SITE } from '../../../config/site';
import type { UiKey } from '../../core/i18n/ui';
import type { Lang } from '../../core/types';
import { t, useLang } from '../i18n';
import { TIPS, fillValues, type TipId, type TipValues } from '../tips';

/** How long the pointer must rest on the icon before a hover opens it (a click, a tap or the keyboard open it at once). */
export const HOVER_DELAY_MS = 300;

/** How long the pointer may be off both the icon and the bubble (crossing the gap between them) before a hover-opened tip closes. */
export const HOVER_LEAVE_MS = 200;

/** The one tip that is open: opening another closes it. */
let openTip: (() => void) | null = null;

const EDGE = 8; // px kept free between the bubble and the edge of the viewport
const GAP = 6; // px between the icon and the bubble

/** The rule details live in docs/rules.md of the public repository, one row (and anchor) per rule id. */
export const ruleDocUrl = (ruleId: string): string => `${SITE.sourceUrl}/blob/main/docs/rules.md#${ruleId}`;

/** Splits a tip text into bullet lines ("• …") and plain lines. */
function Lines({ text, values, lang, pending }: { text: string; values: TipValues; lang: Lang; pending: boolean }): React.ReactElement {
  const rows = text.split('\n').filter((l) => l.trim() !== '');
  const bullets = rows.filter((l) => l.startsWith('• '));
  const plain = rows.filter((l) => !l.startsWith('• '));
  return (
    <>
      {plain.map((l, i) => (
        <span key={'p' + i} className="infotip-line">
          {fillValues(l, values, lang, pending)}
        </span>
      ))}
      {bullets.length > 0 && (
        <span className="infotip-list" role="list">
          {bullets.map((l, i) => (
            <span key={'b' + i} className="infotip-item" role="listitem">
              {fillValues(l.slice(2), values, lang, pending)}
            </span>
          ))}
        </span>
      )}
    </>
  );
}

interface Placement {
  left: number;
  top: number;
  maxWidth: number;
  maxHeight?: number;
  side: 'below' | 'above';
}

/**
 * The ⓘ explanation next to a decision or a result (a "toggletip"). One component for every page: what a tip says lives in
 * `tip.<id>.does` ("what it does") and `tip.<id>.logic` ("the logic") of src/core/i18n/ui.ts, and every number, unit and source in it
 * is filled in from the rule definitions and constants by src/app/tips.tsx, never typed into the text.
 *
 * Behaviour: opens on hover (after HOVER_DELAY_MS; the mouse only), on click or tap, and on keyboard focus; closes on Esc (focus returns to
 * the icon), on a press elsewhere and when focus leaves both the icon and the bubble. Hover alone is never the only way in. The icon is a
 * real button (type="button": it submits nothing, and it is never placed inside a <label>, so it toggles no checkbox).
 *
 * The bubble is drawn in a portal on <body> with position: fixed, placed from the icon's rectangle (shifted sideways inside the viewport,
 * above the icon when there is no room below, never on the icon) and re-placed on scroll and resize. So no scroll container, overflow or
 * stacking context of the page can clip or cover it. A portal breaks the DOM order, which is repaired by hand: Tab from the icon goes to the
 * first link of the bubble, Tab from its last link goes on to what follows the icon, Shift+Tab from its first link goes back to the icon.
 * There is no focus trap.
 *
 * Screen readers: the text is copied into an aria-live="polite" region next to the icon when the bubble opens (empty before), which is what
 * makes it read; the visible bubble itself is not a live region. aria-controls points at the bubble while it is open.
 */
export function InfoTip({ id }: { id: TipId }): React.ReactElement {
  const { lang } = useLang();
  const def = TIPS[id];
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Placement | null>(null);
  const [lazy, setLazy] = useState<TipValues | null>(null);
  const [announce, setAnnounce] = useState('');
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const pinned = useRef(false); // opened by click, tap or keyboard: stays open when the pointer leaves
  const returning = useRef(false); // Esc or Tab puts the focus back on the icon: that focus must not open the tip again
  const byPointer = useRef(false); // the focus on the button comes from a pointer press, whose click will decide
  const openedByFocus = useRef(false); // opened by keyboard focus and not yet confirmed by a keyboard click: that first click keeps it open
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bubbleId = useId();

  const clearTimer = (): void => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
  };
  const close = useCallback((): void => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
    if (leaveTimer.current !== undefined) clearTimeout(leaveTimer.current);
    leaveTimer.current = undefined;
    pinned.current = false;
    openedByFocus.current = false;
    setOpen(false);
    setPlace(null);
  }, []);
  useEffect(
    () => () => {
      clearTimer();
      if (leaveTimer.current !== undefined) clearTimeout(leaveTimer.current);
    },
    [],
  );

  // only one tip is open at a time: opening this one (by click, focus or hover) closes the one that was open
  useEffect(() => {
    if (!open) return;
    if (openTip && openTip !== close) openTip();
    openTip = close;
    return () => {
      if (openTip === close) openTip = null;
    };
  }, [open, close]);

  // the values that need rule data are loaded when the tip is first opened, so no page carries the rule definitions for its tips
  useEffect(() => {
    if (!open || !def.lazy || lazy) return;
    let alive = true;
    void def.lazy().then((v) => {
      if (alive) setLazy(v);
    });
    return () => {
      alive = false;
    };
  }, [open, def, lazy]);
  const pending = def.lazy !== undefined && lazy === null;
  const values: TipValues = { ...(def.values ?? {}), ...(lazy ?? {}) };

  // keep the bubble inside the viewport and off the icon
  const position = useCallback((): void => {
    const w = wrap.current;
    const b = bubble.current;
    if (!w || !b) return;
    const r = w.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    const maxWidth = Math.max(0, vw - 2 * EDGE);
    const width = Math.min(b.offsetWidth, maxWidth);
    const left = Math.min(Math.max(r.left, EDGE), Math.max(EDGE, vw - EDGE - width));
    const height = Math.max(b.offsetHeight, b.scrollHeight);
    const roomBelow = vh - r.bottom - GAP - EDGE;
    const roomAbove = r.top - GAP - EDGE;
    const side: 'below' | 'above' = height <= roomBelow || roomBelow >= roomAbove ? 'below' : 'above';
    const room = Math.max(0, side === 'below' ? roomBelow : roomAbove);
    const shown = Math.min(height, room);
    const top = side === 'below' ? r.bottom + GAP : r.top - GAP - shown;
    setPlace({ left, top, maxWidth, ...(height > room ? { maxHeight: room } : {}), side });
  }, []);
  useLayoutEffect(() => {
    if (open) position();
  }, [open, position, lang, lazy]);

  // what the screen reader reads: the visible text, copied into the live region next to the icon
  useEffect(() => {
    setAnnounce(open && !pending ? (bubble.current?.textContent ?? '') : '');
  }, [open, pending, lang, lazy]);

  useEffect(() => {
    if (!open) return;
    const inside = (n: EventTarget | null): boolean => n instanceof Node && ((wrap.current?.contains(n) ?? false) || (bubble.current?.contains(n) ?? false));
    const outside = (e: Event): void => {
      if (!inside(e.target)) close();
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      const had = inside(document.activeElement);
      close();
      if (had) {
        returning.current = true;
        button.current?.focus();
        returning.current = false;
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open, close, position]);

  const canHover = (): boolean => typeof window.matchMedia !== 'function' || window.matchMedia('(hover: hover)').matches;
  const links = (): HTMLElement[] => [...(bubble.current?.querySelectorAll<HTMLElement>('a[href]') ?? [])];
  const focusButton = (): void => {
    returning.current = true;
    button.current?.focus();
    returning.current = false;
  };
  const label = t(def.label);
  const logic = t(`tip.${id}.logic` as UiKey);

  const bubbleNode = open ? (
    <span
      ref={bubble}
      id={bubbleId}
      role="group"
      aria-label={t('tip.aria', { label })}
      className="infotip-bubble"
      data-tip-bubble={id}
      data-side={place?.side ?? 'below'}
      data-ready={pending ? 'false' : 'true'}
      tabIndex={-1}
      style={{ left: place?.left ?? 0, top: place?.top ?? 0, maxWidth: place?.maxWidth, maxHeight: place?.maxHeight }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return;
        const all = links();
        if (all.length === 0) return;
        const active = document.activeElement;
        if (e.shiftKey && (active === all[0] || active === bubble.current)) {
          e.preventDefault();
          focusButton();
        } else if (!e.shiftKey && active === all[all.length - 1]) {
          // the icon takes the focus and the browser's own Tab goes on from it: to whatever follows the icon in the page
          focusButton();
        }
      }}
    >
      <span className="infotip-part">
        <strong>{t('tip.does')}</strong>
        <Lines text={t(`tip.${id}.does` as UiKey)} values={values} lang={lang} pending={pending} />
      </span>
      <span className="infotip-part">
        <strong>{t('tip.logic')}</strong>
        <Lines text={logic} values={values} lang={lang} pending={pending} />
      </span>
      {def.rule !== undefined && (
        <a className="infotip-link" href={ruleDocUrl(def.rule)} target="_blank" rel="noopener noreferrer">
          {t('tip.ruleLink')}
        </a>
      )}
    </span>
  ) : null;

  return (
    <span
      ref={wrap}
      className="infotip"
      data-tip={id}
      onMouseEnter={() => {
        if (leaveTimer.current !== undefined) clearTimeout(leaveTimer.current);
        leaveTimer.current = undefined;
        if (open || !canHover()) return;
        clearTimer();
        timer.current = setTimeout(() => {
          timer.current = undefined;
          setOpen(true);
        }, HOVER_DELAY_MS);
      }}
      onMouseLeave={() => {
        clearTimer();
        if (pinned.current || !open) return;
        // a short delay, so the pointer can cross the gap to the bubble; entering the bubble (part of this component) cancels it
        leaveTimer.current = setTimeout(() => {
          leaveTimer.current = undefined;
          if (!pinned.current) close();
        }, HOVER_LEAVE_MS);
      }}
      onBlur={(e) => {
        byPointer.current = false;
        const next = e.relatedTarget;
        const within = next instanceof Node && ((wrap.current?.contains(next) ?? false) || (bubble.current?.contains(next) ?? false));
        if (!within) close();
      }}
    >
      <button
        ref={button}
        type="button"
        className="infotip-button"
        aria-label={t('tip.aria', { label })}
        aria-expanded={open}
        aria-controls={open ? bubbleId : undefined}
        onPointerDown={() => {
          byPointer.current = true;
        }}
        onMouseDown={() => {
          byPointer.current = true;
        }}
        onFocus={() => {
          if (byPointer.current || returning.current) return;
          pinned.current = true;
          if (!open) openedByFocus.current = true;
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Tab' || e.shiftKey || !open) return;
          const first = links()[0];
          if (first) {
            e.preventDefault();
            first.focus();
          }
        }}
        onClick={(e) => {
          // never reaches a label, a row or a card that is itself clickable
          e.stopPropagation();
          byPointer.current = false;
          clearTimer();
          if (open && pinned.current) {
            // Tab opened it, then Enter or Space (or a screen reader's focus() and click()): the visitor asks for it open, so the first
            // keyboard click only confirms. A mouse click (detail > 0) and the next keyboard click close it.
            if (openedByFocus.current && e.detail === 0) openedByFocus.current = false;
            else close();
          } else {
            pinned.current = true;
            setOpen(true);
          }
        }}
      >
        <span className="infotip-glyph" aria-hidden="true" />
      </button>
      <span aria-live="polite" aria-atomic="true" className="visually-hidden">
        {announce}
      </span>
      {bubbleNode && createPortal(bubbleNode, document.body)}
    </span>
  );
}

/** A field label with its ⓘ beside it (never inside the <label>, so the label and the field keep a clean accessible name). */
export function FieldLabel({ htmlFor, tip, children }: { htmlFor: string; tip: TipId; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="field-label">
      <label htmlFor={htmlFor}>{children}</label>
      <InfoTip id={tip} />
    </div>
  );
}

/** A heading with its ⓘ beside it (outside the heading element, so the heading's accessible name stays clean). */
export function HeadingTip({ tip, children }: { tip: TipId; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="with-tip">
      {children}
      <InfoTip id={tip} />
    </div>
  );
}
