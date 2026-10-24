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
        <InfoTip id="singleCruise" />
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
      render(<InfoTip id="singleCruise" />);
      const b = screen.getByRole('button') as HTMLButtonElement;
      expect(b.tagName).toBe('BUTTON');
      expect(b.type).toBe('button');
      expect(b.getAttribute('aria-label'), lang).toBe(translate(lang, 'tip.aria', { label: translate(lang, 'confirm.singleCruise') }));
      expect(b.getAttribute('aria-label')).not.toContain('{');
    }
    setLang('pl');
    cleanup();
    render(<InfoTip id="singleCruise" />);
    expect(screen.getByRole('button').getAttribute('aria-label')).toMatch(/^Wyjaśnienie: /);
  });

  it('puts the content into an aria-live region when it opens (empty before), in two parts, with the rule link', () => {
    render(<InfoTip id="singleCruise" />);
    expect(live().textContent).toBe('');
    expect(live().getAttribute('aria-atomic')).toBe('true');
    fireEvent.click(tipButton());
    const text = live().textContent ?? '';
    expect(text).toContain('What it does');
    expect(text).toContain('The logic');
    expect(text).toContain(translate('en', 'tip.singleCruise.does'));
    expect(screen.getByRole('link', { name: 'Rule details →' }).getAttribute('href')).toMatch(/docs\/rules\.md#ROW-SHIP-SPEED$/);
    const link = screen.getByRole('link', { name: 'Rule details →' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('the icon letter is drawn by CSS and is not part of the text of the page', () => {
    const { container } = render(<InfoTip id="singleCruise" />);
    expect(container.textContent).toBe('');
  });
});

describe('InfoTip: opening', () => {
  it('a click opens it, a second click closes it', () => {
    render(<InfoTip id="singleCruise" />);
    fireEvent.click(tipButton());
    expect(isOpen()).toBe(true);
    fireEvent.click(tipButton());
    expect(isOpen()).toBe(false);
    expect(live().textContent).toBe('');
  });

  it('keyboard focus opens it, Esc closes it and the focus is back on the icon (also from the link inside)', () => {
    render(<InfoTip id="singleCruise" />);
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
    render(<InfoTip id="singleCruise" />);
    fireEvent.mouseDown(tipButton());
    act(() => tipButton().focus());
    expect(isOpen()).toBe(false);
    fireEvent.click(tipButton());
    expect(isOpen()).toBe(true);
  });

  it('hover opens it after a short delay, and leaving closes it again', () => {
    vi.useFakeTimers();
    render(<InfoTip id="singleCruise" />);
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
    render(<InfoTip id="singleCruise" />);
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
    render(<InfoTip id="singleCruise" />);
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
        <InfoTip id="singleCruise" />
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
  it('the link comes after the icon in the tab order and the next control after the link: Tab reaches it and moves on', () => {
    render(<Host />);
    fireEvent.click(tipButton());
    const focusables = [...document.querySelectorAll<HTMLElement>('input, button, a[href], [tabindex]')].filter((e) => e.tabIndex >= 0);
    const names = focusables.map((e) => e.tagName + ':' + (e.getAttribute('aria-label') ?? e.textContent));
    const iconAt = names.findIndex((n) => n.startsWith('BUTTON:Explanation'));
    const rest = names.slice(iconAt + 1);
    const next = rest.findIndex((n) => !n.startsWith('A:'));
    expect(next).toBeGreaterThan(0); // the sources and the rule link, in the bubble, in reading order
    expect(rest[next - 1]).toBe('A:Rule details →');
    expect(rest[next]).toBe('INPUT:after');
    // the bubble takes a click but is not a tab stop, and nothing sets a positive tabindex
    expect(document.querySelector('.infotip-bubble')?.getAttribute('tabindex')).toBe('-1');
    expect(document.querySelectorAll('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])').length).toBe(0);
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
        <InfoTip id="singleCruise" />
      </div>,
    );
    fireEvent.click(tipButton());
    expect(outer).not.toHaveBeenCalled();
  });
});

describe('InfoTip: stays in the viewport and off its icon', () => {
  const rect = (r: Partial<DOMRect>): DOMRect => ({ x: 0, y: 0, width: 24, height: 24, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}), ...r }) as DOMRect;

  it('on a 360 px phone an icon at the right edge gets a bubble shifted left, inside the margins', () => {
    vi.stubGlobal('innerWidth', 360);
    vi.stubGlobal('innerHeight', 740);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('infotip') ? rect({ left: 330, right: 354, top: 100, bottom: 124 }) : rect({});
    });
    render(<InfoTip id="singleCruise" />);
    fireEvent.click(tipButton());
    const bubble = document.querySelector('.infotip-bubble') as HTMLElement;
    const dx = Number.parseFloat(bubble.style.getPropertyValue('--tip-dx'));
    // the bubble is min(352, 360 - 16) = 344 wide: its left edge lands on the 8 px margin
    expect(330 + dx).toBe(8);
    expect(330 + dx + 344).toBeLessThanOrEqual(360 - 8);
    vi.unstubAllGlobals();
  });

  it('opens below the icon, and above it when there is no room below', () => {
    vi.stubGlobal('innerWidth', 360);
    vi.stubGlobal('innerHeight', 740);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200);
    let bottom = 150;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('infotip') ? rect({ left: 20, right: 44, top: bottom - 24, bottom }) : rect({});
    });
    render(<InfoTip id="singleCruise" />);
    fireEvent.click(tipButton());
    expect(document.querySelector('.infotip-bubble')?.getAttribute('data-side')).toBe('below');
    fireEvent.click(tipButton());
    bottom = 710;
    fireEvent.click(tipButton());
    expect(document.querySelector('.infotip-bubble')?.getAttribute('data-side')).toBe('above');
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
