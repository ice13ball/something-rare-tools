// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A CSW answer cut into its records WITHOUT a DOM of the whole page. A GeoNetwork page of 25 records is 1 to 11 MB of XML, and a DOM costs
// about 20 times the text: parsing the page in one piece peaked at hundreds of MB while parsing the records one by one needs the DOM of
// the largest record only. The cut is a conservative text scan; anything it does not fully recognise returns null and the caller parses
// the whole page as before, so what a page means never depends on this shortcut.

export interface SplitPage {
  /** The `nextRecord` attribute of SearchResults, when it has one. */
  nextRecord: number | undefined;
  /** Each record's XML, with the namespace declarations it inherits from the answer's root written on its start tag. */
  records: string[];
}

const NAME = '[A-Za-z_][\\w.-]*(?::[A-Za-z_][\\w.-]*)?';
const ATTRS = `(?:\\s+[^\\s=/>]+\\s*=\\s*(?:"[^"]*"|'[^']*'))*`;
const SEARCH_RESULTS = new RegExp(`<((?:[A-Za-z_][\\w.-]*:)?)SearchResults(${ATTRS})\\s*(/?)>`);
const START_TAG = new RegExp(`^<(${NAME})(${ATTRS})\\s*(/?)>`);
const XMLNS = /\s(xmlns(?::[A-Za-z_][\w.-]*)?)\s*=\s*("[^"]*"|'[^']*')/g;

function declarations(attrs: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of attrs.matchAll(XMLNS)) out.set(m[1], m[2]);
  return out;
}

/** The text of the root element's start tag (after the prolog), or undefined. */
function rootStartTag(head: string): string | undefined {
  const m = new RegExp(`<(?!\\?|!)(${NAME})(${ATTRS})\\s*>`).exec(head);
  return m?.[0];
}

const isSpace = (c: number): boolean => c === 32 || c === 10 || c === 13 || c === 9;

export function splitCswPage(text: string): SplitPage | null {
  const m = SEARCH_RESULTS.exec(text);
  if (!m) return null;
  const head = text.slice(0, m.index);
  if (!/GetRecordsResponse/.test(head) || /ExceptionReport/.test(head)) return null;
  const root = rootStartTag(head);
  if (!root || !/^<(?:[A-Za-z_][\w.-]*:)?GetRecordsResponse\b/.test(root)) return null;
  const nextAttr = /\snextRecord\s*=\s*"(\d{1,10})"/.exec(m[2]);
  const nextRecord = nextAttr ? Number(nextAttr[1]) : undefined;

  const inherited = new Map<string, string>([...declarations(root), ...declarations(m[2])]);
  const closeSearch = `</${m[1]}SearchResults>`;
  let end: number;
  let tailFrom: number;
  if (m[3] === '/') {
    end = m.index + m[0].length;
    tailFrom = end;
  } else {
    end = text.lastIndexOf(closeSearch);
    if (end < m.index + m[0].length) return null;
    tailFrom = end + closeSearch.length;
  }
  // after SearchResults only the closing tag of the answer may follow: a truncated answer is not split (the whole-page parse rejects it)
  if (!/^\s*<\/(?:[A-Za-z_][\w.-]*:)?GetRecordsResponse>\s*$/.test(text.slice(tailFrom, tailFrom + 200))) return null;

  const records: string[] = [];
  let pos = m.index + m[0].length;
  if (m[3] === '/') return { nextRecord, records };
  for (;;) {
    while (pos < end && isSpace(text.charCodeAt(pos))) pos += 1;
    if (pos >= end) break;
    if (text.charCodeAt(pos) !== 60) return null;
    const start = START_TAG.exec(text.slice(pos, pos + 20_000));
    if (!start) return null;
    const name = start[1];
    if (name.slice(name.indexOf(':') + 1) !== 'MD_Metadata') return null;
    let stop: number;
    if (start[3] === '/') {
      stop = pos + start[0].length;
    } else {
      const close = `</${name}>`;
      const at = text.indexOf(close, pos + start[0].length);
      if (at < 0 || at + close.length > end) return null;
      // the same element nested inside itself would end at the first closing tag: not cut
      const nested = new RegExp(`<${name.replace('.', '\\.')}(?=[\\s>/])`, 'g');
      nested.lastIndex = pos + start[0].length;
      const hit = nested.exec(text);
      if (hit && hit.index < at) return null;
      stop = at + close.length;
    }
    let rec = text.slice(pos, stop);
    const own = declarations(start[2]);
    let add = '';
    for (const [k, v] of inherited) if (!own.has(k)) add += ` ${k}=${v}`;
    if (add) rec = `<${name}${add}${rec.slice(1 + name.length)}`;
    records.push(rec);
    pos = stop;
  }
  return { nextRecord, records };
}
