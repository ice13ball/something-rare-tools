// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useState } from 'react';
import type { SheetLedger } from '../../core/convert/ledger';
import type { UiKey } from '../../core/i18n/ui';
import type { ConflictEntry } from '../../core/convert/sampleJoin';
import type { ConvertFileSummary, ConvertView, SampleJoinRequest, SheetRef } from '../../worker/convert.protocol';
import type { JoinChoice } from '../convertModel';
import { t } from '../i18n';

/*
 * The panel of the sample-sheet join (core/convert/sampleJoin.ts). Declare first: a sheet that seems to describe the samples of another is only PROPOSED here, and nothing joins until the person
 * presses Confirm (or Change, then "Join with these columns"). Every choice stays on screen with the button that takes it back. The groups of differing values are decided for all samples at
 * once, for each sample, or for each pair of values; a choice for one sample wins over a choice for its pair, and that over the choice for all. The sample codes and values of a group are
 * shown here and go to the converter's worker and nowhere else: nothing of this panel is reported to analytics.
 */

type Side = 'description' | 'results';
type Group = ConvertView['sampleJoin']['conflicts'][number];
type Answer = SampleJoinRequest['conflicts'][number];
type Proposal = ConvertView['sampleJoin']['proposals'][number];
type Pair = { results: number; description: number };

const same = (a: SheetRef, b: SheetRef): boolean => a.fileId === b.fileId && a.sheet === b.sheet;
const refKey = (r: SheetRef): string => `${r.fileId}\u0000${r.sheet}`;

/** The name of a sheet for a person: the file name alone for a table file, "file / sheet" for a sheet of a workbook. */
function labelOf(files: readonly ConvertFileSummary[], ref: SheetRef): string {
  const file = files.find((f) => f.fileId === ref.fileId);
  if (file === undefined) return ref.sheet;
  return ref.sheet === file.fileName ? file.fileName : `${file.fileName} / ${ref.sheet}`;
}

const headerOf = (files: readonly ConvertFileSummary[], ref: SheetRef, column: number): string => {
  const h = files.find((f) => f.fileId === ref.fileId)?.sheets.find((s) => s.name === ref.sheet)?.header[column];
  return h === undefined || h.trim() === '' ? `#${column + 1}` : h.trim();
};

/** The key in words: the column of each sheet that names the sample, "Sample ↔ Sample"; several parts joined by " + ". */
const keysText = (files: readonly ConvertFileSummary[], results: SheetRef, description: SheetRef, keys: readonly Pair[]): string =>
  keys.map((k) => `${headerOf(files, results, k.results)} ↔ ${headerOf(files, description, k.description)}`).join(' + ');

/* ---------- the groups of differing values ---------- */

const pairOf = (e: ConflictEntry): [string, string] => [e.descriptionText, e.resultsText];
const samePair = (a: readonly [string, string], b: readonly [string, string]): boolean => a[0] === b[0] && a[1] === b[1];

/** What decides an entry now, and where that decision comes from: its own exception, its pair, the choice for all. */
function effective(answer: Answer | undefined, e: ConflictEntry): { side: Side; source: 'sample' | 'pair' | 'all' } | undefined {
  const own = answer?.exceptions.find((x) => x.entry === e.id);
  if (own !== undefined) return { side: own.take, source: 'sample' };
  const pair = answer?.pairs?.find((p) => samePair(p.pair, pairOf(e)));
  if (pair !== undefined) return { side: pair.take, source: 'pair' };
  if (answer?.take !== undefined) return { side: answer.take, source: 'all' };
  return undefined;
}

/** An answer with nothing in it is no answer. */
function tidy(a: Answer): Answer | undefined {
  const pairs = a.pairs ?? [];
  if (a.take === undefined && a.exceptions.length === 0 && pairs.length === 0) return undefined;
  const { pairs: _p, ...rest } = a;
  return pairs.length > 0 ? { ...rest, pairs } : rest;
}

function GroupPanel({ group, answer: given, undecided, onAnswer }: { group: Group; answer: Answer | undefined; undecided: number | undefined; onAnswer: (next: Answer | undefined) => void }): React.ReactElement {
  // an answer holds only for the number of samples it was given for (the converter ignores it otherwise): a stale one is no answer here either, is never resent, and is said
  const stale = given !== undefined && given.count !== group.count;
  const answer = stale ? undefined : given;
  // an answer is always written with the number of samples it is given for today
  const base: Answer = { group: group.group, ...(answer?.take === undefined ? {} : { take: answer.take }), count: group.count, exceptions: answer?.exceptions ?? [], ...(answer?.pairs === undefined ? {} : { pairs: answer.pairs }) };
  const setTake = (take: Side | undefined): void => {
    const { take: _t, ...rest } = base;
    onAnswer(tidy(take === undefined ? rest : { ...rest, take }));
  };
  const setRow = (e: ConflictEntry, side: Side): void => {
    const now = effective(answer, e);
    // pressing the side that is already chosen for this sample takes the choice back
    const exceptions = base.exceptions.filter((x) => x.entry !== e.id);
    onAnswer(tidy({ ...base, exceptions: now?.source === 'sample' && now.side === side ? exceptions : [...exceptions, { entry: e.id, take: side }] }));
  };
  const setPair = (e: ConflictEntry, on: boolean): void => {
    const now = effective(answer, e);
    const mine = pairOf(e);
    const pairs = (base.pairs ?? []).filter((p) => !samePair(p.pair, mine));
    if (!on) {
      onAnswer(tidy({ ...base, pairs }));
      return;
    }
    if (now === undefined) return;
    // the pair now says what the rows of that pair said one by one
    const sameEntries = new Set(group.entries.filter((x) => samePair(pairOf(x), mine)).map((x) => x.id));
    onAnswer(tidy({ ...base, exceptions: base.exceptions.filter((x) => !sameEntries.has(x.entry)), pairs: [...pairs, { pair: mine, take: now.side }] }));
  };
  // once the conversion has run, the converter's own count of what is still open is used (a pair covers samples beyond the rows listed)
  const decided = undecided !== undefined && !stale ? group.count - undecided : answer?.take !== undefined ? group.count : group.entries.reduce((n, e) => (effective(answer, e) === undefined ? n : n + e.samples.length), 0);
  const listed = group.entries.reduce((n, e) => n + e.samples.length, 0);
  return (
    <div className="convert-join-group" data-testid="join-group" data-group={group.group}>
      <h4>{t('convert.join.conflict.title', { label: group.label, count: group.count })}</h4>
      <p>
        <button type="button" className="button" aria-pressed={answer?.take === 'description'} onClick={() => setTake(answer?.take === 'description' ? undefined : 'description')}>
          {t('convert.join.conflict.takeDescription')}
        </button>{' '}
        <button type="button" className="button" aria-pressed={answer?.take === 'results'} onClick={() => setTake(answer?.take === 'results' ? undefined : 'results')}>
          {t('convert.join.conflict.takeResults')}
        </button>
        {answer?.take !== undefined && (
          <>
            {' '}
            <button type="button" className="button" onClick={() => setTake(undefined)}>
              {t('convert.join.conflict.clear')}
            </button>
          </>
        )}
      </p>
      {answer?.take !== undefined && <p className="muted">{t(answer.take === 'description' ? 'convert.join.conflict.bulkDescription' : 'convert.join.conflict.bulkResults')}</p>}
      {stale && given !== undefined && <p className="notice" role="note">{t('convert.join.conflict.stale', { old: given.count, count: group.count })}</p>}
      <p className="muted" role="status">
        {t('convert.join.conflict.decided', { decided, count: group.count })}
      </p>
      {listed < group.count && <p className="notice" role="note">{t('convert.join.conflict.capped', { shown: group.entries.length })}</p>}
      <table>
        <thead>
          <tr>
            <th scope="col">{t('convert.join.conflict.colSample')}</th>
            <th scope="col">{t('convert.join.conflict.colDescription')}</th>
            <th scope="col">{t('convert.join.conflict.colResults')}</th>
            <th scope="col">{t('convert.join.conflict.colResultsSamples')}</th>
            <th scope="col">{t('convert.join.conflict.colChoice')}</th>
          </tr>
        </thead>
        <tbody>
          {group.entries.map((e) => {
            const now = effective(answer, e);
            const pairOn = answer?.pairs?.some((p) => samePair(p.pair, pairOf(e))) === true;
            const shown = (text: string): string => (text === '' ? t('convert.join.conflict.blank') : text);
            return (
              <tr key={e.id} data-entry={e.id}>
                <td>{e.key}</td>
                <td>{shown(e.descriptionText)}</td>
                <td>{shown(e.resultsText)}</td>
                <td>{e.samples.join(', ')}</td>
                <td>
                  {(['description', 'results'] as const).map((side) => (
                    <React.Fragment key={side}>
                      <button
                        type="button"
                        className="button"
                        aria-pressed={now?.side === side}
                        aria-label={t('convert.join.conflict.rowLabel', { sample: e.key, side: t(side === 'description' ? 'convert.join.conflict.rowDescription' : 'convert.join.conflict.rowResults') })}
                        onClick={() => setRow(e, side)}
                      >
                        {t(side === 'description' ? 'convert.join.conflict.rowDescription' : 'convert.join.conflict.rowResults')}
                      </button>{' '}
                    </React.Fragment>
                  ))}
                  <span className="muted">{now === undefined ? t('convert.join.conflict.undecided') : `${t(`convert.join.conflict.from.${now.side}` as UiKey)} (${t(`convert.join.conflict.source.${now.source}` as UiKey)})`}</span>{' '}
                  <button
                    type="button"
                    className="button"
                    aria-pressed={pairOn}
                    disabled={!pairOn && (now === undefined || now.source === 'all')}
                    aria-label={t('convert.join.conflict.pairLabel', { sample: e.key })}
                    title={!pairOn && (now === undefined || now.source === 'all') ? t('convert.join.conflict.pairHint') : undefined}
                    onClick={() => setPair(e, !pairOn)}
                  >
                    {t('convert.join.conflict.pair')}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Change: the other sheet, other key columns ---------- */

interface Draft {
  description: SheetRef;
  keys: Pair[];
}

function ChangeForm({ results, files, draft, onDraft, onUse, onCancel }: { results: SheetRef; files: readonly ConvertFileSummary[]; draft: Draft; onDraft: (d: Draft) => void; onUse: () => void; onCancel: () => void }): React.ReactElement {
  const others = files.flatMap((f) => f.sheets.map((s) => ({ fileId: f.fileId, sheet: s.name }))).filter((r) => !same(r, results));
  const columns = (ref: SheetRef): { index: number; name: string }[] => (files.find((f) => f.fileId === ref.fileId)?.sheets.find((s) => s.name === ref.sheet)?.header ?? []).map((_, i) => ({ index: i, name: headerOf(files, ref, i) }));
  const mine = columns(results);
  const theirs = columns(draft.description);
  const setKey = (n: number, patch: Partial<Pair>): void => onDraft({ ...draft, keys: draft.keys.map((k, i) => (i === n ? { ...k, ...patch } : k)) });
  return (
    <div className="convert-join-change">
      <p className="muted">{t('convert.join.changeHint')}</p>
      <label>
        {t('convert.join.changeDescription')}{' '}
        <select
          value={refKey(draft.description)}
          onChange={(e) => {
            const to = others.find((r) => refKey(r) === e.target.value);
            if (to !== undefined) onDraft({ description: to, keys: draft.keys.map((k) => ({ results: k.results, description: 0 })) });
          }}
        >
          {others.map((r) => (
            <option key={refKey(r)} value={refKey(r)}>
              {labelOf(files, r)}
            </option>
          ))}
        </select>
      </label>
      {draft.keys.map((k, n) => (
        <p key={n}>
          <label>
            {t('convert.join.changeResultsColumn', { n: n + 1, results: labelOf(files, results) })}{' '}
            <select value={k.results} onChange={(e) => setKey(n, { results: Number(e.target.value) })}>
              {mine.length === 0 && <option value={k.results}>{t('convert.join.changeNoColumns')}</option>}
              {mine.map((c) => (
                <option key={c.index} value={c.index}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>{' '}
          <label>
            {t('convert.join.changeDescriptionColumn', { n: n + 1 })}{' '}
            <select value={k.description} onChange={(e) => setKey(n, { description: Number(e.target.value) })}>
              {theirs.length === 0 && <option value={k.description}>{t('convert.join.changeNoColumns')}</option>}
              {theirs.map((c) => (
                <option key={c.index} value={c.index}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {draft.keys.length > 1 && (
            <>
              {' '}
              <button type="button" className="button" onClick={() => onDraft({ ...draft, keys: draft.keys.filter((_, i) => i !== n) })}>
                {t('convert.join.changeRemoveKey', { n: n + 1 })}
              </button>
            </>
          )}
        </p>
      ))}
      <p>
        <button type="button" className="button" onClick={() => onDraft({ ...draft, keys: [...draft.keys, { results: mine.find((c) => !draft.keys.some((k) => k.results === c.index))?.index ?? 0, description: theirs.find((c) => !draft.keys.some((k) => k.description === c.index))?.index ?? 0 }] })}>
          {t('convert.join.changeAddKey')}
        </button>{' '}
        <button type="button" className="button" onClick={onUse}>
          {t('convert.join.changeUse')}
        </button>{' '}
        <button type="button" className="button" onClick={onCancel}>
          {t('convert.join.changeCancel')}
        </button>
      </p>
    </div>
  );
}

/* ---------- the panel ---------- */

export interface ConvertSampleJoinProps {
  view: ConvertView['sampleJoin'] | undefined;
  files: ConvertFileSummary[];
  joins: JoinChoice[];
  onChange: (joins: JoinChoice[]) => void;
  /** The ledger of the conversion the view belongs to, once it is settled: a confirmed join with no description ledger in it was not applied, and the panel says so. */
  ledger?: readonly SheetLedger[];
  /** Once the conversion has settled: how many samples of each group the converter still finds undecided (CONV-JOIN-CONFLICT); a group not listed is counted from the answers on the page. */
  undecided?: { results: SheetRef; group: string; count: number }[];
}

/**
 * How many samples of each group the converter still finds undecided, read from the settled view: the count of CONV-JOIN-CONFLICT for the group, 0 when CONV-JOIN-CONFLICT-CHOSEN says the group is
 * fully decided, and no entry otherwise (the panel then counts from the answers it holds itself, never 0 for a group the converter did not report on).
 */
export function undecidedOf(view: Pick<ConvertView, 'findings' | 'sampleJoin'>, files: readonly ConvertFileSummary[]): { results: SheetRef; group: string; count: number }[] {
  const out: { results: SheetRef; group: string; count: number }[] = [];
  for (const g of view.sampleJoin.conflicts) {
    const name = files.find((f) => f.fileId === g.results.fileId)?.fileName;
    const on = (f: { file?: string; sheet?: string }): boolean => f.file === name && f.sheet === g.results.sheet;
    const open = view.findings.find((f) => f.ruleId === 'CONV-JOIN-CONFLICT' && on(f) && String(f.params.group) === g.group);
    if (open !== undefined) out.push({ results: g.results, group: g.group, count: Number(open.params.count) });
    else if (view.findings.some((f) => f.ruleId === 'CONV-JOIN-CONFLICT-CHOSEN' && on(f) && String(f.params.what) === g.label)) out.push({ results: g.results, group: g.group, count: 0 });
  }
  return out;
}

export function ConvertSampleJoin({ view, files, joins, onChange, ledger, undecided }: ConvertSampleJoinProps): React.ReactElement | null {
  const [editing, setEditing] = useState<Record<string, Draft>>({});
  // a results sheet that already has a confirmed join is not proposed again (the view may still be the one from before the confirmation)
  const proposals = (view?.proposals ?? []).filter((p) => !joins.some((j) => j.state === 'confirmed' && same(j.results, p.results)));
  // a results sheet with no proposal and no confirmed join can still be joined: the person says which sheet describes it (declare-first: the entry point names no sheet and guesses no role)
  const declarable = (view?.resultsSheets ?? []).filter((r) => !proposals.some((p) => same(p.results, r)) && !joins.some((j) => j.state === 'confirmed' && same(j.results, r)) && files.some((f) => f.sheets.some((sh) => !same({ fileId: f.fileId, sheet: sh.name }, r))));
  if (proposals.length === 0 && joins.length === 0 && declarable.length === 0) return null;

  const without = (list: readonly JoinChoice[], results: SheetRef, description: SheetRef, state: JoinChoice['state']): JoinChoice[] =>
    list.filter((j) => !(same(j.results, results) && ((state === 'confirmed' && j.state === 'confirmed') || same(j.description, description) && j.state === 'declined')));
  // a results sheet has at most one join; a confirmation replaces what was there for it (and a "No" for that very pair)
  const decide = (results: SheetRef, description: SheetRef, keys: Pair[], state: JoinChoice['state']): void =>
    onChange([...without(joins, results, description, state), { results, description, keys, state, conflicts: [] }]);
  const stopEditing = (key: string): void => setEditing(({ [key]: _gone, ...rest }) => rest);
  const proposalKey = (p: Proposal): string => `${refKey(p.results)}\u0001${refKey(p.description)}`;
  const answerFor = (j: JoinChoice, group: string): Answer | undefined => j.conflicts.find((a) => a.group === group);
  const setAnswer = (j: JoinChoice, group: string, next: Answer | undefined): void =>
    onChange(joins.map((x) => (x === j ? { ...x, conflicts: [...x.conflicts.filter((a) => a.group !== group), ...(next === undefined ? [] : [next])] } : x)));
  const groupsOf = (j: JoinChoice): Group[] => (view?.conflicts ?? []).filter((c) => same(c.results, j.results));
  const settled = ledger !== undefined;

  return (
    <section className="convert-join" aria-labelledby="convert-join-title" data-testid="sample-join">
      <h3 id="convert-join-title">{t('convert.join.title')}</h3>
      {(proposals.length > 0 || declarable.length > 0) && <p className="muted">{t('convert.join.intro')}</p>}
      {proposals.map((p) => {
        const key = proposalKey(p);
        const draft = editing[key];
        const results = labelOf(files, p.results);
        const description = labelOf(files, p.description);
        return (
          <div key={key} className="convert-join-proposal" data-testid="join-proposal">
            <p>{t('convert.join.proposal', { results, description, keys: keysText(files, p.results, p.description, p.keys) })}</p>
            {p.long === true ? (
              <p className="notice" role="note">
                {t('convert.join.long', { description })}
              </p>
            ) : (
              <>
                <p className="muted">{t('convert.join.proposalCovered', { results, description, covered: p.covered, samples: p.samples })}</p>
                {draft === undefined ? (
                  <p>
                    <button type="button" className="button" onClick={() => decide(p.results, p.description, p.keys, 'confirmed')}>
                      {t('convert.join.confirm')}
                    </button>{' '}
                    <button type="button" className="button" onClick={() => setEditing((prev) => ({ ...prev, [key]: { description: p.description, keys: p.keys.map((k) => ({ ...k })) } }))}>
                      {t('convert.join.change')}
                    </button>{' '}
                    <button type="button" className="button" onClick={() => decide(p.results, p.description, p.keys, 'declined')}>
                      {t('convert.join.no')}
                    </button>
                  </p>
                ) : (
                  <ChangeForm
                    results={p.results}
                    files={files}
                    draft={draft}
                    onDraft={(d) => setEditing((prev) => ({ ...prev, [key]: d }))}
                    onUse={() => {
                      decide(p.results, draft.description, draft.keys, 'confirmed');
                      stopEditing(key);
                    }}
                    onCancel={() => stopEditing(key)}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
      {declarable.map((r) => {
        const key = `declare\u0001${refKey(r)}`;
        const draft = editing[key];
        const first = files.flatMap((f) => f.sheets.map((sh) => ({ fileId: f.fileId, sheet: sh.name }))).find((o) => !same(o, r));
        return (
          <div key={key} className="convert-join-declare" data-testid="join-declare">
            {draft === undefined ? (
              <p>
                <button type="button" className="button" onClick={() => first !== undefined && setEditing((prev) => ({ ...prev, [key]: { description: first, keys: [{ results: 0, description: 0 }] } }))}>
                  {t('convert.join.declare', { results: labelOf(files, r) })}
                </button>
              </p>
            ) : (
              <ChangeForm
                results={r}
                files={files}
                draft={draft}
                onDraft={(d) => setEditing((prev) => ({ ...prev, [key]: d }))}
                onUse={() => {
                  decide(r, draft.description, draft.keys, 'confirmed');
                  stopEditing(key);
                }}
                onCancel={() => stopEditing(key)}
              />
            )}
          </div>
        );
      })}
      {joins.map((j) => {
        const results = labelOf(files, j.results);
        const description = labelOf(files, j.description);
        if (j.state === 'declined') {
          return (
            <p key={`no:${refKey(j.results)}:${refKey(j.description)}`} data-testid="join-declined">
              {t('convert.join.declinedLine', { results, description })}{' '}
              <button type="button" className="button" onClick={() => onChange(joins.filter((x) => x !== j))}>
                {t('convert.finding.askAgain')}
              </button>
            </p>
          );
        }
        const file = files.find((f) => f.fileId === j.description.fileId);
        const applied = !settled || (ledger ?? []).some((l) => l.kind === 'description' && l.file === file?.fileName && l.sheet === j.description.sheet);
        const groups = groupsOf(j);
        return (
          <div key={`yes:${refKey(j.results)}`} className="convert-join-confirmed" data-testid="join-confirmed">
            <p>
              {t('convert.join.confirmedLine', { results, description, keys: keysText(files, j.results, j.description, j.keys) })}{' '}
              <button type="button" className="button" onClick={() => onChange(joins.filter((x) => x !== j))}>
                {t('convert.join.undo')}
              </button>
            </p>
            {j.fromFile === true && <p className="muted">{t('convert.join.fromFile')}</p>}
            {!applied && (
              <p className="notice" role="note">
                {t('convert.join.notApplied')}
              </p>
            )}
            {groups.length > 0 && (
              <div className="convert-join-differ">
                <h4>{t('convert.join.differ.title')}</h4>
                <p className="muted">{t('convert.join.differ.intro', { results, description })}</p>
                {groups.map((g) => (
                  <GroupPanel key={g.group} group={g} answer={answerFor(j, g.group)} undecided={undecided === undefined ? undefined : undecided.find((u) => same(u.results, j.results) && u.group === g.group)?.count} onAnswer={(next) => setAnswer(j, g.group, next)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
