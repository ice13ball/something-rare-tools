// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Live false-positive corpus: 30 public DOIs (PANGAEA, Zenodo, SEANOE) loaded with the SAME loading code as the licence page,
// then analyseLicences + checkLicence. Network test: skipped unless LICENCE_CORPUS=1 (like test/golden without GOLDEN_DIR).
//   LICENCE_CORPUS=1 npx vitest run test/corpus
// LICENCE_CORPUS_OUT=<file> additionally writes the per-DOI result as JSON there. ⛔ No DOI from IO PAN / iopan.pl in this list.
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isAllowedHost } from '../../config/hosts';
import { analyseLicences, shownOf } from '../../src/core/licence/analyse';
import { loadLicenceReferences } from '../../src/core/licence/load';
import { checkLicence } from '../../src/core/checks/licence';
import { FetchBlockedError, hostOf, HostNotAllowedError, type Fetcher } from '../../src/core/sources/fetcher';
import type { MetadataSource } from '../../src/core/types';

const DOIS: readonly string[] = [
  '10.1594/PANGAEA.316562', '10.1594/PANGAEA.398985', '10.1594/PANGAEA.736807', '10.1594/PANGAEA.779685', '10.1594/PANGAEA.865439',
  '10.1594/PANGAEA.905422', '10.1594/PANGAEA.907385', '10.1594/PANGAEA.905316', '10.1594/PANGAEA.974338', '10.1594/PANGAEA.996153',
  '10.5281/zenodo.3633185', '10.5281/zenodo.3641932', '10.5281/zenodo.11068368', '10.5281/zenodo.17151018', '10.5281/zenodo.17595082',
  '10.5281/zenodo.21641183', '10.5281/zenodo.21107205', '10.5281/zenodo.19682997', '10.5281/zenodo.23276197', '10.5281/zenodo.23567886',
  '10.17882/93375', '10.17882/102950', '10.17882/58407', '10.17882/54563', '10.17882/62513',
  '10.17882/70205', '10.17882/52153', '10.17882/59800', '10.17882/86286', '10.17882/104709',
];

/** Like the server proxy: https only, allowlisted hosts only, every redirect hop checked, no cookies. */
export function nodeFetcher(): Fetcher {
  return {
    async get(url, accept) {
      let current = url;
      for (let hop = 0; hop < 5; hop++) {
        if (!isAllowedHost(current)) throw new HostNotAllowedError(hostOf(current));
        let res: Response;
        try {
          res = await fetch(current, { redirect: 'manual', headers: { Accept: accept ?? '*/*', 'User-Agent': 'abyssal-claims-tools-corpus-test' } });
        } catch {
          throw new FetchBlockedError(hostOf(current));
        }
        const next = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && next) {
          current = new URL(next, current).toString();
          continue;
        }
        return { status: res.status, bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? undefined, finalUrl: current };
      }
      throw new FetchBlockedError(hostOf(current));
    },
  };
}

const enabled = process.env.LICENCE_CORPUS === '1';
const NOT_IOPAN = /iopan|institute of oceanology|polish academy/i;

describe.skipIf(!enabled)('licence corpus (live)', () => {
  it(
    'loads and analyses every DOI',
    async () => {
      const fetcher = nodeFetcher();
      const out = [];
      for (const doi of DOIS) {
        const load = await loadLicenceReferences([doi], fetcher);
        const unreadable = [...new Set(load.failures.flatMap((f) => (f.source ? [f.source] : [])))] as MetadataSource[];
        const analysis = analyseLicences(load.records, { unreadable });
        const findings = checkLicence(load.records, { label: doi, inaccessible: load.failures.length > 0, unreadable }).filter((f) => f.ruleId.startsWith('LIC-'));
        // the list was screened; a record that mentions IO PAN would mean it was not
        for (const r of load.records) expect(JSON.stringify([r.title, r.creators, r.publisher, r.landingUrl]), doi).not.toMatch(NOT_IOPAN);
        out.push({
          doi,
          failures: load.failures.map((f) => ({ source: f.source, rule: f.finding?.ruleId, status: f.finding?.params.status, reason: f.reason })),
          sources: analysis.sources.map((s) => ({
            source: s.source,
            group: s.group,
            state: s.state,
            statements: s.statements.map((a) => ({
              field: a.statement.field,
              text: a.statement.text,
              uri: a.statement.uri,
              classification: a.classification.kind === 'spdx' ? a.classification.id : 'unrecognised',
              shown: shownOf(a),
              conflict: a.conflict?.kind,
            })),
          })),
          statedGroups: analysis.statedGroups,
          recognisedGroups: analysis.recognisedGroups,
          comparison: analysis.comparison,
          contradictions: analysis.contradictions.map((c) => c.kind),
          findings: findings.map((f) => ({ ruleId: f.ruleId, severity: f.severity, params: f.params })),
        });
      }
      if (process.env.LICENCE_CORPUS_OUT) writeFileSync(process.env.LICENCE_CORPUS_OUT, JSON.stringify(out, null, 1));
      // every DOI was read at DataCite at least: a corpus that could not be loaded proves nothing
      for (const r of out) expect(r.sources.length, r.doi).toBeGreaterThan(0);
    },
    300_000,
  );
});
