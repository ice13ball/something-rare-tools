// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { classifyMatches, isUnaccepted, writesOwnName } from '../../core/convert/worms';
import type { WormsChoice, WormsRecord } from '../../core/convert/worms';
import type { UiKey } from '../../core/i18n/ui';
import { t } from '../i18n';
import type { WormsFailure } from '../optins/worms';
import { HeadingTip, InfoTip } from './InfoTip';

/** Where the lookup stands. `stopped` covers an abort and a failed call: what completed before it is kept. */
export type WormsStatus =
  | { state: 'idle' }
  | { state: 'running'; done: number; total: number }
  | { state: 'finished'; answered: number }
  | { state: 'stopped'; done: number; total: number; failure?: WormsFailure };

export interface ConvertWormsProps {
  on: boolean;
  onToggle: (on: boolean) => void;
  /** The names a lookup would send (the converter's list: names with an ID from the sheet are not in it). */
  names: readonly string[];
  /** Distinct names left out because the sheet gives them an ID. */
  withSheetId: number;
  /** The names that have no result yet. */
  pending: number;
  records: Readonly<Record<string, readonly WormsRecord[]>>;
  choices: Readonly<Record<string, WormsChoice>>;
  onChoice: (name: string, choice: WormsChoice | undefined) => void;
  status: WormsStatus;
  onLookup: () => void;
  onAbort: () => void;
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

const STATUS_KEYS: Record<string, UiKey> = {
  accepted: 'convert.worms.status.accepted',
  uncertain: 'convert.worms.status.uncertain',
  deleted: 'convert.worms.status.deleted',
  quarantined: 'convert.worms.status.quarantined',
  'alternate representation': 'convert.worms.status.alternate',
  'temporary name': 'convert.worms.status.temporary',
  'interim unpublished': 'convert.worms.status.interim',
};
const RANKS = new Set(['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species', 'subspecies', 'subgenus', 'subfamily', 'suborder', 'subclass']);

/** The match type as the service names it, then a plain word in the reader's language. */
function matchTypeWord(mt: string): string {
  if (mt === 'exact') return t('convert.worms.mt.exact');
  if (mt === 'phonetic') return t('convert.worms.mt.phonetic');
  if (/^near_\d+$/.test(mt)) return t('convert.worms.mt.near');
  if (mt === 'exact_genus') return t('convert.worms.mt.genus');
  return t('convert.worms.mt.other');
}

/** A status in the reader's language; a status this page has no word for (a Latin term such as nomen dubium) is shown as the service gives it. */
function statusText(r: WormsRecord): string {
  if (isUnaccepted(r)) return t('convert.worms.unaccepted', { name: r.valid_name ?? '' });
  return has(STATUS_KEYS, r.status) ? t(STATUS_KEYS[r.status]) : r.status;
}

const rankText = (r: WormsRecord): string => {
  const k = (r.rank ?? '').toLowerCase();
  return RANKS.has(k) ? t(`convert.worms.rank.${k}` as UiKey) : (r.rank ?? '');
};

/** The habitat flags WoRMS holds for the record, in words; "not stated" when it holds none. */
function habitatText(r: WormsRecord): string {
  const out: string[] = [];
  if (r.isMarine === 1) out.push(t('convert.worms.habitat.marine'));
  if (r.isBrackish === 1) out.push(t('convert.worms.habitat.brackish'));
  if (r.isFreshwater === 1) out.push(t('convert.worms.habitat.freshwater'));
  if (r.isTerrestrial === 1) out.push(t('convert.worms.habitat.terrestrial'));
  return out.length > 0 ? out.join(', ') : t('convert.worms.habitat.unknown');
}

/**
 * The WoRMS opt-in of /convert (stage 4): the tick, the privacy copy that stands next to it, the lookup button and the result table with the user's decision
 * for each name. This component sends nothing and holds no state; the page owns it and the only code that calls the network is src/app/optins/worms.ts,
 * from the button.
 */
export function ConvertWorms(p: ConvertWormsProps): React.ReactElement {
  const shown = p.names.filter((n) => has(p.records, n));
  const classes = shown.map((n) => ({ name: n, records: p.records[n], match: classifyMatches(p.records[n], n) }));
  const exact = classes.filter((c) => c.match.kind === 'auto').length;
  const choose = classes.filter((c) => c.match.kind === 'choose').length;
  const none = classes.filter((c) => c.match.kind === 'none').length;
  const running = p.status.state === 'running';
  return (
    <section className="convert-worms" aria-labelledby="convert-worms-title">
      <h2 id="convert-worms-title">{t('convert.worms.title')}</h2>
      <div className="choice-line">
        <label className="inline-choice">
          <input type="checkbox" checked={p.on} onChange={(e) => p.onToggle(e.target.checked)} aria-describedby="convert-worms-help" />
          <span>{t('convert.worms.optin')}</span>
        </label>
        <InfoTip id="convertWormsOptIn" />
      </div>
      <p id="convert-worms-help" className="muted">
        {t('convert.worms.optin.help')}
      </p>
      <div className="notice convert-worms-privacy" role="note" aria-labelledby="convert-worms-privacy-title">
        <HeadingTip tip="convertWormsPrivacy">
          <h3 id="convert-worms-privacy-title">{t('convert.worms.privacy.title')}</h3>
        </HeadingTip>
        <ul>
          <li>{t('convert.worms.privacy.sent')}</li>
          <li>{t('convert.worms.privacy.to')}</li>
          <li>{t('convert.worms.privacy.ip')}</li>
          <li>{t('convert.worms.privacy.unpublished')}</li>
          <li>{t('convert.worms.privacy.button')}</li>
        </ul>
      </div>

      {p.on && (
        <>
          {p.names.length > 0 ? (
            <details className="convert-worms-names">
              <summary>{t('convert.worms.names.summary', { n: p.names.length })}</summary>
              <ul className="convert-worms-list">
                {p.names.map((n) => (
                  <li key={n}>
                    <code>{n}</code>
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="muted">{t('convert.worms.none')}</p>
          )}
          {p.withSheetId > 0 && <p className="muted">{t('convert.worms.skipped', { n: p.withSheetId })}</p>}

          <div className="confirm-actions">
            {p.pending > 0 && !running && (
              <button type="button" className="button" onClick={p.onLookup}>
                {t('convert.worms.lookup', { n: p.pending })}
              </button>
            )}
            {running && (
              <button type="button" className="button" onClick={p.onAbort}>
                {t('convert.worms.abort')}
              </button>
            )}
          </div>
          {p.status.state === 'running' && (
            <p role="status" aria-live="polite">
              {t('convert.worms.progress', { done: p.status.done, total: p.status.total })}
            </p>
          )}
          {p.status.state === 'finished' && <p role="status">{t('convert.worms.finished', { n: p.status.answered })}</p>}
          {p.status.state === 'stopped' && p.status.failure === undefined && <p role="status">{t('convert.worms.stopped', { done: p.status.done, total: p.status.total })}</p>}
          {p.status.state === 'stopped' && p.status.failure !== undefined && (
            <p className="error-text" role="alert">
              {p.status.failure.kind === 'http' ? t('convert.worms.error.http', { status: p.status.failure.status }) : t(p.status.failure.kind === 'network' ? 'convert.worms.error.network' : 'convert.worms.error.format')}
            </p>
          )}

          {classes.length > 0 && (
            <div className="convert-worms-results">
              <HeadingTip tip="convertWormsTable">
                <h3>{t('convert.worms.table.title')}</h3>
              </HeadingTip>
              <p>{t('convert.worms.summary', { exact, choose, none })}</p>
              <div className="with-tip">
                <p>{t('convert.worms.choose.intro')}</p>
                <InfoTip id="convertWormsChoice" />
              </div>
              <div className="table-scroll">
                <table className="convert-table convert-worms-table">
                  <thead>
                    <tr>
                      <th scope="col">{t('convert.worms.col.name')}</th>
                      <th scope="col">{t('convert.worms.col.record')}</th>
                      <th scope="col">{t('convert.worms.col.match')}</th>
                      <th scope="col">{t('convert.worms.col.status')}</th>
                      <th scope="col">{t('convert.worms.col.rank')}</th>
                      <th scope="col">{t('convert.worms.col.habitat')}</th>
                      <th scope="col">{t('convert.worms.col.decision')}</th>
                    </tr>
                  </thead>
                  {classes.map((c) => {
                    const choice = has(p.choices, c.name) ? p.choices[c.name] : undefined;
                    if (c.match.kind === 'none') {
                      return (
                        <tbody key={c.name} data-match="none">
                          <tr>
                            <th scope="row">
                              <code>{c.name}</code>
                            </th>
                            <td colSpan={5} className="muted">
                              {t('convert.worms.nomatch')}
                            </td>
                            <td>{t('convert.worms.decision.none')}</td>
                          </tr>
                        </tbody>
                      );
                    }
                    const rows = c.records;
                    const auto = c.match.kind === 'auto';
                    return (
                      <tbody key={c.name} data-match={auto ? 'auto' : 'choose'}>
                        {rows.map((r, i) => (
                          <tr key={r.AphiaID}>
                            {i === 0 && (
                              <th scope="row" rowSpan={rows.length}>
                                <code>{c.name}</code>
                              </th>
                            )}
                            <td>
                              <code>{r.AphiaID}</code> {r.scientificname}
                              {r.authority ? <span className="muted"> {r.authority}</span> : null}
                              {!auto && <div className="muted convert-worms-written">{writesOwnName(r, c.name) ? t('convert.worms.writtenAs', { name: r.scientificname.trim() }) : t('convert.worms.writtenSame')}</div>}
                            </td>
                            <td>
                              <code>{r.match_type}</code>{r.match_type === 'exact' ? null : <span className="muted"> ({matchTypeWord(r.match_type)})</span>}
                            </td>
                            <td>{statusText(r)}</td>
                            <td>{rankText(r)}</td>
                            <td>{habitatText(r)}</td>
                            {i === 0 && (
                              <td rowSpan={rows.length}>
                                {auto ? (
                                  <select className="convert-input" aria-label={t('convert.worms.decision.aria', { name: c.name })} value={choice === 'none' ? 'none' : 'auto'} onChange={(e) => p.onChoice(c.name, e.target.value === 'none' ? 'none' : undefined)}>
                                    <option value="auto">{t('convert.worms.decision.auto')}</option>
                                    <option value="none">{t('convert.worms.decision.none')}</option>
                                  </select>
                                ) : (
                                  <select
                                    className="convert-input"
                                    aria-label={t('convert.worms.decision.aria', { name: c.name })}
                                    value={choice === undefined ? '' : String(choice)}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      p.onChoice(c.name, v === '' ? undefined : v === 'none' ? 'none' : Number(v));
                                    }}
                                  >
                                    <option value="">{t('convert.worms.decision.choose')}</option>
                                    {rows.map((o) => (
                                      <option key={o.AphiaID} value={String(o.AphiaID)}>
                                        {`${o.AphiaID} · ${o.scientificname} · ${statusText(o)}`}
                                      </option>
                                    ))}
                                    <option value="none">{t('convert.worms.decision.none')}</option>
                                  </select>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    );
                  })}
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
