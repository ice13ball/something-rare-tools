// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Stage 3 on the page: the description is prefilled from metadata files dropped with the data, each value shows its source; where files disagree the user
// chooses; the licence has its four cases; a typed field is never overwritten; the metadata file is listed apart and never a data sheet; the archive carries the
// prefilled values and the citation; and the drop of a metadata file makes no request. Synthetic metadata only.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { grantConsent } from '../../src/app/analytics';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { EMPTY_METADATA } from '../../src/core/convert/metadata';
import { UI, translate } from '../../src/core/i18n/ui';
import { openZip } from '../../src/core/parse/zip';
import { LANGS } from '../../src/core/types';
import { createConvertHandler, createDirectConvertEngine } from '../../src/worker/convert.handler';
import { BASE, CONTRADICTING, dataciteJson, dataciteXml, isoXml, zenodoJson } from '../convert/metaFixtures';
import { nodeInflate } from '../helpers/zipfile';
import { W1_CSV, chooseFiles } from './convertHelpers';

vi.setConfig({ testTimeout: 30_000 });
const T = UI.en;

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

type F = { name: string; text: string };
const DATA: F = { name: 'w1.csv', text: W1_CSV };
const BAY: F = { name: 'bay.datacite.xml', text: dataciteXml({ contacts: ['Example, Anna'], licence: 'CC-BY-4.0', collected: '2019-06-01/2019-06-30', box: { west: 3, east: 5, south: 54, north: 56 } }) };

const input = (label: string): HTMLInputElement => screen.getByLabelText(label) as HTMLInputElement;
const field = (label: string): HTMLElement => screen.getByLabelText(label).closest('.field') as HTMLElement;
const summary = (): HTMLElement => screen.getByRole('region', { name: T['convert.summary.title'] });
const settled = async (text: string): Promise<void> => void (await waitFor(() => expect(summary().textContent).toContain(text)));
const pick = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const typeInto = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));

async function read(view: { container: HTMLElement }, files: F[]): Promise<void> {
  chooseFiles(view.container, files);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
}

async function load(files: F[], lang: (typeof LANGS)[number] = 'en'): Promise<{ container: HTMLElement; engine: ReturnType<typeof createDirectConvertEngine> }> {
  setLang(lang);
  const engine = createDirectConvertEngine();
  const view = render(<ConvertPage engine={engine} download={vi.fn()} downloadFile={vi.fn()} />);
  chooseFiles(view.container, files);
  fireEvent.click(screen.getByRole('button', { name: UI[lang]['convert.read'] }));
  await screen.findByRole('heading', { name: UI[lang]['convert.columns.title'] });
  return { container: view.container, engine };
}

describe('the metadata file is listed apart and is never a data sheet', () => {
  it('the worker keeps it out of the sheets, lists it, and reads the description from it', async () => {
    const h = createConvertHandler();
    const r = (await Promise.resolve(h.handle({ type: 'parse', files: [DATA, BAY].map((f) => ({ name: f.name, bytes: new TextEncoder().encode(f.text), source: 'dropped' as const })) }))) as import('../../src/worker/convert.protocol').ConvertParseResult;
    expect(r.files.map((f) => f.fileName)).toEqual(['w1.csv']);
    expect(r.metadataFiles).toEqual(['bay.datacite.xml']);
    expect(r.notRead).toEqual([]);
    expect(r.prefillInfo?.files).toEqual([{ fileName: 'bay.datacite.xml', kind: 'DataCite' }]);
    expect(r.prefill).toMatchObject({ title: BASE.title, licence: 'CC-BY-4.0', contactName: 'Example, Anna' });
  });

  it('the page lists it under its own heading as a "metadata file", with an ⓘ, and the column review shows only the data sheet', async () => {
    await load([DATA, BAY]);
    const section = screen.getByRole('heading', { name: T['convert.metafiles.title'] }).closest('section') as HTMLElement;
    expect(section.textContent).toContain('bay.datacite.xml: metadata file (DataCite)');
    expect(section.querySelector('[data-tip="convertMetaFiles"]')).toBeTruthy();
    expect(within(section).queryByRole('heading', { level: 3 })).toBeNull();
    const columns = (screen.getByRole('heading', { name: T['convert.columns.title'] }).closest('section') as HTMLElement).textContent as string;
    expect(columns).toContain('w1.csv');
    expect(columns).not.toContain('bay.datacite.xml');
    // no metadata file, no section
  });

  it('no metadata file: no section, no source note, no licence note', async () => {
    await load([DATA]);
    expect(screen.queryByRole('heading', { name: T['convert.metafiles.title'] })).toBeNull();
    expect(document.querySelector('.convert-meta-note')).toBeNull();
    expect(document.querySelector('.convert-licence-note')).toBeNull();
    expect(input(T['convert.meta.f.title']).value).toBe('');
    expect((screen.getByLabelText(T['convert.meta.f.licence']) as HTMLSelectElement).value).toBe('');
  });
});

describe('the prefill and its sources', () => {
  it('fills title, abstract, creators, contact name, citation and the licence; each shows its file and field; the form asks for what is missing', async () => {
    await load([DATA, BAY]);
    expect(input(T['convert.meta.f.title']).value).toBe(BASE.title);
    expect(field(T['convert.meta.f.title']).textContent).toContain('From your metadata: bay.datacite.xml, titles');
    expect(input(T['convert.meta.f.abstract']).value).toBe(BASE.abstract);
    expect(field(T['convert.meta.f.abstract']).textContent).toContain('bay.datacite.xml, descriptions');
    expect(input(T['convert.meta.f.creators']).value).toBe('Example, Anna\nSample, Boris');
    expect(field(T['convert.meta.f.creators']).textContent).toContain('bay.datacite.xml, creators');
    expect(input(T['convert.meta.f.contactName']).value).toBe('Example, Anna');
    expect(field(T['convert.meta.f.contactName']).textContent).toContain('bay.datacite.xml, contributors (ContactPerson)');
    expect(input(T['convert.meta.f.citation']).value).toBe(`Example, Anna; Sample, Boris (2020). ${BASE.title}. Example Marine Laboratory. https://doi.org/10.0000/synthetic.convert.1`);
    expect(field(T['convert.meta.f.citation']).textContent).toContain('bay.datacite.xml, creators, titles, publisher, identifier');
    // every field is still shown; the ones no file has are marked as missing and stay empty
    expect(input(T['convert.meta.f.contactEmail']).value).toBe('');
    expect(field(T['convert.meta.f.contactEmail']).textContent).toContain(T['convert.meta.src.missing']);
    expect(input(T['convert.meta.f.institution']).value).toBe('');
    expect((screen.getByLabelText(T['convert.meta.f.basis']) as HTMLSelectElement).value).toBe('');
  });

  it('the licence is taken (CC-BY-4.0) with its source, and can be changed; after the change the note no longer claims it', async () => {
    await load([DATA, BAY]);
    const select = screen.getByLabelText(T['convert.meta.f.licence']) as HTMLSelectElement;
    expect(select.value).toBe('CC-BY-4.0');
    const note = field(T['convert.meta.f.licence']);
    expect(note.textContent).toContain('Taken from your metadata: CC-BY-4.0 (bay.datacite.xml, rightsList[0]). You can change it.');
    expect(note.querySelector('[data-tip="convertLicenceTaken"]')).toBeTruthy();
    pick(T['convert.meta.f.licence'], 'CC0-1.0');
    expect(field(T['convert.meta.f.licence']).textContent).not.toContain('Taken from your metadata');
    expect(select.value).toBe('CC0-1.0');
  });

  it('a value shown with its source loses the note when the text is changed', async () => {
    await load([DATA, BAY]);
    typeInto(T['convert.meta.f.title'], 'My own title');
    expect(field(T['convert.meta.f.title']).textContent).not.toContain('From your metadata');
  });

  it('the coverage the metadata state is shown for information, and says it is not what the archive writes', async () => {
    await load([DATA, BAY]);
    const cov = document.querySelector('.convert-coverage') as HTMLElement;
    expect(cov.textContent).toContain('bay.datacite.xml: period 2019-06-01 to 2019-06-30; area west 3, east 5, south 54, north 56');
    expect(cov.textContent).toContain('always computed from your data');
    expect(cov.querySelector('[data-tip="convertMetaCoverage"]')).toBeTruthy();
  });

  it('an ISO 19139 record gives the contact e-mail too, with its source', async () => {
    await load([DATA, { name: 'iso.xml', text: isoXml({ contactName: 'Anna Example', email: 'anna@example.org', author: 'Anna Example' }) }]);
    expect(input(T['convert.meta.f.contactEmail']).value).toBe('anna@example.org');
    expect(field(T['convert.meta.f.contactEmail']).textContent).toContain('iso.xml, pointOfContact');
  });
});

describe('files that disagree: a choice, never a silent pick', () => {
  const ZEN: F = { name: 'bay.zenodo.json', text: zenodoJson({ title: 'A different title of the same invented dataset', creators: ['Sample, Boris'], licence: 'CC-BY-4.0', doi: '10.0000/synthetic.convert.2' }) };

  it('lists each value with its file, fills nothing, and "Use this" fills it', async () => {
    await load([DATA, BAY, ZEN]);
    expect(input(T['convert.meta.f.title']).value).toBe('');
    const box = within(field(T['convert.meta.f.title'])).getByRole('group', { name: T['convert.meta.src.choose.label'] });
    expect(box.textContent).toContain(BASE.title);
    expect(box.textContent).toContain('A different title of the same invented dataset');
    expect(box.textContent).toContain('bay.datacite.xml, titles');
    expect(box.textContent).toContain('bay.zenodo.json, metadata.title');
    expect(box.querySelector('[data-tip="convertMetaChoice"]')).toBeTruthy();
    // what they agree on is filled: the abstract and (both say CC-BY-4.0) the licence, from both files
    expect(input(T['convert.meta.f.abstract']).value).toBe(BASE.abstract);
    expect(field(T['convert.meta.f.abstract']).textContent).toContain('bay.datacite.xml, descriptions; bay.zenodo.json, metadata.description');
    expect(field(T['convert.meta.f.licence']).textContent).toContain('bay.datacite.xml, rightsList[0]; bay.zenodo.json, license.id');
    fireEvent.click(within(box).getByRole('button', { name: 'Use "A different title of the same invented dataset" from bay.zenodo.json, metadata.title' }));
    expect(input(T['convert.meta.f.title']).value).toBe('A different title of the same invented dataset');
    const after = within(field(T['convert.meta.f.title'])).getByRole('group', { name: T['convert.meta.src.choose.label'] });
    expect(after.textContent).toContain(T['convert.meta.src.used']);
    // the user can still edit what they chose
    typeInto(T['convert.meta.f.title'], 'Edited after choosing');
    expect(input(T['convert.meta.f.title']).value).toBe('Edited after choosing');
  });

  it('two contacts in ONE file are a neutral list ("lists 2 contacts"), not a disagreement; one choice fills name and e-mail together', async () => {
    const two = { name: 'two.iso.xml', text: isoXml({ contacts: [{ name: 'Anna Example', email: 'anna@example.org' }, { name: 'Boris Sample', email: 'boris@example.org' }] }) };
    await load([DATA, two]);
    expect(input(T['convert.meta.f.contactName']).value).toBe('');
    const group = screen.getByRole('group', { name: T['convert.meta.src.list.label'] });
    expect(group.textContent).toContain('two.iso.xml lists 2 contacts. Choose one:');
    expect(group.textContent).not.toContain('different values');
    expect(group.querySelector('[data-tip="convertMetaList"]')).toBeTruthy();
    expect(screen.queryByRole('group', { name: T['convert.meta.src.choose.label'] })).toBeNull();
    fireEvent.click(within(group).getByRole('button', { name: 'Use "Boris Sample, boris@example.org" from two.iso.xml, pointOfContact' }));
    expect(input(T['convert.meta.f.contactName']).value).toBe('Boris Sample');
    expect(input(T['convert.meta.f.contactEmail']).value).toBe('boris@example.org');
  });

  it('a DataCite file with two ContactPersons is the same list; a list of seven shows the first five and "Show all 7"', async () => {
    await load([DATA, { name: 'two.datacite.xml', text: dataciteXml({ contacts: ['Example, Anna', 'Sample, Boris'] }) }]);
    expect(screen.getByRole('group', { name: T['convert.meta.src.list.label'] }).textContent).toContain('two.datacite.xml lists 2 contacts');
    cleanup();
    const seven = Array.from({ length: 7 }, (_, i) => `Person${i + 1}, Test`);
    await load([DATA, { name: 'seven.datacite.xml', text: dataciteXml({ contacts: seven }) }]);
    const group = screen.getByRole('group', { name: T['convert.meta.src.list.label'] });
    expect(within(group).getAllByRole('listitem')).toHaveLength(5);
    expect(group.textContent).toContain('Person5, Test');
    expect(group.textContent).not.toContain('Person6, Test');
    fireEvent.click(within(group).getByRole('button', { name: 'Show all 7' }));
    expect(within(group).getAllByRole('listitem')).toHaveLength(7);
    fireEvent.click(within(group).getByRole('button', { name: T['convert.meta.src.showFewer'] }));
    expect(within(group).getAllByRole('listitem')).toHaveLength(5);
  });

  it('exactly one contact in a file is prefilled and not asked about', async () => {
    await load([DATA, { name: 'one.datacite.xml', text: dataciteXml({ contacts: ['Example, Anna'] }) }]);
    expect(input(T['convert.meta.f.contactName']).value).toBe('Example, Anna');
    expect(screen.queryByRole('group', { name: T['convert.meta.src.list.label'] })).toBeNull();
  });
});

describe('a value of a file that differs from what the field holds stays visible, and is never applied by itself', () => {
  it('typing over a prefilled title shows "Your file X says: ..." with "Use this"; using it restores the file value', async () => {
    await load([DATA, BAY]);
    typeInto(T['convert.meta.f.title'], 'My own title');
    const f = field(T['convert.meta.f.title']);
    const box = within(f).getByRole('group', { name: T['convert.meta.src.choose.label'] });
    expect(box.getAttribute('data-mode')).toBe('differs');
    expect(box.textContent).toContain('Your file bay.datacite.xml, titles says:');
    expect(box.textContent).toContain(BASE.title.slice(0, 40));
    expect(input(T['convert.meta.f.title']).value).toBe('My own title');
    fireEvent.click(within(box).getByRole('button', { name: new RegExp(`^Use ".*" from bay.datacite.xml, titles$`) }));
    expect(input(T['convert.meta.f.title']).value).toBe(BASE.title);
    expect(within(field(T['convert.meta.f.title'])).queryByRole('group', { name: T['convert.meta.src.choose.label'] })).toBeNull();
  });

  it('every field: abstract, creators, citation and the contact show their file value when the field differs', async () => {
    await load([DATA, BAY]);
    typeInto(T['convert.meta.f.abstract'], 'My abstract');
    typeInto(T['convert.meta.f.creators'], 'Me Myself');
    typeInto(T['convert.meta.f.citation'], 'My citation.');
    typeInto(T['convert.meta.f.contactName'], 'Someone Else');
    for (const label of [T['convert.meta.f.abstract'], T['convert.meta.f.creators'], T['convert.meta.f.citation']]) {
      expect(within(field(label)).getByRole('group', { name: T['convert.meta.src.choose.label'] }).getAttribute('data-mode'), label).toBe('differs');
    }
    const contact = screen.getAllByRole('group', { name: T['convert.meta.src.choose.label'] }).find((g) => g.textContent?.includes('contributors (ContactPerson)')) as HTMLElement;
    expect(contact.textContent).toContain('Example, Anna');
    fireEvent.click(within(contact).getByRole('button', { name: /^Use "Example, Anna" from/ }));
    expect(input(T['convert.meta.f.contactName']).value).toBe('Example, Anna');
  });

  it('a value equal to the file value (ignoring capitals and spacing) shows no box', async () => {
    await load([DATA, BAY]);
    typeInto(T['convert.meta.f.title'], `  ${BASE.title.toUpperCase()} `);
    expect(within(field(T['convert.meta.f.title'])).queryByRole('group', { name: T['convert.meta.src.choose.label'] })).toBeNull();
  });

  it('when the file a choice came from is removed, the remaining files\' values are offered and the current value is kept', async () => {
    const ZEN: F = { name: 'bay.zenodo.json', text: zenodoJson({ title: 'Another invented title', licence: 'CC-BY-4.0', doi: '10.0000/synthetic.convert.2' }) };
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={vi.fn()} />);
    await read(view, [DATA, BAY, ZEN]);
    fireEvent.click(screen.getByRole('button', { name: 'Use "Another invented title" from bay.zenodo.json, metadata.title' }));
    expect(input(T['convert.meta.f.title']).value).toBe('Another invented title');
    fireEvent.click(screen.getByRole('button', { name: 'Remove bay.zenodo.json' }));
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await waitFor(() => expect(within(field(T['convert.meta.f.title'])).queryByText(/different values/)).toBeNull());
    await waitFor(() => expect(within(field(T['convert.meta.f.title'])).getByRole('group', { name: T['convert.meta.src.choose.label'] }).getAttribute('data-mode')).toBe('differs'));
    expect(input(T['convert.meta.f.title']).value).toBe('Another invented title');
    expect(field(T['convert.meta.f.title']).textContent).toContain('Your file bay.datacite.xml, titles says:');
  });
});

describe('CONV-LICENCE-DIFFERS: a licence other than the one of the source needs an acknowledgement', () => {
  const group = (): HTMLElement | null => document.querySelector('[data-rule-group="CONV-LICENCE-DIFFERS"]');

  async function ready(files: F[], downloadFile = vi.fn()): Promise<void> {
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={downloadFile} />);
    await read(view, files);
    fireEvent.click(screen.getByRole('button', { name: /Confirm all shown/ }));
    pick(T['convert.quantity.kind'], 'count');
    pick(T['convert.effort.title'], 'column');
    fireEvent.click(await screen.findByRole('button', { name: /^Approve \d+ shown/ }));
    fireEvent.click(screen.getByLabelText(T['convert.fullList']));
    await settled('7 occurrences (6 present, 1 absent)');
    if (input(T['convert.meta.f.contactName']).value === '') typeInto(T['convert.meta.f.contactName'], 'Example, Anna');
    typeInto(T['convert.meta.f.contactEmail'], 'anna@example.org');
    typeInto(T['convert.meta.f.institution'], 'INVENTED');
    pick(T['convert.meta.f.basis'], 'HumanObservation');
    pick(T['convert.device.label'], 'bongo');
    typeInto(T['convert.mesh.label'], '335');
    await idle();
  }

  it('no warning while the licence is the one of the metadata; choosing another raises it, naming both; choosing it back clears it', async () => {
    await ready([DATA, BAY]);
    expect(group()).toBeNull();
    pick(T['convert.meta.f.licence'], 'CC0-1.0');
    await waitFor(() => expect(group()).toBeTruthy());
    const text = (group() as HTMLElement).textContent as string;
    expect(text).toContain('The licence chosen (CC0-1.0) differs from the one your metadata states (CC-BY-4.0). The rights holder decides which licence applies; accept this only if the rights holder has decided it.');
    pick(T['convert.meta.f.licence'], 'CC-BY-4.0');
    await waitFor(() => expect(group()).toBeNull());
  });

  it('for the "other" case too: the metadata say CC-BY-3.0 and the user chooses CC-BY-4.0 -> the warning, until it is accepted', async () => {
    const downloadFile = vi.fn();
    await ready([DATA, { name: 'old.datacite.xml', text: dataciteXml({ licence: 'CC-BY-3.0' }) }], downloadFile);
    pick(T['convert.meta.f.licence'], 'CC-BY-4.0');
    await waitFor(() => expect(group()).toBeTruthy());
    expect((group() as HTMLElement).textContent).toContain('(CC-BY-4.0) differs from the one your metadata states (CC-BY-3.0)');
    // tick every other kind, leave this one: the export stays off
    await waitFor(() => expect(document.querySelector('.convert-accept')).toBeTruthy());
    for (const box of document.querySelectorAll<HTMLInputElement>('.convert-accept [data-rule-group] input[type="checkbox"]')) {
      if (box.closest('[data-rule-group]')?.getAttribute('data-rule-group') !== 'CONV-LICENCE-DIFFERS' && !box.checked) fireEvent.click(box);
    }
    const button = screen.getByRole('button', { name: T['convert.export.button'] });
    await idle();
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(within(group() as HTMLElement).getByRole('checkbox'));
    await waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('false'));
    fireEvent.click(button);
    await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1));
  });

  it('the worker refuses the export without the acknowledgement, from the request alone', async () => {
    const h = createConvertHandler();
    const parsed = (await Promise.resolve(h.handle({ type: 'parse', files: [DATA, BAY].map((f) => ({ name: f.name, bytes: new TextEncoder().encode(f.text), source: 'dropped' as const })) }))) as import('../../src/worker/convert.protocol').ConvertParseResult;
    const f = parsed.files[0];
    const body = {
      sheets: [{ fileId: f.fileId, sheet: f.sheets[0].name, mapping: f.mappings[0], shape: 'wide' as const, quantity: { kind: 'count' as const, effort: { source: 'column' as const } } }],
      options: { fullList: true },
      approvedSplits: { 'Pseudocalanus sp.': { verbatimIdentification: 'Pseudocalanus sp.', scientificName: 'Pseudocalanus', identificationQualifier: 'sp.' } },
    };
    const meta = { ...EMPTY_METADATA, ...(parsed.prefill as object), contactEmail: 'anna@example.org', institutionCode: 'INVENTED', basisOfRecord: 'HumanObservation' as const, licence: 'CC0-1.0' as const };
    const run = (accepted: string[], sourceLicences: string[]) => Promise.resolve(h.handle({ type: 'export', export: { body, metadata: meta, accepted, sourceLicences, generated: '2026-10-25T12:00:00Z' } }));
    await expect(run(['CONV-NAMEID-MISSING', 'CONV-DEVICE-MISSING'], ['CC-BY-4.0'])).rejects.toThrow(/CONV-LICENCE-DIFFERS not accepted/);
    await expect(run(['CONV-NAMEID-MISSING', 'CONV-DEVICE-MISSING', 'CONV-LICENCE-DIFFERS'], ['CC-BY-4.0'])).resolves.toBeTruthy();
    await expect(run(['CONV-NAMEID-MISSING', 'CONV-DEVICE-MISSING'], [])).resolves.toBeTruthy();
  });
});

describe('creator lines: how each is written, shown in the form', () => {
  it('lists a person with given name and family name, and an organisation as such', async () => {
    await load([DATA, BAY]);
    typeInto(T['convert.meta.f.creators'], 'Maria de la Cruz\nde Vries\nInstytut Oceanologii PAN');
    const writes = field(T['convert.meta.f.creators']).querySelector('.convert-writes') as HTMLElement;
    expect(writes.textContent).toContain(T['convert.meta.writes.title']);
    expect(writes.textContent).toContain('Maria de la Cruz: person, given name Maria, family name de la Cruz');
    expect(writes.textContent).toContain('de Vries: person, family name de Vries');
    expect(writes.textContent).toContain('Instytut Oceanologii PAN: organisation');
  });
});

describe('archive description files dropped on /convert', () => {
  it('an eml.xml and a meta.xml are recognised by content, listed apart, and never a data sheet', async () => {
    const eml = '<?xml version="1.0" encoding="UTF-8"?>\n<eml:eml xmlns:eml="https://eml.ecoinformatics.org/eml-2.2.0" packageId="x/v1.0" system="http://gbif.org" scope="system"><dataset><title>T</title></dataset></eml:eml>\n';
    const meta = '<archive xmlns="http://rs.tdwg.org/dwc/text/" metadata="eml.xml"><core encoding="UTF-8" rowType="http://rs.tdwg.org/dwc/terms/Event"><files><location>event.txt</location></files><id index="0"/></core></archive>\n';
    await load([DATA, { name: 'eml.xml', text: eml }, { name: 'meta.xml', text: meta }]);
    const section = screen.getByRole('heading', { name: T['convert.archdesc.title'] }).closest('section') as HTMLElement;
    expect(section.textContent).toContain('eml.xml: archive description (EML), not read as data');
    expect(section.textContent).toContain('meta.xml: archive description (meta.xml), not read as data');
    expect(section.querySelector('[data-tip="convertArchiveDesc"]')).toBeTruthy();
    const columns = (screen.getByRole('heading', { name: T['convert.columns.title'] }).closest('section') as HTMLElement).textContent as string;
    expect(columns).not.toContain('eml.xml');
    expect(columns).not.toContain('meta.xml');
    expect(screen.queryByText(/could not be read as a metadata record/)).toBeNull();
    expect(screen.queryByRole('heading', { name: T['convert.metafiles.title'] })).toBeNull();
  });

  it('the worker keeps both out of the sheets and out of the prefill, whatever their names', () => {
    const h = createConvertHandler();
    const eml = '<eml:eml xmlns:eml="https://eml.ecoinformatics.org/eml-2.2.0"><dataset><title>Hidden title</title></dataset></eml:eml>';
    const r = h.handle({ type: 'parse', files: [DATA, { name: 'whatever.txt', text: eml }].map((f) => ({ name: f.name, bytes: new TextEncoder().encode(f.text), source: 'dropped' as const })) }) as import('../../src/worker/convert.protocol').ConvertParseResult;
    expect(r.files.map((f) => f.fileName)).toEqual(['w1.csv']);
    expect(r.archiveFiles).toEqual([{ fileName: 'whatever.txt', kind: 'eml' }]);
    expect(r.prefill).toEqual({});
    expect(r.problems).toEqual([]);
  });
});

describe('the German label of the bulk approval', () => {
  it('"1 gezeigten Namen bestätigen", and the forms for 1, 2 and 5', () => {
    expect(translate('de', 'convert.splits.approveAll', { n: 1 })).toBe('1 gezeigten Namen bestätigen');
    expect(translate('de', 'convert.splits.approveAll', { n: 2 })).toBe('2 gezeigten Namen bestätigen');
    expect(translate('de', 'convert.splits.approveAll', { n: 5 })).toBe('5 gezeigten Namen bestätigen');
    expect(translate('de', 'convert.splits.approveAllSkip', { n: 1, skipped: 2 })).toBe('1 gezeigten Namen bestätigen (2 mit Zweifel übersprungen)');
  });
});
describe('the licence in each case: a plain note, an ⓘ, and no prefill unless taken', () => {
  const licenceField = (): HTMLElement => field(T['convert.meta.f.licence']);
  const value = (): string => (screen.getByLabelText(T['convert.meta.f.licence']) as HTMLSelectElement).value;

  it('taken: CC0, CC BY, CC BY-NC are prefilled', async () => {
    for (const [file, id] of [
      [{ name: 'a.datacite.xml', text: dataciteXml({ licence: 'CC0-1.0' }) }, 'CC0-1.0'],
      [{ name: 'b.datacite.json', text: dataciteJson({ licence: 'CC-BY-4.0' }) }, 'CC-BY-4.0'],
      [{ name: 'c.zenodo.json', text: zenodoJson({ licence: 'CC-BY-NC-4.0' }) }, 'CC-BY-NC-4.0'],
    ] as [F, string][]) {
      cleanup();
      await load([DATA, file]);
      expect(value(), file.name).toBe(id);
      expect(licenceField().textContent).toContain(`Taken from your metadata: ${id} (${file.name}`);
    }
  });

  it('other (CC-BY-3.0): the note says what the metadata say and who decides; nothing is chosen; 3.0 is not turned into 4.0', async () => {
    await load([DATA, { name: 'old.datacite.xml', text: dataciteXml({ licence: 'CC-BY-3.0' }) }]);
    expect(value()).toBe('');
    expect(licenceField().textContent).toContain('Your metadata says "CC-BY-3.0" (old.datacite.xml, rightsList[0]). OBIS accepts only CC0, CC BY or CC BY-NC; the rights holder decides which of the three to use. Nothing was filled in: choose one.');
    expect(licenceField().querySelector('[data-tip="convertLicenceOther"]')).toBeTruthy();
  });

  it('other (CC-BY-SA-4.0 in a Zenodo record, and a free text in an ISO record)', async () => {
    await load([DATA, { name: 'sa.zenodo.json', text: zenodoJson({ licence: 'CC-BY-SA-4.0' }) }]);
    expect(value()).toBe('');
    expect(licenceField().textContent).toContain('Your metadata says "CC-BY-SA-4.0" (sa.zenodo.json, license.id)');
    cleanup();
    await load([DATA, { name: 'free.iso.xml', text: isoXml({ freeText: 'Free to use for non-commercial research; please cite the authors.' }) }]);
    expect(value()).toBe('');
    expect(licenceField().textContent).toContain('Your metadata says "Free to use for non-commercial research; please cite the authors." (free.iso.xml, useLimitation)');
  });

  it('contradictory: what each file says is listed; nothing is chosen', async () => {
    await load([DATA, { name: 'dc.xml', text: CONTRADICTING.datacite }, { name: 'zen.json', text: CONTRADICTING.zenodo }]);
    expect(value()).toBe('');
    const f = licenceField();
    expect(f.textContent).toContain('Your metadata does not give one licence. What each says:');
    expect(f.textContent).toContain('dc.xml (rightsList[0]): CC-BY-4.0');
    expect(f.textContent).toContain('zen.json (license.id): CC0-1.0');
    expect(f.textContent).toContain('Nothing was filled in: choose one of the three OBIS accepts.');
    expect(f.querySelector('[data-tip="convertLicenceContradictory"]')).toBeTruthy();
  });

  it('missing: the note just asks', async () => {
    await load([DATA, { name: 'none.datacite.xml', text: dataciteXml() }]);
    expect(value()).toBe('');
    expect(licenceField().textContent).toContain('None of your metadata files states a licence. The rights holder decides: choose one.');
    expect(licenceField().querySelector('[data-tip="convertLicenceMissing"]')).toBeTruthy();
  });

  it('the four cases read in Polish, German and French with no English sentence and no placeholder left', async () => {
    const cases: [string, F[]][] = [
      ['taken', [BAY]],
      ['other', [{ name: 'old.datacite.xml', text: dataciteXml({ licence: 'CC-BY-3.0' }) }]],
      ['contradictory', [{ name: 'dc.xml', text: CONTRADICTING.datacite }, { name: 'zen.json', text: CONTRADICTING.zenodo }]],
      ['missing', [{ name: 'none.datacite.xml', text: dataciteXml() }]],
    ];
    for (const lang of ['pl', 'de', 'fr'] as const) {
      for (const [name, files] of cases) {
        cleanup();
        await load([DATA, ...files], lang);
        const f = (screen.getByLabelText(UI[lang]['convert.meta.f.licence']).closest('.field') as HTMLElement).querySelector('.convert-licence-note') as HTMLElement;
        const text = f.textContent as string;
        expect(text, `${lang} ${name}`).not.toMatch(/[{}]/);
        expect(text, `${lang} ${name}`).not.toMatch(/\b(Your metadata|rights holder|Nothing was filled|Taken from|choose one)\b/);
      }
    }
  });
});

describe('what the user typed is never overwritten', () => {
  it('reading the files again with a metadata file keeps the typed title and fills the fields the user left alone', async () => {
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={vi.fn()} />);
    await read(view, [DATA]);
    typeInto(T['convert.meta.f.title'], 'Typed before the metadata file');
    typeInto(T['convert.meta.f.contactEmail'], 'typed@example.org');
    await read(view, [DATA, BAY]);
    expect(input(T['convert.meta.f.title']).value).toBe('Typed before the metadata file');
    expect(input(T['convert.meta.f.contactEmail']).value).toBe('typed@example.org');
    expect(input(T['convert.meta.f.abstract']).value).toBe(BASE.abstract);
    expect((screen.getByLabelText(T['convert.meta.f.licence']) as HTMLSelectElement).value).toBe('CC-BY-4.0');
  });

  it('a licence the user chose is not replaced by the one of a metadata file read later', async () => {
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={vi.fn()} />);
    await read(view, [DATA]);
    pick(T['convert.meta.f.licence'], 'CC0-1.0');
    await read(view, [DATA, BAY]);
    expect((screen.getByLabelText(T['convert.meta.f.licence']) as HTMLSelectElement).value).toBe('CC0-1.0');
  });
});

describe('the archive carries the prefilled values and the citation', () => {
  const bytesOf = (b: Blob): Promise<Uint8Array> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(b);
    });

  it('exports eml.xml with the title, abstract, creators, contact, licence and the citation of the file; only what was missing was typed', async () => {
    const downloadFile = vi.fn();
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={downloadFile} />);
    await read(view, [DATA, BAY]);
    fireEvent.click(screen.getByRole('button', { name: /Confirm all shown/ }));
    pick(T['convert.quantity.kind'], 'count');
    pick(T['convert.effort.title'], 'column');
    fireEvent.click(await screen.findByRole('button', { name: /^Approve \d+ shown/ }));
    fireEvent.click(screen.getByLabelText(T['convert.fullList']));
    await settled('7 occurrences (6 present, 1 absent)');
    // what the file did not give: the e-mail, the institution code, the kind of record
    typeInto(T['convert.meta.f.contactEmail'], 'anna@example.org');
    typeInto(T['convert.meta.f.institution'], 'INVENTED');
    pick(T['convert.meta.f.basis'], 'HumanObservation');
    pick(T['convert.device.label'], 'bongo');
    typeInto(T['convert.mesh.label'], '335');
    await idle();
    await waitFor(() => expect(document.querySelector('.convert-accept')).toBeTruthy());
    for (const box of document.querySelectorAll<HTMLInputElement>('.convert-accept [data-rule-group] input[type="checkbox"]')) if (!box.checked) fireEvent.click(box);
    const button = screen.getByRole('button', { name: T['convert.export.button'] });
    await waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('false'));
    fireEvent.click(button);
    await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1));
    const [blob, name] = downloadFile.mock.calls[0] as [Blob, string];
    expect(name).toBe('synthetic-zooplankton-counts-test-bay-2019.zip');
    const z = openZip(await bytesOf(blob));
    const eml = new TextDecoder().decode(await z.read(z.find('eml.xml')!, nodeInflate));
    expect(eml).toContain(`<title xml:lang="en">${BASE.title}</title>`);
    expect(eml).toContain('<para>Invented counts of zooplankton from a made-up bay; every value in this record is synthetic.</para>');
    expect(eml).toContain('<givenName>Anna</givenName><surName>Example</surName>');
    expect(eml).toContain('<givenName>Boris</givenName><surName>Sample</surName>');
    expect(eml).toContain('<electronicMailAddress>anna@example.org</electronicMailAddress>');
    expect(eml).toContain('<ulink url="http://creativecommons.org/licenses/by/4.0/legalcode">');
    // the citation of the file (shared attribution function), without a licence sentence, on one line
    expect(eml).toContain(`<citation identifier="synthetic-zooplankton-counts-test-bay-2019">Example, Anna; Sample, Boris (2020). ${BASE.title}. Example Marine Laboratory. https://doi.org/10.0000/synthetic.convert.1</citation>`);
    const event = new TextDecoder().decode(await z.read(z.find('event.txt')!, nodeInflate));
    expect(event).toContain(`\t${BASE.title}\tINVENTED\n`);
  });
});

describe('no network and no storage through the drop of a metadata file and the export', () => {
  it('drop (data + DataCite + Zenodo files) -> prefill -> choice -> export: no request, no storage, no cookie, no beacon', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network is not allowed')));
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const beacon = vi.fn();
    const idbOpen = vi.fn();
    const cookieSet = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('indexedDB', { open: idbOpen });
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    const cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(document, 'cookie', { configurable: true, get: () => '', set: cookieSet });
    const lsSet = vi.spyOn(Storage.prototype, 'setItem');
    const lsRemove = vi.spyOn(Storage.prototype, 'removeItem');
    const lsClear = vi.spyOn(Storage.prototype, 'clear');
    const downloadFile = vi.fn();
    try {
      const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={downloadFile} />);
      await read(view, [DATA, BAY, { name: 'bay.zenodo.json', text: zenodoJson({ title: 'Another invented title', licence: 'CC-BY-4.0', doi: '10.0000/synthetic.convert.2' }) }]);
      // the two files disagree on the title: the user chooses
      fireEvent.click(screen.getByRole('button', { name: `Use "${BASE.title}" from bay.datacite.xml, titles` }));
      fireEvent.click(screen.getByRole('button', { name: /Confirm all shown/ }));
      pick(T['convert.quantity.kind'], 'count');
      pick(T['convert.effort.title'], 'column');
      fireEvent.click(await screen.findByRole('button', { name: /^Approve \d+ shown/ }));
      fireEvent.click(screen.getByLabelText(T['convert.fullList']));
      await settled('7 occurrences (6 present, 1 absent)');
      typeInto(T['convert.meta.f.contactEmail'], 'anna@example.org');
      typeInto(T['convert.meta.f.institution'], 'INVENTED');
      pick(T['convert.meta.f.basis'], 'HumanObservation');
      pick(T['convert.device.label'], 'bongo');
      typeInto(T['convert.mesh.label'], '335');
      await idle();
      await waitFor(() => expect(document.querySelector('.convert-accept')).toBeTruthy());
      for (const box of document.querySelectorAll<HTMLInputElement>('.convert-accept [data-rule-group] input[type="checkbox"]')) if (!box.checked) fireEvent.click(box);
      const button = screen.getByRole('button', { name: T['convert.export.button'] });
      await waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('false'));
      fireEvent.click(button);
      await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1));
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(xhrOpen).not.toHaveBeenCalled();
      expect(beacon).not.toHaveBeenCalled();
      expect(idbOpen).not.toHaveBeenCalled();
      expect(cookieSet).not.toHaveBeenCalled();
      expect(lsSet).not.toHaveBeenCalled();
      expect(lsRemove).not.toHaveBeenCalled();
      expect(lsClear).not.toHaveBeenCalled();
      expect(sessionStorage.length).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      if (cookieDesc) Object.defineProperty(document, 'cookie', cookieDesc);
      else delete (document as unknown as Record<string, unknown>).cookie;
    }
  });
});

describe('GA4: the metadata source is an enum, never a title, a name or an e-mail address', () => {
  const win = window as unknown as { dataLayer: unknown[]; gtag?: unknown };
  const events = (): { name: string; params: Record<string, unknown> }[] =>
    win.dataLayer.map((e) => Array.from(e as ArrayLike<unknown>)).filter((e) => e[0] === 'event').map((e) => ({ name: e[1] as string, params: e[2] as Record<string, unknown> }));

  async function exportWith(files: F[]): Promise<void> {
    document.cookie = 'ac_consent=; Path=/; Max-Age=0';
    win.dataLayer = [];
    delete win.gtag;
    document.head.querySelectorAll('script').forEach((x) => x.remove());
    grantConsent();
    win.dataLayer = [];
    const downloadFile = vi.fn();
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={downloadFile} />);
    await read(view, files);
    fireEvent.click(screen.getByRole('button', { name: /Confirm all shown/ }));
    pick(T['convert.quantity.kind'], 'count');
    pick(T['convert.effort.title'], 'column');
    fireEvent.click(await screen.findByRole('button', { name: /^Approve \d+ shown/ }));
    fireEvent.click(screen.getByLabelText(T['convert.fullList']));
    await settled('7 occurrences (6 present, 1 absent)');
    typeInto(T['convert.meta.f.title'], 'Typed title (invented)');
    typeInto(T['convert.meta.f.abstract'], 'Typed abstract.');
    typeInto(T['convert.meta.f.creators'], 'Ada Example');
    typeInto(T['convert.meta.f.contactName'], 'Ada Example');
    typeInto(T['convert.meta.f.contactEmail'], 'ada@example.org');
    typeInto(T['convert.meta.f.institution'], 'INVENTED');
    pick(T['convert.meta.f.licence'], 'CC0-1.0');
    pick(T['convert.meta.f.basis'], 'HumanObservation');
    pick(T['convert.device.label'], 'bongo');
    typeInto(T['convert.mesh.label'], '335');
    await idle();
    await waitFor(() => expect(document.querySelector('.convert-accept')).toBeTruthy());
    for (const box of document.querySelectorAll<HTMLInputElement>('.convert-accept [data-rule-group] input[type="checkbox"]')) if (!box.checked) fireEvent.click(box);
    const button = screen.getByRole('button', { name: T['convert.export.button'] });
    await waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('false'));
    fireEvent.click(button);
    await waitFor(() => expect(downloadFile).toHaveBeenCalled());
  }

  it('meta_source is "file" when a metadata file was dropped and "none" when not; nothing else of the metadata is sent', async () => {
    await exportWith([DATA, BAY]);
    const exported = events().find((e) => e.name === 'convert_exported');
    expect(exported?.params.meta_source).toBe('file');
    expect(Object.keys(exported?.params ?? {}).sort()).toEqual(['input_type', 'meta_source', 'mode', 'n_events', 'n_measurements', 'n_occurrences', 'profile', 'shape']);
    expect(JSON.stringify(win.dataLayer)).not.toMatch(/Synthetic zooplankton|Example|Boris|bay\.datacite|synthetic\.convert|Marine Laboratory|ada@|INVENTED/);
    cleanup();
    await exportWith([DATA]);
    expect(events().find((e) => e.name === 'convert_exported')?.params.meta_source).toBe('none');
  });
});

describe('the four languages', () => {
  it('every new text exists in all four languages, with its placeholders, and PL / DE / FR sentences hold no English', () => {
    const keys = Object.keys(UI.en).filter((k) => /^convert\.(metafiles|meta\.src|meta\.cov|licence)\./.test(k) || k === 'convert.meta.f.citation' || k === 'convert.meta.f.citation.help');
    expect(keys.length).toBeGreaterThan(25);
    for (const k of keys) {
      const ph = (s: string): string[] => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
      for (const lang of LANGS) {
        const text = UI[lang][k as keyof typeof UI.en];
        expect(text?.trim(), `${lang}:${k}`).toBeTruthy();
        expect(ph(text), `${lang}:${k}`).toEqual(ph(UI.en[k as keyof typeof UI.en]));
        if (lang !== 'en') expect(text, `${lang}:${k}`).not.toMatch(/\b(your metadata|metadata files?|the rights holder|nothing was|filled in|use this|in use|for information only)\b/i);
      }
    }
    expect(translate('pl', 'convert.licence.taken', { licence: 'CC0-1.0', sources: 'a.xml, rightsList[0]' })).toBe('Wzięta z Twoich metadanych: CC0-1.0 (a.xml, rightsList[0]). Możesz ją zmienić.');
  });
});
