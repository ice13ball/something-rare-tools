// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Pure helpers behind the mapping table: changing the role of a column without ever inventing a unit.
import type { UiKey } from '../core/i18n/ui';
import type { ColumnRole, SheetMapping } from '../core/types';

export type RoleKind = ColumnRole['kind'];

/** Order of the role dropdown. */
export const ROLE_KINDS: readonly RoleKind[] = [
  'ignore',
  'latitude',
  'longitude',
  'datetime',
  'date',
  'time',
  'depth',
  'pressure',
  'station',
  'cruise',
  'sampleId',
  'variable',
];

export const roleLabelKey = (kind: RoleKind): UiKey => `role.${kind}` as UiKey;

/**
 * The role after the user picked `kind` in the dropdown. Going back to the kind the tool proposed restores the
 * proposal as it was (unit and all); any other kind starts bare: no unit, depth direction unknown.
 */
export function changeRole(_current: ColumnRole, proposed: ColumnRole, kind: RoleKind, cleanHeader: string): ColumnRole {
  if (proposed.kind === kind) return proposed;
  switch (kind) {
    case 'depth':
      return { kind: 'depth', positive: 'unknown' };
    case 'variable':
      return { kind: 'variable', variable: cleanHeader };
    case 'pressure':
      return { kind: 'pressure' };
    default:
      return { kind } as ColumnRole;
  }
}

export function roleUnit(role: ColumnRole): string | undefined {
  return role.kind === 'variable' || role.kind === 'depth' || role.kind === 'pressure' ? role.unit : undefined;
}

/** A unit typed by the user (trimmed). Empty removes it. Roles without a unit are returned unchanged. */
export function setUnit(role: ColumnRole, text: string): ColumnRole {
  const unit = text.trim();
  if (role.kind === 'variable') {
    const { unit: _u, unitSource: _s, ...rest } = role;
    return unit === '' ? rest : { ...rest, unit, unitSource: 'user' };
  }
  if (role.kind === 'depth') {
    const { unit: _u, ...rest } = role;
    return unit === '' ? rest : { ...rest, unit };
  }
  if (role.kind === 'pressure') {
    const { unit: _u, ...rest } = role;
    return unit === '' ? rest : { ...rest, unit };
  }
  return role;
}

export function setVariableName(role: ColumnRole, name: string): ColumnRole {
  return role.kind === 'variable' ? { ...role, variable: name } : role;
}

export function setPositive(role: ColumnRole, positive: 'down' | 'up' | 'unknown'): ColumnRole {
  return role.kind === 'depth' ? { ...role, positive } : role;
}

/** A copy of the mapping with the role of column `index` replaced. The other columns keep their identity. */
export function mappingWith(mapping: SheetMapping, index: number, role: ColumnRole): SheetMapping {
  return { ...mapping, columns: mapping.columns.map((c) => (c.index === index ? { ...c, role } : c)) };
}
