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

describe('depth direction: a depth word is evidence of "down"; only an undecided column is a default', () => {
  it('a depth word with non-negative values keeps "down", high confidence, no note', () => {
    for (const h of ['Depth', 'Depth [m]', 'Depth_m', 'Water depth', 'Depth water [m]', 'Depth below sea level [m]', 'Depth positive down [m]', 'Depth [m BSL]']) {
      const p = depthProposal(h, ['5', '10']);
      expect(p.role, h).toMatchObject({ kind: 'depth', positive: 'down' });
      expect(p.confidence, h).toBe('high');
      expect(noteFires(h, ['5', '10']), h).toBe(false);
    }
  });

  it('values of both signs keep "up" as before (crossfile matches depths with this sign), no note', () => {
    expect(depthProposal('Depth [m]', ['5', '-2', '10']).role).toMatchObject({ positive: 'up' });
    expect(noteFires('Depth [m]', ['5', '-2', '10'])).toBe(false);
  });

  it('an undecided direction (the mapping editor starts a hand-mapped depth column at "not stated") fires the note', () => {
    const f = file('Station,Latitude,Longitude,z\nS1,70,10,5\nS1,70,10,6\n');
    const layout = proposeLayout(f);
    const mappings = proposeMappings(f, layout).map((m) => ({ ...m, columns: m.columns.map((c) => (c.header === 'z' ? { ...c, role: { kind: 'depth' as const, positive: 'unknown' as const } } : c)) }));
    const { dataset } = buildDataset(f, layout, mappings, [], 'x');
    expect(runChecks({ datasets: [dataset], records: [], parseFindings: [] }, { land: null }).findings.some((x) => x.ruleId === 'ROW-DEPTH-SIGN')).toBe(true);
  });

  it('negative values only and elevation words are evidence for "up"; Darwin Core depth and a P01 depth code are down', () => {
    expect(depthProposal('Depth [m]', ['-5', '-10']).role).toMatchObject({ positive: 'up' });
    expect(noteFires('Depth [m]', ['-5', '-10'])).toBe(false);
    expect(depthProposal('Elevation [m]', ['5']).role).toMatchObject({ positive: 'up' });
    expect(depthProposal('minimumDepthInMeters', ['5']).role).toMatchObject({ positive: 'down' });
    expect(depthProposal('ADEPZZ01', ['5', '10']).role).toMatchObject({ positive: 'down' });
  });
});
