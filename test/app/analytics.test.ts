// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { denyConsent, getStoredConsent, grantConsent, track } from '../../src/app/analytics';

const win = window as unknown as { dataLayer: unknown[]; gtag?: unknown };
const entries = (): unknown[][] => win.dataLayer.map((e) => Array.from(e as ArrayLike<unknown>));

beforeEach(() => {
  localStorage.clear();
  win.dataLayer = [];
  delete win.gtag;
  document.head.querySelectorAll('script').forEach((s) => s.remove());
});

describe('track', () => {
  it('pushes nothing without a stored decision', () => {
    track('check_started', { input_type: 'file', mode: 'browser' });
    expect(win.dataLayer).toEqual([]);
  });

  it('pushes nothing when consent is denied', () => {
    denyConsent();
    win.dataLayer = [];
    track('check_finished', { input_type: 'file', mode: 'browser', n_errors: 1, n_warnings: 2, n_info: 3 });
    expect(win.dataLayer).toEqual([]);
    expect(getStoredConsent()).toBe('denied');
  });

  it('pushes exactly the five allowed parameters when consent is granted', () => {
    grantConsent();
    win.dataLayer = [];
    track('check_finished', { input_type: 'zenodo', mode: 'server', n_errors: 1, n_warnings: 2, n_info: 3 });
    expect(entries()).toEqual([['event', 'check_finished', { input_type: 'zenodo', mode: 'server', n_errors: 1, n_warnings: 2, n_info: 3 }]]);
  });

  it('drops anything outside the enums or numbers, even if a caller forces it past the types', () => {
    grantConsent();
    win.dataLayer = [];
    track('check_started', { input_type: 'my-secret-file.csv', mode: 'browser', n_errors: 'x', extra: 'leak' } as never);
    const [e] = entries();
    expect(JSON.stringify(e)).not.toMatch(/secret|leak/);
    expect(Object.keys(e[2] as object).sort()).toEqual(['mode']);
  });
});

describe('consent', () => {
  it('grant: stores the decision, updates consent first, loads gtag.js once, then configures with an explicit page_location', () => {
    grantConsent();
    grantConsent();
    expect(localStorage.getItem('consent')).toBe('granted');
    const e = entries();
    const update = e.findIndex((x) => x[0] === 'consent' && x[1] === 'update');
    const config = e.findIndex((x) => x[0] === 'config');
    expect(update).toBeGreaterThanOrEqual(0);
    expect(config).toBeGreaterThan(update);
    expect(e[update][2]).toEqual({ analytics_storage: 'granted' });
    expect(e[config][1]).toBe('G-S5HR4WT0ZG');
    expect(e[config][2]).toEqual({ page_location: location.origin + location.pathname, send_page_view: true });
    const scripts = [...document.head.querySelectorAll('script')].map((s) => s.src);
    expect(scripts).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-S5HR4WT0ZG']);
  });

  it('deny: stores the decision, updates consent to denied, loads nothing', () => {
    denyConsent();
    expect(localStorage.getItem('consent')).toBe('denied');
    expect(entries().some((x) => x[0] === 'consent' && (x[2] as { analytics_storage: string }).analytics_storage === 'denied')).toBe(true);
    expect(document.head.querySelectorAll('script').length).toBe(0);
  });
});
