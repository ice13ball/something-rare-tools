// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { LicencePage } from '../../src/app/pages/LicencePage';
import { IndexPage } from '../../src/app/pages/IndexPage';
import { LANGS } from '../../src/core/types';
import { FetchBlockedError, type Fetcher } from '../../src/core/sources/fetcher';
import { MapFetcher } from '../sources/mapFetcher';
import { caseA, caseB, caseC, dataciteJson, DC, isoXml, GN, UUID, zenodoJson, ZEN } from '../helpers/licenceFixtures';

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

/** Fills the box, presses the button, waits for the result. */
async function run(fetcher: Fetcher, refs: string[], lang: 'en' | 'pl' | 'de' | 'fr' = 'en'): Promise<HTMLElement> {
  setLang(lang);
  render(<LicencePage fetcherFor={() => fetcher} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: refs.join('\n') } });
  fireEvent.click(screen.getByRole('button', { name: /Compare licences|Porównaj licencje|Lizenzen vergleichen|Comparer les licences/ }));
  return waitFor(() => screen.getByTestId('licence-result'));
}

// whole words in four languages: nothing on this page may say the licence is fine or that the data may be used
const FORBIDDEN =
  /\b(green|ok|valid|allowed|compliant|ready|zielon\w*|poprawn\w*|dozwolon\w*|zgodn\w*|gotow\w*|ważn\w*|grün|gültig|erlaubt|konform|bereit|vert|valide|autoris[ée]e?s?|conforme|prêt\w*)\b|w porządku|in Ordnung/i;

describe('LicencePage', () => {
  it('shows the static explanation before anything is entered, and no result', () => {
    render(<LicencePage fetcherFor={() => new MapFetcher({})} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Licence check' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What this checks' })).toBeTruthy();
    expect(screen.queryByTestId('licence-result')).toBeNull();
    expect(document.title).toBe("Licence check: compare a dataset's licence across metadata sources — Abyssal Claims Tools");
  });

  it('offers the same browser / server choice as /check, browser first', () => {
    render(<LicencePage fetcherFor={() => new MapFetcher({})} />);
    expect((screen.getByLabelText('In my browser only') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Via the Abyssal Claims server') as HTMLInputElement).checked).toBe(false);
  });

  it('asks for a reference instead of loading nothing', () => {
    render(<LicencePage fetcherFor={() => new MapFetcher({})} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare licences' }));
    expect(screen.getByRole('alert').textContent).toBe('Add at least one reference.');
  });

  it('sources agree: ISO and DataCite are two sources, no contradiction', async () => {
    const { refs, fetcher } = caseA();
    const result = await run(fetcher, refs);
    const text = result.textContent ?? '';
    expect(text).toContain('No contradiction among 2 sources');
    expect(text).toContain('CC-BY-4.0 (Creative Commons Attribution 4.0 International)');
    expect(text).toContain('CC BY 4.0');
    expect(result.querySelector('a[href="https://creativecommons.org/licenses/by/4.0/"]')).toBeTruthy();
    expect(text).not.toContain('missing');
    expect(screen.getByTestId('attribution').textContent).toBe(
      'Kowalska, Anna; Nowak, Jan (2024). Synthetic CTD profiles from a test cruise. Example Data Repository. https://doi.org/10.0000/synthetic.a Licence: Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/legalcode).',
    );
  });

  it('text and link disagree: the rule text is shown, the licence is left out of the attribution with a reason', async () => {
    const { refs, fetcher } = caseB();
    const result = await run(fetcher, refs);
    const text = result.textContent ?? '';
    expect(text).toContain('Contradictions found: 1');
    expect(text).toContain('The licence text ("CC BY-NC 4.0") and its link point to different licences');
    expect(text).toContain('unrecognised — check manually');
    expect(text).not.toContain('No contradiction');
    const attr = screen.getByTestId('attribution').textContent ?? '';
    expect(attr).toBe('Smith, Alex (2023). Synthetic mooring temperature series. Example Data Repository. https://doi.org/10.0000/synthetic.b');
    expect(text).toContain('The licence is left out: the sources contradict each other.');
  });

  it('single source: nothing to compare, the licence is named; the unreadable DataCite record is "could not read", not "missing"', async () => {
    const { refs, fetcher } = caseC();
    const result = await run(fetcher, refs);
    const text = result.textContent ?? '';
    expect(text).toContain('Single source — nothing to compare');
    expect(text).toContain('could not read');
    expect(text).not.toContain('missing');
    expect(text).toContain('At least one source could not be read');
    expect(screen.getByTestId('attribution').textContent).toBe(
      'Dupont, Marie (2022). Synthetic plankton counts. Zenodo. https://doi.org/10.5281/zenodo.3000001 Licence: Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/legalcode).',
    );
  });

  it('an unreadable source next to a readable one: "could not read" with the reason, never "missing", no comparison claimed', async () => {
    const zen = zenodoJson('3000002', { doi: '10.5281/zenodo.3000002', title: 'T' }, { id: 'cc-by-4.0' });
    const f = new MapFetcher({
      [ZEN + '3000002']: zen,
      [DC + '10.5281/zenodo.3000002']: dataciteJson({ doi: '10.5281/zenodo.3000002' }, [{ rightsIdentifier: 'cc-by-4.0' }]),
      [GN(UUID)]: { status: 403 },
    });
    const result = await run(f, ['3000002', `https://geonetwork.iopan.pl/geonetwork/srv/api/records/${UUID}`]);
    const text = result.textContent ?? '';
    expect(text).toContain('could not read');
    expect(text).toContain('HTTP 403');
    expect(text).not.toMatch(/missing/);
    expect(text).toContain('Single source — nothing to compare');
    expect(text).not.toContain('No contradiction');
  });

  it('a reference that is not a reference is listed as such', async () => {
    const result = await run(new MapFetcher({}), ['hello world']);
    expect(result.textContent).toContain('hello world');
    expect(result.textContent).toContain('This is not a DOI');
    expect(result.textContent).not.toContain('missing');
  });

  it('a blocked download offers the switch to server mode, like /check', async () => {
    const blocked: Fetcher = { get: async () => Promise.reject(new FetchBlockedError('api.datacite.org')) };
    const result = await run(blocked, ['10.0000/x']);
    expect(result.textContent).toContain('could not read');
    expect(result.textContent).toContain('Your browser could not reach api.datacite.org');
    expect(result.textContent).not.toMatch(/drop them here|missing/);
    fireEvent.click(screen.getByRole('button', { name: /server/i }));
    expect((screen.getByLabelText('Via the Abyssal Claims server') as HTMLInputElement).checked).toBe(true);
  });

  it('dual licensing in one source is not a contradiction; the attribution leaves the licence out', async () => {
    const c = { doi: '10.0000/dual', title: 'Dual', creators: ['A, B'], year: 2021, publisher: 'P' };
    const f = new MapFetcher({
      [DC + c.doi]: dataciteJson({ ...c, url: 'https://repository.example.org/d' }, [{ rightsIdentifier: 'cc-by-4.0' }, { rightsIdentifier: 'cc0-1.0' }]),
    });
    const result = await run(f, [c.doi]);
    const text = result.textContent ?? '';
    expect(text).not.toContain('Contradictions found');
    expect(text).toContain('Single source — nothing to compare');
    expect(text).toContain('The licence is left out: more than one licence is recognised across the sources.');
    expect(screen.getByTestId('attribution').textContent).not.toContain('Licence:');
  });

  it('Zenodo and its DataCite record are one deposit: agreement counts once and the page says so; a DOI and a Zenodo link give each source once', async () => {
    const c = { doi: '10.5281/zenodo.3000003', title: 'Same', creators: ['A, B'], year: 2020, publisher: 'Zenodo', url: 'https://zenodo.org/records/3000003' };
    const f = new MapFetcher({
      [ZEN + '3000003']: zenodoJson('3000003', c, { id: 'cc-by-4.0' }),
      [DC + c.doi]: dataciteJson(c, [{ rightsIdentifier: 'cc-by-4.0', rightsUri: 'https://creativecommons.org/licenses/by/4.0/legalcode' }]),
    });
    const result = await run(f, [c.doi, 'https://zenodo.org/records/3000003']);
    const text = result.textContent ?? '';
    expect(text).toContain('Single source — nothing to compare');
    expect(text).not.toContain('No contradiction among');
    expect(text).toContain('one deposit');
    expect(result.querySelectorAll('.licence-source').length).toBe(2);
    expect(f.calls.filter((u) => u === ZEN + '3000003').length).toBe(1);
  });

  it('a DOI of a GeoNetwork record looks up DataCite only once; a GeoNetwork link with a DOI-less ISO record asks for none', async () => {
    const c = { doi: '10.0000/synthetic.a' };
    const { fetcher } = caseA();
    await run(fetcher, [c.doi, `https://geonetwork.iopan.pl/geonetwork/srv/api/records/${UUID}`]);
    expect(fetcher.calls.filter((u) => u === DC + c.doi).length).toBe(1);
  });

  it('copy button writes exactly the attribution text and confirms', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { refs, fetcher } = caseA();
    await run(fetcher, refs);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(screen.getByText('Copied to the clipboard.')).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith(screen.getByTestId('attribution').textContent);
  });

  it('copy failure is said, not hidden', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => Promise.reject(new Error('no')) }, configurable: true });
    const { refs, fetcher } = caseA();
    await run(fetcher, refs);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(screen.getByText(/Copying did not work here/)).toBeTruthy());
  });

  it('the attribution is English in every UI language; the interface is not', async () => {
    const { refs, fetcher } = caseA();
    const result = await run(fetcher, refs, 'pl');
    expect(screen.getByTestId('attribution').textContent).toContain('Licence: Creative Commons Attribution 4.0 International');
    expect(result.textContent).toContain('Brak sprzeczności między 2 źródłami');
  });

  it('never says green, OK, valid, allowed, compliant or ready (nor their translations), in any language and any case', async () => {
    const cases = [caseA, caseB, caseC];
    for (const lang of LANGS) {
      for (const make of cases) {
        const { refs, fetcher } = make();
        const { container, unmount } = (() => {
          setLang(lang);
          return render(<LicencePage fetcherFor={() => fetcher} />);
        })();
        fireEvent.change(screen.getByRole('textbox'), { target: { value: refs.join('\n') } });
        fireEvent.submit(container.querySelector('form')!);
        await waitFor(() => screen.getByTestId('licence-result'));
        const text = container.textContent ?? '';
        expect(text, `${lang} ${make.name}`).not.toMatch(FORBIDDEN);
        unmount();
      }
    }
  });
});

describe('home page', () => {
  it('has a licence card next to the data check card', () => {
    render(<IndexPage />);
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toContain('/check');
    expect(links).toContain('/licence');
    expect(screen.getByRole('heading', { name: 'Licence check' })).toBeTruthy();
  });
});
