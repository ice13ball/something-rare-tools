// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

/*
 * Constants of the checks that the page also shows (the ⓘ explanations, src/app/tips.tsx). They live here, free of imports, so the page
 * can read them without pulling the whole check engine into its bundle; the checks import them from here (speed.ts re-exports).
 */

/**
 * Minimum separation, km: two consecutive events closer than this are one place (parallel casts, a mothership and its boats,
 * two casts on one station, the same station written in two files with slightly different positions), not a hop to be timed.
 * A stated choice, not a published threshold (docs/research/qc-sources.md): 10 km is the tool's own "same station" size
 * (ROW-STATION-SPREAD uses the same number, far above a ship's drift during a cast), so the two rules agree on what one
 * place is. IOOS QARTOD's 20 km is a displacement limit (RANGEMAX), not a separation, and a larger value would hide pairs
 * with short gaps (below about 16 minutes at 40 knots) for no gain on the pairs that matter. Rounding of the written
 * coordinates is NOT absorbed here but deducted from each distance (see allowance).
 */
export const SHIP_SPEED_MIN_SEPARATION_KM = 10;
