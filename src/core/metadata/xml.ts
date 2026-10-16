// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Namespace-aware helpers over @xmldom/xmldom. Everything matches namespaceURI + localName, never prefixes.
import { DOMParser } from '@xmldom/xmldom';

export const NS = {
  gmd: 'http://www.isotc211.org/2005/gmd',
  gco: 'http://www.isotc211.org/2005/gco',
  gmx: 'http://www.isotc211.org/2005/gmx',
  xlink: 'http://www.w3.org/1999/xlink',
  gml: ['http://www.opengis.net/gml', 'http://www.opengis.net/gml/3.2'],
} as const;

export function parseXml(xml: string, what: string): Document {
  const errors: string[] = [];
  // xmldom's Document is structurally close to the DOM lib's but not assignable; it is what the helpers below use.
  const doc = new DOMParser({
    onError: (level, msg) => {
      if (level !== 'warning') errors.push(msg);
    },
  }).parseFromString(xml, 'text/xml') as unknown as Document;
  if (errors.length > 0 || !doc || !doc.documentElement) {
    throw new Error(`${what}: not well-formed XML`);
  }
  return doc;
}

type Ns = string | readonly string[];
const nsMatch = (el: Element, ns: Ns): boolean =>
  typeof ns === 'string' ? el.namespaceURI === ns : ns.includes(el.namespaceURI ?? '');

export function children(el: Element, ns: Ns, local: string): Element[] {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (n as Element).localName === local && nsMatch(n as Element, ns)) out.push(n as Element);
  }
  return out;
}

export function elementChildren(el: Element): Element[] {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element);
  return out;
}

export function child(el: Element, ns: Ns, local: string): Element | undefined {
  return children(el, ns, local)[0];
}

export function descendants(el: Element, ns: Ns, local: string): Element[] {
  const out: Element[] = [];
  const walk = (e: Element): void => {
    for (let n = e.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 1) continue;
      const c = n as Element;
      if (c.localName === local && nsMatch(c, ns)) out.push(c);
      walk(c);
    }
  };
  walk(el);
  return out;
}

/** Follow a chain of child names in one namespace. */
export function path(el: Element | undefined, ns: Ns, ...names: string[]): Element | undefined {
  let cur = el;
  for (const n of names) {
    if (!cur) return undefined;
    cur = child(cur, ns, n);
  }
  return cur;
}

export function text(el: Element | undefined): string | undefined {
  const t = el?.textContent?.trim();
  return t ? t : undefined;
}

export function attr(el: Element | undefined, ns: string | null, local: string): string | undefined {
  if (!el) return undefined;
  const v = ns === null ? el.getAttribute(local) : el.getAttributeNS(ns, local);
  const t = v?.trim();
  return t ? t : undefined;
}

export function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
