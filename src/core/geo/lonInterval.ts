// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

/**
 * The smallest interval of longitudes that holds every point, as the bounding box of a metadata record states it. Plain minimum and maximum, unless the points lie on both sides of the
 * antimeridian and the arc that crosses it is the shorter one: then west > east (178, 179, -179, -178 -> west 178, east -178). ISO 19115 (EX_GeographicBoundingBox) and the EML,
 * GeoJSON (RFC 7946, 5.2) and DataCite (each bound in -180..180, no order stated) boxes all allow it. A spread that needs more than 180 degrees either way is global in practice and keeps the
 * plain minimum and maximum, so a worldwide dataset still gives -180..180 style bounds and never an odd 270-degree arc. `lons` are in -180..180; at least one.
 */
export function smallestLonInterval(lons: readonly number[]): { west: number; east: number } {
  const sorted = [...lons].sort((a, b) => a - b);
  const plain = { west: sorted[0], east: sorted[sorted.length - 1] };
  // the widest empty stretch between neighbours (going east) is where the box is cut; the plain box is cut at the antimeridian (gap: last -> first + 360)
  let gap = sorted[0] + 360 - sorted[sorted.length - 1];
  let cut = -1;
  for (let i = 1; i < sorted.length; i++) {
    const g = sorted[i] - sorted[i - 1];
    if (g > gap) {
      gap = g;
      cut = i;
    }
  }
  if (cut < 0) return plain;
  const width = 360 - gap;
  return width <= 180 ? { west: sorted[cut], east: sorted[cut - 1] } : plain;
}
