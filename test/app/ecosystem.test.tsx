// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// One ecosystem with the atlas: ?lang= on arrival, the atlas link, the shared banner text, and the leave warning on /check.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { atlasHref, initLang, langFromSearch, searchWithoutLang, setLang } from '../../src/app/i18n';
import { CookieBanner } from '../../src/app/components/CookieBanner';
import { Layout } from '../../src/app/components/Layout';
import { CheckPage } from '../../src/app/pages/CheckPage';
import { UI } from '../../src/core/i18n/ui';
import { createDirectEngine } from '../../src/worker/handler';

const setUrl = (u: string): void => window.history.replaceState(null, '', u);

beforeEach(() => {
  localStorage.clear();
  document.cookie = 'ac_consent=; Path=/; Max-Age=0';
  setUrl('/');
});
afterEach(() => {
  cleanup();
  setUrl('/');
});

describe('?lang= on arrival', () => {
  it('langFromSearch accepts pl, en, de, fr only', () => {
    expect(langFromSearch('?lang=de')).toBe('de');
    expect(langFromSearch('?lang=PL')).toBe('pl');
    expect(langFromSearch('?lang=Fr')).toBe('fr');
    expect(langFromSearch('?a=1&lang=fr&b=2')).toBe('fr');
    for (const bad of ['?lang=xx', '?lang=', '?language=de', '', '?lang=de%00']) expect(langFromSearch(bad), bad).toBeNull();
  });

  it('searchWithoutLang drops only lang and keeps every other parameter as written', () => {
    expect(searchWithoutLang('?lang=de')).toBe('');
    expect(searchWithoutLang('?a=1&lang=de&b=%20x')).toBe('?a=1&b=%20x');
    expect(searchWithoutLang('?s=abc%3D&lang=pl')).toBe('?s=abc%3D');
    expect(searchWithoutLang('?langx=1&xlang=2')).toBe('?langx=1&xlang=2');
    expect(searchWithoutLang('')).toBe('');
  });

  it('stores the language under lang, sets <html lang>, strips only ?lang= and keeps the other parameters and the hash', () => {
    setUrl('/check?doi=10.1234%2Fabc&lang=de&x=1#frag');
    expect(initLang()).toBe('de');
    expect(localStorage.getItem('lang')).toBe('de');
    expect(document.documentElement.lang).toBe('de');
    expect(location.pathname + location.search + location.hash).toBe('/check?doi=10.1234%2Fabc&x=1#frag');
  });

  it('an upper-case value is accepted and still stripped', () => {
    setUrl('/?lang=PL&a=1');
    expect(initLang()).toBe('pl');
    expect(localStorage.getItem('lang')).toBe('pl');
    expect(location.search).toBe('?a=1');
  });

  it('a clean address stays clean when ?lang= was the only parameter', () => {
    setUrl('/?lang=fr');
    initLang();
    expect(location.pathname + location.search + location.hash).toBe('/');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('an unknown value is ignored: nothing stored, the address untouched, the stored language wins', () => {
    localStorage.setItem('lang', 'pl');
    setUrl('/?lang=xx&a=1');
    expect(initLang()).toBe('pl');
    expect(localStorage.getItem('lang')).toBe('pl');
    expect(location.search).toBe('?lang=xx&a=1');
  });

  it('it overrides an older stored choice, and runs before first render (initLang is what the entries call first)', () => {
    localStorage.setItem('lang', 'en');
    setUrl('/?lang=de');
    initLang();
    render(<CheckPage engine={createDirectEngine()} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(UI.de['check.title']);
  });
});

describe('the link to the atlas', () => {
  it('atlasHref adds the language and keeps an existing query and hash', () => {
    expect(atlasHref('https://something-rare.com', 'de')).toBe('https://something-rare.com/?lang=de');
    expect(atlasHref('https://something-rare.com/?s=abc#h', 'pl')).toBe('https://something-rare.com/?s=abc&lang=pl#h');
    expect(atlasHref('https://something-rare.com/?lang=en', 'fr')).toBe('https://something-rare.com/?lang=fr');
  });

  it('header and footer name it "Atlas", open in the same tab and follow the language', () => {
    for (const lang of ['pl', 'en', 'de', 'fr'] as const) {
      setLang(lang);
      render(
        <Layout>
          <p>x</p>
        </Layout>,
      );
      const atlas = [...document.querySelectorAll('a')].filter((a) => a.getAttribute('href')?.startsWith('https://something-rare.com'));
      expect(atlas.length, lang).toBe(2);
      for (const a of atlas) {
        expect(a.textContent).toBe('Atlas');
        expect(a.getAttribute('href')).toBe(`https://something-rare.com/?lang=${lang}`);
        expect(a.hasAttribute('target')).toBe(false);
      }
      expect(document.querySelector('.brand')?.textContent).toBe(`Abyssal Claims ${UI[lang]['nav.tools']}`);
      cleanup();
    }
    setLang('en');
  });
});

describe('the shared banner text', () => {
  it('PL and EN are the contract wording, verbatim, with Odrzucam / Akceptuję and Decline / Accept', () => {
    expect(UI.pl['cookie.text']).toBe('Za Twoją zgodą używamy Google Analytics, żeby liczyć odwiedziny i użycie Atlasu i Narzędzi Abyssal Claims. Jedna decyzja obowiązuje w obu. Nigdy nie wysyłamy treści Twoich plików ani wklejonych linków.');
    expect(UI.en['cookie.text']).toBe('With your consent we use Google Analytics to count visits to and use of the Abyssal Claims Atlas and Tools. One choice applies to both. We never send the contents of your files or the links you paste.');
    expect([UI.pl['cookie.decline'], UI.pl['cookie.accept']]).toEqual(['Odrzucam', 'Akceptuję']);
    expect([UI.en['cookie.decline'], UI.en['cookie.accept']]).toEqual(['Decline', 'Accept']);
    expect(UI.pl['nav.privacy']).toBe('Prywatność');
  });

  it('the German sentence uses the decided wording', () => {
    expect(UI.de['cookie.text']).toContain('Wir senden niemals den Inhalt Ihrer Dateien oder die von Ihnen eingefügten Links.');
  });

  it('is rendered with both buttons and the privacy link', () => {
    setLang('pl');
    render(<CookieBanner />);
    expect(screen.getByRole('button', { name: 'Odrzucam' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Akceptuję' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Prywatność' }).getAttribute('href')).toBe('/privacy');
    setLang('en');
  });

  it('is never shown to someone who answered on either site (cookie present), and "Cookie settings" re-opens it to change the shared cookie', () => {
    document.cookie = 'ac_consent=granted; Path=/';
    const { rerender } = render(<CookieBanner />);
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    rerender(<CookieBanner key="forced" forceOpen />);
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(document.cookie).toContain('ac_consent=denied');
  });
});

describe('leaving /check: the browser prompt', () => {
  const leave = (): boolean => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  };
  const csv = new File(['Station,Latitude,Longitude,Date,Temperature [degC]\nS1,70,15,2021-07-01T00:00,4.2\n'], 'a.csv', { type: 'text/csv' });
  const drop = (container: HTMLElement): void => void fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [csv] } });

  it('an empty page does not warn', () => {
    render(<CheckPage engine={createDirectEngine()} />);
    expect(leave()).toBe(false);
  });

  it('files on the input step warn; removing them stops it', () => {
    const { container } = render(<CheckPage engine={createDirectEngine()} />);
    drop(container);
    expect(leave()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove a.csv' }));
    expect(leave()).toBe(false);
  });

  it('the confirm step and the report warn; Start again with nothing left chosen does not', async () => {
    const { container } = render(<CheckPage engine={createDirectEngine()} />);
    drop(container);
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    await screen.findByRole('heading', { name: 'Confirm how your files are read' });
    expect(leave()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and check' }));
    await screen.findByRole('heading', { name: 'Report' });
    expect(leave()).toBe(true);
    // a download is a blob link with a `download` attribute: a click on it is not a navigation, and nothing here fires the prompt
    for (const a of container.querySelectorAll('a[href^="blob:"]')) expect(a.hasAttribute('download')).toBe(true);
  });

  it('after Start again with the file list emptied there is no warning', async () => {
    const { container } = render(<CheckPage engine={createDirectEngine()} />);
    drop(container);
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    await screen.findByRole('heading', { name: 'Confirm how your files are read' });
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove a.csv' }));
    expect(leave()).toBe(false);
  });

  it('the listener is removed when the page unmounts', () => {
    const { container, unmount } = render(<CheckPage engine={createDirectEngine()} />);
    drop(container);
    expect(leave()).toBe(true);
    unmount();
    expect(leave()).toBe(false);
  });
});
