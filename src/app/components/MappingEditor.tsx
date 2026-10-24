// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { CANONICAL_VARIABLES } from '../../core/recognize/vocab';
import type { ColumnProposal, ColumnRole, SheetMapping } from '../../core/types';
import { MAX_SAMPLES } from '../../worker/protocol';
import { t, useLang } from '../i18n';
import { InfoTip } from './InfoTip';
import { ROLE_KINDS, changeRole, mappingWith, roleLabelKey, roleUnit, setPositive, setUnit, setVariableName, type RoleKind } from '../mappingModel';

export interface MappingEditorProps {
  sheet: string;
  proposals: ColumnProposal[];
  /** samples[columnIndex]: the first non-blank values as text. At most 5 are shown, however many are passed. */
  samples: string[][];
  mapping: SheetMapping;
  /** Columns the table layout reads itself (long format: parameter, unit, value): shown, not editable. */
  layoutColumns?: ReadonlySet<number>;
  onChange: (mapping: SheetMapping) => void;
}

const DATALIST_ID = 'canonical-variables';
const CANONICAL_KEYS: readonly string[] = CANONICAL_VARIABLES.map((c) => c.key);

/**
 * One row per column: its header, the first values, the role the tool proposes as a dropdown (low-confidence proposals
 * highlighted), and for a measured variable its name and unit. The unit box starts from the proposal only: a column with no
 * stated unit stays empty. ⛔ Never fills in a unit nobody stated.
 */
export function MappingEditor({ sheet, proposals, samples, mapping, layoutColumns, onChange }: MappingEditorProps): React.ReactElement {
  useLang();
  return (
    <section className="mapping-editor" aria-label={t('mapping.title', { sheet })}>
      <h4>{t('mapping.title', { sheet })}</h4>
      <datalist id={DATALIST_ID}>
        {CANONICAL_KEYS.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <div className="table-scroll">
        <table className="mapping-table">
          <thead>
            <tr>
              <th scope="col">{t('mapping.column')}</th>
              <th scope="col">{t('mapping.samples')}</th>
              <th scope="col" aria-label={t('mapping.role')}>
                {t('mapping.role')}
                <InfoTip id="roles" />
              </th>
            </tr>
          </thead>
          <tbody>
            {mapping.columns.map((col) => {
              const proposal = proposals.find((p) => p.index === col.index);
              const consumed = layoutColumns?.has(col.index) === true;
              const low = proposal?.confidence === 'low' && !consumed;
              const shown = (samples[col.index] ?? []).slice(0, MAX_SAMPLES);
              const label = col.header === '' ? `#${col.index + 1}` : col.header;
              return (
                <tr key={col.index} className={low ? 'low-confidence' : undefined} data-low={low ? 'true' : 'false'}>
                  <th scope="row">
                    <code>{label}</code>
                  </th>
                  <td className="samples">
                    {shown.length === 0 ? (
                      <span className="muted">{t('mapping.empty')}</span>
                    ) : (
                      shown.map((s, i) => (
                        <span key={i} className="sample">
                          {s}
                        </span>
                      ))
                    )}
                  </td>
                  <td>
                    {consumed ? (
                      <span className="muted">{t('mapping.layout')}</span>
                    ) : (
                      <RoleCell
                        label={label}
                        role={col.role}
                        proposed={proposal?.role ?? { kind: 'ignore' }}
                        cleanHeader={proposal?.cleanHeader ?? col.header}
                        reason={low ? proposal?.reason : undefined}
                        onRole={(r) => onChange(mappingWith(mapping, col.index, r))}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <span className="visually-hidden">{sheet}</span>
    </section>
  );
}

interface RoleCellProps {
  label: string;
  role: ColumnRole;
  proposed: ColumnRole;
  cleanHeader: string;
  reason?: string;
  onRole: (role: ColumnRole) => void;
}

function RoleCell({ label, role, proposed, cleanHeader, reason, onRole }: RoleCellProps): React.ReactElement {
  const unit = roleUnit(role) ?? '';
  const hasUnit = role.kind === 'variable' || role.kind === 'depth' || role.kind === 'pressure';
  return (
    <div className="role-cell">
      <select
        aria-label={`${label}: ${t('mapping.role')}`}
        value={role.kind}
        onChange={(e) => onRole(changeRole(role, proposed, e.target.value as RoleKind, cleanHeader))}
      >
        {ROLE_KINDS.map((k) => (
          <option key={k} value={k}>
            {t(roleLabelKey(k))}
          </option>
        ))}
      </select>
      {reason !== undefined && (
        <p className="low-note">
          <strong>{t('mapping.low')}.</strong> <span className="muted">{reason}</span>
        </p>
      )}
      {role.kind === 'variable' && (
        <label className="inline-field">
          <span>{t('mapping.variable')}</span>
          <input type="text" list={DATALIST_ID} value={role.variable} autoComplete="off" spellCheck={false} onChange={(e) => onRole(setVariableName(role, e.target.value))} />
        </label>
      )}
      {role.kind === 'depth' && (
        <label className="inline-field">
          <span>{t('mapping.positive')}</span>
          <select value={role.positive} onChange={(e) => onRole(setPositive(role, e.target.value as 'down' | 'up' | 'unknown'))}>
            <option value="down">{t('mapping.positive.down')}</option>
            <option value="up">{t('mapping.positive.up')}</option>
            <option value="unknown">{t('mapping.positive.unknown')}</option>
          </select>
        </label>
      )}
      {hasUnit && (
        <label className="inline-field">
          <span>{t('mapping.unit')}</span>
          <input
            type="text"
            value={unit}
            placeholder={unit === '' ? t('mapping.unit.none') : undefined}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => onRole(setUnit(role, e.target.value))}
          />
        </label>
      )}
    </div>
  );
}
