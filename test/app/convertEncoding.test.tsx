// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Round 4, Task 6, on the page: a file whose 8-bit letters read differently in windows-1250, ISO-8859-2 and windows-1252 is asked about (one button per reading, each showing its words, none picked),
// the answer is the person's own and is sent to the worker by file, "Ask again" takes it back, and the companion file keeps it under the hash of the file's bytes. Every value is invented.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { bytesHash, keyHashes } from '../../src/core/convert/keySetting';
import { writeConvertSidecar } from '../../src/core/convert/settings';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import type { ConvertEngine } from '../../src/worker/convert.protocol';

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

// bytes of a windows-1252 file: \xf8 is ø there, ř in windows-1250 and ISO-8859-2; \xe8 is è, č, č
const latin = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
const HEADER = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count', 'Kr\xf8yer'];
const CSV = [HEADER.join(';'), 'S1;k1;2023-06-14;55,5;3,5;Calanus finmarchicus;4;S\xe8vre', 'S2;k2;2023-06-14;56,5;3,5;Calanus finmarchicus;5;S\xe8vre'].join('\n') + '\n';

interface Run {
  calls: (string | null)[];
  download: ReturnType<typeof vi.fn>;
}

async function load(files: { name: string; bytes: Uint8Array }[]): Promise<Run> {
  const base = createDirectConvertEngine();
  const calls: Run['calls'] = [];
  const engine: ConvertEngine = { ...base, encodingChoice: (fileId, encoding) => (calls.push(encoding), base.encodingChoice(fileId, encoding)) };
  const download = vi.fn();
  const view = render(<ConvertPage engine={engine} download={download} downloadFile={vi.fn()} />);
  fireEvent.change(view.container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: files.map((f) => new File([f.bytes as BlobPart], f.name, { type: 'text/csv' })) } });
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  const confirm = screen.queryByRole('button', { name: /Confirm all shown/ });
  if (confirm !== null) fireEvent.click(confirm);
  for (const kind of screen.queryAllByLabelText(T['convert.quantity.kind'])) fireEvent.change(kind, { target: { value: 'count' } });
  await idle();
  return { calls, download };
}

const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const item = (rule: string): HTMLElement | null => document.querySelector(`li[data-rule="${rule}"]`);
const readings = (): HTMLElement[] => within(item('IN-ENCODING-AMBIGUOUS')!).getAllByTestId('encoding-reading');
const roleOf = (h: string) => (screen.getByLabelText(`${h}: Meaning`) as HTMLSelectElement).value;

describe('the question', () => {
  it('one button per reading, each showing its encodings and its words, none picked; the finding is in the blocking list until a reading is picked', async () => {
    await load([{ name: 'hauls.csv', bytes: latin(CSV) }]);
    const b = readings();
    expect(b).toHaveLength(2);
    expect(b[0].textContent).toBe('Read as windows-1250, ISO-8859-2: Krřyer, Sčvre');
    expect(b[1].textContent).toBe('Read as windows-1252: Krøyer, Sèvre');
    expect(b.every((x) => !x.hasAttribute('aria-pressed') && !x.hasAttribute('disabled'))).toBe(true);
    expect(item('CONV-ENCODING-DECLARED')).toBeNull();
    expect(item('IN-ENCODING-AMBIGUOUS')?.closest('.convert-findings')?.getAttribute('data-kind')).toBe('error');
    fireEvent.click(b[1]);
    await waitFor(() => expect(item('CONV-ENCODING-DECLARED')).not.toBeNull());
    await idle();
    expect(item('IN-ENCODING-AMBIGUOUS')).toBeNull();
    expect(document.querySelectorAll('.convert-findings[data-kind="error"] li[data-rule="IN-ENCODING-AMBIGUOUS"]')).toHaveLength(0);
    expect(item('CONV-ENCODING-DECLARED')?.closest('.convert-findings')?.getAttribute('data-kind')).toBe('info');
  });

  it('a file all the code pages read alike is not asked', async () => {
    await load([{ name: 'hauls.csv', bytes: latin(CSV.replace('Kr\xf8yer', 'M\xfcller').replace(/S\xe8vre/g, 'Caf\xe9')) }]);
    expect(item('IN-ENCODING-AMBIGUOUS')).toBeNull();
    expect(screen.queryAllByTestId('encoding-reading')).toHaveLength(0);
  });

  it('a reading is sent to the worker; the question becomes CONV-ENCODING-DECLARED and the column shows the picked reading; "Ask again" takes it back', async () => {
    const run = await load([{ name: 'hauls.csv', bytes: latin(CSV) }]);
    expect(screen.queryByLabelText('Krøyer: Meaning')).toBeNull();
    fireEvent.click(readings()[1]);
    await waitFor(() => expect(item('CONV-ENCODING-DECLARED')).not.toBeNull());
    await idle();
    expect(run.calls).toEqual(['windows-1252']);
    expect(item('IN-ENCODING-AMBIGUOUS')).toBeNull();
    expect(screen.getByLabelText('Krøyer: Meaning')).not.toBeNull();
    expect(screen.queryByLabelText('Krřyer: Meaning')).toBeNull();
    fireEvent.click(within(item('CONV-ENCODING-DECLARED')!).getByRole('button', { name: T['convert.finding.askAgain'] }));
    await waitFor(() => expect(item('IN-ENCODING-AMBIGUOUS')).not.toBeNull());
    await idle();
    expect(run.calls).toEqual(['windows-1252', null]);
    expect(item('CONV-ENCODING-DECLARED')).toBeNull();
    expect(screen.getByLabelText('Krřyer: Meaning')).not.toBeNull();
  });

  it('the first reading sends its first encoding', async () => {
    const run = await load([{ name: 'hauls.csv', bytes: latin(CSV) }]);
    fireEvent.click(readings()[0]);
    await waitFor(() => expect(item('CONV-ENCODING-DECLARED')).not.toBeNull());
    expect(run.calls).toEqual(['windows-1250']);
  });
});

describe('answering does not reset the sheet', () => {
  it('a role the person changed survives the pick and taking it back', async () => {
    await load([{ name: 'hauls.csv', bytes: latin(CSV) }]);
    fireEvent.change(screen.getByLabelText('Station: Meaning'), { target: { value: 'ignore' } });
    fireEvent.change(screen.getByLabelText('Krřyer: Meaning'), { target: { value: 'ignore' } });
    await idle();
    fireEvent.click(readings()[1]);
    await waitFor(() => expect(item('CONV-ENCODING-DECLARED')).not.toBeNull());
    await idle();
    expect(roleOf('Station')).toBe('ignore');
    expect(roleOf('Krøyer')).toBe('ignore');
    fireEvent.click(within(item('CONV-ENCODING-DECLARED')!).getByRole('button', { name: T['convert.finding.askAgain'] }));
    await waitFor(() => expect(item('IN-ENCODING-AMBIGUOUS')).not.toBeNull());
    await idle();
    expect(roleOf('Station')).toBe('ignore');
    expect(roleOf('Krřyer')).toBe('ignore');
  });
});

describe('the companion file', () => {
  const hash = bytesHash(latin(CSV));
  const sidecar = (h = hash) => latin(writeConvertSidecar({ encoding: [{ encoding: 'windows-1252', hash: h }] }));

  it('writes the pick as a code page and the hash of the bytes, never a word of the file', async () => {
    const run = await load([{ name: 'hauls.csv', bytes: latin(CSV) }]);
    fireEvent.click(readings()[1]);
    await waitFor(() => expect(item('CONV-ENCODING-DECLARED')).not.toBeNull());
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const text = run.download.mock.calls[0][0] as string;
    expect(text).toContain(`encoding=windows-1252:${hash}`);
    expect(text).not.toMatch(/Kr|S.vre/);
  });

  it('is applied for the same bytes ("from the file", with "Ask again") and the question stays open for a changed file', async () => {
    await load([{ name: 'hauls.csv', bytes: latin(CSV) }, { name: 'c.csv', bytes: sidecar() }]);
    await waitFor(() => expect(item('CONV-ENCODING-DECLARED')?.textContent).toContain('companion file'));
    expect(item('IN-ENCODING-AMBIGUOUS')).toBeNull();
    fireEvent.click(within(item('CONV-ENCODING-DECLARED')!).getByRole('button', { name: T['convert.finding.askAgain'] }));
    await waitFor(() => expect(item('IN-ENCODING-AMBIGUOUS')).not.toBeNull());
    cleanup();
    await load([{ name: 'hauls.csv', bytes: latin(CSV.replace('S1;', 'S9;')) }, { name: 'c.csv', bytes: sidecar() }]);
    expect(item('IN-ENCODING-AMBIGUOUS')).not.toBeNull();
    expect(item('CONV-ENCODING-DECLARED')).toBeNull();
  });
});

describe('a name that came from the header follows it; a name the person typed stays', () => {
  const nameInput = (): HTMLInputElement => screen.getByLabelText(T['mapping.variable']) as HTMLInputElement;

  it('the variable name of a column set to variable takes the header the pick reads, and goes back with "Ask again"', async () => {
    await load([{ name: 'hauls.csv', bytes: latin(CSV) }]);
    fireEvent.change(screen.getByLabelText('Krřyer: Meaning'), { target: { value: 'variable' } });
    await idle();
    expect(nameInput().value).toBe('Krřyer');
    fireEvent.click(readings()[1]);
    await waitFor(() => expect(item('CONV-ENCODING-DECLARED')).not.toBeNull());
    await idle();
    expect(roleOf('Krøyer')).toBe('variable');
    expect(nameInput().value).toBe('Krøyer');
    fireEvent.click(within(item('CONV-ENCODING-DECLARED')!).getByRole('button', { name: T['convert.finding.askAgain'] }));
    await waitFor(() => expect(item('IN-ENCODING-AMBIGUOUS')).not.toBeNull());
    await idle();
    expect(nameInput().value).toBe('Krřyer');
  });

  it('a name the person typed stays', async () => {
    await load([{ name: 'hauls.csv', bytes: latin(CSV) }]);
    fireEvent.change(screen.getByLabelText('Krřyer: Meaning'), { target: { value: 'variable' } });
    await idle();
    fireEvent.change(nameInput(), { target: { value: 'Water clarity' } });
    fireEvent.click(readings()[1]);
    await waitFor(() => expect(item('CONV-ENCODING-DECLARED')).not.toBeNull());
    await idle();
    expect(nameInput().value).toBe('Water clarity');
  });
});

describe('what the re-read changes in the answers keyed by the header text or the column number', () => {
  const DATES = [HEADER.join(';'), 'S1;k1;03/04/2023;55,5;3,5;Calanus finmarchicus;4;S\xe8vre', 'S2;k2;05/06/2023;56,5;3,5;Calanus finmarchicus;5;S\xe8vre'].join('\n') + '\n';

  async function loadWith(files: { name: string; bytes: Uint8Array }[], change: (f: Awaited<ReturnType<ConvertEngine['encodingChoice']>>) => Awaited<ReturnType<ConvertEngine['encodingChoice']>>): Promise<void> {
    const base = createDirectConvertEngine();
    const engine: ConvertEngine = { ...base, encodingChoice: async (fileId, encoding) => change(await base.encodingChoice(fileId, encoding)) };
    const view = render(<ConvertPage engine={engine} download={vi.fn()} downloadFile={vi.fn()} />);
    fireEvent.change(view.container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: files.map((f) => new File([f.bytes as BlobPart], f.name)) } });
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    await idle();
  }

  it('a day/month order the companion file gave for a header hash loses its label when the pick changes the text of that header', async () => {
    const asRead = HEADER.map((h) => h.replace('\xf8', 'ř'));
    const sidecar = latin(writeConvertSidecar({ dayMonthOrder: [{ sheet: 'hauls.csv', order: 'dmy', hash: keyHashes(asRead, [2]) as string, rows: 2 }] }));
    // the date column is only recognised under its plain name, so the pick is made to read that header another way in the summary the worker returns
    await loadWith([{ name: 'hauls.csv', bytes: latin(DATES) }, { name: 'c.csv', bytes: sidecar }], (f) => ({ ...f, sheets: [{ ...f.sheets[0], header: f.sheets[0].header.map((h, i) => (i === 2 ? `${h}.` : h)) }] }));
    await waitFor(() => expect(item('CONV-DATE-ORDER-DECLARED')?.textContent).toContain('companion file'));
    fireEvent.click(readings()[1]);
    await waitFor(() => expect(item('CONV-ENCODING-DECLARED')).not.toBeNull());
    await idle();
    await waitFor(() => expect(item('CONV-DATE-ORDER-DECLARED')?.textContent).not.toContain('companion file'));
    expect(item('CONV-DATE-ORDER-DECLARED')).not.toBeNull();
  });

  it('a sheet whose number of columns changed under the pick starts again and the page says so', async () => {
    await loadWith([{ name: 'hauls.csv', bytes: latin(CSV) }], (f) => {
      const sheet = f.sheets[0].name;
      const index = f.sheets[0].header.length;
      return {
        ...f,
        sheets: [{ ...f.sheets[0], header: [...f.sheets[0].header, 'Extra'] }],
        mappings: [{ sheet, columns: [...f.mappings[0].columns, { index, header: 'Extra', role: { kind: 'ignore' } }] }],
        proposals: { [sheet]: [...f.proposals[sheet], { index, header: 'Extra', cleanHeader: 'Extra', role: { kind: 'ignore' }, confidence: 'high', reason: 'x', reasonCode: 'text-column' } as never] },
        samples: { [sheet]: [...f.samples[sheet], []] },
      };
    });
    fireEvent.change(screen.getByLabelText('Station: Meaning'), { target: { value: 'ignore' } });
    await idle();
    expect(screen.queryByTestId('encoding-sheet-reset')).toBeNull();
    fireEvent.click(readings()[1]);
    await waitFor(() => expect(item('CONV-ENCODING-DECLARED')).not.toBeNull());
    await idle();
    expect(screen.getByTestId('encoding-sheet-reset').textContent).toContain('hauls.csv: hauls.csv');
    expect(roleOf('Station')).not.toBe('ignore');
  });
});
