// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A metadata draft computed from the DATA (extent, bbox, variables) plus what the metadata already states (licence, title).
import { unitFromHeader } from '../recognize/columns';
import type { Dataset, Lang, MetadataRecord, ParsedDate } from '../types';

export interface MetadataDraft {
  temporalExtent?: { start: string; end: string };
  bbox?: { west: number; east: number; south: number; north: number };
  licence?: { spdx: string; uri: string };
  variables: { name: string; unit?: string; p01?: string }[];
  title?: string;
  abstract?: string;
}

/* ---------- licences ---------- */

const CC_NAMES: Record<string, string> = {
  BY: 'Attribution',
  'BY-SA': 'Attribution-ShareAlike',
  'BY-NC': 'Attribution-NonCommercial',
  'BY-NC-SA': 'Attribution-NonCommercial-ShareAlike',
  'BY-ND': 'Attribution-NoDerivatives',
  'BY-NC-ND': 'Attribution-NonCommercial-NoDerivatives',
};
const FIXED: Record<string, { uri: string; name: string }> = {
  'CC0-1.0': { uri: 'https://creativecommons.org/publicdomain/zero/1.0/', name: 'Creative Commons Zero v1.0 Universal' },
  'ODbL-1.0': { uri: 'https://opendatacommons.org/licenses/odbl/1-0/', name: 'Open Data Commons Open Database License v1.0' },
  'PDDL-1.0': { uri: 'https://opendatacommons.org/licenses/pddl/1-0/', name: 'Open Data Commons Public Domain Dedication and License v1.0' },
  'ODC-By-1.0': { uri: 'https://opendatacommons.org/licenses/by/1-0/', name: 'Open Data Commons Attribution License v1.0' },
};

/** Canonical licence URI of every SPDX id toSpdx() can return (CC-BY family of any version, CC0, ODbL, PDDL, ODC-By). */
export function spdxToUri(spdx: string): string | undefined {
  const fixed = FIXED[spdx];
  if (fixed) return fixed.uri;
  const m = /^CC-(BY(?:-(?:NC|SA|ND))*)-(\d\.\d)$/.exec(spdx);
  if (m && CC_NAMES[m[1]]) return `https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/`;
  return undefined;
}

/** SPDX full name ('Creative Commons Attribution 4.0 International'). */
export function spdxName(spdx: string): string {
  const fixed = FIXED[spdx];
  if (fixed) return fixed.name;
  const m = /^CC-(BY(?:-(?:NC|SA|ND))*)-(\d\.\d)$/.exec(spdx);
  if (m && CC_NAMES[m[1]]) {
    const v = m[2];
    return `Creative Commons ${CC_NAMES[m[1]]} ${v} ${v === '4.0' ? 'International' : v === '3.0' ? 'Unported' : 'Generic'}`;
  }
  return spdx;
}

/* ---------- extent ---------- */

/** First and last day covered by a date, at the precision it was written ('2021' -> 2021-01-01 .. 2021-12-31). */
function dayRange(d: ParsedDate): { first: string; last: string } | undefined {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(d.iso);
  if (day) return { first: day[0], last: day[0] };
  const month = /^(\d{4})-(\d{2})$/.exec(d.iso);
  if (month) {
    const lastDay = new Date(Date.UTC(Number(month[1]), Number(month[2]), 0)).getUTCDate();
    return { first: `${d.iso}-01`, last: `${d.iso}-${String(lastDay).padStart(2, '0')}` };
  }
  const year = /^(\d{4})$/.exec(d.iso);
  if (year) return { first: `${d.iso}-01-01`, last: `${d.iso}-12-31` };
  return undefined;
}

const P01_CODE = /^[A-Z][A-Z0-9]{7}$/;
export const p01Url = (code: string): string | undefined =>
  P01_CODE.test(code) ? `https://vocab.nerc.ac.uk/collection/P01/current/${code}/` : undefined;

export function metadataDraft(datasets: Dataset[], metadata: MetadataRecord[]): MetadataDraft {
  const draft: MetadataDraft = { variables: [] };

  let start: string | undefined;
  let end: string | undefined;
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const ds of datasets) {
    for (const r of ds.rows) {
      const range = r.datetime ? dayRange(r.datetime) : undefined;
      if (range) {
        if (start === undefined || range.first < start) start = range.first;
        if (end === undefined || range.last > end) end = range.last;
      }
      // out-of-range coordinates are reported by the row rules; they must not make an invalid bounding box
      if (r.lat !== undefined && r.lon !== undefined && Math.abs(r.lat) <= 90 && r.lon >= -180 && r.lon <= 180) {
        west = Math.min(west, r.lon);
        east = Math.max(east, r.lon);
        south = Math.min(south, r.lat);
        north = Math.max(north, r.lat);
      }
    }
  }
  if (start !== undefined && end !== undefined) draft.temporalExtent = { start, end };
  if (west <= east) draft.bbox = { west, east, south, north };

  // Constraints that describe the METADATA record are not the licence of the data.
  for (const rec of metadata) {
    const hit = rec.licences.find((l) => l.spdx !== undefined && !l.field.startsWith('metadataConstraints/') && spdxToUri(l.spdx) !== undefined);
    if (hit?.spdx) {
      draft.licence = { spdx: hit.spdx, uri: spdxToUri(hit.spdx)! };
      break;
    }
  }

  const seen = new Set<string>();
  for (const ds of datasets) {
    for (const v of ds.variables) {
      const name = unitFromHeader(v.header).name || v.header;
      const id = `${name}\u0000${v.unit ?? ''}\u0000${v.p01 ?? ''}`;
      if (seen.has(id)) continue;
      seen.add(id);
      draft.variables.push({ name, ...(v.unit !== undefined ? { unit: v.unit } : {}), ...(v.p01 !== undefined ? { p01: v.p01 } : {}) });
    }
  }

  const title = metadata.find((m) => m.title)?.title;
  const abstract = metadata.find((m) => m.abstract)?.abstract;
  if (title) draft.title = title;
  if (abstract) draft.abstract = abstract;
  return draft;
}

/* ---------- GeoNetwork editor labels ---------- */

/** Section names as the GeoNetwork (3.x/4.x ISO 19139 editor) shows them, so a user can find the field to paste into. */
export const GN_FIELD_LABELS: Record<Lang, Record<'temporalExtent' | 'bbox' | 'licence' | 'variables', string>> = {
  en: { temporalExtent: 'Temporal extent', bbox: 'Geographic bounding box', licence: 'Constraints — licence', variables: 'Keywords / variables' },
  pl: { temporalExtent: 'Zakres czasowy', bbox: 'Prostokąt ograniczający (zasięg geograficzny)', licence: 'Ograniczenia — licencja', variables: 'Słowa kluczowe / zmienne' },
  de: { temporalExtent: 'Zeitliche Ausdehnung', bbox: 'Geographisches Begrenzungsrechteck', licence: 'Einschränkungen — Lizenz', variables: 'Schlüsselwörter / Variablen' },
  fr: { temporalExtent: 'Étendue temporelle', bbox: 'Rectangle englobant géographique', licence: 'Contraintes — licence', variables: 'Mots-clés / variables' },
};

/* ---------- XML helpers shared by the two XML writers ---------- */

/** Escapes text and attribute values; characters that XML 1.0 forbids are dropped. */
export function escapeXml(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Text of an XML comment: `--` is not allowed inside one. */
export const commentText = (s: string): string => s.replace(/-{2,}/g, '-').replace(/-$/, '- ');

/** `name [unit]` plus the P01 code when the variable has one. */
export function variableLabel(v: MetadataDraft['variables'][number]): string {
  return `${v.unit ? `${v.name} [${v.unit}]` : v.name}${v.p01 ? ` (SDN:P01::${v.p01})` : ''}`;
}

/** A number as XML decimal text: never an exponent ('1e-7' is not an xs:decimal). */
export function decimalText(n: number): string {
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return n.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
}
