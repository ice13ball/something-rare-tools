// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useId } from 'react';
import { suggestType, suggestUnit } from '../../core/convert/nerc';
import type { NvsConcept } from '../../core/convert/nvs';
import { searchWords } from '../../core/convert/nvs';
import type { NercTerm } from '../../core/convert/vocab';
import type { UiKey } from '../../core/i18n/ui';
import { t } from '../i18n';
import type { NvsFailure } from '../optins/nvs';
import { typeContext, unitContext } from '../convertModel';
import type { NercColumn, NercPicks, StoredPick } from '../convertModel';
import { HeadingTip, InfoTip } from './InfoTip';

export type NercKind = 'type' | 'unit';

/** What the page knows of the last NVS search for one (column, kind): the word that was typed when it was pressed, and what came back. */
export type NvsSearchView =
  | { status: 'running'; word: string }
  | { status: 'done'; word: string; concepts: NvsConcept[]; via: 'search' | 'code' }
  | { status: 'stopped'; word: string }
  | { status: 'failed'; word: string; failure: NvsFailure };

export interface ConvertNercProps {
  columns: readonly NercColumn[];
  picks: NercPicks;
  /** Sets (or, with undefined, clears) the identifier confirmed for a column. The page keeps it; the worker checks it again. */
  onPick: (col: NercColumn, kind: NercKind, pick: StoredPick | undefined) => void;
  /** Columns that have a suggestion and no choice yet. */
  suggestedCount: number;
  onUseSuggested: () => void;
  nvsOn: boolean;
  onToggleNvs: (on: boolean) => void;
  /** What the user typed, by `${column key}|${kind}`: it is page state only, and nothing of it is sent before the button. */
  words: Readonly<Record<string, string>>;
  onWord: (id: string, text: string) => void;
  searches: Readonly<Record<string, NvsSearchView>>;
  /** The id of the search that is running, if any: one at a time. */
  busy: string | null;
  onSearch: (col: NercColumn, kind: NercKind) => void;
  onAbort: () => void;
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
export const searchId = (col: NercColumn, kind: NercKind): string => `${col.key}|${kind}`;

interface Opt {
  value: string;
  label: string;
  term: { uri: string; label: string };
  source: 'suggested' | 'nvs';
  disabled?: boolean;
  group: 'suggested' | 'offered' | 'nvs';
}

const short = (code: string, label: string): string => `${code}: ${label}`;
const termOpt = (term: NercTerm, group: 'suggested' | 'offered'): Opt => ({ value: `s:${term.uri}`, label: short(term.code, term.label), term, source: 'suggested', group });

/** The suggestion for a column: the proposed concept and unit, and the other verified concepts that fit (never the proposed one twice). */
export function suggestionOf(col: Pick<NercColumn, 'variable' | 'unit'>): { type: ReturnType<typeof suggestType>; unit: NercTerm | undefined } {
  return { type: suggestType(col.variable, col.unit), unit: suggestUnit(col.unit) };
}

/** The choices of one list: the suggested concept, the offered ones, the results of the user's NVS search, and the choice already made when it is no longer among them. */
function optionsOf(col: NercColumn, kind: NercKind, search: NvsSearchView | undefined, current: StoredPick | undefined): Opt[] {
  const out: Opt[] = [];
  if (kind === 'type') {
    const s = suggestType(col.variable, col.unit);
    if (s.proposed) out.push(termOpt(s.proposed, 'suggested'));
    for (const o of s.offered) out.push(termOpt(o, 'offered'));
  } else {
    const u = suggestUnit(col.unit);
    if (u) out.push(termOpt(u, 'suggested'));
  }
  if (search?.status === 'done') {
    for (const c of search.concepts) out.push({ value: `n:${c.uri}`, label: `${short(c.code, c.label)}${c.deprecated ? ` (${t('convert.nerc.deprecated')})` : ''}`, term: c, source: 'nvs', group: 'nvs', ...(c.deprecated ? { disabled: true } : {}) });
  }
  if (current && !out.some((o) => o.term.uri === current.id && o.source === current.source)) {
    out.push({ value: `${current.source === 'nvs' ? 'n' : 's'}:${current.id}`, label: current.label, term: { uri: current.id, label: current.label }, source: current.source, group: current.source === 'nvs' ? 'nvs' : 'offered' });
  }
  return out;
}

/** The pick of a column and kind that is still valid for it: confirmed for the same variable and unit. */
export function effectivePick(col: NercColumn, picks: NercPicks, kind: NercKind): StoredPick | undefined {
  if (!has(picks, col.key)) return undefined;
  const p = picks[col.key][kind];
  if (!p) return undefined;
  return p.ctx === (kind === 'type' ? typeContext(col) : unitContext(col)) ? p : undefined;
}

/**
 * The NERC part of /convert (stage 5): the measured-variable columns, the concept and the unit chosen for each, and the opt-in search of the NERC Vocabulary Server. This
 * component sends nothing and holds no state; the page owns it, and the only code that calls the network is src/app/optins/nvs.ts, from the search button of a column.
 * Nothing is chosen for the user: a list starts at "No ID", a suggestion is an entry of the list, and an NVS result is an entry that a deprecated concept cannot be.
 */
export function ConvertNerc(p: ConvertNercProps): React.ReactElement | null {
  const id = useId();
  if (p.columns.length === 0) return null;
  const multiSheet = new Set(p.columns.map((c) => `${c.fileId}\u0000${c.sheet}`)).size > 1;
  const running = p.busy !== null;
  return (
    <section className="convert-nerc" aria-labelledby="convert-nerc-title">
      <HeadingTip tip="convertNerc">
        <h2 id="convert-nerc-title">{t('convert.nerc.title')}</h2>
      </HeadingTip>
      <p>{t('convert.nerc.intro')}</p>

      <div className="convert-nvs">
        <h3>{t('convert.nvs.title')}</h3>
        <div className="choice-line">
          <label className="inline-choice">
            <input type="checkbox" checked={p.nvsOn} onChange={(e) => p.onToggleNvs(e.target.checked)} aria-describedby={`${id}-nvs-help`} />
            <span>{t('convert.nvs.optin')}</span>
          </label>
          <InfoTip id="convertNvsOptIn" />
        </div>
        <p id={`${id}-nvs-help`} className="muted">
          {t('convert.nvs.optin.help')}
        </p>
        <div className="notice convert-nvs-privacy" role="note" aria-labelledby={`${id}-nvs-privacy-title`}>
          <HeadingTip tip="convertNvsPrivacy">
            <h4 id={`${id}-nvs-privacy-title`}>{t('convert.nvs.privacy.title')}</h4>
          </HeadingTip>
          <ul>
            <li>{t('convert.nvs.privacy.sent')}</li>
            <li>{t('convert.nvs.privacy.to')}</li>
            <li>{t('convert.nvs.privacy.ip')}</li>
            <li>{t('convert.nvs.privacy.button')}</li>
          </ul>
        </div>
      </div>

      <div className="with-tip">
        <p>{t('convert.nerc.choose.intro')}</p>
        <InfoTip id="convertNercChoice" />
      </div>
      {p.suggestedCount > 0 && (
        <div className="convert-nerc-bulk">
          <button type="button" className="button" onClick={p.onUseSuggested}>
            {t('convert.nerc.useSuggested', { n: p.suggestedCount })}
          </button>
          <p className="muted">{t('convert.nerc.useSuggested.help')}</p>
        </div>
      )}

      <ul className="convert-nerc-list">
        {p.columns.map((col) => (
          <li key={col.key} className="convert-nerc-col" data-column={col.header}>
            <p className="convert-nerc-head">
              <code>{col.header}</code>
              {multiSheet && <span className="muted"> ({col.sheet})</span>}
              <span className="muted">
                {' — '}
                {/* the variable and the unit are names taken from the column (often English words): in code font, so that they read as names in every language */}
                <code>{col.variable}</code>, {col.unit === undefined ? t('convert.nerc.col.noUnit') : <>{t('convert.nerc.col.unit')} <code>{col.unit}</code></>}
              </span>
            </p>
            <div className="convert-fields">
              <PickList p={p} col={col} kind="type" />
              {col.unit !== undefined && <PickList p={p} col={col} kind="unit" />}
            </div>
            {p.nvsOn && (
              <div className="convert-nvs-searches">
                <SearchRow p={p} col={col} kind="type" running={running} />
                {col.unit !== undefined && <SearchRow p={p} col={col} kind="unit" running={running} />}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PickList({ p, col, kind }: { p: ConvertNercProps; col: NercColumn; kind: NercKind }): React.ReactElement {
  const id = useId();
  const sid = searchId(col, kind);
  const current = effectivePick(col, p.picks, kind);
  const opts = optionsOf(col, kind, has(p.searches, sid) && p.nvsOn ? p.searches[sid] : undefined, current);
  const value = current ? `${current.source === 'nvs' ? 'n' : 's'}:${current.id}` : '';
  const group = (g: Opt['group'], label: UiKey): React.ReactNode => {
    const list = opts.filter((o) => o.group === g);
    return list.length === 0 ? null : (
      <optgroup label={t(label)}>
        {list.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </optgroup>
    );
  };
  // a choice that was confirmed for another variable or unit text is not in force any more: the page says so instead of dropping it without a word
  const dropped = current === undefined && has(p.picks, col.key) && p.picks[col.key][kind] !== undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{t(kind === 'type' ? 'convert.nerc.type.label' : 'convert.nerc.unit.label')}</label>
      <select
        id={id}
        aria-label={t(kind === 'type' ? 'convert.nerc.type.aria' : 'convert.nerc.unit.aria', { header: col.header })}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          const o = opts.find((x) => x.value === v);
          if (v === '' || !o || o.disabled) {
            p.onPick(col, kind, undefined);
            return;
          }
          p.onPick(col, kind, { id: o.term.uri, source: o.source, deprecated: false, label: o.label, ctx: kind === 'type' ? typeContext(col) : unitContext(col) });
        }}
      >
        <option value="">{t('convert.nerc.choice.none')}</option>
        {group('suggested', kind === 'type' ? 'convert.nerc.group.suggested' : 'convert.nerc.group.suggestedUnit')}
        {group('offered', 'convert.nerc.group.offered')}
        {group('nvs', 'convert.nerc.group.nvs')}
      </select>
      {dropped && <p className="muted convert-nerc-dropped" role="status">{t('convert.nerc.dropped')}</p>}
    </div>
  );
}

function SearchRow({ p, col, kind, running }: { p: ConvertNercProps; col: NercColumn; kind: NercKind; running: boolean }): React.ReactElement {
  const id = useId();
  const sid = searchId(col, kind);
  const word = has(p.words, sid) ? p.words[sid] : '';
  const s = has(p.searches, sid) ? p.searches[sid] : undefined;
  const mine = p.busy === sid;
  const canSearch = !running && searchWords(word).length > 0;
  return (
    <div className="convert-nvs-search" data-kind={kind}>
      <div className="convert-fields">
        <div className="field">
          <label htmlFor={id}>{t(kind === 'type' ? 'convert.nvs.word.type' : 'convert.nvs.word.unit')}</label>
          <input
            id={id}
            type="text"
            aria-label={t(kind === 'type' ? 'convert.nvs.word.type.aria' : 'convert.nvs.word.unit.aria', { header: col.header })}
            value={word}
            placeholder={t('convert.nvs.word.hint')}
            autoComplete="off"
            spellCheck={false}
            maxLength={200}
            onChange={(e) => p.onWord(sid, e.target.value)}
          />
        </div>
      </div>
      <div className="confirm-actions">
        {!mine && (
          <button type="button" className="button" disabled={!canSearch} aria-label={t(kind === 'type' ? 'convert.nvs.search.type.aria' : 'convert.nvs.search.unit.aria', { header: col.header })} onClick={() => p.onSearch(col, kind)}>
            {t('convert.nvs.search')}
          </button>
        )}
        {mine && (
          <button type="button" className="button" onClick={p.onAbort}>
            {t('convert.nvs.abort')}
          </button>
        )}
      </div>
      {s?.status === 'running' && (
        <p role="status" aria-live="polite">
          {t('convert.nvs.running')}
        </p>
      )}
      {s?.status === 'stopped' && <p role="status">{t('convert.nvs.stopped')}</p>}
      {s?.status === 'failed' && (
        <p className="error-text" role="alert">
          {s.failure.kind === 'http' ? t('convert.nvs.error.http', { status: s.failure.status }) : t(s.failure.kind === 'network' ? 'convert.nvs.error.network' : 'convert.nvs.error.format')}
        </p>
      )}
      {s?.status === 'done' && (
        <div className="convert-nvs-results">
          {s.via === 'code' && <p className="muted">{t('convert.nvs.via.code')}</p>}
          <div className="with-tip">
            <p>{s.concepts.length > 0 ? t('convert.nvs.found', { n: s.concepts.length, word: s.word.trim() }) : t('convert.nvs.found.none', { word: s.word.trim() })}</p>
            <InfoTip id="convertNvsResults" />
          </div>
          {s.concepts.length > 0 && (
            <ul className="convert-nvs-list">
              {s.concepts.map((c) => (
                <li key={c.uri} data-deprecated={c.deprecated ? 'true' : 'false'}>
                  <code>{c.code}</code> {c.label}
                  {c.deprecated && <span className="convert-doubt"> {t('convert.nerc.deprecated')}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
