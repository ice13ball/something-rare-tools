// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { InputType } from './analytics';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Coarse kind of a link/DOI/id, used ONLY to pick an analytics enum value (the text itself is never sent).
 * A link that matches nothing known is counted as 'doi' (the closest enum value; the resolver later knows better).
 */
function linkType(link: string): InputType {
  const s = link.trim().toLowerCase();
  if (/zenodo/.test(s)) return 'zenodo';
  if (/pangaea/.test(s)) return 'pangaea';
  if (/geonetwork|\/srv\/|\/geo\./.test(s) || UUID.test(s)) return 'geonetwork';
  return 'doi';
}

export function classifyInput(fileCount: number, link: string | undefined): InputType {
  const hasLink = !!link && link.trim() !== '';
  if (fileCount > 0 && hasLink) return 'mixed';
  if (hasLink) return linkType(link as string);
  return 'file';
}
