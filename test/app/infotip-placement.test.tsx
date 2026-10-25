// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Where the ⓘ explanations stand: every tool page carries the full list of its placements (by data-tip key and by accessible name),
// and every tip of the registry stands somewhere. A new tool or decision without its ⓘ is a failed review (CONTRIBUTING.md).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapLib } from '../../src/app/components/MapPreview';
import { initLang, setLang } from '../../src/app/i18n';
import { InputPanel } from '../../src/app/components/InputPanel';
import { CheckPage } from '../../src/app/pages/CheckPage';
import { CollectionPage } from '../../src/app/pages/CollectionPage';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { IndexPage } from '../../src/app/pages/IndexPage';
import { LicencePage } from '../../src/app/pages/LicencePage';
import { TIPS, TIP_IDS, type TipId } from '../../src/app/tips';
import { UI, translate, type UiKey } from '../../src/core/i18n/ui';
import { LANGS } from '../../src/core/types';
import { createDirectEngine } from '../../src/worker/handler';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { NO_CODE_CSV, SIDECAR_CSV, chooseFiles } from './convertHelpers';
import { createDirectCollectionEngine } from '../../src/worker/collection.client';
import { dataciteMock, runnerDeps, virtualClock } from '../collection/helpers';
import { DC, dataciteJson, zenodoJson, ZEN } from '../helpers/licenceFixtures';
import { MapFetcher } from '../sources/mapFetcher';
import * as meta from '../convert/metaFixtures';
import { wormsMock } from '../helpers/wormsFixtures';
import { nvsMock } from '../helpers/nvsFixtures';

const wideCsv = readFileSync(join(__dirname, '..', 'fixtures', 'layout-wide.csv'), 'utf-8');
const seen = new Set<TipId>();

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

/** The tip is on the page, once or more, and its button is named "Explanation: <the label it explains>". */
function expectTips(ids: readonly TipId[], lang: (typeof LANGS)[number] = 'en'): void {
  for (const id of ids) {
    const found = document.querySelectorAll(`[data-tip="${id}"]`);
    expect(found.length, `${id} is placed`).toBeGreaterThan(0);
    for (const el of found) {
      const button = el.querySelector('button');
      expect(button?.getAttribute('aria-label'), id).toBe(translate(lang, 'tip.aria', { label: UI[lang][TIPS[id].label as UiKey] }));
    }
    seen.add(id);
  }
}

const fakeLib = (): (() => Promise<MapLib>) => {
  class FakeMap {
    on() {}
    addSource() {}
    addLayer() {}
    fitBounds() {}
    getCanvas() {
      return { style: { cursor: '' } };
    }
    remove() {}
  }
  class FakePopup {
    setLngLat() {
      return this;
    }
    setDOMContent() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  }
  return () => Promise.resolve({ Map: FakeMap, Popup: FakePopup } as unknown as MapLib);
};

describe('/check', () => {
  it('input, confirm step, report and downloads each carry their ⓘ', async () => {
    const { container } = render(<CheckPage engine={createDirectEngine()} mapLib={fakeLib()} />);
    // input: the drop zone, the link field, the download mode
    expectTips(['dropZone', 'linkField', 'downloadMode']);
    // the field keeps its own clean name: the icon is not inside the label
    expect(screen.getByRole('textbox', { name: /Zenodo, GeoNetwork/ })).toBeTruthy();

    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File([wideCsv], 'layout-wide.csv', { type: 'text/csv' })] } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    await screen.findByRole('heading', { name: 'Confirm how your files are read' });
    // confirm step: the layout question, the column meanings, the encoding line, the one-cruise checkbox
    expectTips(['layout', 'roles', 'encoding', 'singleCruise']);
    // the column-meaning tip sits in a scrolling table, yet its bubble is outside every scroll container
    fireEvent.click(document.querySelector('[data-tip="roles"] button') as HTMLElement);
    const rolesBubble = document.querySelector('[data-tip-bubble="roles"]') as HTMLElement;
    expect(rolesBubble.closest('.table-scroll')).toBeNull();
    expect(rolesBubble.parentElement).toBe(document.body);
    expect(rolesBubble.textContent).toContain('ROW-LAT-RANGE');
    fireEvent.click(document.querySelector('[data-tip="roles"] button') as HTMLElement);
    // the visible help stays
    expect(screen.getByText(UI.en['confirm.singleCruise.help'])).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Table layout' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Meaning' })).toBeTruthy();
    expect(screen.getByLabelText(UI.en['confirm.singleCruise'])).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm and check' }));
    await screen.findByRole('heading', { name: 'Report' });
    // report: the severities, what is not checked, the map legend; downloads: each export and the draft
    await waitFor(() => expect(document.querySelector('[data-tip="mapLegend"]')).toBeTruthy());
    await waitFor(() => expect(document.querySelector('[data-tip="draft"]')).toBeTruthy());
    expectTips(['severities', 'notChecked', 'mapLegend', 'cleanCsv', 'sidecar', 'iso19139', 'datacite', 'draft', 'geojson']);
    expect(screen.getByRole('heading', { name: UI.en['notChecked.title'] })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Downloads' })).toBeTruthy();
    // the exports are still found by their own names
    for (const k of ['downloads.cleanCsv', 'downloads.sidecar', 'downloads.iso', 'downloads.datacite', 'downloads.geojson'] as const) {
      expect(screen.getByRole('button', { name: UI.en[k] })).toBeTruthy();
    }
  });
});

describe('the drop zone', () => {
  it('a file dropped on the ⓘ beside the zone is taken, and the browser is not allowed to open it', () => {
    render(<InputPanel mode="browser" onSubmit={() => {}} />);
    const icon = document.querySelector('[data-tip="dropZone"] button') as HTMLElement;
    const over = new Event('dragover', { bubbles: true, cancelable: true });
    icon.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    const drop = fireEvent.drop(icon, { dataTransfer: { files: [new File(['a,b\n1,2\n'], 'dropped-on-icon.csv', { type: 'text/csv' })] } });
    expect(drop).toBe(false); // default prevented
    expect(screen.getByText('dropped-on-icon.csv')).toBeTruthy();
  });
});

describe('/licence', () => {
  it('the input and the download mode stand before a result; the comparison, classification, DataCite line and attribution after it', async () => {
    const c = { doi: '10.5281/zenodo.9', title: 'Z' };
    const fetcher = new MapFetcher({ [ZEN + '9']: zenodoJson('9', c, { id: 'cc-by-4.0' }), [DC + c.doi]: dataciteJson(c, []) });
    render(<LicencePage fetcherFor={() => fetcher} />);
    expectTips(['licenceInput', 'downloadMode']);
    fireEvent.change(screen.getByRole('textbox', { name: UI.en['licence.input.label'] }), { target: { value: 'https://zenodo.org/records/9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare licences' }));
    await screen.findByTestId('licence-result');
    expectTips(['licenceOneDeposit', 'licenceSpdx', 'licenceDatacite', 'licenceAttribution']);
    // the page's own explanation stays
    expect(screen.getByRole('heading', { name: 'What this checks' })).toBeTruthy();
  });
});

describe('/collection', () => {
  it('the kinds, each kind\'s inputs and options, and the run carry their ⓘ', () => {
    const clock = virtualClock();
    const engine = createDirectCollectionEngine(runnerDeps(dataciteMock({ total: 5, clock }).net, clock));
    render(<CollectionPage engine={engine} />);
    expectTips(['collectionKind', 'collectionRun']);
    fireEvent.click(screen.getByLabelText('A list of DOIs'));
    expectTips(['collectionDois']);
    fireEvent.click(screen.getByLabelText('A DataCite repository or DOI prefix'));
    expectTips(['collectionDatacite']);
    fireEvent.click(screen.getByLabelText('A Zenodo community'));
    expectTips(['collectionZenodo']);
    fireEvent.click(screen.getByLabelText('A GeoNetwork catalogue'));
    expectTips(['collectionCsw', 'collectionCross']);
    // the fields keep their names
    expect(screen.getByRole('combobox', { name: UI.en['collection.csw.label'] })).toBeTruthy();
  });
});

describe('/convert', () => {
  it('the intro and the drop zone carry their ⓘ, in every language, beside the text and not inside a heading', () => {
    for (const lang of LANGS) {
      cleanup();
      setLang(lang);
      render(<ConvertPage engine={createDirectConvertEngine()} />);
      expectTips(['convertIntro', 'dropZone'], lang);
      expect(document.querySelectorAll('h1 .infotip, h2 .infotip, h3 .infotip, h4 .infotip, label .infotip').length).toBe(0);
      expect(document.querySelectorAll('.infotip').length).toBe(2);
    }
  });

  it('every decision of the flow carries its ⓘ: roles, sheet, shape, each quantity field, cruise, full list, station prefix, flatten, splits, codes, tree', async () => {
    const { container } = render(<ConvertPage engine={createDirectConvertEngine()} />);
    // a sheet with a missing sample code (the code step) and a companion file that ticks the station prefix
    chooseFiles(container, [
      { name: 'no-code.csv', text: NO_CODE_CSV },
      { name: 'run.sidecar.csv', text: SIDECAR_CSV },
    ]);
    fireEvent.click(screen.getByRole('button', { name: UI.en['convert.read'] }));
    await screen.findByRole('heading', { name: UI.en['convert.columns.title'] });
    // the cruise field is offered for a sheet without a cruise column
    fireEvent.change(screen.getByLabelText('Cruise: Meaning'), { target: { value: 'ignore' } });
    // the proposed taxon columns have their own control and tip; they are confirmed before anything is converted
    expectTips(['convertTaxa', 'convertDepthBound']);
    fireEvent.click(screen.getByRole('button', { name: /Confirm all shown/ }));
    expectTips(['convertRoles', 'convertSheetUse', 'convertShape', 'convertQuantityKind', 'convertEffort', 'convertCruise', 'convertFullList', 'convertStationPrefix', 'convertFlattenStation', 'convertFlattenCruise', 'convertTree', 'convertDevice', 'convertMesh', 'convertWormsOptIn', 'convertWormsPrivacy']);
    // the role column header of /convert has its own tip, and /check's is not on this page
    expect(document.querySelector('[data-tip="roles"]')).toBeNull();
    // the quantity fields that depend on the kind
    fireEvent.change(screen.getByLabelText(UI.en['convert.quantity.kind']), { target: { value: 'biomass' } });
    fireEvent.change(screen.getByLabelText(UI.en['convert.quantity.unit']), { target: { value: 'g/m2' } });
    expectTips(['convertQuantityUnit', 'convertQuantityBasis', 'convertQuantityPer', 'convertQuantityMedium']);
    // a typed sample size: value, unit and dimension each have their own
    fireEvent.change(screen.getByLabelText(UI.en['convert.effort.title']), { target: { value: 'constant' } });
    expectTips(['convertEffortValue', 'convertEffortUnit', 'convertEffortDimension']);
    // the splits and the codes appear with what the data need
    await screen.findByRole('heading', { name: UI.en['convert.splits.title'] });
    await screen.findByRole('heading', { name: UI.en['convert.codes.title'] });
    expectTips(['convertSplits', 'convertCodes']);
    // the description of the dataset (every field), the export and the companion file
    expectTips(['convertMetaTitle', 'convertMetaAbstract', 'convertMetaCreators', 'convertMetaContact', 'convertMetaInstitution', 'convertMetaDatasetName', 'convertMetaMethods', 'convertMetaCitation', 'convertLicence', 'convertBasis', 'convertExport', 'convertCompanion']);
    // none of them inside a label or a heading element (names stay clean)
    expect(document.querySelectorAll('h1 .infotip, h2 .infotip, h3 .infotip, h4 .infotip, label .infotip').length).toBe(0);
    // the bubble of the roles tip lists the converter roles, and sits on the body, outside the scrolling table
    fireEvent.click(document.querySelector('[data-tip="convertRoles"] button') as HTMLElement);
    const bubble = document.querySelector('[data-tip-bubble="convertRoles"]') as HTMLElement;
    expect(bubble.parentElement).toBe(document.body);
    for (const k of ['role.taxonHeader', 'role.quantity', 'role.effort', 'role.occurrenceId', 'role.lifeStage', 'role.qualifier'] as const) expect(bubble.textContent).toContain(UI.en[k]);
    // the pressure line is the converter's own (a profile sheet writes it), not the /check sentence that says no output file uses it
    expect(bubble.textContent).toContain(UI.en['tip.role.pressureConvert']);
    expect(bubble.textContent).not.toContain(UI.en['tip.role.pressure']);
    fireEvent.click(document.querySelector('[data-tip="convertRoles"] button') as HTMLElement);
  });
});

describe('/convert: the metadata files of stage 3', () => {
  const NAME = (n: number): string => ['', 'a.xml', 'b.json'][n];
  async function withFiles(...extra: { name: string; text: string }[]): Promise<void> {
    cleanup();
    const { container } = render(<ConvertPage engine={createDirectConvertEngine()} />);
    chooseFiles(container, [{ name: 'w1.csv', text: NO_CODE_CSV }, ...extra]);
    fireEvent.click(screen.getByRole('button', { name: UI.en['convert.read'] }));
    await screen.findByRole('heading', { name: UI.en['convert.columns.title'] });
  }

  it('the file listing, the source hint, the choice between differing values, the coverage and the contradictory licence each carry their ⓘ', async () => {
    await withFiles(
      { name: NAME(1), text: meta.dataciteXml({ licence: 'CC-BY-4.0', collected: '2019-06-01/2019-06-30' }) },
      { name: NAME(2), text: meta.zenodoJson({ title: 'Another invented title', licence: 'CC0-1.0', doi: '10.0000/synthetic.convert.2' }) },
    );
    expectTips(['convertMetaFiles', 'convertMetaSource', 'convertMetaChoice', 'convertMetaCoverage', 'convertLicenceContradictory']);
    expect(document.querySelectorAll('h1 .infotip, h2 .infotip, h3 .infotip, h4 .infotip, label .infotip').length).toBe(0);
  });

  it('the list of contacts one file names and the archive description file carry their ⓘ', async () => {
    await withFiles(
      { name: NAME(1), text: meta.isoXml({ contacts: [{ name: 'Anna Example' }, { name: 'Boris Sample' }] }) },
      { name: 'eml.xml', text: '<eml:eml xmlns:eml="https://eml.ecoinformatics.org/eml-2.2.0"><dataset/></eml:eml>' },
    );
    expectTips(['convertMetaList', 'convertArchiveDesc']);
  });

  it('the three other licence cases each carry their ⓘ', async () => {
    await withFiles({ name: NAME(1), text: meta.dataciteXml({ licence: 'CC-BY-4.0' }) });
    expectTips(['convertLicenceTaken']);
    await withFiles({ name: NAME(1), text: meta.dataciteXml({ licence: 'CC-BY-3.0' }) });
    expectTips(['convertLicenceOther']);
    await withFiles({ name: NAME(1), text: meta.dataciteXml() });
    expectTips(['convertLicenceMissing']);
  });
});

describe('/convert: the acceptance of warnings and the sum column', () => {
  it('a converted sheet with a warning shows the acceptance with its ⓘ, and a sum column shows the ⓘ of its reason', async () => {
    const csv = 'Station,Sample,Latitude,Longitude,Date,Calanus finmarchicus,Suma\nS,a,55,3,2020-01-01,4,4\n';
    const { container } = render(<ConvertPage engine={createDirectConvertEngine()} />);
    chooseFiles(container, [{ name: 'suma.csv', text: csv }]);
    fireEvent.click(screen.getByRole('button', { name: UI.en['convert.read'] }));
    await screen.findByRole('heading', { name: UI.en['convert.columns.title'] });
    // "Suma" starts as ignored, with its reason and its ⓘ
    expect((screen.getByLabelText('Suma: Meaning') as HTMLSelectElement).value).toBe('ignore');
    expectTips(['convertSummaryColumn']);
    fireEvent.click(screen.getByRole('button', { name: /Confirm all shown/ }));
    fireEvent.change(screen.getByLabelText(UI.en['convert.quantity.kind']), { target: { value: 'count' } });
    await screen.findByRole('heading', { name: UI.en['convert.accept.title'] });
    expectTips(['convertAccept']);
    expect(document.querySelectorAll('h1 .infotip, h2 .infotip, h3 .infotip, h4 .infotip, label .infotip').length).toBe(0);
  });
});

describe('/convert: the WoRMS result table', () => {
  it('after a lookup the result table and the decision carry their own ⓘ, in every language', async () => {
    for (const lang of LANGS) {
      cleanup();
      setLang(lang);
      vi.stubGlobal('fetch', wormsMock().fetch);
      const csv = 'occurrenceID,eventID,scientificName,individualCount,decimalLatitude,decimalLongitude,eventDate\no1,E1,Calanus finmarchicus,5,54.1,7.9,2022-05-05\no2,E1,Oithona,3,54.1,7.9,2022-05-05\n';
      const { container } = render(<ConvertPage engine={createDirectConvertEngine()} />);
      chooseFiles(container, [{ name: 'l.csv', text: csv }]);
      fireEvent.click(screen.getByRole('button', { name: UI[lang]['convert.read'] }));
      await screen.findByRole('heading', { name: UI[lang]['convert.worms.title'] });
      fireEvent.click(screen.getByRole('checkbox', { name: UI[lang]['convert.worms.optin'] }));
      fireEvent.click(await screen.findByRole('button', { name: translate(lang, 'convert.worms.lookup', { n: 2 }) }));
      await waitFor(() => expect(document.querySelector('.convert-worms-table')).toBeTruthy());
      expectTips(['convertWormsOptIn', 'convertWormsPrivacy', 'convertWormsTable', 'convertWormsChoice'], lang);
      expect(document.querySelectorAll('h1 .infotip, h2 .infotip, h3 .infotip, h4 .infotip, label .infotip').length).toBe(0);
      vi.unstubAllGlobals();
    }
  });
});

describe('/convert: the NERC section and the NVS search', () => {
  it('the section, the opt-in, its privacy copy, the decision and (after a search) the results carry their own ⓘ, in every language', async () => {
    for (const lang of LANGS) {
      cleanup();
      setLang(lang);
      vi.stubGlobal('fetch', nvsMock().fetch);
      const csv = 'occurrenceID,eventID,scientificName,individualCount,decimalLatitude,decimalLongitude,eventDate,Temperature [°C]\no1,E1,Calanus finmarchicus,5,54.1,7.9,2022-05-05,7.1\n';
      const { container } = render(<ConvertPage engine={createDirectConvertEngine()} />);
      chooseFiles(container, [{ name: 'l.csv', text: csv }]);
      fireEvent.click(screen.getByRole('button', { name: UI[lang]['convert.read'] }));
      await screen.findByRole('heading', { name: UI[lang]['convert.nerc.title'] });
      expectTips(['convertNerc', 'convertNercChoice', 'convertNvsOptIn', 'convertNvsPrivacy'], lang);
      fireEvent.click(screen.getByRole('checkbox', { name: UI[lang]['convert.nvs.optin'] }));
      fireEvent.change(screen.getByLabelText(UI[lang]['convert.nvs.word.type.aria'].replace('{header}', 'Temperature [°C]')), { target: { value: 'invented current' } });
      fireEvent.click(screen.getByRole('button', { name: UI[lang]['convert.nvs.search.type.aria'].replace('{header}', 'Temperature [°C]') }));
      await waitFor(() => expect(document.querySelector('.convert-nvs-results')).toBeTruthy());
      expectTips(['convertNvsResults'], lang);
      expect(document.querySelectorAll('h1 .infotip, h2 .infotip, h3 .infotip, h4 .infotip, label .infotip').length).toBe(0);
      vi.unstubAllGlobals();
    }
  });
});

describe('/convert: the profile / environment file (stage 6)', () => {
  it('the mark, the approval of the level IDs, the station matching and the pressure each carry their own ⓘ, in every language', async () => {
    for (const lang of LANGS) {
      cleanup();
      setLang(lang);
      const ctd = 'Cruise,Station,Latitude,Longitude,Date,Depth [m],Temperature [°C],Pressure [dbar]\nCR1,S1,55.5,2.5,2023-06-14,0,11.2,0.5\n';
      const { container } = render(<ConvertPage engine={createDirectConvertEngine()} />);
      chooseFiles(container, [{ name: 'ctd.csv', text: ctd }]);
      fireEvent.click(screen.getByRole('button', { name: UI[lang]['convert.read'] }));
      await screen.findByRole('heading', { name: UI[lang]['convert.columns.title'] });
      // the mark is offered to every sheet; the suggestion is a note with a button, not a decision made for the user
      expectTips(['convertProfile'], lang);
      expect(document.querySelector('[data-tip="convertProfileDepthIds"]')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: UI[lang]['convert.sheet.profile.mark'] }));
      expectTips(['convertProfile', 'convertProfileDepthIds', 'convertProfileStations', 'convertProfileCast', 'convertProfilePressure'], lang);
      expect(document.querySelectorAll('h1 .infotip, h2 .infotip, h3 .infotip, h4 .infotip, label .infotip').length).toBe(0);
    }
  });

  it('the roles tip says what a pressure column does here, in the converter\'s own words, not /check\'s', () => {
    cleanup();
    setLang('en');
    expect(UI.en['tip.role.pressureConvert']).toContain('profile sheet');
    expect(UI.en['tip.role.pressure']).toContain('no check or output file uses it');
  });
});

describe('the index page', () => {
  it('one ⓘ per tool, beside its name, outside the link', () => {
    render(<IndexPage />);
    expectTips(['indexCheck', 'indexLicence', 'indexCollection', 'indexConvert']);
    expect(document.querySelectorAll('.tool .infotip').length).toBe(4);
    expect(document.querySelectorAll('.tool a .infotip').length).toBe(0);
    expect(screen.getByRole('heading', { name: 'Data check' })).toBeTruthy();
  });

  it('the names are right in every language', () => {
    for (const lang of LANGS) {
      cleanup();
      setLang(lang);
      render(<IndexPage />);
      expectTips(['indexCheck', 'indexLicence', 'indexCollection', 'indexConvert'], lang);
    }
  });
});

afterAll(() => {
  // runs last in this file: every tip of the registry was seen on a page above
  expect([...seen].sort()).toEqual([...TIP_IDS].sort());
});
