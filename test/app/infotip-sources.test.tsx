// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Single source of truth for the ⓘ explanations: a number, unit or source in a tip comes from the rule definition or a constant,
// and a digit typed into a tip text fails here.
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGUES } from '../../config/catalogues';
import { DATAVERSE_INSTALLATIONS, LINKED_FILE_MAX_BYTES } from '../../config/dataverse';
import { InfoTip } from '../../src/app/components/InfoTip';
import { initLang, setLang } from '../../src/app/i18n';
import { ROLE_KINDS } from '../../src/app/mappingModel';
import { ACCEPTED_EXTENSIONS } from '../../src/app/types';
import { ROLE_FEEDS, TIPS, TIP_IDS, formatNumber, type TipId } from '../../src/app/tips';
import { shortSource } from '../../src/app/tipRules';
import { SHIP_SPEED_MIN_SEPARATION_KM } from '../../src/core/checks/speed';
import { UI, isUiKey, type UiKey } from '../../src/core/i18n/ui';
import { getRule } from '../../src/core/rules/registry';
import { LANGS } from '../../src/core/types';

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

/** What the bubble of a tip says, in a language. */
async function bubbleOf(id: TipId, lang: (typeof LANGS)[number] = 'en'): Promise<HTMLElement> {
  cleanup();
  setLang(lang);
  render(<InfoTip id={id} />);
  fireEvent.click(document.querySelector('.infotip-button') as HTMLElement);
  // a tip that needs rule data loads it on first open
  await waitFor(() => expect(document.querySelector('.infotip-bubble')?.getAttribute('data-ready')).toBe('true'));
  return document.querySelector('.infotip-bubble') as HTMLElement;
}

const textKeys = (id: TipId): UiKey[] => [`tip.${id}.does`, `tip.${id}.logic`] as UiKey[];
const placeholders = (s: string): string[] => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
/** Digits that belong to the name of a standard, an encoding or a code list, not to a rule. */
const NAMES_WITH_DIGITS = /UTF-8|windows-1250|ISO-8859-2|ISO[ -]19139|ISO[ -]19115-3|ISO 8601|P01/g;

describe('the registry', () => {
  it('has both parts of the text, in all four languages, for every tip; and a label that exists', () => {
    expect(TIP_IDS.length).toBeGreaterThanOrEqual(30);
    for (const id of TIP_IDS) {
      expect(isUiKey(TIPS[id].label), `${id} label ${TIPS[id].label}`).toBe(true);
      for (const key of textKeys(id)) for (const lang of LANGS) expect(UI[lang][key]?.trim(), `${lang}:${key}`).toBeTruthy();
    }
  });

  it('every {placeholder} of a tip has a value, and every value is used, in every language', async () => {
    for (const id of TIP_IDS) {
      const names = Object.keys({ ...(TIPS[id].values ?? {}), ...(TIPS[id].lazy ? await TIPS[id].lazy!() : {}) }).sort();
      for (const lang of LANGS) {
        const used = placeholders(textKeys(id).map((k) => UI[lang][k]).join('\n'));
        expect(used, `${lang}:${id}`).toEqual(names);
      }
    }
  });

  it('renders every tip in every language with nothing left unfilled', async () => {
    for (const id of TIP_IDS) {
      for (const lang of LANGS) {
        const text = (await bubbleOf(id, lang)).textContent ?? '';
        expect(text, `${lang}:${id}`).not.toMatch(/[{}]/);
        expect(text.length).toBeGreaterThan(40);
      }
    }
  });

  it('points only at rules that exist; every rule it prints a number of is declared in backedBy', () => {
    for (const id of TIP_IDS) {
      const def = TIPS[id];
      if (def.rule) expect(() => getRule(def.rule as string), `${id} rule`).not.toThrow();
      for (const r of def.backedBy ?? []) expect(() => getRule(r), `${id} backedBy ${r}`).not.toThrow();
    }
    expect(TIPS.singleCruise.backedBy).toEqual(['ROW-SHIP-SPEED', 'ROW-SHIP-SPEED-UNUSUAL']);
  });

  it('every tip of the registry is placed on a page (no orphan text)', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx$/.test(f) && f !== 'tips.tsx' && f !== 'InfoTip.tsx') files.push(p);
      }
    };
    walk(join(__dirname, '..', '..', 'src', 'app'));
    const source = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const id of TIP_IDS) expect(source, id).toMatch(new RegExp(`['"]${id}['"]`));
  });
});

describe('the rule data is not carried by the registry', () => {
  it('tips.tsx and InfoTip.tsx import neither the rule registry nor tipRules statically; the ship tip loads them on first open', () => {
    for (const f of ['tips.tsx', 'components/InfoTip.tsx']) {
      const src = readFileSync(join(__dirname, '..', '..', 'src', 'app', f), 'utf8');
      const staticImports = src.split('\n').filter((l) => /^import /.test(l));
      for (const l of staticImports) expect(l, f).not.toMatch(/rules\/registry|tipRules|core\/checks\/(speed|rows)/);
    }
    expect(readFileSync(join(__dirname, '..', '..', 'src', 'app', 'tips.tsx'), 'utf8')).toContain("import('./tipRules')");
    expect(TIPS.singleCruise.lazy).toBeTypeOf('function');
  });
});

describe('no number is typed into a tip', () => {
  it('no digit in any tip text of any language, apart from the names of standards and encodings', () => {
    for (const lang of LANGS) {
      for (const [key, text] of Object.entries(UI[lang])) {
        if (!key.startsWith('tip.')) continue;
        expect(text.replace(NAMES_WITH_DIGITS, ''), `${lang}:${key}`).not.toMatch(/\d/);
      }
    }
  });

  it('the guard works: a tip text with a typed number would be caught', () => {
    expect('faster than 40 knots'.replace(NAMES_WITH_DIGITS, '')).toMatch(/\d/);
    expect('read as UTF-8 or ISO 19139'.replace(NAMES_WITH_DIGITS, '')).not.toMatch(/\d/);
  });
});

describe('the ship-speed tip is rendered from the rule', () => {
  const extreme = getRule('ROW-SHIP-SPEED').thresholds?.find((t) => t.name === 'speed.extreme');
  const unusual = getRule('ROW-SHIP-SPEED-UNUSUAL').thresholds?.find((t) => t.name === 'speed.unusual');

  it('carries both thresholds and the minimum separation, as the rule and the constant have them, in every language', async () => {
    expect(extreme?.value).toBeGreaterThan(0);
    expect(unusual?.value).toBeGreaterThan(0);
    expect(SHIP_SPEED_MIN_SEPARATION_KM).toBeGreaterThan(0);
    for (const lang of LANGS) {
      const text = (await bubbleOf('singleCruise', lang)).textContent ?? '';
      expect(text, lang).toContain(`${formatNumber(extreme!.value, lang)} `);
      expect(text, lang).toContain(`${formatNumber(unusual!.value, lang)} `);
      expect(text, lang).toContain(`${formatNumber(SHIP_SPEED_MIN_SEPARATION_KM, lang)} km`);
    }
    // the unit is the rule's unit, written in the language of the page
    expect(extreme?.unit).toBe('knots');
    expect((await bubbleOf('singleCruise', 'pl')).textContent).toContain(`${extreme!.value} węzłów`);
    expect((await bubbleOf('singleCruise', 'en')).textContent).toContain(`${extreme!.value} knots`);
  });

  it('names the sources of the rule, linked to the rule citations', async () => {
    const bubble = (await bubbleOf('singleCruise'));
    const links = [...bubble.querySelectorAll('a')].map((a) => ({ text: a.textContent, href: a.getAttribute('href') }));
    expect(links).toContainEqual({ text: shortSource(extreme!.citation.label), href: extreme!.citation.url });
    expect(links).toContainEqual({ text: shortSource(unusual!.citation.label), href: unusual!.citation.url });
    expect(shortSource(extreme!.citation.label)).toBe('Met Office marine-qc');
  });

  it('says "warning" and "note" because the two rules are of those severities (the words are not a number, so the rule is checked here)', async () => {
    expect(getRule('ROW-SHIP-SPEED').severity).toBe('warning');
    expect(getRule('ROW-SHIP-SPEED-UNUSUAL').severity).toBe('info');
    const bullets = [...(await bubbleOf('singleCruise')).querySelectorAll('.infotip-item')].map((e) => e.textContent ?? '');
    expect(bullets[0]).toMatch(/^warning/);
    expect(bullets[1]).toMatch(/^note/);
    expect(UI.en['severity.warning']).toBe('Warning');
    expect(UI.en['severity.info']).toBe('Note');
  });

  it('keeps the mock-up the owner approved: four bullets and the rule link', async () => {
    const bubble = (await bubbleOf('singleCruise', 'pl'));
    expect(bubble.textContent).toContain('Włącza test, czy statek mógł w zapisanym czasie przepłynąć z jednej stacji do następnej.');
    expect(bubble.querySelectorAll('.infotip-item').length).toBe(4);
    expect(bubble.querySelector('.infotip-link')?.textContent).toBe('Szczegóły reguły →');
  });
});

describe('other tips are rendered from config', () => {
  it('the drop zone lists the accepted extensions of the input panel', async () => {
    const text = (await bubbleOf('dropZone')).textContent ?? '';
    for (const ext of ACCEPTED_EXTENSIONS) expect(text).toContain(ext);
  });

  it('the link field names the Dataverse installations and the size limit of the config', async () => {
    const text = (await bubbleOf('linkField')).textContent ?? '';
    for (const i of DATAVERSE_INSTALLATIONS) expect(text).toContain(i.host);
    expect(text).toContain('geonetwork.iopan.pl');
    expect(text).toContain(`${Math.round(LINKED_FILE_MAX_BYTES / 1024 / 1024)} MB`);
    expect((await bubbleOf('downloadMode')).textContent).toContain(`${Math.round(LINKED_FILE_MAX_BYTES / 1024 / 1024)} MB`);
  });

  it('the catalogue tip lists every catalogue of the collection config', async () => {
    const text = (await bubbleOf('collectionCsw')).textContent ?? '';
    for (const c of CATALOGUES) expect(text).toContain(c.host);
  });

  it('the column meanings list every role and the rules each feeds, and those rules exist', async () => {
    const text = (await bubbleOf('roles')).textContent ?? '';
    for (const kind of ROLE_KINDS) {
      expect(UI.en[`tip.role.${kind}` as UiKey], kind).toBeTruthy();
      expect(text).toContain(UI.en[`role.${kind}` as UiKey]);
      for (const rule of ROLE_FEEDS[kind]) {
        expect(() => getRule(rule), `${kind} ${rule}`).not.toThrow();
        expect(text).toContain(rule);
      }
    }
    expect(Object.keys(ROLE_FEEDS).sort()).toEqual([...ROLE_KINDS].sort());
    // date and date+time share one slot of the dataset builder, so they feed the same rules
    expect(ROLE_FEEDS.date).toEqual(ROLE_FEEDS.datetime);
  });
});
