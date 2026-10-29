// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Every reason the shared column proposer gives is a code (recognize/reasons.ts CHECK_REASONS) with a text per language, and
// /check shows it in the reader's language: never English in pl, de or fr. Synthetic headers and values only.
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MappingEditor } from '../../src/app/components/MappingEditor';
import { initLang, setLang } from '../../src/app/i18n';
import { OVERLAY_REASONS, proposeConvertColumns } from '../../src/core/convert/recognize';
import { UI, type UiKey } from '../../src/core/i18n/ui';
import { proposeColumns } from '../../src/core/recognize/columns';
import { CHECK_REASONS, reasonEnglish, type ReasonCode } from '../../src/core/recognize/reasons';
import type { ColumnProposal, RawSheet } from '../../src/core/types';
import { LANGS } from '../../src/core/types';
import { rawSheet } from '../helpers/files';

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const key = (code: string): UiKey => `check.reason.${code}` as UiKey;
const CODES = Object.keys(CHECK_REASONS) as ReasonCode[];
const CTX = { decimalComma: false, date1904: false };
type Cell = string | number | null;

describe('the reason table', () => {
  it('every code has a text in all four languages; English is the technical wording, the other three differ from it', () => {
    for (const code of CODES) {
      for (const lang of LANGS) expect(UI[lang][key(code)]?.trim(), `${lang} ${code}`).toBeTruthy();
      expect(UI.en[key(code)], code).toBe(CHECK_REASONS[code]);
      for (const lang of ['pl', 'de', 'fr'] as const) expect(UI[lang][key(code)], `${lang} ${code}`).not.toBe(UI.en[key(code)]);
    }
  });

  it('no check.reason key exists without its code, and none lacks a language', () => {
    for (const lang of LANGS) {
      const keys = Object.keys(UI[lang]).filter((k) => k.startsWith('check.reason.'));
      expect(keys.sort(), lang).toEqual(CODES.map((c) => `check.reason.${c}`).sort());
    }
  });

  it('every translation has the same placeholders as the English text, and no English wording of a reason', () => {
    const holes = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const code of CODES) {
      for (const lang of ['pl', 'de', 'fr'] as const) {
        const text = UI[lang][key(code)];
        expect(holes(text), `${lang} ${code}`).toEqual(holes(CHECK_REASONS[code]));
        expect(text, `${lang} ${code}`).not.toMatch(/\b(name says|another column|column is|values are|the header|is used for|depth is|text column|quality flag)\b/i);
      }
    }
  });

  it('the converter keeps its own table: no code is shared, so an overlay code never reads a check text', () => {
    for (const code of Object.keys(OVERLAY_REASONS)) expect(CODES, code).not.toContain(code);
  });

  it('columns.ts writes a reason only through its code table: no free text, no string built by hand', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'core', 'recognize', 'columns.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // a `reason:` / `.reason =` / `.reason +=` appears only where the text of reasons.ts is copied across (reasonOf, applyReason)
    const lines = src.split('\n').map((l) => l.trim()).filter((l) => /\breason:|\.reason\s*\+?=/.test(l));
    expect(lines).toEqual([
      "return { reason: w.reason, reasonCode: w.code, ...(w.params === undefined ? {} : { reasonParams: w.params }) };",
      "p.reason = `${lead.reason}; ${p.reason}`;",
      "p.reason += notes.map((n) => `; ${n.reason}`).join('');",
    ]);
    // every why(...) names a code of the table (a literal, or a template / lookup that resolves to one)
    for (const m of src.matchAll(/\bwhy\(\s*([^,)]*)/g)) {
      const a = m[1].trim();
      if (/^'[\w-]+'$/.test(a)) expect(CODES, a).toContain(a.slice(1, -1) as ReasonCode);
      else expect(a, a).toMatch(/^`name-\$\{bare\.axis\}-marked`$|^f\.axis === 'latitude' \? 'bare-latitude' : 'bare-longitude'$|^OTHER_USED\[slot\]$|^c\.why\b|^code: string|^code: ReasonCode/);
    }
  });
});

/** A battery of synthetic sheets that between them reach every reason the proposer can give. */
function battery(): { sheet: RawSheet; place?: true; long?: { parameterCol: number; valueCol: number; unitCol?: number } }[] {
  const S = (h: string[], r: Cell[][], df?: boolean[]): { sheet: RawSheet } => ({ sheet: rawSheet(h, r, 'S', df) });
  const out: { sheet: RawSheet; place?: true; long?: { parameterCol: number; valueCol: number; unitCol?: number } }[] = [
    // English names, one per role
    S(['Latitude', 'Longitude', 'Date', 'Time', 'Depth', 'Cruise', 'Station', 'Sample ID', 'Salinity', 'Comments', 'QC flag', '', 'Mystery'], [
      [54.5, 18.5, '2020-05-12', '10:30', 12, 'C1', 'S1', 'A-1', 35.1, 'ok', 1, 'x', 3.3],
      [54.6, 18.6, '2020-05-13', '11:30', 14, 'C1', 'S2', 'A-2', 35.2, 'ok', 1, 'y', 3.4],
    ]),
    S(['Date and time', 'Elevation', 'Probe', 'Pressure [dbar]'], [['2020-05-12 10:30', 12, 'P-1', 5], ['2020-05-13 11:30', 14, 'P-2', 6]]),
    // Polish: a marked latitude, a depth range (two bounds), a prefix + próby sample id
    S(['Szerokość [°N]', 'Długość [°E]', 'Głębokość od', 'Głębokość do', 'Kod próby'], [[54.5, 18.5, 0, 10, 'A-1'], [54.6, 18.6, 5, 15, 'A-2']]),
    // a depth with negative values (positive up), two columns for the date where the first is empty (the empty one loses), a second sample column
    S(['Depth', 'Date', 'Data poboru', 'Sample', 'Nr próby'], [[-5, null, '2020-05-12', 'A-1', 'B-1'], [-10, null, '2020-05-13', 'A-2', 'B-2']]),
    // a bare width / length that is a coordinate because both are present and fit
    S(['Szerokość', 'Długość', 'Temperatura'], [[54.37, 18.62, 4.5], [54.41, 18.7, 4.6]]),
    // values, not names: degrees and minutes, ISO dates, an Excel date column
    S(['a', 'b', 'c'], [["54°30.5′N", '2020-05-12', 44000], ["54°31.5′N", '2020-05-13', 44001]], [false, false, true]),
    // Darwin Core
    S(['eventDate', 'decimalLatitude', 'decimalLongitude', 'minimumDepthInMeters', 'locationID', 'occurrenceID', 'eventID', 'verbatimLatitude', 'locality', 'catalogNumber', 'year', 'scientificName', 'dwc:eventTime'], [
      ['2020-05-12', 54.5, 18.5, 5, 'L1', 'O1', 'E1', '54.5', 'Bay', 'C1', 2020, 'Calanus', '10:30'],
      ['2020-05-13', 54.6, 18.6, 6, 'L2', 'O2', 'E2', '54.6', 'Bay', 'C2', 2020, 'Calanus', '11:30'],
    ]),
    // NERC P01 codes
    S(['ALATZZ01', 'ALONZZ01', 'ADEPZZ01', 'STRT8601', 'TEMPPR01', 'PRESPR01', 'SDN:P01::PSLTZZ01'], [
      [54.5, 18.5, 5, '2020-05-12T10:30:00Z', 4.5, 5, 35],
      [54.6, 18.6, 6, '2020-05-13T11:30:00Z', 4.6, 6, 35],
    ]),
    // ISO dates as text under a name that says nothing; the end of a depth range on its own
    S(['when', 'Głębokość do'], [['2020-05-12', 10], ['2020-05-13', 15]]),
    // two columns for the same longitude, time and cruise: the first is used
    S(['Longitude', 'Lon', 'Time', 'Uhrzeit', 'Cruise', 'Expedition'], [[18.5, 18.5, '10:30', '10:30', 'C1', 'C1'], [18.6, 18.6, '11:30', '11:30', 'C1', 'C1']]),
    // a German sheet: a depth range with von / bis (the second bound is not read)
    S(['Tiefe von', 'Tiefe bis', 'Probe'], [[0, 10, 'P-1'], [5, 15, 'P-2']]),
    // the start and end of a tow, a hemisphere letter, an identifier and an abundance
    S(['Begin Latitude', 'End Latitude', 'Begin Longitude', 'Lon Dir', 'Catalog ID', 'Count'], [[54.5, 54.6, 18.5, 'E', 101, 1], [54.6, 54.7, 18.6, 'E', 102, 12]]),
    // a hemisphere letter that names no mapped coordinate stays ignored; one of two positions with nothing to tell which is ambiguous
    S(['Lon Dir', 'Depth'], [['E', 10], ['W', 15]]),
    S(['Begin Latitude', 'End Latitude', 'Lat Dir'], [[54.5, 54.6, 'N'], [54.6, 54.7, 'N']]),
    // a coordinate that carries its own signs: its letter column is not applied
    S(['Latitude', 'Lat NS'], [[-32.7, 'S'], [-33, 'S']]),
    // only the end position of a tow
    S(['End Lat', 'End Lon'], [[54.5, 18.5], [54.6, 18.6]]),
    // a place column with short repeated names is the station when the converter asks for it
    { ...S(['Location', 'Temp'], [['North bay', 4.5], ['North bay', 4.6], ['Rocky point', 5.1]]), place: true as const },
    // long format: the parameter, unit and value columns are read through the layout
    { ...S(['Param', 'Unit', 'Value', 'Date'], [['T', 'C', 4.5, '2020-05-12'], ['S', 'psu', 35, '2020-05-12']]), long: { parameterCol: 0, unitCol: 1, valueCol: 2 } },
  ];
  return out;
}

function proposalsOf(): { p: ColumnProposal; sheet: RawSheet }[] {
  const all: { p: ColumnProposal; sheet: RawSheet }[] = [];
  for (const b of battery()) for (const p of proposeColumns(b.sheet, { ...CTX, ...(b.long ? { long: b.long } : {}), ...(b.place ? { placeAsStation: true } : {}) })) all.push({ p, sheet: b.sheet });
  return all;
}

/** The English text a proposal's code, params, lead and notes stand for. */
const englishOf = (p: ColumnProposal): string => {
  const parts = [...(p.reasonLead === undefined ? [] : [p.reasonLead]), p.reasonCode as string, ...(p.reasonNotes ?? [])];
  return parts.map((c) => reasonEnglish(c as ReasonCode, c === p.reasonCode ? p.reasonParams : undefined)).join('; ');
};

describe('every proposal carries its code', () => {
  it('no proposal has a reason without a code, and the English reason is the table text with its values', () => {
    const seen = new Set<string>();
    for (const { p } of proposalsOf()) {
      expect(p.reasonCode, `${p.header}: ${p.reason}`).toBeDefined();
      expect(CODES, p.reasonCode).toContain(p.reasonCode);
      // a NERC P01 reason adds the English label of the concept after the code
      if (p.reasonCode === 'p01') expect(p.reason, p.header).toMatch(new RegExp(`^${englishOf(p)}: .+`));
      else expect(p.reason, `${p.header} (${p.reasonCode})`).toBe(englishOf(p));
      seen.add(p.reasonCode as string);
      for (const c of [...(p.reasonLead === undefined ? [] : [p.reasonLead]), ...(p.reasonNotes ?? [])]) {
        expect(CODES, c).toContain(c);
        seen.add(c);
      }
      // the values a text needs are all given
      for (const hole of CHECK_REASONS[p.reasonCode as ReasonCode].matchAll(/\{(\w+)\}/g)) expect(p.reasonParams?.[hole[1]], `${p.reasonCode} {${hole[1]}}`).toBeTruthy();
    }
    // 'note-depth-not-stated' is a guard no header reaches today: every depth name the proposer knows contains a depth word
    expect(CODES.filter((c) => !seen.has(c) && c !== 'note-depth-not-stated'), 'codes the battery never reaches').toEqual([]);
  });
});

describe('/check shows the reason in the reader language', () => {
  const show = (lang: 'en' | 'pl' | 'de' | 'fr', p: ColumnProposal): string | null | undefined => {
    cleanup();
    setLang(lang);
    const low: ColumnProposal = { ...p, confidence: 'low' }; // a note is shown for low confidence only: every reason is shown once
    render(<MappingEditor sheet="S" proposals={[low]} samples={[['1']]} mapping={{ sheet: 'S', columns: [{ index: p.index, header: p.header, role: p.role }] }} onChange={() => {}} />);
    return document.querySelector('.low-note .muted')?.textContent;
  };

  it('pl, de and fr show the translated text of every code, with its values, never the English reason', () => {
    const cases = proposalsOf().map((c) => c.p);
    for (const lang of ['pl', 'de', 'fr'] as const) {
      for (const p of cases) {
        const parts = [...(p.reasonLead === undefined ? [] : [p.reasonLead]), p.reasonCode as string, ...(p.reasonNotes ?? [])];
        const want = parts
          .map((c) => {
            let text = UI[lang][key(c)];
            if (c === p.reasonCode) for (const [k, v] of Object.entries(p.reasonParams ?? {})) text = text.replace(`{${k}}`, v);
            return text;
          })
          .join('; ');
        const note = show(lang, p);
        expect(note, `${lang} ${p.header} ${p.reasonCode}`).toBe(want);
        expect(note, `${lang} ${p.header}`).not.toBe(p.reason);
        expect(note, `${lang} ${p.header}`).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it('en shows the English reason of the proposal', () => {
    for (const { p } of proposalsOf()) {
      // the page names a NERC P01 code; the technical English reason adds the concept's label
      if (p.reasonCode === 'p01') expect(p.reason.startsWith(`${show('en', p)}: `), p.header).toBe(true);
      else expect(show('en', p), p.header).toBe(p.reason);
    }
  });

  it('a proposal without a code still shows its English reason, and a converter overlay code still shows the converter text', () => {
    const plain: ColumnProposal = { index: 0, header: 'x', cleanHeader: 'x', role: { kind: 'variable', variable: 'x' }, confidence: 'low', reason: 'numeric column with an unrecognised name' };
    setLang('pl');
    expect(show('pl', plain)).toBe('numeric column with an unrecognised name');
    const overlay: ColumnProposal = { ...plain, reasonCode: 'taxon-numeric', reasonLead: 'lead-empty', reasonNotes: ['note-negative-up'], reasonParams: { name: 'zzz' } };
    expect(show('pl', overlay)).toBe(UI.pl['convert.reason.taxon-numeric']);
  });
});

describe('the converter overlay', () => {
  it('leaves no value, lead or note of a shared reason on a proposal whose reason it replaced', () => {
    const sheets = [
      rawSheet(['Sample', 'eventID', 'Species', 'Count', 'Date', 'Data poboru'], [[null, 'e1', 'Calanus', 3, null, '2020-05-12'], [null, 'e2', 'Calanus', 4, null, '2020-05-13']]),
      rawSheet(['Station', 'Calanus finmarchicus', 'Total copepods', 'Depth top', 'Depth bottom'], [['S', '+', 4, -1, -5], ['T', 'NA', 5, -2, -6]]),
    ];
    let overlay = 0;
    for (const sheet of sheets) {
      for (const p of proposeConvertColumns(sheet, CTX)) {
        if (p.reasonCode === undefined || p.reasonCode in CHECK_REASONS) continue;
        overlay++;
        expect(p.reasonParams, p.header).toBeUndefined();
        expect(p.reasonLead, p.header).toBeUndefined();
        expect(p.reasonNotes, p.header).toBeUndefined();
      }
    }
    expect(overlay).toBeGreaterThan(0);
  });
});
