// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CookieBanner } from '../../src/app/components/CookieBanner';
import { InputPanel } from '../../src/app/components/InputPanel';
import { ModeSwitch } from '../../src/app/components/ModeSwitch';
import { ReportView } from '../../src/app/components/ReportView';
import { initLang, setLang } from '../../src/app/i18n';
import { CheckPage } from '../../src/app/pages/CheckPage';
import { IndexPage } from '../../src/app/pages/IndexPage';
import { PrivacyPage } from '../../src/app/pages/PrivacyPage';
import { DATA_HOSTS } from '../../config/hosts';
import { UI } from '../../src/core/i18n/ui';
import { buildReport } from '../../src/core/report';
import { createDirectEngine } from '../../src/worker/handler';
import { makeFinding } from '../../src/core/rules/registry';

beforeEach(() => {
  localStorage.clear();
  (window as unknown as { dataLayer: unknown[] }).dataLayer = [];
  initLang();
  setLang('en');
});
afterEach(cleanup);

describe('ReportView', () => {
  it('with zero findings shows the empty-result sentence and the not-checked list, never "ready"', () => {
    const { container } = render(<ReportView report={buildReport([])} />);
    expect(screen.getByText('No problems found in the checked categories.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What this tool does not check' })).toBeTruthy();
    expect(container.querySelectorAll('[data-testid="not-checked"] li').length).toBe(5);
    expect(container.textContent ?? '').not.toMatch(/ready/i);
  });

  it('with a warning shows the plain text on top and the rule id inside <details>', () => {
    const f = makeFinding('META-EMPTY-LINK', { file: 'a.csv', params: { count: 2 } });
    const { container } = render(<ReportView report={buildReport([f])} />);
    expect(screen.getByText(/contains 2 download link/)).toBeTruthy();
    expect(screen.queryByText('No problems found in the checked categories.')).toBeNull();
    const details = container.querySelector('details') as HTMLElement;
    expect(within(details).getByText('META-EMPTY-LINK')).toBeTruthy();
    expect(within(details).getByText('a.csv')).toBeTruthy();
    expect(within(details).getByText('Technical details')).toBeTruthy();
    // the rule id is NOT outside <details>
    const plain = container.querySelector('[data-testid="plain"]') as HTMLElement;
    expect(plain.textContent).not.toContain('META-EMPTY-LINK');
    expect(screen.getByTestId('summary').textContent).toBe('Errors: 0 · Warnings: 1 · Notes: 0');
  });

  it('shows lines, field, value and cited sources with links for a threshold rule', () => {
    const f = makeFinding('ROW-LAT-RANGE', { file: 'x.csv', lines: [5, 6, 7, 20], field: 'lat', value: '95.2' });
    const { container } = render(<ReportView report={buildReport([f])} />);
    const details = container.querySelector('details') as HTMLElement;
    expect(details.textContent).toContain('5–7, 20');
    expect(details.textContent).toContain('lat');
    expect(details.textContent).toContain('95.2');
    const links = [...details.querySelectorAll('a')];
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      expect(a.getAttribute('href')).toMatch(/^https:\/\//);
      expect(a.getAttribute('rel')).toContain('noopener');
    }
  });

  it('renders findings in the current language and groups by severity', () => {
    setLang('pl');
    const fs = [makeFinding('META-EMPTY-LINK', { params: { count: 1 } }), makeFinding('ROW-RAGGED', { file: 'a.csv', lines: [3], params: { expected: 4, found: 5 } })];
    const { container } = render(<ReportView report={buildReport(fs)} />);
    expect(screen.getByRole('heading', { name: /Błędy/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Ostrzeżenia/ })).toBeTruthy();
    expect(container.querySelectorAll('li[data-severity]').length).toBe(2);
  });

  it('does not crash on an unknown rule id', () => {
    const report = buildReport([]);
    report.findings.push({ ruleId: 'NOPE', severity: 'info', params: {} });
    report.counts.info = 1;
    render(<ReportView report={report} />);
    expect(screen.getAllByText('NOPE', { exact: false }).length).toBeGreaterThan(0);
  });
});

describe('ModeSwitch', () => {
  it('defaults to browser, shows both sentences before any input, and switches', () => {
    const onChange = vi.fn();
    render(<ModeSwitch onChange={onChange} />);
    expect((screen.getByRole('radio', { name: /In my browser only/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: /Via the Abyssal Claims server/ }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/downloaded by your own browser/)).toBeTruthy();
    expect(screen.getByText(/keeps nothing/)).toBeTruthy();
    expect(screen.getByText(/never leave your computer/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Via the Abyssal Claims server/ }));
    expect(onChange).toHaveBeenCalledWith('server');
  });
});

describe('InputPanel', () => {
  const csv = (name: string) => new File(['a,b\n1,2\n'], name, { type: 'text/csv' });

  it('submits files, the trimmed link and the mode; prevents the native form submit', () => {
    const onSubmit = vi.fn();
    const { container } = render(<InputPanel mode="server" onSubmit={onSubmit} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe('.csv,.tsv,.txt,.tab,.xlsx,.xls,.xml,.json');
    const f = csv('one.csv');
    fireEvent.change(input, { target: { files: [f] } });
    fireEvent.change(screen.getByLabelText(/Zenodo or GeoNetwork link/), { target: { value: '  10.5281/zenodo.1  ' } });
    const form = container.querySelector('form') as HTMLFormElement;
    const notPrevented = fireEvent.submit(form);
    expect(notPrevented).toBe(false);
    expect(onSubmit).toHaveBeenCalledWith({ files: [f], link: '10.5281/zenodo.1', mode: 'server' });
  });

  it('omits link when empty, skips unsupported file types and refuses an empty submit', () => {
    const onSubmit = vi.fn();
    const { container } = render(<InputPanel mode="browser" onSubmit={onSubmit} />);
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Add at least one file or a link.');
    const good = csv('ok.xlsx');
    const bad = csv('virus.exe');
    fireEvent.drop(container.querySelector('.dropzone') as HTMLElement, { dataTransfer: { files: [good, bad] } });
    expect(screen.getByText(/virus\.exe/)).toBeTruthy();
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0][0];
    expect(arg.files).toEqual([good]);
    expect('link' in arg).toBe(false);
  });
});

describe('CheckPage', () => {
  it('never writes to history or location during a whole check', async () => {
    const push = vi.spyOn(history, 'pushState');
    const replace = vi.spyOn(history, 'replaceState');
    const before = location.href;
    const { container } = render(<CheckPage engine={createDirectEngine()} mapLib={() => Promise.reject(new Error('no map in jsdom'))} />);
    expect((screen.getByRole('radio', { name: /In my browser only/ }) as HTMLInputElement).checked).toBe(true);
    const file = new File(['Station,Lat,Lon,Date\nST1,76.5,15.1,2021-07-25\n'], 'secret-name.csv');
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText(/Zenodo or GeoNetwork link/), { target: { value: '' } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and check' }));
    await screen.findByRole('heading', { name: 'Report' });
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(location.href).toBe(before);
    expect(location.search + location.hash).toBe('');
    push.mockRestore();
    replace.mockRestore();
  });

  it('shows a plain message, not a blank screen, when the worker fails', async () => {
    const engine = { ...createDirectEngine(), parse: () => Promise.reject(new Error('The checking worker failed. Reload the page and try again.')) };
    const { container } = render(<CheckPage engine={engine} />);
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(['x'], 'a.csv')] } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('could not be completed');
    expect(alert.textContent).toContain('checking worker failed');
  });
});

describe('pages', () => {
  it('IndexPage: one card to /check, atlas link, privacy link, language switcher, cookie banner', () => {
    render(<IndexPage />);
    expect(screen.getAllByText('Abyssal Claims Tools').length).toBeGreaterThan(0);
    const card = screen.getByRole('link', { name: /Open data check/ });
    expect(card.getAttribute('href')).toBe('/check');
    for (const a of screen.getAllByRole('link', { name: 'Abyssal Claims — deep-sea atlas' })) expect(a.getAttribute('href')).toBe('https://something-rare.com');
    expect(screen.getAllByRole('link', { name: 'Privacy' })[0].getAttribute('href')).toBe('/privacy');
    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy();
  });

  it('IndexPage: one tile per tool, each a single link named by its full action, and the header marks the current page', () => {
    render(<IndexPage />);
    const tiles = document.querySelectorAll('li.tool');
    expect(tiles.length).toBe(3);
    for (const tile of tiles) expect(tile.querySelectorAll('a').length).toBe(1);
    expect(screen.getByRole('link', { name: 'Open licence check' }).getAttribute('href')).toBe('/licence');
    expect(document.querySelector('header a[aria-current]')).toBeNull();
    cleanup();
    window.history.pushState({}, '', '/check');
    render(<IndexPage />);
    expect(document.querySelector('header a[aria-current="page"]')?.getAttribute('href')).toBe('/check');
    window.history.pushState({}, '', '/');
  });

  it('every page footer carries the section 7(b) attribution notice word for word, linking the documentation DOI, in every language and page', () => {
    const terms = readFileSync(join(__dirname, '..', '..', 'LICENSE-ADDITIONAL-TERMS.md'), 'utf8');
    expect(terms).toContain('Based on Abyssal Claims — © 2026 Michal Mazurowski\nhttps://something-rare.com\nhttps://doi.org/10.5281/zenodo.19745884');
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      setLang(lang);
      render(<IndexPage />);
      const link = screen.getByRole('link', { name: 'Based on Abyssal Claims — © 2026 Michal Mazurowski' });
      expect(link.getAttribute('href')).toBe('https://doi.org/10.5281/zenodo.19745884');
      expect(link.closest('footer')).not.toBeNull();
      cleanup();
    }
    setLang('en');
    for (const page of ['index.html', 'check/index.html', 'licence/index.html', 'collection/index.html', 'privacy/index.html']) {
      expect(readFileSync(join(__dirname, '..', '..', page), 'utf8'), page).toContain('<a href="https://doi.org/10.5281/zenodo.19745884" lang="en">Based on Abyssal Claims — © 2026 Michal Mazurowski</a></footer>');
    }
  });

  it('every page footer links the source code with the licence of package.json, in four languages and in the static pages', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as { license: string };
    expect(pkg.license).toBe('AGPL-3.0-or-later');
    render(<IndexPage />);
    const link = screen.getByRole('link', { name: `Source code (${pkg.license})` });
    expect(link.getAttribute('href')).toBe('https://github.com/ice13ball/something-rare-tools');
    expect(link.closest('footer')).not.toBeNull();
    for (const lang of ['pl', 'de', 'fr'] as const) expect(UI[lang]['footer.source']).toContain(`(${pkg.license})`);
    for (const page of ['index.html', 'check/index.html', 'licence/index.html', 'collection/index.html', 'privacy/index.html']) {
      const html = readFileSync(join(__dirname, '..', '..', page), 'utf8');
      expect(html, page).toContain('<a href="https://github.com/ice13ball/something-rare-tools">Source code (AGPL-3.0-or-later)</a>');
    }
  });

  it('PrivacyPage lists every allowlisted host and the contact link', () => {
    render(<PrivacyPage />);
    // the first host list is the data hosts of /check (a host can also be a Collection review catalogue, listed further down)
    const dataHosts = document.querySelector('ul.host-list') as HTMLElement;
    for (const h of DATA_HOSTS) expect(within(dataHosts).getByText(h)).toBeTruthy();
    expect(screen.getAllByRole('link').some((a) => a.getAttribute('href') === 'https://something-rare.com')).toBe(true);
    expect(screen.getAllByRole('link').some((a) => a.getAttribute('href') === 'mailto:m.mazurowski@ai-wall.com')).toBe(true);
  });

  it('PrivacyPage describes the hosting logs (IP, 30 days), CARTO and the legal basis in every language', () => {
    for (const [lang, heading, ip, gdpr] of [
      ['en', 'Hosting logs', 'IP address', /Art\. 6\(1\)\(f\) GDPR[\s\S]*Art\. 6\(1\)\(a\) GDPR/],
      ['pl', 'Logi hostingu', 'adres IP', /art\. 6 ust\. 1 lit\. f RODO[\s\S]*art\. 6 ust\. 1 lit\. a RODO/],
      ['de', 'Hosting-Protokolle', 'IP-Adresse', /Art\. 6 Abs\. 1 lit\. f DSGVO[\s\S]*Art\. 6 Abs\. 1 lit\. a DSGVO/],
      ['fr', "Journaux d'hébergement", "l'adresse IP", /point f, du RGPD[\s\S]*point a, du RGPD/],
    ] as const) {
      setLang(lang);
      const { container, unmount } = render(<PrivacyPage />);
      const text = container.textContent ?? '';
      expect(screen.getByRole('heading', { name: heading }), lang).toBeTruthy();
      expect(text, lang).toContain(ip);
      expect(text, lang).toContain('Google Cloud Run (');
      expect(text, lang).toMatch(/30 (days|dniach|Tagen|jours)/);
      expect(text, lang).toContain('CARTO (basemaps.cartocdn.com)');
      expect(text, lang).toMatch(gdpr);
      expect(container.querySelector('a[href="https://carto.com/privacy/"]'), lang).toBeTruthy();
      unmount();
    }
  });
});

describe('CookieBanner', () => {
  it('is shown without a decision; Decline stores denied and hides it', () => {
    render(<CookieBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(localStorage.getItem('consent')).toBe('denied');
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });
  it('Accept stores granted', () => {
    render(<CookieBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(localStorage.getItem('consent')).toBe('granted');
  });
  it('stays hidden once a decision exists', () => {
    localStorage.setItem('consent', 'denied');
    render(<CookieBanner />);
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });
});
