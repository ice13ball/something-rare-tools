// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useId } from 'react';
import { parseRateUnit } from '../../core/convert';
import type { ConvertShape } from '../../core/convert';
import type { UiKey } from '../../core/i18n/ui';
import { t, useLang } from '../i18n';
import type { QuantityForm, SheetChoice } from '../convertModel';
import { DEVICES } from '../../core/convert/vocab';
import { FieldLabel, InfoTip } from './InfoTip';

export interface ConvertSheetFormProps {
  fileName: string;
  sheet: string;
  /** a column of this sheet is mapped as the cruise: no cruise code field */
  hasCruiseColumn: boolean;
  /** a column of this sheet is mapped as the sample size */
  hasEffortColumn: boolean;
  /** Stage 6: the overlay thinks the sheet looks like a profile / environment file (a suggestion only: the mark is the user's tick) */
  suggestedProfile: boolean;
  /** the sheet looks like a data dictionary (a glossary of columns): it started unticked, and the note says why */
  dictionary?: boolean;
  /** the sheet looks transposed (species or variables in rows): the blocking message is in the list below, the tick "read as a normal table" is here */
  transposed?: boolean;
  /** a column of this sheet is mapped as the sample code (a profile sheet's own level code) */
  hasCodeColumn: boolean;
  /** a column of this sheet is mapped as a pressure */
  hasPressureColumn: boolean;
  /** a column of this sheet is mapped as the station (without one, a profile sheet may take each distinct position for a station) */
  hasStationColumn: boolean;
  choice: SheetChoice;
  onChange: (choice: SheetChoice) => void;
}

/**
 * The decisions about one sheet: use it or not, whether it is a profile / environment file of the cruise (stage 6: then no shape, quantity or device is asked, but the
 * approval of depth-based level IDs when there is no code column), wide or long, what the numbers mean (kind, unit, kind of weight, per volume or area, where it was
 * sampled, the sample size) and, without a cruise column, the cruise code. Every one carries its ⓘ. Nothing here is guessed: the form starts with the
 * shape the column meanings suggest and with NO declaration of the quantity, which blocks until the user makes it.
 */
export function ConvertSheetForm({ fileName, sheet, hasCruiseColumn, hasEffortColumn, suggestedProfile, dictionary, transposed, hasCodeColumn, hasPressureColumn, hasStationColumn, choice, onChange }: ConvertSheetFormProps): React.ReactElement {
  useLang();
  const id = useId();
  const q = choice.quantity;
  const setQ = (patch: Partial<QuantityForm>): void => onChange({ ...choice, quantity: { ...q, ...patch } });
  const rate = q.unit.trim() === '' ? undefined : parseRateUnit(q.unit);
  const perArea = q.per === 'area' || (q.per === '' && rate?.per === 'area');
  const shapeLabel = `${id}-shape`;
  return (
    <section className="convert-sheet" aria-label={t('convert.sheet.title', { sheet, file: fileName })}>
      <h3>{t('convert.sheet.title', { sheet, file: fileName })}</h3>
      <div className="choice-line">
        <label className="inline-choice">
          <input type="checkbox" checked={choice.use} onChange={(e) => onChange({ ...choice, use: e.target.checked })} />
          <span>{t('convert.sheet.use')}</span>
        </label>
        <InfoTip id="convertSheetUse" />
      </div>
      {dictionary === true && (
        <p className="muted" role="note">
          {t('convert.sheet.dictionary')}
        </p>
      )}
      {transposed === true && choice.use && (
        <div className="choice-line">
          <label className="inline-choice">
            <input type="checkbox" checked={choice.readAsTable} onChange={(e) => onChange({ ...choice, readAsTable: e.target.checked })} />
            <span>{t('convert.sheet.asTable')}</span>
          </label>
        </div>
      )}
      {choice.use && (
        <>
          <div className="convert-group">
            <div className="choice-line">
              <label className="inline-choice">
                <input type="checkbox" checked={choice.profile} onChange={(e) => onChange({ ...choice, profile: e.target.checked, ...(e.target.checked ? {} : { profileDepthIds: false, profileIgnoreCast: false, profilePosition: false }) })} aria-describedby={`${id}-profile-help`} />
                <span>{t('convert.sheet.profile')}</span>
              </label>
              <InfoTip id="convertProfile" />
            </div>
            <p id={`${id}-profile-help`} className="muted">
              {t('convert.sheet.profile.help')}
            </p>
            {!choice.profile && suggestedProfile && (
              <div className="notice" role="note">
                <p>{t('convert.sheet.profile.suggest')}</p>
                <button type="button" className="button" onClick={() => onChange({ ...choice, profile: true })}>
                  {t('convert.sheet.profile.mark')}
                </button>
              </div>
            )}
            {choice.profile && (
              <>
                {!hasStationColumn && (
                  <>
                    <div className="choice-line">
                      <label className="inline-choice">
                        <input type="checkbox" checked={choice.profilePosition} onChange={(e) => onChange({ ...choice, profilePosition: e.target.checked })} aria-describedby={`${id}-position-help`} />
                        <span>{t('convert.sheet.profile.position')}</span>
                      </label>
                      <InfoTip id="convertProfilePosition" />
                    </div>
                    <p id={`${id}-position-help`} className="muted">
                      {t('convert.sheet.profile.position.help')}
                    </p>
                  </>
                )}
                {!hasCodeColumn && (
                  <>
                    <div className="choice-line">
                      <label className="inline-choice">
                        <input type="checkbox" checked={choice.profileDepthIds} onChange={(e) => onChange({ ...choice, profileDepthIds: e.target.checked })} aria-describedby={`${id}-depthids-help`} />
                        <span>{t('convert.sheet.profile.depthIds')}</span>
                      </label>
                      <InfoTip id="convertProfileDepthIds" />
                    </div>
                    <p id={`${id}-depthids-help`} className="muted">
                      {t('convert.sheet.profile.depthIds.help')}
                    </p>
                  </>
                )}
                <div className="with-tip">
                  <p className="muted">{t('convert.sheet.profile.stations')}</p>
                  <InfoTip id="convertProfileStations" />
                </div>
                <div className="choice-line">
                  <label className="inline-choice">
                    <input type="checkbox" checked={choice.profileIgnoreCast} onChange={(e) => onChange({ ...choice, profileIgnoreCast: e.target.checked })} aria-describedby={`${id}-cast-help`} />
                    <span>{t('convert.sheet.profile.cast')}</span>
                  </label>
                  <InfoTip id="convertProfileCast" />
                </div>
                <p id={`${id}-cast-help`} className="muted">
                  {t('convert.sheet.profile.cast.help')}
                </p>
                {hasPressureColumn && (
                  <div className="with-tip">
                    <p className="muted">{t('convert.sheet.profile.pressure')}</p>
                    <InfoTip id="convertProfilePressure" />
                  </div>
                )}
              </>
            )}
          </div>

          {!choice.profile && (
            <>
            <div className="convert-group">
              <div className="with-tip">
                <span className="convert-legend" id={shapeLabel}>
                  {t('convert.sheet.shape')}
                </span>
                <InfoTip id="convertShape" />
              </div>
              <div role="radiogroup" aria-labelledby={shapeLabel} className="convert-radios">
                {(['wide', 'long'] as ConvertShape[]).map((s) => (
                  <label key={s} className="inline-choice convert-radio">
                    <input type="radio" name={`${id}-shape`} checked={choice.shape === s} onChange={() => onChange({ ...choice, shape: s })} />
                    <span>{t(`convert.shape.${s}` as UiKey)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="convert-group">
              <div className="choice-line">
                <label className="inline-choice">
                  <input type="checkbox" checked={choice.presenceOnly} onChange={(e) => onChange({ ...choice, presenceOnly: e.target.checked })} aria-describedby={`${id}-presence-help`} />
                  <span>{t('convert.sheet.presence')}</span>
                </label>
              </div>
              <p id={`${id}-presence-help`} className="muted">
                {t('convert.sheet.presence.help')}
              </p>
            </div>

            {!choice.presenceOnly && (
            <div className="convert-group">
              <h4>{t('convert.quantity.title')}</h4>
              <div className="convert-fields">
                <div className="field">
                  <FieldLabel htmlFor={`${id}-kind`} tip="convertQuantityKind">
                    {t('convert.quantity.kind')}
                  </FieldLabel>
                  <select id={`${id}-kind`} value={q.kind} onChange={(e) => setQ({ kind: e.target.value as QuantityForm['kind'] })}>
                    <option value="">{t('convert.kind.none')}</option>
                    <option value="count">{t('convert.kind.count')}</option>
                    <option value="density">{t('convert.kind.density')}</option>
                    <option value="biomass">{t('convert.kind.biomass')}</option>
                  </select>
                </div>
                {(q.kind === 'density' || q.kind === 'biomass') && (
                  <>
                    <div className="field">
                      <FieldLabel htmlFor={`${id}-unit`} tip="convertQuantityUnit">
                        {t('convert.quantity.unit')}
                      </FieldLabel>
                      <input id={`${id}-unit`} type="text" value={q.unit} placeholder={t('convert.quantity.unit.example')} autoComplete="off" spellCheck={false} onChange={(e) => setQ({ unit: e.target.value })} />
                    </div>
                    {q.kind === 'biomass' && (
                      <div className="field">
                        <FieldLabel htmlFor={`${id}-basis`} tip="convertQuantityBasis">
                          {t('convert.quantity.basis')}
                        </FieldLabel>
                        <select id={`${id}-basis`} value={q.basis} onChange={(e) => setQ({ basis: e.target.value as QuantityForm['basis'] })}>
                          <option value="">{t('convert.kind.none')}</option>
                          <option value="wet">{t('convert.basis.wet')}</option>
                          <option value="dry">{t('convert.basis.dry')}</option>
                          <option value="afdw">{t('convert.basis.afdw')}</option>
                        </select>
                      </div>
                    )}
                    <div className="field">
                      <FieldLabel htmlFor={`${id}-per`} tip="convertQuantityPer">
                        {t('convert.quantity.per')}
                      </FieldLabel>
                      <select id={`${id}-per`} value={q.per} onChange={(e) => setQ({ per: e.target.value as QuantityForm['per'] })}>
                        <option value="">{t('convert.per.auto')}</option>
                        <option value="volume">{t('convert.per.volume')}</option>
                        <option value="area">{t('convert.per.area')}</option>
                      </select>
                    </div>
                    {perArea && (
                      <div className="field">
                        <FieldLabel htmlFor={`${id}-medium`} tip="convertQuantityMedium">
                          {t('convert.quantity.medium')}
                        </FieldLabel>
                        <select id={`${id}-medium`} value={q.medium} onChange={(e) => setQ({ medium: e.target.value as QuantityForm['medium'] })}>
                          <option value="">{t('convert.medium.none')}</option>
                          <option value="bed">{t('convert.medium.bed')}</option>
                          <option value="water">{t('convert.medium.water')}</option>
                        </select>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="convert-fields">
                <div className="field">
                  <FieldLabel htmlFor={`${id}-effort`} tip="convertEffort">
                    {t('convert.effort.title')}
                  </FieldLabel>
                  <select id={`${id}-effort`} value={q.effort} onChange={(e) => setQ({ effort: e.target.value as QuantityForm['effort'] })}>
                    <option value="none">{t('convert.effort.none')}</option>
                    <option value="constant">{t('convert.effort.constant')}</option>
                    <option value="column">{t('convert.effort.column')}</option>
                  </select>
                </div>
                {q.effort === 'constant' && (
                  <div className="field">
                    <FieldLabel htmlFor={`${id}-evalue`} tip="convertEffortValue">
                      {t('convert.effort.value')}
                    </FieldLabel>
                    <input id={`${id}-evalue`} type="text" inputMode="decimal" value={q.effortValue} autoComplete="off" spellCheck={false} onChange={(e) => setQ({ effortValue: e.target.value })} />
                  </div>
                )}
                {q.effort !== 'none' && (
                  <>
                    <div className="field">
                      <FieldLabel htmlFor={`${id}-eunit`} tip="convertEffortUnit">
                        {t('convert.effort.unit')}
                      </FieldLabel>
                      <input id={`${id}-eunit`} type="text" value={q.effortUnit} placeholder="m3" autoComplete="off" spellCheck={false} onChange={(e) => setQ({ effortUnit: e.target.value })} />
                    </div>
                    <div className="field">
                      <FieldLabel htmlFor={`${id}-edim`} tip="convertEffortDimension">
                        {t('convert.effort.dimension')}
                      </FieldLabel>
                      <select id={`${id}-edim`} value={q.effortDimension} onChange={(e) => setQ({ effortDimension: e.target.value as QuantityForm['effortDimension'] })}>
                        <option value="">{t('convert.per.auto')}</option>
                        <option value="volume">{t('convert.per.volume')}</option>
                        <option value="area">{t('convert.per.area')}</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
              {q.effort === 'column' && !hasEffortColumn && (
                <p className="notice" role="note">
                  {t('convert.effort.columnMissing')}
                </p>
              )}
            </div>
            )}

            <div className="convert-group">
              <div className="convert-fields">
                <div className="field">
                  <FieldLabel htmlFor={`${id}-device`} tip="convertDevice">
                    {t('convert.device.label')}
                  </FieldLabel>
                  <select id={`${id}-device`} value={choice.device} onChange={(e) => onChange({ ...choice, device: e.target.value })}>
                    <option value="">{t('convert.device.none')}</option>
                    {Object.entries(DEVICES).map(([key, d]) => (
                      <option key={key} value={key}>
                        {d.label}
                      </option>
                    ))}
                    <option value="other">{t('convert.device.other')}</option>
                  </select>
                </div>
                {choice.device === 'other' && (
                  <div className="field">
                    <label htmlFor={`${id}-devicetext`}>{t('convert.device.text')}</label>
                    <input id={`${id}-devicetext`} type="text" value={choice.deviceText} autoComplete="off" spellCheck={false} onChange={(e) => onChange({ ...choice, deviceText: e.target.value })} />
                  </div>
                )}
                <div className="field">
                  <FieldLabel htmlFor={`${id}-mesh`} tip="convertMesh">
                    {t('convert.mesh.label')}
                  </FieldLabel>
                  <input id={`${id}-mesh`} type="text" inputMode="decimal" value={choice.mesh} autoComplete="off" spellCheck={false} onChange={(e) => onChange({ ...choice, mesh: e.target.value })} />
                </div>
              </div>
            </div>

            </>
          )}

          {!hasCruiseColumn && (
            <div className="convert-group">
              <div className="field">
                <FieldLabel htmlFor={`${id}-cruise`} tip="convertCruise">
                  {t('convert.cruise.label')}
                </FieldLabel>
                <input id={`${id}-cruise`} type="text" value={choice.cruise} autoComplete="off" spellCheck={false} onChange={(e) => onChange({ ...choice, cruise: e.target.value })} aria-describedby={`${id}-cruise-help`} />
                <p id={`${id}-cruise-help`} className="muted">
                  {t('convert.cruise.help')}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
