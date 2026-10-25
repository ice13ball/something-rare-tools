// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useId, useState } from 'react';
import { BASES_OF_RECORD, LICENCES, creatorLines, isBasis, isLicence, partyOf } from '../../core/convert/metadata';
import type { DatasetMetadata } from '../../core/convert/metadata';
import type { Candidate, ConvertPrefill, LicenceCase, LicenceSaid, PrefillKey, SourceRef } from '../../core/convert/prefill';
import type { UiKey } from '../../core/i18n/ui';
import { t, useLang } from '../i18n';
import { FieldLabel, InfoTip } from './InfoTip';

export interface ConvertMetadataFormProps {
  value: DatasetMetadata;
  onChange: (next: DatasetMetadata) => void;
  /** What the dropped metadata files say (core/convert/prefill.ts). Null / absent: no metadata file was dropped, and no source note is shown. */
  prefill?: ConvertPrefill | null;
}

const norm = (s: string): string => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const sourcesText = (sources: readonly SourceRef[]): string => sources.map((s) => `${s.file}, ${s.field}`).join('; ');
const shorten = (s: string, max = 400): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * The minimal description of the dataset: title, abstract, creators, contact, institution code, dataset name, methods, citation, licence and basisOfRecord.
 * A plain controlled form over `DatasetMetadata` (core/convert/metadata.ts). The page fills it from the metadata files dropped with the data (`prefill`,
 * stage 3): a value that came from a file shows the file and the field under its input, until the text is changed; where the files disagree nothing is
 * filled in and the page lists what each file says, to pick one from; a field no file has says so. The licence has four cases (taken from the metadata,
 * another licence, contradictory, missing), each with its own note and ⓘ. The licence and the kind of record start unchosen and have no default unless the
 * metadata give one licence OBIS accepts. Nothing is stored.
 */
export function ConvertMetadataForm({ value, onChange, prefill = null }: ConvertMetadataFormProps): React.ReactElement {
  useLang();
  const id = useId();
  const set = (patch: Partial<DatasetMetadata>): void => onChange({ ...value, ...patch });
  const text = (k: 'title' | 'institutionCode' | 'datasetName' | 'contactName' | 'contactEmail', type: 'text' | 'email' = 'text') => ({
    id: `${id}-${k}`,
    type,
    value: value[k],
    autoComplete: 'off',
    spellCheck: false,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: e.target.value } as Partial<DatasetMetadata>),
  });

  /** Under a field: where its value came from (while the field still holds it), that no file has it, or the choice between differing values. */
  const note = (key: PrefillKey, current: string, pick: (c: Candidate) => string): React.ReactNode => {
    if (!prefill) return null;
    const cands = prefill.fields[key];
    const values = cands.map(pick).filter((v) => v !== '');
    if (values.length === 0) return <p className="muted convert-meta-note">{t('convert.meta.src.missing')}</p>;
    if (cands.length === 1) {
      return norm(current) === norm(values[0]) ? <p className="muted convert-meta-note">{t('convert.meta.src.from', { sources: sourcesText(cands[0].sources) })}</p> : null;
    }
    return null;
  };

  /**
   * A list of values of the files to pick from. mode 'choose': values of DIFFERENT files that disagree (none is filled in). mode 'differs': one file's value
   * that differs from what the field holds now (typed or chosen): it stays visible and never replaces the value by itself.
   */
  const box = (key: PrefillKey, cands: Candidate[], isCurrent: (c: Candidate) => boolean, apply: (c: Candidate) => Partial<DatasetMetadata>, mode: 'choose' | 'differs' | 'contacts'): React.ReactNode => (
    <div className="convert-choice" role="group" aria-label={t('convert.meta.src.choose.label')} data-mode={mode}>
      <p>
        {mode === 'choose' ? t('convert.meta.src.choose') : mode === 'contacts' ? t('convert.meta.src.contacts') : t('convert.meta.src.differs', { sources: sourcesText(cands[0].sources), n: new Set(cands[0].sources.map((x) => x.file)).size })} <InfoTip id="convertMetaChoice" />
      </p>
      <ul>
        {cands.map((c, i) => {
          const shown = key === 'contact' ? [c.value, c.email].filter((x) => x !== undefined && x !== '').join(', ') : c.value.replace(/\s+/g, ' ');
          return (
            <li key={i}>
              <span className="convert-choice-value">{key === 'contact' ? shown : shorten(c.value)}</span>
              {mode !== 'differs' && <span className="muted"> ({sourcesText(c.sources)}) </span>}{' '}
              {isCurrent(c) ? (
                <span className="muted">{t('convert.meta.src.used')}</span>
              ) : (
                <button type="button" className="link-button" aria-label={t('convert.meta.src.useLabel', { value: shorten(shown, 80), sources: sourcesText(c.sources) })} onClick={() => set(apply(c))}>
                  {t('convert.meta.src.use')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );

  /** For a field: the choice between files that disagree, or the value of the one file that differs from what the field holds now. */
  const choice = (key: PrefillKey, currentValue: string, apply: (c: Candidate) => Partial<DatasetMetadata>): React.ReactNode => {
    const cands = prefill?.fields[key] ?? [];
    const isCurrent = (c: Candidate): boolean => norm(c.value) === norm(currentValue);
    if (cands.length >= 2) return box(key, cands, isCurrent, apply, 'choose');
    if (cands.length === 1 && currentValue.trim() !== '' && !isCurrent(cands[0])) return box(key, cands, isCurrent, apply, 'differs');
    return null;
  };

  /** The contact: a list per file that names several (neutral), the choice between files that each name one and disagree, or the one file's contact that differs. */
  const contactBlock = (): React.ReactNode => {
    if (!prefill) return null;
    const isCurrent = (c: Candidate): boolean => norm(c.value) === norm(value.contactName) && norm(c.email ?? '') === norm(value.contactEmail);
    const apply = (c: Candidate): Partial<DatasetMetadata> => ({ contactName: c.value, contactEmail: c.email ?? '' });
    const all = prefill.fields.contact;
    const holds = value.contactName.trim() !== '' || value.contactEmail.trim() !== '';
    return (
      <>
        {prefill.contactLists.length === 0 && prefill.contactSingles.length >= 2 && box('contact', prefill.contactSingles, isCurrent, apply, 'choose')}
        {prefill.contactLists.length > 0 && prefill.contactSingles.length >= 1 && box('contact', prefill.contactSingles, isCurrent, apply, 'contacts')}
        {all.length === 1 && holds && !isCurrent(all[0]) && box('contact', all, isCurrent, apply, 'differs')}
        {prefill.contactLists.map((l) => (
          <ContactList key={l.file} list={l} isCurrent={(c) => isCurrent(c)} onUse={(c) => set(apply(c))} />
        ))}
      </>
    );
  };

  const titleNote = note('title', value.title, (c) => c.value);
  const citationNote = note('citation', value.citation, (c) => c.value);
  return (
    <div className="convert-fields convert-meta">
      {prefill && (
        <div className="field convert-wide">
          <p className="muted">
            {t('convert.meta.src.hint')} <InfoTip id="convertMetaSource" />
          </p>
        </div>
      )}
      <div className="field">
        <FieldLabel htmlFor={`${id}-title`} tip="convertMetaTitle">
          {t('convert.meta.f.title')}
        </FieldLabel>
        <input {...text('title')} />
        {titleNote}
        {choice('title', value.title, (c) => ({ title: c.value }))}
      </div>
      <div className="field">
        <FieldLabel htmlFor={`${id}-abstract`} tip="convertMetaAbstract">
          {t('convert.meta.f.abstract')}
        </FieldLabel>
        <textarea id={`${id}-abstract`} rows={4} value={value.abstract} spellCheck={false} onChange={(e) => set({ abstract: e.target.value })} />
        {note('abstract', value.abstract, (c) => c.value)}
        {choice('abstract', value.abstract, (c) => ({ abstract: c.value }))}
      </div>
      <div className="field">
        <FieldLabel htmlFor={`${id}-creators`} tip="convertMetaCreators">
          {t('convert.meta.f.creators')}
        </FieldLabel>
        <textarea id={`${id}-creators`} rows={3} value={value.creators} spellCheck={false} onChange={(e) => set({ creators: e.target.value })} />
        {note('creators', value.creators, (c) => c.value)}
        {choice('creators', value.creators, (c) => ({ creators: c.value }))}
        <Writes lines={creatorLines(value)} organisations={value.organisations} />
      </div>
      <div className="field">
        <FieldLabel htmlFor={`${id}-contactName`} tip="convertMetaContact">
          {t('convert.meta.f.contactName')}
        </FieldLabel>
        <input {...text('contactName')} />
        {note('contact', value.contactName, (c) => c.value)}
        <Writes lines={value.contactName.trim() === '' ? [] : [value.contactName]} organisations={value.organisations} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-contactEmail`}>{t('convert.meta.f.contactEmail')}</label>
        <input {...text('contactEmail', 'email')} />
        {note('contact', value.contactEmail, (c) => c.email ?? '')}
      </div>
      {prefill && prefill.fields.contact.length > 0 && <div className="field convert-wide">{contactBlock()}</div>}
      <div className="field">
        <FieldLabel htmlFor={`${id}-institutionCode`} tip="convertMetaInstitution">
          {t('convert.meta.f.institution')}
        </FieldLabel>
        <input {...text('institutionCode')} />
      </div>
      <div className="field">
        <FieldLabel htmlFor={`${id}-datasetName`} tip="convertMetaDatasetName">
          {t('convert.meta.f.datasetName')}
        </FieldLabel>
        <input {...text('datasetName')} placeholder={value.title} aria-describedby={`${id}-datasetName-help`} />
        <p id={`${id}-datasetName-help`} className="muted">
          {t('convert.meta.f.datasetName.help')}
        </p>
      </div>
      <div className="field">
        <FieldLabel htmlFor={`${id}-methods`} tip="convertMetaMethods">
          {t('convert.meta.f.methods')}
        </FieldLabel>
        <textarea id={`${id}-methods`} rows={3} value={value.methods} spellCheck={false} onChange={(e) => set({ methods: e.target.value })} />
      </div>
      <div className="field">
        <FieldLabel htmlFor={`${id}-citation`} tip="convertMetaCitation">
          {t('convert.meta.f.citation')}
        </FieldLabel>
        <textarea id={`${id}-citation`} rows={3} value={value.citation} spellCheck={false} aria-describedby={`${id}-citation-help`} onChange={(e) => set({ citation: e.target.value })} />
        <p id={`${id}-citation-help`} className="muted">
          {t('convert.meta.f.citation.help')}
        </p>
        {citationNote}
        {choice('citation', value.citation, (c) => ({ citation: c.value }))}
      </div>
      <div className="field">
        <FieldLabel htmlFor={`${id}-licence`} tip="convertLicence">
          {t('convert.meta.f.licence')}
        </FieldLabel>
        <select id={`${id}-licence`} value={value.licence} aria-describedby={`${id}-licence-help`} onChange={(e) => set({ licence: isLicence(e.target.value) ? e.target.value : '' })}>
          <option value="">{t('convert.medium.none')}</option>
          {LICENCES.map((l) => (
            <option key={l} value={l}>
              {t(`convert.meta.licence.${l}` as UiKey)}
            </option>
          ))}
        </select>
        <p id={`${id}-licence-help`} className="muted">
          {t('convert.meta.licence.help')}
        </p>
        {prefill && <LicenceNote licence={prefill.licence} current={value.licence} />}
      </div>
      <div className="field">
        <FieldLabel htmlFor={`${id}-basis`} tip="convertBasis">
          {t('convert.meta.f.basis')}
        </FieldLabel>
        <select id={`${id}-basis`} value={value.basisOfRecord} aria-describedby={`${id}-basis-help`} onChange={(e) => set({ basisOfRecord: isBasis(e.target.value) ? e.target.value : '' })}>
          <option value="">{t('convert.medium.none')}</option>
          {BASES_OF_RECORD.map((b) => (
            <option key={b} value={b}>
              {t(`convert.meta.basis.${b}` as UiKey)}
            </option>
          ))}
        </select>
        <p id={`${id}-basis-help`} className="muted">
          {t('convert.meta.basis.help')}
        </p>
      </div>
      {prefill && prefill.coverage.length > 0 && (
        <div className="field convert-wide convert-coverage">
          <p>
            <strong>{t('convert.meta.cov.title')}</strong> <InfoTip id="convertMetaCoverage" />
          </p>
          <ul>
            {prefill.coverage.map((c) => (
              <li key={c.file}>
                {c.file}: {coverageText(c)}
              </li>
            ))}
          </ul>
          <p className="muted">{t('convert.meta.cov.note')}</p>
        </div>
      )}
    </div>
  );
}

function coverageText(c: ConvertPrefill['coverage'][number]): string {
  const parts: string[] = [];
  if (c.start && c.end) parts.push(t('convert.meta.cov.period', { start: c.start, end: c.end }));
  else if (c.start) parts.push(t('convert.meta.cov.periodFrom', { start: c.start }));
  else if (c.end) parts.push(t('convert.meta.cov.periodTo', { end: c.end }));
  if (c.bbox) parts.push(t('convert.meta.cov.area', { west: c.bbox.west, east: c.bbox.east, south: c.bbox.south, north: c.bbox.north }));
  return parts.join('; ');
}

/** The note under the licence field: one of the four cases of what the metadata say about the licence, each with its ⓘ. */
function LicenceNote({ licence, current }: { licence: LicenceCase; current: string }): React.ReactElement | null {
  useLang();
  switch (licence.kind) {
    case 'taken':
      // the note says "taken from your metadata": it is shown only while the field still holds that licence
      return current === licence.id ? (
        <p className="notice convert-licence-note" role="note">
          {t('convert.licence.taken', { licence: licence.id, sources: sourcesText(licence.sources) })} <InfoTip id="convertLicenceTaken" />
          <Also items={licence.also} />
        </p>
      ) : null;
    case 'other': {
      const sources = [...new Set(licence.says.map((s) => `${s.file}, ${s.field}`))].join('; ');
      return (
        <p className="notice convert-licence-note" role="note">
          {t(licence.ids.length > 1 ? 'convert.licence.otherSeveral' : 'convert.licence.other', { said: licence.said, sources })} <InfoTip id="convertLicenceOther" />
          <Also items={licence.also} />
        </p>
      );
    }
    case 'contradictory':
      return (
        <div className="notice convert-licence-note" role="note">
          <p>
            {t('convert.licence.contradictory')} <InfoTip id="convertLicenceContradictory" />
          </p>
          <ul>
            {licence.says.map((s, i) => (
              <li key={i}>{t('convert.licence.said', { file: s.file, field: s.field, says: s.says })}</li>
            ))}
          </ul>
          <p>{t('convert.licence.contradictory.after')}</p>
        </div>
      );
    case 'missing':
      return (
        <p className="notice convert-licence-note" role="note">
          {t('convert.licence.missing')} <InfoTip id="convertLicenceMissing" />
        </p>
      );
  }
}

/** The non-licence statements beside a licence: a neutral note, never a conflict. */
function Also({ items }: { items: LicenceSaid[] }): React.ReactElement | null {
  useLang();
  if (items.length === 0) return null;
  const files = [...new Set(items.map((i) => i.file))];
  return (
    <span className="convert-also">
      {files.map((file) => (
        <span key={file}> {t('convert.licence.also', { file, items: items.filter((i) => i.file === file).map((i) => t('convert.licence.alsoItem', { field: i.field, says: i.says })).join('; ') })}</span>
      ))}
    </span>
  );
}

/** How each creator or contact line will be written: a person (given name and family name) or an organisation. */
function Writes({ lines, organisations }: { lines: string[]; organisations: string }): React.ReactElement | null {
  useLang();
  if (lines.length === 0) return null;
  return (
    <div className="muted convert-writes">
      <p>{t('convert.meta.writes.title')}</p>
      <ul>
        {lines.map((line, i) => {
          const p = partyOf(line, organisations);
          const text = p.kind === 'organisation' ? t('convert.meta.writes.org', { line }) : p.givenName === undefined ? t('convert.meta.writes.personSur', { line, surname: p.surName }) : t('convert.meta.writes.person', { line, given: p.givenName, surname: p.surName });
          return <li key={i}>{text}</li>;
        })}
      </ul>
    </div>
  );
}

const LIST_FIRST = 5;

/** The contacts one file lists: not a disagreement, a list. The first five are shown, "show all" the rest; nothing is filled in until one is chosen. */
function ContactList({ list, isCurrent, onUse }: { list: ConvertPrefill['contactLists'][number]; isCurrent: (c: Candidate) => boolean; onUse: (c: Candidate) => void }): React.ReactElement {
  useLang();
  const [all, setAll] = useState(false);
  const shown = all ? list.items : list.items.slice(0, LIST_FIRST);
  return (
    <div className="convert-choice" role="group" aria-label={t('convert.meta.src.list.label')} data-mode="list">
      <p>
        {t('convert.meta.src.list', { file: list.file, n: list.items.length })} <InfoTip id="convertMetaList" />
      </p>
      <ul>
        {shown.map((c, i) => {
          const cand: Candidate = { value: c.name, email: c.email, sources: [{ file: list.file, field: list.field }] };
          const text = [c.name, c.email].filter((x) => x !== '').join(', ');
          return (
            <li key={i}>
              <span className="convert-choice-value">{text}</span>{' '}
              {isCurrent(cand) ? (
                <span className="muted">{t('convert.meta.src.used')}</span>
              ) : (
                <button type="button" className="link-button" aria-label={t('convert.meta.src.useLabel', { value: text, sources: `${list.file}, ${list.field}` })} onClick={() => onUse(cand)}>
                  {t('convert.meta.src.use')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {list.items.length > LIST_FIRST && (
        <button type="button" className="link-button" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? t('convert.meta.src.showFewer') : t('convert.meta.src.showAll', { n: list.items.length })}
        </button>
      )}
    </div>
  );
}
