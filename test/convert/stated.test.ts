// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// What of a /convert column proposal is STATED (core/convert/stated.ts) and what is only a guess. The wrong-role lists of the review (problems P13, P15, P19 and problems 1, 5 and 7 of the second
// set of files) as a table: every header below was proposed with a wrong role at some confidence, and none of them is stated. Synthetic headers and rows only.
import { describe, expect, it } from 'vitest';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { statedInfo, withStated } from '../../src/core/convert/stated';
import type { Cell } from './helpers';
import { CTX, fileOf } from './helpers';

const LATIN = ['Solea solea', 'Merlangius merlangus', 'Pleuragramma antarctica Boulenger, 1902', 'Calanus finmarchicus', 'Oithona similis', 'Gadus morhua'];
const ISO_DATES = ['2014-05-02', '2014-05-03', '2014-05-04', '2014-05-05', '2014-05-06', '2014-05-07'];
const ISO_DATETIMES = ['2012-03-05T00:00:00Z', '2012-03-06T00:00:00Z', '2012-03-07T06:30:00Z', '2012-03-08T00:00:00Z', '2012-03-09T00:00:00Z', '2012-03-10T00:00:00Z'];
const NUMBERS = [1, 2, 3, 1, 4, 2];
const FRAME = ['Station', 'Latitude', 'Longitude'];
const frameRows = (n: number): Cell[][] => Array.from({ length: n }, (_, i) => [`S${i + 1}`, 50 + i / 10, 2 + i / 10]);

/** The one column under test, in a sheet with a station and a position, as the converter proposes it. */
function propose(header: string, cells: readonly Cell[], extra: { header: string; cells: readonly Cell[] }[] = [], pangaea = false, frame = true) {
  const cols = [{ header, cells }, ...extra];
  const rows = frameRows(cells.length).map((r, i) => [...(frame ? r : []), ...cols.map((c) => c.cells[i] ?? null)]);
  const file = fileOf([...(frame ? FRAME : []), ...cols.map((c) => c.header)], rows);
  const sheet = file.sheets[0];
  const proposals = proposeConvertColumns(sheet, CTX);
  const info = statedInfo(sheet, proposals, { decimalComma: false, pangaea });
  const at = proposals.findIndex((p) => p.header === header);
  return { p: proposals[at], i: info[at], proposals, info, sheet };
}

describe('stated: the wrong-role table of the review is never stated', () => {
  // [header, cells, why it was wrong]
  const WRONG: [string, readonly Cell[], string][] = [
    // P13
    ['Scientific name', LATIN, 'P13 b03: ignored at high confidence (a space is not an underscore: not a Darwin Core term)'],
    ['SpName', LATIN, 'P13 b10'],
    ['DateCollected', ISO_DATES, 'P13 b07'],
    ['date_local', ISO_DATES, 'P13 b10'],
    ['Ind [#] (>3 = shoal)', NUMBERS, 'P13 b03: a quantity proposed as a taxon candidate'],
    ['Reg spec no (WoRMS Aphia ID)', [831402, 831403, 831404, 831405, 831406, 831407], 'P13 b03'],
    ['DepthStart', [205, 210, 215, 220, 225, 230], 'P13 b11'],
    ['DepthSampleStart', [205, 210, 215, 220, 225, 230], 'P13 b11'],
    ['SampleYear', [2014, 2014, 2015, 2015, 2016, 2016], 'P13 b07'],
    ['CoreDiameter', [6.35, 6.35, 6.35, 6.35, 6.35, 6.35], 'P13 b07'],
    // new files, 1, 5, 7
    ['Number_in_Haul', NUMBERS, 'new 1'],
    ['Boat_kw', [81, 81, 81, 90, 90, 90], 'new 5'],
    ['Haul l [m]', [2764, 2790, 2781, 2777, 2763, 2788], 'new 5: a taxon candidate with a physical unit'],
    ['Ending_Latitude_decimal', [49.1, 49.2, 49.3, 49.4, 49.5, 49.6], 'new 5'],
    ['Boat_Engine_kw', [81, 81, 81, 90, 90, 90], 'new 5'],
    ['len_tot_est', [12, 15, 18, 20, 22, 25], 'new 5'],
    ['surface_temp', [11.2, 11.4, 11.1, 10.9, 11.0, 11.3], 'new 5'],
    ['Event', ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'], 'new 7: station at high confidence, though unique per row (stated only in a PANGAEA file)'],
    ['sampling_event', ['ZQ_55314', 'ZQ_55315', 'ZQ_55316', 'ZQ_55317', 'ZQ_55318', 'ZQ_55319'], 'new 7: ignored at high confidence'],
    ['SampleNumber', ['KLM-93', 'KLM-94', 'KLM-95', 'KLM-96', 'KLM-97', 'KLM-98'], 'new 7'],
    ['time_local', ['03:17', '03:32', '03:47', '04:02', '04:17', '04:32'], 'new 7: ignored at high confidence'],
    ['Porifera [#]', NUMBERS, 'new 5: a species column is a candidate, asked in bulk'],
  ];
  it.each(WRONG)('%s (%s)', (header, cells) => {
    const { i, p } = propose(header, cells);
    expect(i.stated, `${header} -> ${JSON.stringify(p.role)}`).toBe(false);
  });

  it('`time` that holds ISO datetimes is not stated, and says why', () => {
    const { i } = propose('time', ISO_DATETIMES);
    expect(i.stated).toBe(false);
    expect(i.vetoed).toBe('not-time-of-day');
    expect(i.nameStates).toBe('time');
  });

  it('`NA` over species names (P15) is not a sodium column', () => {
    const { i, p } = propose('NA', LATIN);
    expect(i.stated).toBe(false);
    expect(p.role.kind).not.toBe('taxon');
  });

  it('238 columns headed `NA` with a species name in row 1 and numbers below are not stated (b13): an abbreviation of two letters is an entry only with a unit', () => {
    const rows: Cell[][] = [['Examplea inventa (Cells ml-1)', 'Skeletonema marinoi (Cells ml-1)'], ...Array.from({ length: 12 }, (_, r): Cell[] => [r + 1, r + 2])];
    const extra = [{ header: 'NA', cells: rows.map((r) => r[1]) }];
    const { i, info } = propose('NA', rows.map((r) => r[0]), extra);
    expect(i.stated).toBe(false);
    expect(info.filter((x) => x.stated && x.role?.kind === 'variable')).toEqual([]);
  });

  it('a text `Area` (P19) is not stated as an effort', () => {
    const { i } = propose('Area', ['Example Sea', 'Example Sea', 'Test Bank', 'Test Bank', 'Example Sea', 'Test Bank']);
    expect(i.stated).toBe(false);
  });

  it('a stated role that cells veto is unassigned, never handed to another role: Year, Month and Day with no valid date', () => {
    const { info, proposals } = propose('Year', [2020, 2020, 2021, 2021, 2020, 2022], [
      { header: 'Month', cells: [13, 2, 14, 2, 13, 15] },
      { header: 'Day', cells: [5, 31, 30, 31, 7, 8] },
    ]);
    const at = (h: string) => proposals.findIndex((p) => p.header === h);
    for (const h of ['Year', 'Month', 'Day']) {
      expect(info[at(h)].stated, h).toBe(false);
      expect(info[at(h)].vetoed, h).toBe('date-part-values');
      expect(info[at(h)].nameStates, h).toBe('datePart');
      expect(info[at(h)].role, h).toBeUndefined();
    }
    expect(proposals[at('Month')].role.kind).not.toBe('datePart');
  });
});

describe('stated: what is stated', () => {
  it('an exact Darwin Core term, folded for case and underscores', () => {
    const { i } = propose('scientificName', LATIN, [{ header: 'individualCount', cells: NUMBERS }]);
    expect(i).toMatchObject({ stated: true, basis: 'darwin-core', role: { kind: 'taxon' } });
    expect(propose('eventID', ['E1', 'E2', 'E3', 'E4', 'E5', 'E6']).i).toMatchObject({ stated: true, basis: 'darwin-core', role: { kind: 'sampleId' } });
    // a space is not an underscore: the words of a name are not a term
    expect(propose('Event ID', ['E1', 'E2', 'E3', 'E4', 'E5', 'E6']).i.stated).toBe(false);
  });

  it('an exact term takes the role the name gives, in the stated layer, where the proposer suggests `ignore` (EVENT_ID, Scientific_Name)', () => {
    const ev = propose('EVENT_ID', ['E1', 'E2', 'E3', 'E4', 'E5', 'E6']);
    expect(ev.p.role.kind).toBe('ignore');
    expect(ev.i).toMatchObject({ stated: true, basis: 'darwin-core', role: { kind: 'sampleId' } });
    const sn = propose('Scientific_Name', LATIN, [{ header: 'Number_in_Haul', cells: NUMBERS }]);
    expect(sn.p.role.kind).toBe('ignore');
    expect(sn.i).toMatchObject({ stated: true, role: { kind: 'taxon' } });
    // the suggestion itself is untouched, and withStated marks nothing where the name states a role the proposer did not give: the role and the mark stay as they were
    const marked = withStated(sn.sheet, sn.proposals, { decimalComma: false });
    const m = marked.find((p) => p.header === 'Scientific_Name')!;
    expect(m.role.kind).toBe('ignore');
    expect(m.stated).toBeUndefined();
    expect(sn.proposals.find((p) => p.header === 'Scientific_Name')!.role.kind).toBe('ignore');
  });

  it('the stated layer never carries `ignore` for a column whose name gives a role', () => {
    const files: [string, Cell[], boolean][] = [
      ['EVENT_ID', ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'], false],
      ['Scientific_Name', LATIN, false],
      ['Depth water [m]', [5, 10, 15, 20, 25, 30], true],
      ['Depth sed [m]', [1, 2, 3, 4, 5, 6], true],
    ];
    for (const [h, cells, pg] of files) {
      const { i } = propose(h, cells, [], pg);
      expect(i.stated, h).toBe(true);
      expect(i.role?.kind, h).not.toBe('ignore');
    }
  });

  it('the whole Darwin Core term list: year, month, day, habitat and waterBody', () => {
    // an ordinary word that is also a term (habitat) is a term only beside at least two other exact terms
    expect(propose('habitat', ['reef', 'reef', 'mud', 'mud', 'reef', 'sand']).i.stated).toBe(false);
    const beside = propose('habitat', ['reef', 'reef', 'mud', 'mud', 'reef', 'sand'], [{ header: 'scientificName', cells: LATIN }, { header: 'individualCount', cells: NUMBERS }]);
    expect(beside.i).toMatchObject({ stated: true, basis: 'darwin-core', role: { kind: 'ignore' } });
    expect(propose('waterBody', ['North Sea', 'North Sea', 'North Sea', 'North Sea', 'North Sea', 'North Sea']).i).toMatchObject({ stated: true, role: { kind: 'ignore' } });
    const ymd = propose('year', [2020, 2020, 2021, 2021, 2020, 2022], [{ header: 'month', cells: [5, 2, 6, 2, 7, 8] }, { header: 'day', cells: [5, 28, 30, 27, 7, 8] }]);
    for (const h of ['year', 'month', 'day']) expect(ymd.info[ymd.proposals.findIndex((p) => p.header === h)], h).toMatchObject({ stated: true, role: { kind: 'datePart' } });
  });

  it('an exact vocabulary entry, with cells that fit', () => {
    expect(propose('Temperature [°C]', [11.2, 11.4, 11.1, 10.9, 11.0, 11.3]).i).toMatchObject({ stated: true });
    expect(propose('time', ['03:17', '03:32', '03:47', '04:02', '04:17', '04:32']).i).toMatchObject({ stated: true, basis: 'vocabulary' });
  });

  it('an effort named by an exact vocabulary entry is stated as the effort', () => {
    for (const h of ['volfilt', 'Samp vol [m**3]']) {
      const { p, i } = propose(h, [30.54, 31.2, 29.9, 30.1, 30.8, 30.2], [{ header: 'Calanus finmarchicus', cells: NUMBERS }]);
      expect(p.role.kind, h).toBe('effort');
      expect(i.stated, h).toBe(true);
    }
  });

  it('a plain `Area`, `Density` and an abbreviation of two letters are stated only when the header declares a unit', () => {
    const cells = [12.5, 13, 14, 11, 12, 13.5];
    const taxon = [{ header: 'Calanus finmarchicus', cells: NUMBERS }];
    expect(propose('Area', cells, taxon).i.stated).toBe(false);
    expect(propose('Area [m2]', cells, taxon).i).toMatchObject({ stated: true, basis: 'header-unit' });
    expect(propose('Density', cells, taxon).i.stated).toBe(false);
    expect(propose('Density [ind/m3]', cells, taxon).i.stated).toBe(true);
    for (const h of ['NA', 'T', 'S', 'Si', 'DO']) {
      const bare = propose(h, cells);
      expect(bare.i.stated, h).toBe(false);
    }
    expect(propose('NA [mg/l]', [450, 460, 455, 470, 465, 462]).i).toMatchObject({ stated: true, role: { kind: 'variable' } });
    expect(propose('Temp [°C]', [11.2, 11.4, 11.1, 10.9, 11.0, 11.3]).i.stated).toBe(true);
  });

  it('scientificName and species both present: only scientificName is stated', () => {
    const r = propose('scientificName', LATIN, [{ header: 'species', cells: LATIN }]);
    const species = r.info[r.proposals.findIndex((p) => p.header === 'species')];
    expect(r.i.stated).toBe(true);
    expect(species.stated).toBe(false);
    expect(propose('species', LATIN).i).toMatchObject({ stated: true, role: { kind: 'taxon' } });
  });

  it('a depth whose sign the values give: the role is stated, the direction is not', () => {
    const r = propose('Depth', [5, -10, 15, 20, -25, 30]);
    expect(r.i.stated).toBe(true);
    expect(r.i.role).toMatchObject({ kind: 'depth', positive: 'unknown' });
    if (r.p.role.kind === 'depth' && r.p.role.positive === 'up') expect(r.i.ask).toEqual(['depth-direction']);
    // a Darwin Core depth and an elevation state their own direction
    const dwc = propose('minimumDepthInMeters', [5, 10, 15, 20, 25, 30], [{ header: 'maximumDepthInMeters', cells: [10, 20, 30, 40, 50, 60] }]);
    expect(dwc.i.role).toMatchObject({ kind: 'depth', positive: 'down', bound: 'min' });
    expect(dwc.i.ask).toBeUndefined();
    // plain positive values: nothing to ask, and nothing claimed
    expect(propose('Depth', [5, 10, 15, 20, 25, 30]).i.role).toMatchObject({ kind: 'depth', positive: 'unknown' });
  });

  it('PANGAEA files: Event, Depth top, Depth bot and Campaign are stated there and only there', () => {
    const ev = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'];
    const d = [5, 10, 15, 20, 25, 30];
    expect(propose('Event', ev, [], true).i).toMatchObject({ stated: true, basis: 'pangaea', role: { kind: 'station' } });
    expect(propose('Event', ev, [], false).i.stated).toBe(false);
    expect(propose('Depth top [m]', d, [{ header: 'Depth bot [m]', cells: d.map((x) => x + 5) }], true).i).toMatchObject({ stated: true, role: { kind: 'depth', bound: 'min' } });
    expect(propose('Depth top [m]', d, [], false).i.stated).toBe(false);
    expect(propose('Campaign', ['PS1', 'PS1', 'PS1', 'PS1', 'PS1', 'PS1'], [], true).i).toMatchObject({ stated: true, role: { kind: 'cruise' } });
  });

  it('a PANGAEA geocode is stated in a PANGAEA file, with the role it gives, and not elsewhere', () => {
    const cells = [5, 10, 15, 20, 25, 30];
    expect(propose('Depth water [m]', cells, [], true).i).toMatchObject({ stated: true, basis: 'geocode', role: { kind: 'depth', positive: 'down' } });
    expect(propose('Depth water [m]', cells, [], false).i.basis).not.toBe('geocode');
  });

  it('a geocode goes through the veto like everything else: a text column is not a depth', () => {
    const r = propose('Depth water [m]', ['shallow', 'deep', 'shallow', 'deep', 'deep', 'shallow'], [], true);
    expect(r.i.stated).toBe(false);
    expect(r.i.vetoed).toBe('not-numeric');
  });

  it('a real sodium column keeps its role: the cells only remove, here they agree', () => {
    const { i, p } = propose('NA [mg/l]', [450, 460, 455, 470, 465, 462]);
    expect(p.role.kind).toBe('variable');
    expect(i.stated).toBe(true);
  });

  it('valid Year, Month and Day are stated as date parts', () => {
    const { info, proposals } = propose('Year', [2020, 2020, 2021, 2021, 2020, 2022], [
      { header: 'Month', cells: [5, 2, 6, 2, 7, 8] },
      { header: 'Day', cells: [5, 28, 30, 27, 7, 8] },
    ]);
    for (const h of ['Year', 'Month', 'Day']) {
      const at = proposals.findIndex((p) => p.header === h);
      expect(proposals[at].role.kind, h).toBe('datePart');
      expect(info[at].stated, h).toBe(true);
    }
  });
});

describe('stated: the veto reads dates and times as the writer does', () => {
  it('a number written YYYYMMDD is a date (Date (YYYYMMDD), Date)', () => {
    const cells = [20190312, 20190313, 20190314, 20190401, 20190402, 20190403];
    const a = propose('Date (YYYYMMDD)', cells);
    const b = propose('Date', cells);
    expect(b.i).toMatchObject({ stated: true, role: { kind: 'date' } });
    expect(a.i.vetoed).toBeUndefined();
    expect(b.i.vetoed).toBeUndefined();
  });

  it('times with a zone are times', () => {
    expect(propose('time', ['03:17:09Z', '03:47:09Z', '04:17:09Z', '04:47:09Z', '05:17:09Z', '05:47:09Z']).i).toMatchObject({ stated: true, role: { kind: 'time' } });
    expect(propose('time', ['04:11:33+0100', '05:11:33+0100', '06:11:33+0100', '07:11:33+0100', '08:11:33+0100', '09:11:33+0100']).i.vetoed).toBeUndefined();
  });

  it('dates with a month name are not stated, because the writer cannot read them: stating them would only move the failure to the export (ROW-DATE-UNPARSEABLE)', () => {
    const r = propose('Date', ['12-Mar-2019', '13-Mar-2019', '14-Mar-2019', '01-Apr-2019', '02-Apr-2019', '03-Apr-2019']);
    expect(r.i.vetoed).toBe('not-date');
  });

  it('text where a date is expected is a veto', () => {
    const r = propose('Date', ['spring', 'summer', 'autumn', 'winter', 'spring', 'summer']);
    expect(r.i.vetoed).toBe('not-date');
    expect(r.i.stated).toBe(false);
  });
});

describe('stated: cells never add a role', () => {
  it('a column of Latin names, of ISO dates or of years under a header with no meaning is not stated', () => {
    for (const cells of [LATIN, ISO_DATES, ISO_DATETIMES, [1986, 1987, 1988, 1989, 1990, 1991]]) {
      expect(propose('colx', cells).i.stated).toBe(false);
    }
  });

  it('withStated changes no role of an unstated column and no confidence, and never mutates its input', () => {
    const { sheet, proposals } = propose('Temperature [°C]', [11.2, 11.4, 11.1, 10.9, 11.0, 11.3], [{ header: 'scientificName', cells: LATIN }]);
    const before = JSON.stringify(proposals);
    const marked = withStated(sheet, proposals, { decimalComma: false });
    expect(JSON.stringify(proposals)).toBe(before);
    expect(marked.map((p) => ({ i: p.index, confidence: p.confidence }))).toEqual(proposals.map((p) => ({ i: p.index, confidence: p.confidence })));
    for (const [k, p] of marked.entries()) if (p.stated !== true) expect(p.role).toEqual(proposals[k].role);
    expect(marked.filter((p) => p.stated === true).map((p) => p.header)).toEqual(expect.arrayContaining(['Temperature [°C]', 'scientificName']));
    expect(marked.filter((p) => p.stated !== true).every((p) => !('stated' in p))).toBe(true);
  });
});

describe('stated: a mark and nothing else', () => {
  it('withStated returns the very roles of the proposals, whatever the file says, vetoed or not', () => {
    const cases: ReturnType<typeof propose>[] = [
      propose('Scientific_Name', LATIN, [{ header: 'Number_in_Haul', cells: NUMBERS }]),
      propose('time', ISO_DATETIMES),
      propose('Year', [2020, 2020, 2021, 2021, 2020, 2022], [{ header: 'Month', cells: [13, 2, 14, 2, 13, 15] }, { header: 'Day', cells: [5, 31, 30, 31, 7, 8] }]),
      propose('Date', ISO_DATETIMES),
      propose('scientificName', LATIN, [{ header: 'individualCount', cells: NUMBERS }]),
      propose('Depth [m]', [5, 10, 15, 20, 25, 30], [{ header: 'Abundance', cells: NUMBERS }]),
    ];
    for (const c of cases) {
      const marked = withStated(c.sheet, c.proposals, { decimalComma: false });
      expect(marked.map((p) => p.role)).toEqual(c.proposals.map((p) => p.role));
      expect(marked.map((p) => p.index)).toEqual(c.proposals.map((p) => p.index));
      // the only difference to the proposals is the mark
      for (const [k, p] of marked.entries()) {
        const { stated, ...rest } = p;
        void stated;
        expect(rest).toEqual(c.proposals[k]);
      }
    }
  });

  it('a Date column the proposer reads as a datetime is stated by its name (date and datetime are one family)', () => {
    const { p, i } = propose('Date', ISO_DATETIMES);
    expect(['date', 'datetime']).toContain(p.role.kind);
    expect(i.stated).toBe(true);
    expect(withStated(propose('Date', ISO_DATETIMES).sheet, propose('Date', ISO_DATETIMES).proposals, { decimalComma: false }).find((x) => x.header === 'Date')?.stated).toBe(true);
  });
});

describe('stated: darwin core terms map to a role only where the converter writes that exact meaning', () => {
  it('verbatimLatitude and verbatimLongitude are never the position (a text in any notation)', () => {
    const rows: Cell[][] = [['54°30.6′N', '10°20.1′E'], ['54°31.2′N', '10°21.0′E'], ['54°32.0′N', '10°22.2′E'], ['54°33.4′N', '10°23.3′E'], ['54°34.8′N', '10°24.4′E'], ['54°35.1′N', '10°25.5′E']];
    const lat = propose('verbatimLatitude', rows.map((r) => r[0]), [{ header: 'verbatimLongitude', cells: rows.map((r) => r[1]) }], false, false);
    expect(lat.i.stated).toBe(false);
    expect(lat.info.every((x) => x.role?.kind !== 'latitude' && x.role?.kind !== 'longitude')).toBe(true);
  });

  it('an empty locationID is not the station and does not beat locality; organismQuantity beside individualCount is not a second quantity', () => {
    const empty = propose('locationID', [null, null, null, null, null, null], [{ header: 'locality', cells: ['Bay A', 'Bay A', 'Bay B', 'Bay B', 'Bay C', 'Bay C'] }], false, false);
    // (it is a term the converter does not write: answered as ignored, never the station)
    expect(empty.i.role?.kind).not.toBe('station');
    expect(empty.info.some((x) => x.stated && x.role?.kind === 'station')).toBe(false);
    const both = propose('individualCount', NUMBERS, [{ header: 'organismQuantity', cells: [1.5, 2.5, 3.5, 1.5, 4.5, 2.5] }], false, false);
    expect(both.i).toMatchObject({ stated: true, role: { kind: 'quantity' } });
    const second = both.info[both.proposals.findIndex((p) => p.header === 'organismQuantity')];
    // (a term the converter does not write beside individualCount: answered as ignored, never a second quantity)
    expect(second.role?.kind).not.toBe('quantity');
    // alone it is the quantity
    expect(propose('organismQuantity', NUMBERS, [{ header: 'scientificName', cells: LATIN }], false, false).i).toMatchObject({ stated: true, role: { kind: 'quantity' } });
  });

  it('the unit has to agree with the name: T needs a temperature unit, S a salinity unit, NA a concentration unit, Volume a volume of water; pH is exempt', () => {
    const t = [11.2, 11.4, 11.1, 10.9, 11.0, 11.3];
    const yes: [string, Cell[]][] = [['T [°C]', t], ['T [degC]', t], ['S [PSU]', [34.1, 34.2, 34.3, 34.1, 34.0, 34.2]], ['NA [mg/l]', [450, 460, 455, 470, 465, 462]], ['NA [mmol/m3]', [450, 460, 455, 470, 465, 462]], ['Volume [m3]', [12, 13, 14, 11, 12, 13]], ['Volume [l]', [12, 13, 14, 11, 12, 13]], ['pH', [8.1, 8.0, 8.2, 8.1, 8.0, 8.1]]];
    const no: [string, Cell[]][] = [['T [min]', t], ['T [years]', t], ['S [#]', t], ['S [cm]', t], ['NA [#]', [450, 460, 455, 470, 465, 462]], ['Volume [mm3]', [12, 13, 14, 11, 12, 13]], ['T', t], ['S', t], ['Temperature [min]', t]];
    const taxon = [{ header: 'Calanus finmarchicus', cells: NUMBERS }];
    for (const [h, c] of yes) expect(propose(h, c, taxon).i.stated, h).toBe(true);
    for (const [h, c] of no) expect(propose(h, c, taxon).i.stated, h).toBe(false);
  });

  it('Type, Sex, Habitat, Class and Order are terms only with at least two other exact terms beside them', () => {
    const cells = ['a', 'b', 'a', 'b', 'a', 'b'];
    for (const h of ['Type', 'Sex', 'Habitat', 'Class', 'Order']) {
      expect(propose(h, cells).i.stated, `${h} alone`).toBe(false);
      expect(propose(h, cells, [{ header: 'scientificName', cells: LATIN }]).i.stated, `${h} with one term`).toBe(false);
      expect(propose(h, cells, [{ header: 'scientificName', cells: LATIN }, { header: 'individualCount', cells: NUMBERS }]).i.stated, `${h} with two terms`).toBe(true);
    }
    // the ordinary words do not count for each other
    expect(propose('Type', cells, [{ header: 'Sex', cells }, { header: 'Habitat', cells }]).i.stated).toBe(false);
  });
});
