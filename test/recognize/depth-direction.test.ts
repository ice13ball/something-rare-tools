// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { runChecks } from '../../src/core/checks/run';
import { buildDataset } from '../../src/core/dataset';
import { parseFile } from '../../src/core/parse';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import { proposeColumns } from '../../src/core/recognize/columns';

const file = (text: string) => parseFile('d.csv', new TextEncoder().encode(text));
const depthProposal = (header: string, values: string[]) => {
  const f = file(`Station,Latitude,Longitude,${header}\n${values.map((v) => `S1,70,10,${v}`).join('\n')}\n`);
  return proposeColumns(f.sheets[0], { decimalComma: false, date1904: false }).find((p) => p.role.kind === 'depth')!;
};
const noteFires = (header: string, values: string[]) => {
  const f = file(`Station,Latitude,Longitude,${header}\n${values.map((v) => `S1,70,10,${v}`).join('\n')}\n`);
  const layout = proposeLayout(f);
  const { dataset } = buildDataset(f, layout, proposeMappings(f, layout), [], 'x');
  return runChecks({ datasets: [dataset], records: [], parseFindings: [] }, { land: null }).findings.some((x) => x.ruleId === 'ROW-DEPTH-SIGN');
};

describe('depth direction: evidence is kept, a pure default is low-confidence and the note fires', () => {
  it('a bare "Depth [m]" with positive values: not stated, low-confidence, note fires', () => {
    const p = depthProposal('Depth [m]', ['5', '10']);
    expect(p.role).toEqual({ kind: 'depth', positive: 'unknown', unit: 'm' });
    expect(p.confidence).toBe('low');
    expect(noteFires('Depth [m]', ['5', '10'])).toBe(true);
  });

  it('headers that state the direction keep "down" and no note', () => {
    for (const h of ['Depth below sea level [m]', 'Depth positive down [m]', 'Depth [m BSL]', 'Depth below surface [m]']) {
      const p = depthProposal(h, ['5', '10']);
      expect(p.role, h).toMatchObject({ kind: 'depth', positive: 'down' });
      expect(p.confidence, h).toBe('high');
      expect(noteFires(h, ['5', '10']), h).toBe(false);
    }
  });

  it('negative values and elevation words are evidence for "up"; Darwin Core depth is down by its definition', () => {
    expect(depthProposal('Depth [m]', ['-5', '-10']).role).toMatchObject({ positive: 'up' });
    expect(noteFires('Depth [m]', ['-5', '-10'])).toBe(false);
    expect(depthProposal('Elevation [m]', ['5']).role).toMatchObject({ positive: 'up' });
    expect(depthProposal('minimumDepthInMeters', ['5']).role).toMatchObject({ positive: 'down' });
  });

  it('a NERC P01 depth code states the direction (its vocabulary meaning)', () => {
    expect(depthProposal('ADEPZZ01', ['5', '10']).role).toMatchObject({ positive: 'down' });
  });
});
