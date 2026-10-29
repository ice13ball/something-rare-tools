// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A code that a header names with the explicit prefix SDN:P01:: / SDN:P06:: and that is not of the shape of its collection (P01: 8 characters, P06: 4) has no concept page
// (NVS answers 404). /check says so (ROW-HEADER-CODE-SHAPE), /convert says so (CONV-NERC-CODE-MALFORMED) and writes no identifier from it. An INVENTED file; nothing here reads a real one.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runChecks } from '../../src/core/checks/run';
import { buildDatasets } from '../../src/core/dataset';
import { convert } from '../../src/core/convert/build';
import { judge, policyOf } from '../../src/core/convert/policy';
import { readConvertFile } from '../../src/core/convert/read';
import { parseFile } from '../../src/core/parse';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import { P01_CODE_SHAPE, badHeaderCodes } from '../../src/core/recognize/headerCodes';
import { p01CodeOf } from '../../src/core/recognize/vocab';
import { P01_DECLARED } from '../../src/core/convert/nerc';
import { p01Url } from '../../src/core/output/draft';
import { renderConvertPlain } from '../../src/core/rules/convert';
import { renderPlain } from '../../src/core/report';
import { LANGS } from '../../src/core/types';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';

const NAME = 'f12-malformed-p01.csv';
const bytes = new Uint8Array(readFileSync(join(__dirname, '..', 'fixtures', 'convert-env', NAME)));
const BAD = 'SDN:P01::D13CMOP11<Float32>';

describe('badHeaderCodes: only the explicit prefix, only the wrong shape', () => {
  it('flags a 9-character P01 code, a short one, a lower-case one and a 5-character P06 code', () => {
    expect(badHeaderCodes(BAD)).toEqual([{ collection: 'P01', code: 'D13CMOP11', length: 8 }]);
    expect(badHeaderCodes('SDN:P01::ABC123')[0]).toMatchObject({ code: 'ABC123' });
    expect(badHeaderCodes('SDN:P01::psalst01')[0]).toMatchObject({ code: 'psalst01' });
    expect(badHeaderCodes('Sal [SDN:P06::UUUUU]')).toEqual([{ collection: 'P06', code: 'UUUUU', length: 4 }]);
  });

  it('reads only the run of letters and digits after the prefix: what follows (_QC, <Float32>, |, a full stop, a zero-width space...) never turns a valid code into a bad one', () => {
    for (const h of ['SDN:P01::TEMPPR01_QC', 'SDN:P01::TEMPPR01:INSTANCE', 'SDN:P01::TEMPPR01|SDN:P06::UPAA', 'SDN:P01::TEMPPR01{x}', 'SDN:P01::TEMPPR01.', 'SDN:P01::TEMPPR01/', 'SDN:P01::TEMPPR01*', 'SDN:P01::TEMPPR01\u200b', 'SDN:P01:: TEMPPR01', 'SDN:P01::1EMPPR01']) {
      expect(badHeaderCodes(h), JSON.stringify(h)).toEqual([]);
    }
    // a code that is wrong keeps being reported when something follows it
    expect(badHeaderCodes('SDN:P01::D13CMOP11_QC')).toEqual([{ collection: 'P01', code: 'D13CMOP11', length: 8 }]);
    expect(badHeaderCodes('SDN:P01::D13CMOP11|SDN:P06::UPAAA').map((b) => b.code)).toEqual(['D13CMOP11', 'UPAAA']);
  });

  it('a prefix with no code after it names no code at all, so nothing is reported (an empty "code" would say nothing useful)', () => {
    for (const h of ['SDN:P01::', 'SDN:P01:: ', 'SDN:P06::<Float32>', 'SDN:P01::_QC']) expect(badHeaderCodes(h), h).toEqual([]);
  });

  it('P01_CODE_SHAPE is the one definition: a code that begins with a digit is a valid P01 code everywhere (the vocabulary has 66)', () => {
    expect(P01_CODE_SHAPE.test('1EMPPR01')).toBe(true);
    expect(p01CodeOf('SDN:P01::1EMPPR01')).toMatchObject({ code: '1EMPPR01', declared: true });
    expect(P01_DECLARED).toBe(P01_CODE_SHAPE);
    expect(p01Url('1EMPPR01')).toBe('https://vocab.nerc.ac.uk/collection/P01/current/1EMPPR01/');
    expect(p01CodeOf('SDN:P01::1EMPPR0')).toBeUndefined();
  });

  it('says nothing about a valid code or about ordinary words, however they look', () => {
    for (const h of ['SDN:P01::PSALST01<Float32>', 'SDN:P01::D13CMOP1', 'Sal [SDN:P06::UPAA]', 'SDN:P02::ATTN', 'SDN:P02::LONGERCODE', 'TEMPERATURE', 'TEMPERATURE<Float32>', 'PSALST01', 'SALINITY_PSU', 'Temperature [degC]', 'SDN:P01', 'SDN:L22::TOOL0669']) {
      expect(badHeaderCodes(h), h).toEqual([]);
    }
  });
});

describe('/check: ROW-HEADER-CODE-SHAPE', () => {
  const findings = () => {
    const file = parseFile(NAME, bytes);
    const layout = proposeLayout(file);
    const built = buildDatasets(file, layout, proposeMappings(file, layout), [], 'd1');
    return runChecks({ datasets: built.datasets, records: [], parseFindings: built.findings }, { today: '2026-10-29' }).findings;
  };

  it('fires once, for the bad column only, names the column and the code, and is a warning', () => {
    const f = findings().filter((x) => x.ruleId === 'ROW-HEADER-CODE-SHAPE');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', params: { column: 'SDN:P01::D13CMOP11', code: 'D13CMOP11', collection: 'P01', length: 8 } });
    for (const lang of LANGS) {
      const text = renderPlain(f[0], lang);
      expect(text, lang).toContain('D13CMOP11');
      expect(text, lang).toContain('SDN:P01::D13CMOP11');
    }
  });

  it('does not fire on the valid SDN:P01::PSALST01 column or on the bare word TEMPERATURE', () => {
    const f = findings().filter((x) => x.ruleId === 'ROW-HEADER-CODE-SHAPE');
    expect(JSON.stringify(f)).not.toContain('PSALST01');
    expect(JSON.stringify(f)).not.toContain('TEMPERATURE');
  });
});

describe('/convert: CONV-NERC-CODE-MALFORMED, and no dead address is written', () => {
  const run = async (nerc?: Record<string, unknown>) => {
    const parsed = await createDirectConvertEngine().parse([{ name: NAME, bytes }] as never);
    const f = parsed.files[0];
    const mapping = f.mappings[0];
    const bad = mapping.columns.find((c) => c.header === BAD)!;
    const r = convert({
      sheets: [{ file: readConvertFile(parseFile(NAME, bytes)), sheet: mapping.sheet, mapping, shape: f.suggestedShapes[mapping.sheet] ?? 'wide', profile: { depthIds: true, positionStation: true }, ...(nerc ? { nerc } : {}) } as never],
    });
    return { r, bad };
  };

  it('says it once, for the bad column, as a warning to accept, in all four languages', async () => {
    const { r } = await run();
    const f = r.findings.filter((x) => x.ruleId === 'CONV-NERC-CODE-MALFORMED');
    expect(f).toHaveLength(1);
    // the column is shown without the type suffix of the file, as /check shows it
    expect(f[0].params).toMatchObject({ column: 'SDN:P01::D13CMOP11', code: 'D13CMOP11', collection: 'P01', length: 8 });
    expect(policyOf(f[0])).toBe('accept');
    expect(judge(r.findings).acceptRules).toContain('CONV-NERC-CODE-MALFORMED');
    for (const lang of LANGS) expect(renderConvertPlain(f[0], lang), lang).toContain('D13CMOP11');
  });

  it('writes no measurementTypeID from the bad code, even when a page sends a pick that names it', async () => {
    const { r, bad } = await run();
    const rows = r.measurements.filter((m) => m.source.column === BAD);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((m) => m.measurementTypeId === undefined)).toBe(true);
    const dead = { id: 'http://vocab.nerc.ac.uk/collection/P01/current/D13CMOP11/', source: 'declared', deprecated: false };
    const forced = await run({ [String(bad.index)]: { type: dead } });
    expect(forced.r.measurements.filter((m) => m.source.column === BAD).every((m) => m.measurementTypeId === undefined)).toBe(true);
    expect(JSON.stringify(forced.r.measurements)).not.toContain('D13CMOP11/');
  });

  it('a valid prefixed code and a plain word raise nothing', async () => {
    const { r } = await run();
    const f = r.findings.filter((x) => x.ruleId === 'CONV-NERC-CODE-MALFORMED');
    expect(JSON.stringify(f)).not.toContain('PSALST01');
    expect(JSON.stringify(f)).not.toContain('TEMPERATURE');
  });
});
