// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { SITE } from '../../../config/site';
import type { UiKey } from '../../core/i18n/ui';
import type { Lang } from '../../core/types';
import { t, useLang } from '../i18n';
import { TIPS, fillValues, type TipId, type TipValues } from '../tips';

/** How long the pointer must rest on the icon before a hover opens it (a click, a tap or the keyboard open it at once). */
export const HOVER_DELAY_MS = 300;

const EDGE = 8; // px kept free between the bubble and the edge of the viewport
const BUBBLE_MAX = 352; // px, as .infotip-bubble in styles.css

/** The rule details live in docs/rules.md of the public repository, one row (and anchor) per rule id. */
export const ruleDocUrl = (ruleId: string): string => `${SITE.sourceUrl}/blob/main/docs/rules.md#${ruleId}`;

/** Splits a tip text into bullet lines ("• …") and plain lines. */
function Lines({ text, values, lang }: { text: string; values: TipValues; lang: Lang }): React.ReactElement {
  const rows = text.split('\n').filter((l) => l.trim() !== '');
  const bullets = rows.filter((l) => l.startsWith('• '));
  const plain = rows.filter((l) => !l.startsWith('• '));
  return (
    <>
      {plain.map((l, i) => (
        <span key={'p' + i} className="infotip-line">
          {fillValues(l, values, lang)}
        </span>
      ))}
      {bullets.length > 0 && (
        <span className="infotip-list" role="list">
          {bullets.map((l, i) => (
            <span key={'b' + i} className="infotip-item" role="listitem">
              {fillValues(l.slice(2), values, lang)}
            </span>
          ))}
        </span>
      )}
    </>
  );
}

/**
 * The ⓘ explanation next to a decision or a result (a "toggletip"). One component for every page: what a tip says lives in
 * `tip.<id>.does` ("what it does") and `tip.<id>.logic` ("the logic") of src/core/i18n/ui.ts, and every number, unit and source in it
 * is filled in from the rule definitions and constants by src/app/tips.tsx, never typed into the text.
 *
 * Behaviour: opens on hover (after HOVER_DELAY_MS; the mouse only), on click or tap, and on keyboard focus; closes on Esc (focus returns to
 * the icon), on a click or tap elsewhere and when focus leaves both the icon and the bubble. Hover alone is never the only way in. The icon
 * is a real button (type="button": it submits nothing, and it is never placed inside a <label>, so it toggles no checkbox). The bubble
 * follows the icon in the DOM order, so Tab reaches its link and moves on: there is no focus trap. It is written into an aria-live="polite"
 * region when it opens, which is what makes a screen reader read it. The bubble is kept inside the viewport (shifted sideways, flipped
 * above the icon when there is no room below) and never sits on the icon itself.
 */
export function InfoTip({ id }: { id: TipId }): React.ReactElement {
  const { lang } = useLang();
  const def = TIPS[id];
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<'below' | 'above'>('below');
  const [dx, setDx] = useState(0);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const pinned = useRef(false); // opened by click, tap or keyboard: stays open when the pointer leaves
  const returning = useRef(false); // Esc puts the focus back on the icon: that focus must not open the tip again
  const byPointer = useRef(false); // the focus on the button comes from a pointer press, whose click will decide
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bubbleId = useId();

  const clearTimer = (): void => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
  };
  const close = useCallback((): void => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
    pinned.current = false;
    setOpen(false);
  }, []);
  useEffect(() => clearTimer, []);

  // keep the bubble inside the viewport and off the icon
  const place = useCallback((): void => {
    const w = wrap.current;
    const b = bubble.current;
    if (!w || !b) return;
    const r = w.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(BUBBLE_MAX, vw - 2 * EDGE);
    const left = Math.min(Math.max(r.left, EDGE), Math.max(EDGE, vw - EDGE - width));
    setDx(Math.round(left - r.left));
    const height = b.offsetHeight;
    const below = vh - r.bottom;
    setSide(below < height + EDGE && r.top > below ? 'above' : 'below');
  }, []);
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, lang]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event): void => {
      if (wrap.current && e.target instanceof Node && !wrap.current.contains(e.target)) close();
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      const inside = wrap.current?.contains(document.activeElement) ?? false;
      close();
      if (inside) {
        returning.current = true;
        button.current?.focus();
        returning.current = false;
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', place);
    };
  }, [open, close, place]);

  const canHover = (): boolean => typeof window.matchMedia !== 'function' || window.matchMedia('(hover: hover)').matches;
  const label = t(def.label);
  const logic = t(`tip.${id}.logic` as UiKey);
  const values = def.values ?? {};

  return (
    <span
      ref={wrap}
      className="infotip"
      data-tip={id}
      onMouseEnter={() => {
        if (open || !canHover()) return;
        clearTimer();
        timer.current = setTimeout(() => {
          timer.current = undefined;
          setOpen(true);
        }, HOVER_DELAY_MS);
      }}
      onMouseLeave={() => {
        clearTimer();
        if (!pinned.current) setOpen(false);
      }}
      onBlur={(e) => {
        byPointer.current = false;
        const next = e.relatedTarget;
        if (!(next instanceof Node && wrap.current?.contains(next))) close();
      }}
    >
      <button
        ref={button}
        type="button"
        className="infotip-button"
        aria-label={t('tip.aria', { label })}
        aria-expanded={open}
        aria-controls={bubbleId}
        onPointerDown={() => {
          byPointer.current = true;
        }}
        onMouseDown={() => {
          byPointer.current = true;
        }}
        onFocus={() => {
          if (byPointer.current || returning.current) return;
          pinned.current = true;
          setOpen(true);
        }}
        onClick={(e) => {
          // never reaches a label, a row or a card that is itself clickable
          e.stopPropagation();
          byPointer.current = false;
          clearTimer();
          if (open && pinned.current) {
            close();
          } else {
            pinned.current = true;
            setOpen(true);
          }
        }}
      >
        <span className="infotip-glyph" aria-hidden="true" />
      </button>
      <span id={bubbleId} aria-live="polite" aria-atomic="true" className="infotip-live">
        {open && (
          <span ref={bubble} className="infotip-bubble" data-side={side} tabIndex={-1} style={{ '--tip-dx': dx + 'px' } as React.CSSProperties}>
            <span className="infotip-part">
              <strong>{t('tip.does')}</strong>
              <Lines text={t(`tip.${id}.does` as UiKey)} values={values} lang={lang} />
            </span>
            <span className="infotip-part">
              <strong>{t('tip.logic')}</strong>
              <Lines text={logic} values={values} lang={lang} />
            </span>
            {def.rule !== undefined && (
              <a className="infotip-link" href={ruleDocUrl(def.rule)} target="_blank" rel="noopener noreferrer">
                {t('tip.ruleLink')}
              </a>
            )}
          </span>
        )}
      </span>
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
