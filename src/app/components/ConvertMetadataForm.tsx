// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useId } from 'react';
import { BASES_OF_RECORD, LICENCES, isBasis, isLicence } from '../../core/convert/metadata';
import type { DatasetMetadata } from '../../core/convert/metadata';
import type { UiKey } from '../../core/i18n/ui';
import { t, useLang } from '../i18n';
import { FieldLabel } from './InfoTip';

export interface ConvertMetadataFormProps {
  value: DatasetMetadata;
  onChange: (next: DatasetMetadata) => void;
}

/**
 * The minimal description of the dataset: title, abstract, creators, contact, institution code, dataset name, methods, licence and basisOfRecord. A plain
 * controlled form over `DatasetMetadata` (core/convert/metadata.ts): the page starts it from `applyPrefill(EMPTY_METADATA, parsed.prefill)`, so metadata
 * read from dropped files (a later stage) fills the same fields and the user still sees and edits every one. Nothing is stored. The licence and the
 * kind of record start unchosen and have no default.
 */
export function ConvertMetadataForm({ value, onChange }: ConvertMetadataFormProps): React.ReactElement {
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
  return (
    <div className="convert-fields convert-meta">
      <div className="field">
        <FieldLabel htmlFor={`${id}-title`} tip="convertMetaTitle">
          {t('convert.meta.f.title')}
        </FieldLabel>
        <input {...text('title')} />
      </div>
      <div className="field">
        <FieldLabel htmlFor={`${id}-abstract`} tip="convertMetaAbstract">
          {t('convert.meta.f.abstract')}
        </FieldLabel>
        <textarea id={`${id}-abstract`} rows={4} value={value.abstract} spellCheck={false} onChange={(e) => set({ abstract: e.target.value })} />
      </div>
      <div className="field">
        <FieldLabel htmlFor={`${id}-creators`} tip="convertMetaCreators">
          {t('convert.meta.f.creators')}
        </FieldLabel>
        <textarea id={`${id}-creators`} rows={3} value={value.creators} spellCheck={false} onChange={(e) => set({ creators: e.target.value })} />
      </div>
      <div className="field">
        <FieldLabel htmlFor={`${id}-contactName`} tip="convertMetaContact">
          {t('convert.meta.f.contactName')}
        </FieldLabel>
        <input {...text('contactName')} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-contactEmail`}>{t('convert.meta.f.contactEmail')}</label>
        <input {...text('contactEmail', 'email')} />
      </div>
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
    </div>
  );
}
