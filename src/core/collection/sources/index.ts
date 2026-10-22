// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The four sources behind one door: estimate (a request or two), prepare (what a run needs once: totals, the Zenodo slices), and the pager.
import { catalogueById } from '../../../../config/catalogues';
import { SourceFailure, type Estimate, type Pager, type RunSettings, type SourceSpec } from '../types';
import { dataciteListPager, dataciteSamplePager, dataciteTotal, estimateDatacite, validateSourceId, type Deps } from './datacite';
import { doiListPager, estimateDois } from './dois';
import { cswMatched, cswPager, cswSamplePager, estimateCsw, type CswPlan } from './csw';
import { estimateZenodo, planSlices, validateSlug, zenodoPager, zenodoSamplePager, zenodoTotal, ZENODO_WINDOW, type ZenodoPlan } from './zenodo';

export interface Prepared {
  pager: Pager<unknown>;
  /** Saved with the run; resuming does not repeat the requests that made it. */
  plan: unknown;
  estimate: Estimate;
  notices: { code: string; params?: Record<string, string | number> }[];
}

function checkSpec(spec: SourceSpec, sample: boolean): void {
  if (spec.kind === 'dois' && sample) throw new SourceFailure('protocol', 'no-sample-for-list');
  if (spec.kind === 'csw') {
    const cat = catalogueById(spec.catalogue);
    if (!cat) throw new SourceFailure('protocol', 'unknown-catalogue');
    if (!cat.schemas.includes(spec.schema)) throw new SourceFailure('protocol', 'bad-schema');
  }
}

/** Totals only: one or two requests (none for a pasted list). */
export async function estimateSource(deps: Deps, spec: SourceSpec, sample: boolean): Promise<Estimate> {
  checkSpec(spec, sample);
  switch (spec.kind) {
    case 'dois':
      return estimateDois(spec.text);
    case 'datacite':
      return estimateDatacite(await dataciteTotal(deps, spec.by, spec.id), sample);
    case 'zenodo':
      return estimateZenodo(await zenodoTotal(deps, spec.community), sample);
    case 'csw':
      return estimateCsw(await cswMatched(deps, spec), sample, spec.crossSource);
  }
}

/** The start of a run: asks what the source holds (and, for a Zenodo community above the window, builds the date slices). */
export async function prepareSource(deps: Deps, settings: RunSettings, thisYear: number): Promise<Prepared> {
  const { spec, sample } = settings;
  checkSpec(spec, sample);
  switch (spec.kind) {
    case 'dois':
      return { pager: doiListPager(deps, spec.text) as Pager<unknown>, plan: null, estimate: estimateDois(spec.text), notices: [] };
    case 'datacite': {
      validateSourceId(spec.by, spec.id);
      const total = await dataciteTotal(deps, spec.by, spec.id);
      const pager = sample ? dataciteSamplePager(deps, spec.by, spec.id, total) : dataciteListPager(deps, spec.by, spec.id, total);
      return { pager: pager as Pager<unknown>, plan: { total }, estimate: estimateDatacite(total, sample), notices: total === 0 ? [{ code: 'no-records' }] : [] };
    }
    case 'zenodo': {
      validateSlug(spec.community);
      const total = await zenodoTotal(deps, spec.community);
      if (sample) return { pager: zenodoSamplePager(deps, spec.community, total) as Pager<unknown>, plan: { total }, estimate: estimateZenodo(total, true), notices: total === 0 ? [{ code: 'no-records' }] : [] };
      const notices: Prepared['notices'] = total === 0 ? [{ code: 'no-records' }] : [];
      let plan: ZenodoPlan;
      if (total <= ZENODO_WINDOW) plan = { slug: spec.community, total, slices: total > 0 ? [{ total }] : [], sum: total };
      else {
        const { slices, sum } = await planSlices(deps, spec.community, total, thisYear);
        plan = { slug: spec.community, total, slices, sum };
        notices.push({ code: 'split-by-date', params: { slices: slices.length } });
        if (sum !== total) notices.push({ code: 'slices-differ', params: { sum, total } });
      }
      const estimate = { ...estimateZenodo(total, false), slices: Math.max(1, plan.slices.length) };
      return { pager: zenodoPager(deps, plan) as Pager<unknown>, plan, estimate, notices };
    }
    case 'csw': {
      const matched = await cswMatched(deps, spec);
      const plan: CswPlan = { matched };
      const pager = sample ? cswSamplePager(deps, spec, plan) : cswPager(deps, spec, plan);
      return { pager: pager as Pager<unknown>, plan, estimate: estimateCsw(matched, sample, spec.crossSource), notices: matched === 0 ? [{ code: 'no-records' }] : [] };
    }
  }
}

/** A saved run goes on with its saved plan: no request is repeated. */
export function restorePager(deps: Deps, settings: RunSettings, plan: unknown): Pager<unknown> {
  const { spec, sample } = settings;
  switch (spec.kind) {
    case 'dois':
      return doiListPager(deps, spec.text) as Pager<unknown>;
    case 'datacite': {
      const { total } = plan as { total: number };
      return (sample ? dataciteSamplePager(deps, spec.by, spec.id, total) : dataciteListPager(deps, spec.by, spec.id, total)) as Pager<unknown>;
    }
    case 'zenodo':
      return (sample ? zenodoSamplePager(deps, spec.community, (plan as { total: number }).total) : zenodoPager(deps, plan as ZenodoPlan)) as Pager<unknown>;
    case 'csw':
      return (sample ? cswSamplePager(deps, spec, plan as CswPlan) : cswPager(deps, spec, plan as CswPlan)) as Pager<unknown>;
  }
}
