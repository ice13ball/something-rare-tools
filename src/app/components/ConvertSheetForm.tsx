// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useEffect, useId, useRef } from 'react';
import { parseRateUnit } from '../../core/convert';
import type { ConvertShape } from '../../core/convert';
import type { UiKey } from '../../core/i18n/ui';
import { t, useLang } from '../i18n';
import { scaleClassesOf } from '../convertModel';
import type { QuantityForm, SheetChoice } from '../convertModel';
import { DEVICES } from '../../core/convert/vocab';
import { FieldLabel, InfoTip } from './InfoTip';
import { ConvertTurn } from './ConvertTurn';
import type { ConvertTurnProps } from './ConvertTurn';

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
  /** a column of this sheet is mapped as the quantity (a count, a density, a biomass): the sheet has numbers, so "presence only" does not apply and is not offered */
  hasQuantityColumn?: boolean;
  /** the sheet looks transposed (species or variables in rows): the blocking message is in the list below, the tick "read as a normal table" is here */
  transposed?: boolean;
  /** a column of this sheet is mapped as the sample code (a profile sheet's own level code) */
  hasCodeColumn: boolean;
  /** a column of this sheet is mapped as a pressure */
  hasPressureColumn: boolean;
  /** a column of this sheet is mapped as the station (without one, a profile sheet may take each distinct position for a station) */
  hasStationColumn: boolean;
  /** a column of this sheet is mapped as latitude or longitude (even one blank in every row): no declared position is offered */
  hasPositionColumn?: boolean;
  /** the name of the joined sheet that gives this sheet's positions (a confirmed join to a description sheet with a latitude or longitude column): no declared position is used */
  positionJoinedFrom?: string;
  /** CONV-EVENT-DATE-MISSING says no sample of this sheet has a date (and none could come from elsewhere): the field for one declared date is offered. It stays once filled. */
  dateOffered?: boolean;
  /** core's ownRecordsEligible holds for this sheet (a long sheet with a taxon column and no occurrenceID column): the tick "each row is its own record" is shown */
  ownRecordsOffered?: boolean;
  /** "The samples are the columns": the sheet as dropped and what was declared for it (see ConvertTurn). Absent: no declaration is offered. */
  turn?: Omit<ConvertTurnProps, 'fileName' | 'sheet'>;
  choice: SheetChoice;
  onChange: (choice: SheetChoice) => void;
}

/**
 * The decisions about one sheet: use it or not, whether it is a profile / environment file of the cruise (stage 6: then no shape, quantity or device is asked, but the
 * approval of depth-based level IDs when there is no code column), wide or long, what the numbers mean (kind, unit, kind of weight, per volume or area, where it was
 * sampled, the sample size) and, without a cruise column, the cruise code. Every one carries its ⓘ. Nothing here is guessed: the form starts with the
 * shape the column meanings suggest and with NO declaration of the quantity, which blocks until the user makes it.
 */
export function ConvertSheetForm({ fileName, sheet, hasCruiseColumn, hasEffortColumn, suggestedProfile, dictionary, hasQuantityColumn, transposed, hasCodeColumn, hasPressureColumn, hasStationColumn, hasPositionColumn, positionJoinedFrom, dateOffered, ownRecordsOffered, turn, choice, onChange }: ConvertSheetFormProps): React.ReactElement {
  useLang();
  const id = useId();
  const q = choice.quantity;
  const setQ = (patch: Partial<QuantityForm>): void => onChange({ ...choice, quantity: { ...q, ...patch } });
  const rate = q.unit.trim() === '' ? undefined : parseRateUnit(q.unit, { litre: true });
  // one meaning field per class, only when the scale is whole numbers with at most 20 classes
  const scaleClasses = scaleClassesOf(q);
  const perArea = q.per !== 'sample' && (q.per === 'area' || (q.per === '' && rate?.per === 'area'));
  const shapeLabel = `${id}-shape`;
  // the declared position (a sheet with no position column, not a profile): a closed section, open from the start when it already holds values
  const positionBox = useRef<HTMLDetailsElement>(null);
  const positionFilled = choice.positionLat !== '' || choice.positionLon !== '' || choice.positionUncertainty !== '';
  const positionHeld = hasPositionColumn === true || choice.profile || positionJoinedFrom !== undefined;
  useEffect(() => {
    if ((positionFilled || choice.positionStale === true) && positionBox.current) positionBox.current.open = true;
    // only at the start: the person may close it afterwards
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // an edit is the person's own: what was read from a companion file is no longer said to come from it
  const setPosition = (patch: Partial<Pick<SheetChoice, 'positionLat' | 'positionLon' | 'positionUncertainty'>>): void => {
    const { positionFromFile: _file, positionStale: _stale, ...rest } = choice;
    onChange({ ...rest, ...patch });
  };
  // the declared date (a sheet on which no sample has a date): a closed section, open from the start when it already holds a value
  const dateBox = useRef<HTMLDetailsElement>(null);
  const dateFilled = (choice.declaredDate ?? '') !== '';
  useEffect(() => {
    if ((dateFilled || choice.dateStale === true) && dateBox.current) dateBox.current.open = true;
    // only at the start: the person may close it afterwards
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setDate = (value: string): void => {
    const { dateFromFile: _file, dateStale: _stale, ...rest } = choice;
    onChange({ ...rest, declaredDate: value });
  };
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
      {turn !== undefined && choice.use && <ConvertTurn fileName={fileName} sheet={sheet} {...turn} />}
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

            {hasQuantityColumn !== true && (
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
            )}

            {ownRecordsOffered === true && (
            <div className="convert-group">
              <div className="choice-line">
                <label className="inline-choice">
                  <input
                    type="checkbox"
                    checked={choice.ownRecords === true}
                    onChange={(e) => {
                      // ticking is the person's own; unticking takes back the copies answer too (it belongs to this choice) and any pre-tick from a file
                      const { ownRecords: _o, ownRecordsFromFile: _of, keepCopiesAnswer: _ka, keepCopiesFile: _kf, ...rest } = choice;
                      onChange(e.target.checked ? { ...rest, ownRecords: true } : rest);
                    }}
                    aria-describedby={`${id}-own-help`}
                  />
                  <span>{t('convert.sheet.ownRecords')}</span>
                </label>
              </div>
              <p id={`${id}-own-help`} className="muted">
                {t('convert.sheet.ownRecords.help')}
              </p>
            </div>
            )}

            {(!choice.presenceOnly || hasQuantityColumn === true) && (
            <div className="convert-group">
              <h4>{t('convert.quantity.title')}</h4>
              <div className="convert-fields">
                <div className="field">
                  <FieldLabel htmlFor={`${id}-kind`} tip="convertQuantityKind">
                    {t('convert.quantity.kind')}
                  </FieldLabel>
                  <select id={`${id}-kind`} value={q.kind} onChange={(e) => { const kind = e.target.value as QuantityForm['kind']; setQ(kind !== 'biomass' && q.per === 'sample' ? { kind, per: '' } : { kind }); }}>
                    <option value="">{t('convert.kind.none')}</option>
                    <option value="count">{t('convert.kind.count')}</option>
                    <option value="density">{t('convert.kind.density')}</option>
                    <option value="biomass">{t('convert.kind.biomass')}</option>
                    <option value="cover">{t('convert.kind.cover')}</option>
                    <option value="class">{t('convert.kind.class')}</option>
                  </select>
                </div>
                {q.kind === 'class' && (
                  <>
                    <div className="field">
                      <label htmlFor={`${id}-scale-name`}>{t('convert.scale.name')}</label>
                      <input id={`${id}-scale-name`} type="text" value={q.scaleName} autoComplete="off" spellCheck={false} onChange={(e) => setQ({ scaleName: e.target.value })} />
                    </div>
                    <div className="field">
                      <label htmlFor={`${id}-scale-min`}>{t('convert.scale.min')}</label>
                      <input id={`${id}-scale-min`} type="text" inputMode="numeric" value={q.scaleMin} autoComplete="off" spellCheck={false} onChange={(e) => setQ({ scaleMin: e.target.value })} />
                    </div>
                    <div className="field">
                      <label htmlFor={`${id}-scale-max`}>{t('convert.scale.max')}</label>
                      <input id={`${id}-scale-max`} type="text" inputMode="numeric" value={q.scaleMax} autoComplete="off" spellCheck={false} onChange={(e) => setQ({ scaleMax: e.target.value })} />
                    </div>
                    {scaleClasses.length === 0 && q.scaleMin.trim() !== '' && q.scaleMax.trim() !== '' && <p className="muted">{t('convert.scale.nomeanings')}</p>}
                    {scaleClasses.map((n) => (
                      <div className="field" key={n}>
                        <label htmlFor={`${id}-scale-meaning-${n}`}>{t('convert.scale.meaning', { n })}</label>
                        <input id={`${id}-scale-meaning-${n}`} type="text" value={q.scaleMeanings[String(n)] ?? ''} autoComplete="off" spellCheck={false} onChange={(e) => setQ({ scaleMeanings: { ...q.scaleMeanings, [String(n)]: e.target.value } })} />
                      </div>
                    ))}
                  </>
                )}
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
                        {q.kind === 'biomass' && <option value="sample">{t('convert.per.sample')}</option>}
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

          {(!positionHeld || positionFilled || choice.positionStale === true) && (
            <details className="convert-group" ref={positionBox}>
              <summary>{t('convert.position.title')}</summary>
              <p className="muted">{t('convert.position.help')}</p>
              {choice.positionStale === true && (
                <p role="note" data-testid="position-stale">
                  {t('convert.position.staleFile')}
                </p>
              )}
              {positionHeld && positionFilled && (
                <p role="note" data-testid="position-held-back">
                  {choice.profile ? t('convert.position.heldBack.profile') : hasPositionColumn === true ? t('convert.position.heldBack.column') : t('convert.position.heldBack.join', { description: positionJoinedFrom ?? '' })}{' '}
                  <button type="button" className="button" onClick={() => onChange({ ...choice, positionLat: '', positionLon: '', positionUncertainty: '', positionFromFile: undefined, positionStale: undefined })}>
                    {t('convert.position.clear')}
                  </button>
                </p>
              )}
              <div className="field">
                <label htmlFor={`${id}-pos-lat`}>{t('convert.position.lat')}</label>
                <input id={`${id}-pos-lat`} data-position-lat={`${fileName}\u0000${sheet}`} type="text" inputMode="decimal" maxLength={40} value={choice.positionLat} autoComplete="off" spellCheck={false} onChange={(e) => setPosition({ positionLat: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={`${id}-pos-lon`}>{t('convert.position.lon')}</label>
                <input id={`${id}-pos-lon`} type="text" inputMode="decimal" maxLength={40} value={choice.positionLon} autoComplete="off" spellCheck={false} onChange={(e) => setPosition({ positionLon: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={`${id}-pos-unc`}>{t('convert.position.uncertainty')}</label>
                <input id={`${id}-pos-unc`} type="text" inputMode="decimal" maxLength={40} value={choice.positionUncertainty} autoComplete="off" spellCheck={false} onChange={(e) => setPosition({ positionUncertainty: e.target.value })} />
              </div>
            </details>
          )}

          {(dateOffered === true || dateFilled || choice.dateStale === true) && (
            <details className="convert-group" ref={dateBox}>
              <summary>{t('convert.date.title')}</summary>
              <p className="muted">{t('convert.date.help')}</p>
              {choice.dateStale === true && (
                <p role="note" data-testid="date-stale">
                  {t('convert.date.staleFile')}
                </p>
              )}
              {choice.dateFromFile === true && (
                <p role="note" data-testid="date-from-file">
                  {t('convert.date.fromFile')}{' '}
                  <button type="button" className="button" onClick={() => onChange({ ...choice, declaredDate: '', dateFromFile: undefined, dateStale: undefined })}>
                    {t('convert.date.undo')}
                  </button>
                </p>
              )}
              <div className="field">
                <label htmlFor={`${id}-date`}>{t('convert.date.label')}</label>
                <input id={`${id}-date`} data-declared-date={`${fileName}\u0000${sheet}`} type="text" maxLength={40} placeholder="2021-05" value={choice.declaredDate ?? ''} autoComplete="off" spellCheck={false} onChange={(e) => setDate(e.target.value)} />
              </div>
            </details>
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
