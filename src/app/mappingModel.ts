// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Pure helpers behind the mapping table: changing the role of a column without ever inventing a unit.
import type { UiKey } from '../core/i18n/ui';
import { hemisphereTarget } from '../core/recognize/headerWords';
import { headerKey } from '../core/recognize/vocab';
import type { ColumnRole, ConverterRoleKind, SheetMapping } from '../core/types';
import { hemisphereLetter } from '../core/values/coords';

/** The kinds /check offers. The converter-only kinds (types.ts ConverterRole) are not among them: /check never proposes or lists them. */
export type RoleKind = Exclude<ColumnRole['kind'], ConverterRoleKind>;

/** Order of the role dropdown. */
export const ROLE_KINDS: readonly RoleKind[] = [
  'ignore',
  'latitude',
  'longitude',
  'hemisphere',
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
 * An entry of the role dropdown. /check offers the RoleKind list; /convert offers CONVERT_ROLE_CHOICES: the same kinds plus the converter roles, and
 * 'taxonHeader' for a wide sheet's species column (role taxon with header: true), which is a choice of its own so the user sees what it means.
 */
export type RoleChoice = RoleKind | ConverterRoleKind | 'taxonHeader';

/** Order of the role dropdown on /convert. */
export const CONVERT_ROLE_CHOICES: readonly RoleChoice[] = [
  'ignore',
  'sampleId',
  'station',
  'cruise',
  'date',
  'datetime',
  'time',
  'latitude',
  'longitude',
  'hemisphere',
  'depth',
  'depthBelowSeafloor',
  'pressure',
  'taxon',
  'taxonHeader',
  'quantity',
  'quantityType',
  'effort',
  'occurrenceId',
  'lifeStage',
  'qualifier',
  'taxonId',
  'variable',
];

export const roleChoiceLabelKey = (c: RoleChoice): UiKey => `role.${c}` as UiKey;

/** The dropdown entry that stands for a role. */
export const roleChoiceOf = (role: ColumnRole): RoleChoice => (role.kind === 'taxon' && role.header === true ? 'taxonHeader' : role.kind);

/** The role after the user picked `choice`. Every /check kind goes through changeRole, so its behaviour is the one it always had. */
export function roleFromChoice(current: ColumnRole, proposed: ColumnRole, choice: RoleChoice, cleanHeader: string, samples: readonly string[] = []): ColumnRole {
  if (choice === 'taxonHeader') return proposed.kind === 'taxon' && proposed.header === true ? proposed : { kind: 'taxon', header: true };
  if (choice === 'taxon') return proposed.kind === 'taxon' && proposed.header !== true ? proposed : { kind: 'taxon' };
  return changeRole(current, proposed, choice, cleanHeader, samples);
}

/** The axis a column of hemisphere letters signs: the header says it ('Lon Dir'), else the letters do (E / W is longitude, N / S latitude), else latitude (the user can switch it). */
export function hemisphereAxisOf(cleanHeader: string, samples: readonly string[]): 'latitude' | 'longitude' {
  const named = hemisphereTarget(headerKey(cleanHeader)).axis;
  if (named !== undefined) return named;
  const letters = samples.map((s) => hemisphereLetter(s));
  return letters.some((l) => l === 'E' || l === 'W') && !letters.some((l) => l === 'N' || l === 'S') ? 'longitude' : 'latitude';
}

/** The axis of a hemisphere role changed by the user; any other role is returned unchanged. */
export function setHemisphereAxis(role: ColumnRole, axis: 'latitude' | 'longitude'): ColumnRole {
  return role.kind === 'hemisphere' ? { kind: 'hemisphere', axis } : role;
}

/** Converter only: which end of a depth range a depth column is (undefined removes it). */
export function setBound(role: ColumnRole, bound: 'min' | 'max' | undefined): ColumnRole {
  if (role.kind !== 'depth') return role;
  const { bound: _b, ...rest } = role;
  return bound === undefined ? rest : { ...rest, bound };
}

/**
 * The role after the user picked `kind` in the dropdown. Going back to the kind the tool proposed restores the
 * proposal as it was (unit and all); any other kind starts bare: no unit, depth direction unknown.
 */
export function changeRole(_current: ColumnRole, proposed: ColumnRole, kind: RoleKind | ConverterRoleKind, cleanHeader: string, samples: readonly string[] = []): ColumnRole {
  if (proposed.kind === kind) return proposed;
  switch (kind) {
    case 'hemisphere':
      return { kind: 'hemisphere', axis: hemisphereAxisOf(cleanHeader, samples) };
    case 'depth':
      return { kind: 'depth', positive: 'unknown' };
    case 'variable':
      return { kind: 'variable', variable: cleanHeader };
    case 'pressure':
      return { kind: 'pressure' };
    case 'taxon':
      return { kind: 'taxon' };
    default:
      return { kind } as ColumnRole;
  }
}

export function roleUnit(role: ColumnRole): string | undefined {
  return role.kind === 'variable' || role.kind === 'depth' || role.kind === 'pressure' || role.kind === 'effort' || role.kind === 'depthBelowSeafloor' ? role.unit : undefined;
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
  if (role.kind === 'pressure' || role.kind === 'effort' || role.kind === 'depthBelowSeafloor') {
    const { unit: _u, ...rest } = role;
    return unit === '' ? rest : { ...rest, unit };
  }
  return role;
}

export function setVariableName(role: ColumnRole, name: string): ColumnRole {
  return role.kind === 'variable' ? { ...role, variable: name } : role;
}

export function setPositive(role: ColumnRole, positive: 'down' | 'up' | 'unknown'): ColumnRole {
  if (role.kind === 'depthBelowSeafloor') {
    // the depth below the seafloor counts down or up; "not stated" is the default (down)
    const { positive: _p, ...rest } = role;
    return positive === 'up' ? { ...rest, positive: 'up' } : rest;
  }
  return role.kind === 'depth' ? { ...role, positive } : role;
}

/** A copy of the mapping with the role of column `index` replaced. The other columns keep their identity. */
export function mappingWith(mapping: SheetMapping, index: number, role: ColumnRole): SheetMapping {
  return { ...mapping, columns: mapping.columns.map((c) => (c.index === index ? { ...c, role } : c)) };
}
