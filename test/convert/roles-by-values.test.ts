// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Column roles that the VALUES decide, whatever the header says (taxon names, dates, years, sizes, units, the word NA). Every row is invented.
import { describe, expect, it } from 'vitest';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { proposeColumns } from '../../src/core/recognize/columns';
import { rawSheet } from '../helpers/files';
import type { Cell } from './helpers';

const CTX = { decimalComma: false, date1904: false };
const rolesOf = (header: string[], rows: Cell[][], convert = true) => {
  const ps = (convert ? proposeConvertColumns : proposeColumns)(rawSheet(header, rows.map((r) => [...r])), CTX);
  return Object.fromEntries(ps.map((p) => [p.header, p]));
};
const N = (n: number, make: (i: number) => Cell[]): Cell[][] => Array.from({ length: n }, (_, i) => make(i));

describe('a column of Latin binomials is the taxon of a long sheet, under any header', () => {
  const names = ['Gadus morhua Linnaeus, 1758', 'Pleuragramma antarctica Boulenger, 1902', 'Sagitta (Parasagitta) elegans', 'Calanus cf. glacialis', 'Acartia sp.', 'Oithona similis'];
  for (const header of ['Scientific name', 'SpName', 'Organism', 'Taxon_of_record']) {
    it(`under "${header}"`, () => {
      const r = rolesOf(['Station', header, 'Count'], N(6, (i) => ['S1', names[i], i + 1]));
      expect(r[header].role).toEqual({ kind: 'taxon' });
      expect(r[header].confidence).toBe('high');
      expect(r[header].reasonCode).toBe('values-latin-names');
    });
  }

  it('two such columns (a host and a parasite) are not told apart: the leftmost is offered with low confidence', () => {
    const r = rolesOf(['Station', 'Host', 'Parasite', 'Count'], N(6, (i) => ['S1', names[i], names[(i + 1) % 6], i + 1]));
    expect(r.Host.role).toEqual({ kind: 'taxon' });
    expect(r.Host.confidence).toBe('low');
    expect(r.Parasite.role.kind).toBe('ignore');
  });

  it('a column of places, methods or notes is not taken for one, nor a column with too few cells', () => {
    const places = ['Baltic sea', 'Muddy sand', 'Surface water', 'Weddell Sea shelf', 'Rocky shore', 'Sandy mud'];
    const r = rolesOf(['Station', 'Habitat', 'Count'], N(6, (i) => ['S1', places[i], i + 1]));
    expect(r.Habitat.role.kind).toBe('ignore');
    const few = rolesOf(['Station', 'Organism', 'Count'], [['S1', 'Gadus morhua', 1], ['S1', 'Acartia sp.', 2]]);
    expect(few.Organism.role.kind).toBe('ignore');
    // a mixed column: a third of the cells are names, the rest free text
    const mixed = rolesOf(['Station', 'Notes', 'Count'], N(6, (i) => ['S1', i < 2 ? names[i] : places[i], i + 1]));
    expect(mixed.Notes.role.kind).toBe('ignore');
  });

  it('a column that is named as the taxon already keeps its claim', () => {
    const r = rolesOf(['Station', 'Species', 'Other names', 'Count'], N(6, (i) => ['S1', names[i], names[5 - i], i + 1]));
    expect(r.Species.reasonCode).toBe('name-taxon');
    expect(r['Other names'].role.kind).toBe('ignore');
  });
});

describe('a column of dates under an unknown header is a date, with low confidence, when the sheet has no other', () => {
  const day = (i: number) => `2014-05-${String(i + 1).padStart(2, '0')}`;
  it('ISO dates; dates with one stray cell (a units row) among ten or more; day.month.year', () => {
    expect(rolesOf(['Station', 'DateCollected', 'x'], N(5, (i) => ['S1', day(i), i]), false).DateCollected.role).toEqual({ kind: 'date' });
    const stray = N(12, (i) => ['S1', i === 0 ? 'unitless' : day(i), i]);
    expect(rolesOf(['Station', 'date_local', 'x'], stray, false).date_local.role).toEqual({ kind: 'date' });
    expect(rolesOf(['Station', 'recorded', 'x'], N(5, (i) => ['S1', `${String(i + 1).padStart(2, '0')}.05.2014`, i]), false).recorded.role).toEqual({ kind: 'date' });
  });
  it('not for a column that is mostly something else, a year, or placeholders of a spreadsheet', () => {
    expect(rolesOf(['Station', 'note', 'x'], N(12, (i) => ['S1', i < 5 ? day(i) : 'see report', i]), false).note.role.kind).toBe('ignore');
    expect(rolesOf(['Station', 'when', 'x'], N(5, (i) => ['S1', '1899-12-30 12:30', i]), false).when.role.kind).toBe('ignore');
  });
  it('a real date column wins the slot over the one found by its values', () => {
    const r = rolesOf(['Station', 'Date', 'DateCollected'], N(5, (i) => ['S1', day(i), day(i)]), false);
    expect(r.Date.role).toEqual({ kind: 'date' });
    expect(r.DateCollected.role.kind).toBe('ignore');
  });
});

describe('a column named time whose cells are full datetimes', () => {
  const t = (i: number) => `2003-01-${String(17 + i)}T00:00:00Z`;
  it('is the date and time of the row when no other column is the date (/check and /convert alike)', () => {
    for (const convert of [false, true]) {
      const r = rolesOf(['Station', 'time', 'x'], N(4, (i) => ['S1', t(i), i]), convert);
      expect(r.time.role, String(convert)).toEqual({ kind: 'datetime' });
      expect(r.time.reasonCode).toBe('time-holds-datetimes');
    }
  });
  it('stays a time beside a real date column, and real times stay times', () => {
    expect(rolesOf(['Station', 'Date', 'time'], N(4, (i) => ['S1', `2003-01-${17 + i}`, t(i)]), false).time.role).toEqual({ kind: 'time' });
    expect(rolesOf(['Station', 'time', 'x'], N(4, (i) => ['S1', `0${i + 1}:30`, i]), false).time.role).toEqual({ kind: 'time' });
  });
  it('placeholders of a spreadsheet (1899-12-30 12:30) are times, not dates: the column stays a time', () => {
    expect(rolesOf(['Station', 'time', 'x'], N(4, (i) => ['S1', `1899-12-30 1${i}:30:00`, i]), false).time.role).toEqual({ kind: 'time' });
  });
});

describe('numeric columns that no species column can be are not taxon candidates', () => {
  const header = ['Station', 'SampleYear', 'Year', 'DepthStart', 'CoreDiameter', 'Samp vol [m**3]', 'Duration [min]', 'Calanus', 'Acartia', 'Oithona similis', 'Pseudocalanus', 'Absent species'];
  const rows = N(5, (i) => ['S1', 2014, 1986 + i, 200 + 5 * i, 6.35, 30.5 + i, 10, 3 + i, 4, i, 1, 0]);
  const r = rolesOf(header, rows);

  it('years, one fractional value on every row, a size word, a volume or a time unit', () => {
    expect(r.SampleYear.role.kind).toBe('ignore');
    expect(r.SampleYear.reasonCode).toBe('year-values');
    expect(r.Year.reasonCode).toBe('year-values');
    expect(r.CoreDiameter.role.kind).not.toBe('taxon');
    expect(r['Samp vol [m**3]'].role).toMatchObject({ kind: 'effort' });
    expect(r['Duration [min]'].role).toMatchObject({ kind: 'variable', variable: 'Duration', unit: 'min' });
  });

  it('DepthStart is the top of a depth range, the camel-case words are read', () => {
    expect(r.DepthStart.role).toMatchObject({ kind: 'depth', bound: 'min' });
    const two = rolesOf(['Station', 'DepthSampleStart', 'DepthSampleEnd', 'Calanus'], N(4, (i) => ['S1', 10 + i, 20 + i, i]));
    expect(two.DepthSampleStart.role).toMatchObject({ kind: 'depth', bound: 'min' });
    expect(two.DepthSampleEnd.role).toMatchObject({ kind: 'depth', bound: 'max' });
  });

  it('real genera stay candidates, a one-word genus included, and so does a column of zeros', () => {
    for (const h of ['Calanus', 'Acartia', 'Oithona similis', 'Pseudocalanus', 'Absent species']) expect(r[h].role, h).toEqual({ kind: 'taxon', header: true });
  });

  it('a species column whose counts happen to be whole numbers near 2000 stays a candidate (fewer than 3 rows, or beyond the span of years)', () => {
    const small = rolesOf(['Station', 'Calanus'], [['S1', 1900], ['S1', 2000]]);
    expect(small.Calanus.role).toEqual({ kind: 'taxon', header: true });
    const wide = rolesOf(['Station', 'Calanus'], N(4, (i) => ['S1', 1800 + 100 * i]));
    expect(wide.Calanus.role).toEqual({ kind: 'taxon', header: true });
  });

  it('a column with a unit of length, area or temperature is no species, whatever its name', () => {
    const q = rolesOf(['Station', 'Swept [km2]', 'Fork length [mm]', 'Water [°C]', 'Calanus [ind/m3]'], N(4, (i) => ['S1', 1.5 + i, 100 + i, 4 + i / 10, i]));
    expect(q['Swept [km2]'].role).toMatchObject({ kind: 'effort', unit: 'km2' });
    expect(q['Fork length [mm]'].role).toMatchObject({ kind: 'variable', unit: 'mm' });
    expect(q['Water [°C]'].role.kind).toBe('variable');
    expect(q['Calanus [ind/m3]'].role).toEqual({ kind: 'taxon', header: true });
  });

  it('volume abbreviations of the plankton data bases are the effort', () => {
    const q = rolesOf(['Station', 'volfilt', 'Samp vol', 'Calanus'], N(4, (i) => ['S1', 30.5 + i, 28 + i, i]));
    expect(q.volfilt.role.kind).toBe('effort');
    expect(q['Samp vol'].role.kind).toBe('effort');
  });
});

describe('an Aphia ID column of a long sheet', () => {
  const sheet = (aphia: string, extra: Cell[] = []) => rolesOf(['Station', 'Scientific name', aphia, 'Ind [#] (>3 = shoal)'], N(4, (i) => ['S1', ['Gadus morhua', 'Acartia sp.', 'Oithona similis', 'Calanus cf. glacialis'][i], (extra[i] ?? 126436 + i) as Cell, i + 1]));
  it('a header holding AphiaID, aphia_id or Aphia ID whole, in a bracket too, over whole numbers, is the taxon ID', () => {
    expect(sheet('Reg spec no (WoRMS Aphia ID)')['Reg spec no (WoRMS Aphia ID)'].role).toEqual({ kind: 'taxonId', aphia: true });
    expect(sheet('AphiaID').AphiaID.role).toEqual({ kind: 'taxonId', aphia: true });
  });
  it('another spelling, or a cell that is not a whole number, is not', () => {
    expect(sheet('aphiaid').aphiaid.role.kind).not.toBe('taxonId');
    expect(sheet('Reg spec no (WoRMS Aphia ID)', [1, 2, '12a', 4])['Reg spec no (WoRMS Aphia ID)'].role.kind).not.toBe('taxonId');
  });
});

describe('NA is "not available" unless the header says it is sodium', () => {
  const rows = N(4, (i) => ['S1', i, i]);
  const var0 = (h: string, convert = false) => rolesOf(['Station', h, 'x'], rows, convert)[h].role;
  it('Na is sodium; NA and na are, only with a unit', () => {
    expect(var0('Na')).toMatchObject({ kind: 'variable', variable: 'sodium' });
    expect(var0('NA [mg/l]')).toMatchObject({ kind: 'variable', variable: 'sodium' });
    expect(var0('NA')).not.toMatchObject({ variable: 'sodium' });
    expect(var0('na')).not.toMatchObject({ variable: 'sodium' });
  });
});

describe('three things the file-by-file run on real data showed', () => {
  it('epithets in -i (scotti, tokarevi) count as Latin; a comment that says total keeps a PANGAEA total column out of the species', () => {
    const r = rolesOf(['Station', 'Scientific name', 'Count'], N(4, (i) => ['S1', ['Trematomus scotti (Boulenger, 1907)', 'Trematomus tokarevi Andriashev, 1978', 'Pogonophryne scotti Regan, 1914', 'Akarotaxis nudiceps  (Waite, 1916)'][i], i + 1]));
    expect(r['Scientific name'].role).toEqual({ kind: 'taxon' });
    const w = rolesOf(['Station', 'Calanus [#/m**3] (size fraction > 300 µm)', 'Zoopl [#/m**3] (total)'], N(4, (i) => ['S1', i, 10 + i]));
    expect(w['Zoopl [#/m**3] (total)'].role.kind).toBe('ignore');
    expect(w['Zoopl [#/m**3] (total)'].reasonCode).toBe('summary-total');
    expect(w['Calanus [#/m**3] (size fraction > 300 µm)'].role).toEqual({ kind: 'taxon', header: true });
  });

  it('a table of samples in numbered columns, with the species in its rows, is not read as a long sheet', () => {
    const header = ['sp.', '1', '2', '3', '4', '5', '6'];
    const names = ['Gadus morhua', 'Acartia longiremis', 'Oithona similis', 'Calanus finmarchicus'];
    const r = rolesOf(header, N(4, (i) => [names[i], 0, 1, 2, 3, 4, 5]));
    expect(r['sp.'].role.kind).toBe('ignore');
  });
});
