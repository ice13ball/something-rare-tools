// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The Event(s) block of a PANGAEA file as the source of a table's position and date. Every value is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { pangaeaNamesUsed } from '../../src/core/convert/headers';
import { readConvertFile } from '../../src/core/convert/read';
import { parsePangaeaText } from '../../src/core/parse/pangaea';
import { proposeColumns } from '../../src/core/recognize/columns';
import { renderPlain } from '../../src/core/report';
import { LANGS } from '../../src/core/types';
import type { ParsedFile } from '../../src/core/types';
import { runChecks } from '../../src/core/checks/run';
import { translate } from '../../src/core/i18n/ui';
import { sheetInput } from '../convert/helpers';
import { makeDataset } from '../helpers/build';

const PI = 'PI: Doe, Jane (jane@example.org)';
const pangaea = (events: string[], header: string[], rows: string[][], shorts = header): string =>
  [
    '/* DATA DESCRIPTION:',
    'Citation:\tDoe, Jane (2099): Invented counts [dataset]. PANGAEA, https://doi.org/10.1594/PANGAEA.000000, ',
    `Event(s):\t${events[0]}`,
    ...events.slice(1).map((e) => `\t${e}`),
    `Parameter(s):\t${header[0]} (${shorts[0]})`,
    ...header.slice(1).map((h, i) => `\t${h} (${shorts[i + 1]}) * ${PI}`),
    'License:\tCreative Commons Attribution 3.0 Unported (CC-BY-3.0) (URI: https://creativecommons.org/licenses/by/3.0/)',
    '',
    '*/',
    header.join('\t'),
    ...rows.map((r) => r.join('\t')),
  ].join('\n') + '\n';

const E1 = 'ST-01 (A1B2) * LATITUDE: 36.666890 * LONGITUDE: 34.508690 * DATE/TIME: 2099-03-20T08:40:00 * ELEVATION: -47.0 m * CAMPAIGN: X1';
const E2 = 'ST-02 * LATITUDE: -35.959920 * LONGITUDE: 35.876020 * DATE/TIME: 2099-03-21T12:40:00 * CAMPAIGN: X1';
const ids = (f: ParsedFile) => f.findings.map((x) => x.ruleId);
const roles = (f: ParsedFile) => proposeColumns(f.sheets[0], { decimalComma: false, date1904: false }).map((p) => `${p.header}:${p.role.kind}`);

describe('one event', () => {
  const text = pangaea([E1], ['Depth top [m]', 'Oithona similis [#/m**3]'], [['0', '4'], ['10', '7']]);
  const f = parsePangaeaText(text, 'one.tab');

  it('copies the position and date into columns with the text exactly as written, and says so', () => {
    expect(f.sheets[0].header).toEqual(['Depth top [m]', 'Oithona similis [#/m**3]', 'Latitude', 'Longitude', 'Date/Time']);
    expect(f.sheets[0].rows.map((r) => r.cells)).toEqual([
      ['0', '4', '36.666890', '34.508690', '2099-03-20T08:40:00'],
      ['10', '7', '36.666890', '34.508690', '2099-03-20T08:40:00'],
    ]);
    expect(ids(f)).toEqual(['IN-PANGAEA-EVENT-USED']);
    expect(f.findings[0].params).toMatchObject({ columns: 'Latitude, Longitude, Date/Time', count: 2, events: 1 });
    expect(roles(f).slice(-3)).toEqual(['Latitude:latitude', 'Longitude:longitude', 'Date/Time:datetime']);
  });

  it('the elevation is the sea floor level, not a sample depth: no depth column is made', () => {
    expect(f.sheets[0].header.some((h) => /depth|elevation/i.test(h) && h !== 'Depth top [m]')).toBe(false);
  });

  it('/convert writes the event with the borrowed position and date', () => {
    const withLabel = pangaea([E1], ['Sample label', 'Depth top [m]', 'Oithona similis [#/m**3]'], [['S1', '0', '4'], ['S2', '10', '7']]);
    const file = readConvertFile(parsePangaeaText(withLabel, 'one.tab'), withLabel);
    expect(pangaeaNamesUsed(file, file.sheets[0])).toBe(true);
    const r = convert({ sheets: [sheetInput(file, { shape: 'wide', quantity: { kind: 'density', unit: '#/m3' } })], options: {} });
    const sample = r.events.find((e) => e.eventType === 'sample')!;
    expect(sample.lat).toBeCloseTo(36.66689, 5);
    expect(sample.lon).toBeCloseTo(34.50869, 5);
    expect(sample.eventDate).toMatch(/^2099-03-20/);
    expect(r.findings.map((x) => x.ruleId)).toContain('IN-PANGAEA-EVENT-USED');
  });

  it('a start and end that are equal make a point, an interval of dates is kept whole', () => {
    const e = 'C-1 * LATITUDE START: 48.8 * LONGITUDE START: -16.5 * LATITUDE END: 48.8 * LONGITUDE END: -16.5 * DATE/TIME START: 2099-07-14T08:00:00 * DATE/TIME END: 2099-07-15T09:00:00';
    const g = parsePangaeaText(pangaea([e], ['Depth top [m]', 'A [#]'], [['0', '1']]), 'p.tab');
    expect(g.sheets[0].rows[0].cells.slice(2)).toEqual(['48.8', '-16.5', '2099-07-14T08:00:00/2099-07-15T09:00:00']);
  });

  it('a track (start differs from end) is not a point: the date is used, the position is not, and the finding says why', () => {
    const e = 'T-1 * LATITUDE START: -70.88 * LONGITUDE START: -11.11 * LATITUDE END: -70.89 * LONGITUDE END: -11.14 * DATE/TIME START: 2099-12-23T20:43:00';
    const g = parsePangaeaText(pangaea([e], ['Depth top [m]', 'A [#]'], [['0', '1']]), 't.tab');
    expect(g.sheets[0].header).toEqual(['Depth top [m]', 'A [#]', 'Date/Time']);
    expect(ids(g)).toEqual(['IN-PANGAEA-EVENT-NOT-USED', 'IN-PANGAEA-EVENT-USED']);
    expect(g.findings[0].params).toMatchObject({ track: 1 });
  });
});

describe('what the table has of its own is never touched', () => {
  it('own position and date columns: nothing is added', () => {
    const g = parsePangaeaText(pangaea([E1], ['Date/Time', 'Latitude', 'Longitude', 'A [#]'], [['2099-01-01', '1.5', '2.5', '3']]), 'own.tab');
    expect(g.sheets[0].header).toEqual(['Date/Time', 'Latitude', 'Longitude', 'A [#]']);
    expect(ids(g)).toEqual([]);
  });

  it('own position, no date: only the date is added, the position cells stay as they are', () => {
    const g = parsePangaeaText(pangaea([E1], ['Latitude', 'Longitude', 'A [#]'], [['1.5', '2.5', '3']]), 'pos.tab');
    expect(g.sheets[0].header).toEqual(['Latitude', 'Longitude', 'A [#]', 'Date/Time']);
    expect(g.sheets[0].rows[0].cells).toEqual(['1.5', '2.5', '3', '2099-03-20T08:40:00']);
  });

  it('a ragged row keeps its extra fields behind the new cells', () => {
    const g = parsePangaeaText(pangaea([E1], ['Depth top [m]', 'A [#]'], [['0', '1', 'stray']]), 'r.tab');
    expect(g.sheets[0].rows[0].cells).toEqual(['0', '1', '36.666890', '34.508690', '2099-03-20T08:40:00', 'stray']);
  });
});

describe('several events', () => {
  const header = ['Event', 'Depth top [m]', 'A [#]'];

  it('with an Event column each row takes its own event, matched exactly (the alias in brackets is not part of the name)', () => {
    const g = parsePangaeaText(pangaea([E1, E2], header, [['ST-01', '0', '1'], ['ST-02', '0', '2'], ['ST-01', '5', '3']]), 'many.tab');
    const cells = g.sheets[0].rows.map((r) => r.cells.slice(3));
    expect(cells).toEqual([
      ['36.666890', '34.508690', '2099-03-20T08:40:00'],
      ['-35.959920', '35.876020', '2099-03-21T12:40:00'],
      ['36.666890', '34.508690', '2099-03-20T08:40:00'],
    ]);
    expect(ids(g)).toEqual(['IN-PANGAEA-EVENT-USED']);
    expect(g.findings[0].params).toMatchObject({ events: 2, count: 3 });
  });

  it('a row whose event is not listed, is empty, or only starts like a listed one borrows nothing and is reported', () => {
    const g = parsePangaeaText(pangaea([E1, E2], header, [['ST-01', '0', '1'], ['ST-0', '0', '2'], ['ST-011', '5', '3'], ['', '5', '4'], ['st-02', '1', '5']]), 'miss.tab');
    const rows = g.sheets[0].rows;
    expect(rows[0].cells[3]).toBe('36.666890');
    for (const i of [1, 2, 3, 4]) expect(rows[i].cells.slice(3), String(i)).toEqual([null, null, null]);
    const un = g.findings.find((x) => x.ruleId === 'IN-PANGAEA-EVENT-UNMATCHED')!;
    expect(un.lines).toEqual([rows[1].line, rows[2].line, rows[3].line, rows[4].line]);
    expect(un.params.count).toBe(4);
  });

  it('two events with the same name are not guessed between', () => {
    const dup = E1.replace('ST-01 (A1B2)', 'ST-02');
    const g = parsePangaeaText(pangaea([dup, E2], header, [['ST-02', '0', '1']]), 'dup.tab');
    expect(g.sheets[0].rows[0].cells.slice(3)).toEqual([null, null, null]);
    expect(ids(g)).toContain('IN-PANGAEA-EVENT-UNMATCHED');
  });

  it('without an Event column nothing is used, and the finding says why', () => {
    const g = parsePangaeaText(pangaea([E1, E2], ['Depth top [m]', 'A [#]'], [['0', '1']]), 'nocol.tab');
    expect(g.sheets[0].header).toEqual(['Depth top [m]', 'A [#]']);
    expect(ids(g)).toEqual(['IN-PANGAEA-EVENT-NOT-USED']);
    expect(g.findings[0].params).toMatchObject({ several: 2 });
  });
});

describe('texts', () => {
  it('every language renders each finding without a placeholder left', () => {
    const many = parsePangaeaText(pangaea([E1, E2], ['Event', 'A [#]'], [['ST-01', '1'], ['zz', '2']]), 'm.tab');
    const none = parsePangaeaText(pangaea([E1, E2], ['A [#]'], [['1']]), 'n.tab');
    const track = parsePangaeaText(pangaea(['T-1 * LATITUDE START: 1 * LONGITUDE START: 2 * LATITUDE END: 3 * LONGITUDE END: 4 * DATE/TIME: 2099-01-01'], ['A [#]'], [['1']]), 't.tab');
    const all = [...many.findings, ...none.findings, ...track.findings];
    expect(new Set(all.map((x) => x.ruleId))).toEqual(new Set(['IN-PANGAEA-EVENT-USED', 'IN-PANGAEA-EVENT-UNMATCHED', 'IN-PANGAEA-EVENT-NOT-USED']));
    for (const fnd of all) for (const l of LANGS) expect(renderPlain(fnd, l), `${fnd.ruleId} ${l}`).not.toMatch(/[{}]/);
  });
});

describe('/check says when no position exists', () => {
  const run = (rows: Parameters<typeof makeDataset>[0]) => runChecks({ datasets: [makeDataset(rows)], records: [], parseFindings: [] }, { today: '2099-01-01' });

  it('lists the skipped position checks when no row of any table has a position, in four languages', () => {
    expect(run([{ datetime: '2020-01-01' }, {}]).notChecked).toContain('notChecked.noPositions');
    for (const l of LANGS) expect(translate(l, 'notChecked.noPositions').length, l).toBeGreaterThan(40);
  });

  it('is silent when a row has a position', () => {
    expect(run([{ lat: 50, lon: 5, datetime: '2020-01-01' }]).notChecked).not.toContain('notChecked.noPositions');
  });
});
