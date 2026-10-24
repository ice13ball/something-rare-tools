// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// The ⓘ toggletip: the ways in and out, what a screen reader gets, no trap, no side effects on the control beside it, the viewport.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOVER_DELAY_MS, InfoTip } from '../../src/app/components/InfoTip';
import { SingleCruise } from '../../src/app/components/SingleCruise';
import { initLang, setLang } from '../../src/app/i18n';
import { translate } from '../../src/core/i18n/ui';
import { LANGS } from '../../src/core/types';

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const NAME = /^Explanation: /;
const tipButton = (): HTMLButtonElement => screen.getByRole('button', { name: NAME }) as HTMLButtonElement;
const live = (): HTMLElement => document.querySelector('[aria-live="polite"]') as HTMLElement;
const isOpen = (): boolean => tipButton().getAttribute('aria-expanded') === 'true';

/** The tip in the worst place: inside a <label> of a checkbox, in a form with a submit handler. */
function Host({ onSubmit = () => {} }: { onSubmit?: () => void }): React.ReactElement {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label>
        <input type="checkbox" />
        <span>Declare</span>
        <InfoTip id="layout" />
      </label>
      <input type="text" aria-label="after" />
    </form>
  );
}

describe('InfoTip: name and content', () => {
  it('is a real button of type "button" whose name is "Explanation: <label>" in every language', () => {
    for (const lang of LANGS) {
      cleanup();
      setLang(lang);
      render(<InfoTip id="layout" />);
      const b = screen.getByRole('button') as HTMLButtonElement;
      expect(b.tagName).toBe('BUTTON');
      expect(b.type).toBe('button');
      expect(b.getAttribute('aria-label'), lang).toBe(translate(lang, 'tip.aria', { label: translate(lang, 'layout.title') }));
      expect(b.getAttribute('aria-label')).not.toContain('{');
    }
    setLang('pl');
    cleanup();
    render(<InfoTip id="layout" />);
    expect(screen.getByRole('button').getAttribute('aria-label')).toMatch(/^Wyjaśnienie: /);
  });

  it('puts the content into an aria-live region when it opens (empty before), in two parts, with the rule link', () => {
    render(<InfoTip id="layout" />);
    expect(live().textContent).toBe('');
    expect(live().getAttribute('aria-atomic')).toBe('true');
    fireEvent.click(tipButton());
    const text = live().textContent ?? '';
    expect(text).toContain('What it does');
    expect(text).toContain('The logic');
    expect(text).toContain(translate('en', 'tip.layout.does'));
    expect(screen.getByRole('link', { name: 'Rule details →' }).getAttribute('href')).toMatch(/docs\/rules\.md#IN-LAYOUT-UNSUPPORTED$/);
    const link = screen.getByRole('link', { name: 'Rule details →' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('the icon letter is drawn by CSS and is not part of the text of the page', () => {
    const { container } = render(<InfoTip id="layout" />);
    expect(container.textContent).toBe('');
  });
});

describe('InfoTip: opening', () => {
  it('a click opens it, a second click closes it', () => {
    render(<InfoTip id="layout" />);
    fireEvent.click(tipButton());
    expect(isOpen()).toBe(true);
    fireEvent.click(tipButton());
    expect(isOpen()).toBe(false);
    expect(live().textContent).toBe('');
  });

  it('keyboard focus opens it, Esc closes it and the focus is back on the icon (also from the link inside)', () => {
    render(<InfoTip id="layout" />);
    act(() => tipButton().focus());
    expect(isOpen()).toBe(true);
    const link = screen.getByRole('link', { name: 'Rule details →' });
    act(() => link.focus());
    expect(isOpen()).toBe(true); // focus moved inside the tip: it stays
    fireEvent.keyDown(link, { key: 'Escape' });
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(tipButton());
  });

  it('a mouse press focuses the button without opening twice: the click decides', () => {
    render(<InfoTip id="layout" />);
    fireEvent.mouseDown(tipButton());
    act(() => tipButton().focus());
    expect(isOpen()).toBe(false);
    fireEvent.click(tipButton());
    expect(isOpen()).toBe(true);
  });

  it('hover opens it after a short delay, and leaving closes it again', () => {
    vi.useFakeTimers();
    render(<InfoTip id="layout" />);
    const wrap = document.querySelector('.infotip') as HTMLElement;
    fireEvent.mouseEnter(wrap);
    act(() => void vi.advanceTimersByTime(HOVER_DELAY_MS - 1));
    expect(isOpen()).toBe(false);
    act(() => void vi.advanceTimersByTime(1));
    expect(isOpen()).toBe(true);
    fireEvent.mouseLeave(wrap);
    expect(isOpen()).toBe(false);
  });

  it('a pointer that only passes by opens nothing; a click after hovering keeps it open when the pointer leaves', () => {
    vi.useFakeTimers();
    render(<InfoTip id="layout" />);
    const wrap = document.querySelector('.infotip') as HTMLElement;
    fireEvent.mouseEnter(wrap);
    act(() => void vi.advanceTimersByTime(100));
    fireEvent.mouseLeave(wrap);
    act(() => void vi.advanceTimersByTime(1000));
    expect(isOpen()).toBe(false);

    fireEvent.mouseEnter(wrap);
    act(() => void vi.advanceTimersByTime(HOVER_DELAY_MS));
    expect(isOpen()).toBe(true);
    fireEvent.click(tipButton()); // pins it
    fireEvent.mouseLeave(wrap);
    expect(isOpen()).toBe(true);
  });

  it('a tap (no hover media) opens it at once, with no delay', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.useFakeTimers();
    render(<InfoTip id="layout" />);
    const wrap = document.querySelector('.infotip') as HTMLElement;
    fireEvent.mouseEnter(wrap); // the emulated mouse events of a tap
    act(() => void vi.advanceTimersByTime(1000));
    expect(isOpen()).toBe(false);
    fireEvent.click(tipButton());
    expect(isOpen()).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe('InfoTip: closing', () => {
  it('closes on a press outside, but not on a press inside the bubble', () => {
    render(
      <div>
        <InfoTip id="layout" />
        <p data-testid="elsewhere">elsewhere</p>
      </div>,
    );
    fireEvent.click(tipButton());
    fireEvent.pointerDown(document.querySelector('.infotip-bubble') as HTMLElement);
    expect(isOpen()).toBe(true);
    fireEvent.pointerDown(screen.getByTestId('elsewhere'));
    expect(isOpen()).toBe(false);
    fireEvent.click(tipButton());
    fireEvent.mouseDown(screen.getByTestId('elsewhere'));
    expect(isOpen()).toBe(false);
  });

  it('closes when focus leaves both the icon and the bubble, and not while it moves between them', () => {
    render(<Host />);
    const after = screen.getByLabelText('after');
    act(() => tipButton().focus());
    const link = screen.getByRole('link', { name: 'Rule details →' });
    fireEvent.blur(tipButton(), { relatedTarget: link });
    expect(isOpen()).toBe(true);
    fireEvent.blur(link, { relatedTarget: tipButton() });
    expect(isOpen()).toBe(true);
    fireEvent.blur(link, { relatedTarget: after });
    expect(isOpen()).toBe(false);
  });

  it('Esc closes a tip that the mouse opened, when the focus is elsewhere', () => {
    vi.useFakeTimers();
    render(<Host />);
    fireEvent.mouseEnter(document.querySelector('.infotip') as HTMLElement);
    act(() => void vi.advanceTimersByTime(HOVER_DELAY_MS));
    expect(isOpen()).toBe(true);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(isOpen()).toBe(false);
  });
});

describe('InfoTip: no trap, no side effects', () => {
  it('the bubble is drawn in a portal, so Tab is steered by hand: icon -> its link -> on to what follows the icon; Shift+Tab back to the icon; no trap', () => {
    render(<Host />);
    const after = screen.getByLabelText('after');
    act(() => tipButton().focus());
    expect(isOpen()).toBe(true);
    const bubble = document.querySelector('.infotip-bubble') as HTMLElement;
    expect(bubble.parentElement).toBe(document.body);
    expect(bubble.getAttribute('tabindex')).toBe('-1');
    expect(document.querySelectorAll('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])').length).toBe(0);
    const link = screen.getByRole('link', { name: 'Rule details →' });

    // Tab on the icon goes into the bubble
    expect(fireEvent.keyDown(tipButton(), { key: 'Tab' })).toBe(false); // default prevented: we move the focus
    expect(document.activeElement).toBe(link);
    // Shift+Tab on the first link goes back to the icon
    expect(fireEvent.keyDown(link, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(tipButton());
    expect(isOpen()).toBe(true);
    // Tab on the last link: the icon takes the focus and the browser's own Tab goes on from it (the event is not cancelled)
    act(() => link.focus());
    expect(fireEvent.keyDown(link, { key: 'Tab' })).toBe(true);
    expect(document.activeElement).toBe(tipButton());
    // the focus then leaves for the next control: the tip closes
    fireEvent.blur(tipButton(), { relatedTarget: after });
    expect(isOpen()).toBe(false);
    // Shift+Tab on the icon is the browser's own: nothing is intercepted
    act(() => tipButton().focus());
    expect(fireEvent.keyDown(tipButton(), { key: 'Tab', shiftKey: true })).toBe(true);
  });

  it('a tip with no link inside lets Tab pass', () => {
    render(<InfoTip id="cleanCsv" />);
    act(() => tipButton().focus());
    expect(fireEvent.keyDown(tipButton(), { key: 'Tab' })).toBe(true);
  });

  it('a click on the icon neither toggles the checkbox it sits beside nor submits the form', () => {
    const submitted = vi.fn();
    render(<Host onSubmit={submitted} />);
    const box = screen.getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(tipButton());
    fireEvent.click(tipButton());
    fireEvent.click(tipButton());
    expect(box.checked).toBe(false);
    expect(submitted).not.toHaveBeenCalled();
    // Enter and Space on the icon are clicks too
    fireEvent.keyDown(tipButton(), { key: 'Enter' });
    expect(submitted).not.toHaveBeenCalled();
  });

  it('beside the real "one cruise" checkbox: the tip opens, the box stays as it was, and the box still works', () => {
    const onChange = vi.fn();
    render(<SingleCruise checked={false} onChange={onChange} columnFiles={[]} />);
    fireEvent.click(tipButton());
    expect(isOpen()).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('a click on the icon does not reach a clickable ancestor', () => {
    const outer = vi.fn();
    render(
      <div onClick={outer}>
        <InfoTip id="layout" />
      </div>,
    );
    fireEvent.click(tipButton());
    expect(outer).not.toHaveBeenCalled();
  });
});

describe('InfoTip: stays in the viewport and off its icon', () => {
  const rect = (r: Partial<DOMRect>): DOMRect => ({ x: 0, y: 0, width: 24, height: 24, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}), ...r }) as DOMRect;
  const anchor = (r: Partial<DOMRect>): void => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('infotip') ? rect(r) : rect({});
    });
  };

  it('is drawn on <body> with position: fixed, so no scroll container of the page can clip it, and it is above the cookie banner', () => {
    render(
      <div className="table-scroll" style={{ overflow: 'auto' }}>
        <InfoTip id="layout" />
      </div>,
    );
    fireEvent.click(tipButton());
    const bubble = document.querySelector('.infotip-bubble') as HTMLElement;
    expect(bubble.parentElement).toBe(document.body);
    expect(bubble.closest('.table-scroll')).toBeNull();
    const css = readFileSync(join(__dirname, '..', '..', 'src', 'app', 'styles.css'), 'utf8');
    const rule = css.slice(css.indexOf('.infotip-bubble {'), css.indexOf('}', css.indexOf('.infotip-bubble {')));
    expect(rule).toContain('position: fixed');
    const z = Number(/z-index: (\d+)/.exec(rule)?.[1]);
    const banner = css.slice(css.indexOf('.cookie-banner'), css.indexOf('}', css.indexOf('.cookie-banner')));
    expect(z).toBeGreaterThan(Number(/z-index: (\d+)/.exec(banner)?.[1] ?? 0));
  });

  it('on a 360 px phone an icon at the right edge gets a bubble placed inside the margins, from the real width of the bubble', () => {
    vi.stubGlobal('innerWidth', 360);
    vi.stubGlobal('innerHeight', 740);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(344);
    anchor({ left: 330, right: 354, top: 100, bottom: 124 });
    render(<InfoTip id="layout" />);
    fireEvent.click(tipButton());
    const bubble = document.querySelector('.infotip-bubble') as HTMLElement;
    expect(bubble.style.left).toBe('8px');
    expect(bubble.style.maxWidth).toBe('344px');
    expect(bubble.style.top).toBe('130px'); // below the icon, 6 px clear of it
    vi.unstubAllGlobals();
  });

  it('a bubble wider than the viewport allows (large default font, classic scrollbar) is capped to the width that is really there', () => {
    vi.stubGlobal('innerWidth', 360);
    vi.stubGlobal('innerHeight', 740);
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(345);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(344);
    anchor({ left: 300, right: 324, top: 100, bottom: 124 });
    render(<InfoTip id="layout" />);
    fireEvent.click(tipButton());
    const bubble = document.querySelector('.infotip-bubble') as HTMLElement;
    expect(bubble.style.maxWidth).toBe('329px');
    expect(Number.parseFloat(bubble.style.left) + 329).toBeLessThanOrEqual(345 - 8);
    vi.unstubAllGlobals();
  });

  it('opens below the icon, and above it when there is no room below', () => {
    vi.stubGlobal('innerWidth', 360);
    vi.stubGlobal('innerHeight', 740);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200);
    let r: Partial<DOMRect> = { left: 20, right: 44, top: 126, bottom: 150 };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('infotip') ? rect(r) : rect({});
    });
    render(<InfoTip id="layout" />);
    fireEvent.click(tipButton());
    expect(document.querySelector('.infotip-bubble')?.getAttribute('data-side')).toBe('below');
    fireEvent.click(tipButton());
    r = { left: 20, right: 44, top: 686, bottom: 710 };
    fireEvent.click(tipButton());
    const bubble = document.querySelector('.infotip-bubble') as HTMLElement;
    expect(bubble.getAttribute('data-side')).toBe('above');
    expect(Number.parseFloat(bubble.style.top) + 200).toBeLessThanOrEqual(686 - 6);
    vi.unstubAllGlobals();
  });

  it('is placed again when the page scrolls', () => {
    vi.stubGlobal('innerWidth', 360);
    vi.stubGlobal('innerHeight', 740);
    let top = 100;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('infotip') ? rect({ left: 20, right: 44, top, bottom: top + 24 }) : rect({});
    });
    render(<InfoTip id="layout" />);
    fireEvent.click(tipButton());
    const bubble = document.querySelector('.infotip-bubble') as HTMLElement;
    expect(bubble.style.top).toBe('130px');
    top = 60;
    act(() => void window.dispatchEvent(new Event('scroll')));
    expect(bubble.style.top).toBe('90px');
    vi.unstubAllGlobals();
  });

  it('only fades in, and only when the visitor has not asked for reduced motion', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'src', 'app', 'styles.css'), 'utf8');
    const animated = [...css.matchAll(/animation:[^;]*infotip-in/g)];
    expect(animated.length).toBe(1);
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference)', css.indexOf('infotip')));
    expect(block.indexOf('animation: infotip-in')).toBeGreaterThan(-1);
    expect(block.indexOf('animation: infotip-in')).toBeLessThan(block.indexOf('\n}\n\n/* where the icon sits'));
  });
});

describe('InfoTip: focus opens it, and the keyboard click that follows does not close it', () => {
  it('Tab (focus) then Enter (a click), however long the pause: the tip stays open; the next Enter closes it', () => {
    vi.useFakeTimers();
    render(<InfoTip id="layout" />);
    act(() => tipButton().focus());
    expect(isOpen()).toBe(true);
    act(() => void vi.advanceTimersByTime(5000));
    fireEvent.keyDown(tipButton(), { key: 'Enter' });
    fireEvent.click(tipButton());
    expect(isOpen()).toBe(true);
    fireEvent.click(tipButton());
    expect(isOpen()).toBe(false);
  });

  it('a screen reader that calls focus() and then click() gets an open tip too', () => {
    render(<InfoTip id="layout" />);
    act(() => {
      tipButton().focus();
      tipButton().click();
    });
    expect(isOpen()).toBe(true);
  });

  it('a mouse click on a tip the keyboard opened closes it (a click with a position is a decision)', () => {
    render(<InfoTip id="layout" />);
    act(() => tipButton().focus());
    fireEvent.click(tipButton(), { detail: 1 });
    expect(isOpen()).toBe(false);
  });
});
