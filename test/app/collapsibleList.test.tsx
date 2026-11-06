// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Task 9: a list of examples with more than 10 items shows the first 5 and a button "Show all (N)" that turns into "Collapse"; 10 or fewer are shown whole, with no button.
// The button is a native <button> with aria-expanded and aria-controls; the rest of the list is in the page (hidden) so print shows all of it. Every value is invented.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CollapsibleList, sentenceWithList, splitListText } from '../../src/app/components/CollapsibleList';
import { initLang, setLang } from '../../src/app/i18n';
import { UI } from '../../src/core/i18n/ui';
import { LANGS } from '../../src/core/types';

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const names = (n: number): string[] => Array.from({ length: n }, (_, i) => `Name ${i + 1}`);
const list = (n: number): React.ReactElement => <CollapsibleList items={names(n)} itemKey={(x) => x} renderItem={(x) => <code>{x}</code>} className="demo" />;
const shown = (container: HTMLElement): string[] => [...container.querySelectorAll('li')].filter((li) => !li.hasAttribute('hidden')).map((li) => li.textContent ?? '');

describe('CollapsibleList', () => {
  it('10 items are all shown, with no button', () => {
    const { container } = render(list(10));
    expect(shown(container)).toHaveLength(10);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[hidden]')).toBeNull();
  });

  it('11 items show the first 5 and "Show all (11)"', () => {
    const { container } = render(list(11));
    expect(shown(container)).toEqual(['Name 1', 'Name 2', 'Name 3', 'Name 4', 'Name 5']);
    const b = screen.getByRole('button', { name: 'Show all (11)' });
    expect(b.getAttribute('aria-expanded')).toBe('false');
    // the whole list is still in the page (print shows it), only marked hidden
    expect(container.querySelectorAll('li')).toHaveLength(11);
    expect(container.querySelectorAll('li[hidden]')).toHaveLength(6);
  });

  it('expanding shows all 11 and the button turns into "Collapse"; collapsing goes back to 5', () => {
    const { container } = render(list(11));
    fireEvent.click(screen.getByRole('button', { name: 'Show all (11)' }));
    expect(shown(container)).toHaveLength(11);
    const b = screen.getByRole('button', { name: 'Collapse' });
    expect(b.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(b);
    expect(shown(container)).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Show all (11)' })).toBeTruthy();
  });

  it('the button is a native <button type="button"> that the keyboard reaches, and aria-controls points at the list', () => {
    const { container } = render(list(12));
    const b = screen.getByRole('button', { name: 'Show all (12)' }) as HTMLButtonElement;
    expect(b.tagName).toBe('BUTTON');
    expect(b.type).toBe('button');
    expect(b.disabled).toBe(false);
    expect(b.tabIndex).toBeGreaterThanOrEqual(0);
    b.focus();
    expect(document.activeElement).toBe(b);
    // Enter and Space on a focused native button are a click; the state follows the click, so the focus stays on the same button
    fireEvent.click(b);
    expect(document.activeElement).toBe(b);
    expect(b.getAttribute('aria-expanded')).toBe('true');
    const ul = container.querySelector('ul') as HTMLElement;
    expect(ul.id).not.toBe('');
    expect(b.getAttribute('aria-controls')).toBe(ul.id);
    expect(ul.className).toBe('demo');
  });

  it('two lists on one page keep their own state and their own ids', () => {
    const { container } = render(
      <>
        {list(11)}
        {list(12)}
      </>,
    );
    const [a, b] = screen.getAllByRole('button');
    expect(a.getAttribute('aria-controls')).not.toBe(b.getAttribute('aria-controls'));
    fireEvent.click(a);
    expect(a.getAttribute('aria-expanded')).toBe('true');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelectorAll('li[hidden]')).toHaveLength(7);
  });

  it('item attributes reach the <li>', () => {
    const { container } = render(<CollapsibleList items={names(3)} itemKey={(x) => x} itemAttrs={(x) => ({ 'data-n': x })} renderItem={(x) => x} />);
    expect(container.querySelector('li[data-n="Name 2"]')).toBeTruthy();
  });
});

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
    const button = screen.getByRole('button', { name: 'Show all (11)' });
    expect(button.getAttribute('aria-controls')).toBe(more.id);
    // the sentence reads on to its end, then the button: the button never stands inside it
    expect(container.textContent).toBe(`Lines ${eleven}, … are wrong. Show all (11)`);
  });

  it('expanding shows the whole list and drops the ellipsis; the sentence is exactly what it was, with the button after it', () => {
    const { container } = render(<p>{sentenceWithList(`Lines ${LISTED} are wrong.`, LISTED)}</p>);
    fireEvent.click(screen.getByRole('button', { name: 'Show all (12)' }));
    expect(container.querySelector('.collapsible-more')?.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('.collapsible-ellipsis')).toBeNull();
    expect(screen.getByRole('button', { name: 'Collapse' }).getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toBe(`Lines ${LISTED} are wrong. Collapse`);
  });

  it('a "… (+n)" note of lines the converter did not list is a tail, not an item, and it stays visible while collapsed', () => {
    expect(splitListText('2, 5, …')).toEqual({ items: ['2', '5'], tail: '…' });
    expect(splitListText('2, 5, … (+40)')).toEqual({ items: ['2', '5'], tail: '… (+40)' });
    const text = `${LISTED}, … (+40)`;
    const { container } = render(<p>{sentenceWithList(`Lines ${text}.`, text)}</p>);
    expect(screen.getByRole('button', { name: 'Show all (12)' })).toBeTruthy();
    const tail = container.querySelector('.collapsible-tail') as HTMLElement;
    expect(tail.textContent).toBe(', … (+40)');
    expect(tail.closest('[hidden]')).toBeNull();
    expect(container.querySelector('.collapsible-more')?.textContent?.includes('+40')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Show all (12)' }));
    expect(container.textContent).toBe(`Lines ${text}. Collapse`);
  });

  it('a list that is not in the sentence leaves the sentence alone', () => {
    expect(sentenceWithList('No list here.', LISTED)).toBe('No list here.');
    expect(sentenceWithList('Anything', '')).toBe('Anything');
  });
});

describe('labels and print', () => {
  it('has both labels in four languages, with the count in "Show all"', () => {
    for (const lang of LANGS) {
      expect(UI[lang]['list.showAll'], lang).toContain('{n}');
      expect(UI[lang]['list.collapse'].trim(), lang).not.toBe('');
    }
    setLang('pl');
    const { container } = render(list(11));
    expect(container.querySelector('button')?.textContent).toBe('Pokaż wszystkie (11)');
    fireEvent.click(container.querySelector('button')!);
    expect(container.querySelector('button')?.textContent).toBe('Zwiń');
  });

  it('the print stylesheet shows every item and no button or ellipsis', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'src', 'app', 'styles.css'), 'utf-8');
    const at = css.indexOf('@media print');
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf('\n}\n', css.indexOf('.convert-doubt-list', at)) + 3);
    expect(block).toMatch(/\.collapsible-more\[hidden\]\s*\{\s*display:\s*inline\s*!important/);
    expect(block).toMatch(/li\.collapsible-more\[hidden\]\s*\{\s*display:\s*list-item\s*!important/);
    expect(block).toMatch(/\.collapsible-ellipsis,\s*\.collapsible-toggle\s*\{\s*display:\s*none\s*!important/);
  });
});
