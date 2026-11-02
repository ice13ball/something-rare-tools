// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { headerKey } from './vocab';

/*
 * PANGAEA's vertical (z) geocodes, and what each one is.
 *
 * Source: PANGAEA Wiki, "Geocode" (wiki.pangaea.de/wiki/Geocode, page version oldid=17007, last edited 2026-06-11; read 2026-11-02), section "Third spatial dimension (Depth/Height) (z)":
 * "There are several options for specifying the third spatial dimension (Depth/Height) (z). These Geocodes also specify the sample milieu: lithosphere, hydrosphere, cryosphere, atmosphere,
 * biosphere". The names and their definitions, as published:
 *   DEPTH, sediment/rock [m]      "geological, geochemistry, biogeochemisty, paleontological, geophysical measurements and samples. Describing the specific sampling depth in the sediment core"
 *   DEPTH, sediment, experiment   "georeferenced experiments in sediment environments, i.e., lander experiments"
 *   DEPTH, soil [m]               "pedological studies. Describing the specific sampling depth in a pedologic profile or core"
 *   DEPTH, water [m]              "all studies in water columns, e.g., CTD profiles, moorings, biological sampling, hydrochemistry, etc. This GEOCODE describes the water depth in which the measurement or sample was collected"
 *   DEPTH, water, experiment [m]  "georeferenced experiments in the water column, e.g., mesocosm data"
 *   DEPTH, ice/snow [m]           "sampling and measurements in shelf- and sea-ice"
 *   ELEVATION [m a.s.l.]          "Height/bottom depth relative to sea level. Positive above mean sea level, negative below mean sea level ... Below sea level, ELEVATION is identical to negative bottom depth/bathymetric depth"
 *   ALTITUDE [m]                  "measurements in height above sea level, i.e. in the air"
 *   HEIGHT above ground [m]       "meter above ground (not above sea level) ... both on land and above the ocean floor"
 * and, as "relative" geocodes that "do not give an absolute position on Earth": DISTANCE [cm], POINT DISTANCE from start [m], SECTION, height [m], ORDINAL NUMBER. All z geocodes are in metres.
 * The page does not list `Depth, top/min` and `Depth, bottom/max` (they are ordinary PANGAEA parameters, the two ends of a sampled layer): those keep their own handling (a range).
 *
 * The short name is the abbreviation PANGAEA prints in the column header of a table; a file's own parameter list pairs the two ("DEPTH, sediment/rock [m] (Depth sed) * GEOCODE",
 * "DEPTH, water [m] (Depth water) * GEOCODE", "ELEVATION [m a.s.l.] (Elevation) * GEOCODE": seen in the golden files). The short names of the others follow the same pattern and are matched as
 * the pattern gives them; a name that is not in this table is not guessed.
 *
 * What it is used for: only a WATER depth is the depth of a sample in the water (minimumDepthInMeters). A depth in a sediment core is a distance below the seafloor
 * (the role depthBelowSeafloor, a negative distance), a depth in soil or ice/snow is not a water depth at all, and writing any of them as minimumDepthInMeters is a wrong position of the sample
 * with no sign of it. Elevation and altitude keep the sign logic of the proposer (positive up).
 */

export type GeocodeEffect =
  /** The depth of the sample in the water: the plain depth. */
  | 'water-depth'
  /** A depth in a sediment core (or rock): a distance below the seafloor. */
  | 'sediment-depth'
  /** A depth in soil or in ice / snow: not a water depth, kept as a measured variable of the sample. */
  | 'not-water-depth'
  /** Height relative to sea level, positive up: the proposer's elevation reading. */
  | 'elevation'
  /** Not a depth the tool uses (a height above ground, a relative distance, an ordinal number). */
  | 'other';

export interface Geocode {
  /** The geocode's name as published. */
  name: string;
  /** The abbreviation of the table header, where PANGAEA prints one that the files confirm or the pattern gives. */
  short?: string;
  effect: GeocodeEffect;
}

export const PANGAEA_GEOCODES: readonly Geocode[] = [
  { name: 'DEPTH, sediment/rock', short: 'Depth sed', effect: 'sediment-depth' },
  { name: 'DEPTH, sediment, experiment', effect: 'sediment-depth' },
  { name: 'DEPTH, soil', short: 'Depth soil', effect: 'not-water-depth' },
  { name: 'DEPTH, water', short: 'Depth water', effect: 'water-depth' },
  { name: 'DEPTH, water, experiment', effect: 'water-depth' },
  { name: 'DEPTH, ice/snow', short: 'Depth ice/snow', effect: 'not-water-depth' },
  { name: 'ELEVATION', short: 'Elevation', effect: 'elevation' },
  { name: 'ALTITUDE', short: 'Altitude', effect: 'elevation' },
  { name: 'HEIGHT above ground', effect: 'other' },
  { name: 'DISTANCE', effect: 'other' },
  { name: 'POINT DISTANCE from start', effect: 'other' },
  { name: 'SECTION, height', effect: 'other' },
  { name: 'ORDINAL NUMBER', effect: 'other' },
];

const BY_KEY = new Map<string, Geocode>();
for (const g of PANGAEA_GEOCODES) {
  BY_KEY.set(headerKey(g.name), g);
  if (g.short !== undefined) BY_KEY.set(headerKey(g.short), g);
}

/** The geocode a header names (the header without its unit, through headerKey), or undefined. Exact names only: "Depth sed" is one, "Depth of sedimentation" is not. */
export function geocodeOfKey(key: string): Geocode | undefined {
  return BY_KEY.get(key);
}
