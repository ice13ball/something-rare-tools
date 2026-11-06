// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Task 9: a list of line ranges in a sentence with more than 10 ranges shows the first 5 and a button "Show all N lines" that turns into "Collapse"; 10 or fewer are shown whole, with no button.
// The button is a native <button> with aria-expanded and aria-controls; the rest of the list is in the page (hidden) so print shows all of it. Every value is invented.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sentenceWithList, splitListText } from '../../src/app/components/CollapsibleList';
import { initLang, setLang } from '../../src/app/i18n';
import { UI } from '../../src/core/i18n/ui';
import { LANGS } from '../../src/core/types';

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

/** What a reader sees: the text without the parts marked `hidden`. */
function visibleOf(el: Node): string {
  if (el.nodeType === 3) return el.textContent ?? '';
  if (el instanceof Element && el.hasAttribute('hidden')) return '';
  return [...el.childNodes].map(visibleOf).join('');
}
describe('sentenceWithList', () => {
  const items = Array.from({ length: 12 }, (_, i) => `${i * 3 + 2}`);
  const LISTED = items.join(', ');

  it('a short list is the sentence as it was, a string', () => {
    expect(sentenceWithList('Lines 2, 5, 8 are wrong.', '2, 5, 8')).toBe('Lines 2, 5, 8 are wrong.');
  });

  it('10 items in a sentence: whole, a string; 11: five and the button after the whole sentence', () => {
    const ten = items.slice(0, 10).join(', ');
    expect(sentenceWithList(`Lines ${ten} are wrong.`, ten)).toBe(`Lines ${ten} are wrong.`);
    const eleven = items.slice(0, 11).join(', ');
    const { container } = render(<p>{sentenceWithList(`Lines ${eleven} are wrong.`, eleven)}</p>);
    const more = container.querySelector('.collapsible-more') as HTMLElement;
    expect(more.hasAttribute('hidden')).toBe(true);
    expect(more.textContent).toBe(', ' + items.slice(5, 11).join(', '));
    expect(container.querySelector('.collapsible-ellipsis')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Show all 11 lines' });
    expect(button.getAttribute('aria-controls')).toBe(more.id);
    // the sentence reads on to its end, then the button: the button never stands inside it
    expect(container.textContent).toBe(`Lines ${eleven}, … are wrong. Show all 11 lines`);
  });

  it('expanding shows the whole list and drops the ellipsis; the sentence is exactly what it was, with the button after it', () => {
    const { container } = render(<p>{sentenceWithList(`Lines ${LISTED} are wrong.`, LISTED)}</p>);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 12 lines' }));
    expect(container.querySelector('.collapsible-more')?.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('.collapsible-ellipsis')).toBeNull();
    expect(screen.getByRole('button', { name: 'Collapse' }).getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toBe(`Lines ${LISTED} are wrong. Collapse`);
  });

  it('a "… (+n)" tail leaves the sentence and is said plainly after the button, open or closed', () => {
    expect(splitListText('2, 5, …')).toEqual({ items: ['2', '5'], tail: '…' });
    expect(splitListText('2, 5, … (+40)')).toEqual({ items: ['2', '5'], tail: '… (+40)' });
    const text = `${LISTED}, … (+40)`;
    const { container } = render(<p>{sentenceWithList(`Lines ${text}.`, text, { lines: 600 })}</p>);
    const note = container.querySelector('.collapsible-note') as HTMLElement;
    expect(note.textContent?.trim()).toBe('Only these are listed; 40 more lines are not.');
    expect(note.closest('[hidden]')).toBeNull();
    // the visible text: five ranges, one ellipsis, the sentence, the button, the note; no "…, … (+40)"
    expect(visibleOf(container)).toBe('Lines 2, 5, 8, 11, 14, \u2026. Show all 600 lines Only these are listed; 40 more lines are not.');
    fireEvent.click(screen.getByRole('button', { name: 'Show all 600 lines' }));
    expect(container.textContent).toBe(`Lines ${LISTED}. Collapse Only these are listed; 40 more lines are not.`);
    expect(container.querySelector('.collapsible-note')).toBeTruthy();
  });

  it('the button names the true number of lines when it is given, and describes itself by the sentence', () => {
    const { container } = render(<p>{sentenceWithList(`Lines ${LISTED} are wrong.`, LISTED, { lines: 550 })}</p>);
    const b = screen.getByRole('button', { name: 'Show all 550 lines' });
    expect(b.getAttribute('aria-describedby')).toBe((container.querySelector('.collapsible') as HTMLElement).id);
  });

  it('a list that is not in the sentence leaves the sentence alone', () => {
    expect(sentenceWithList('No list here.', LISTED)).toBe('No list here.');
    expect(sentenceWithList('Anything', '')).toBe('Anything');
  });
});

describe('labels and print', () => {
  it('has both labels in four languages, with the count in "Show all N lines"', () => {
    for (const lang of LANGS) {
      expect(UI[lang]['list.showAllLines'], lang).toContain('{n}');
      expect(UI[lang]['list.tailNote'], lang).toContain('{n}');
      expect(UI[lang]['list.collapse'].trim(), lang).not.toBe('');
    }
    setLang('pl');
    const eleven = Array.from({ length: 11 }, (_, i) => `${i * 3 + 2}`).join(', ');
    const { container } = render(<p>{sentenceWithList(`Lines ${eleven}.`, eleven, { lines: 11 })}</p>);
    expect(container.querySelector('button')?.textContent).toBe('Pokaż wszystkie 11 wierszy');
    fireEvent.click(container.querySelector('button')!);
    expect(container.querySelector('button')?.textContent).toBe('Zwiń');
  });

  it('the print stylesheet shows every range and no button or ellipsis', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'src', 'app', 'styles.css'), 'utf-8');
    const at = css.indexOf('@media print');
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf('\n}\n', css.indexOf('.convert-doubt-list', at)) + 3);
    expect(block).toMatch(/\.collapsible-more\[hidden\]\s*\{\s*display:\s*inline\s*!important/);
    expect(block).toMatch(/\.collapsible-ellipsis,\s*\.collapsible-toggle\s*\{\s*display:\s*none\s*!important/);
  });
});
