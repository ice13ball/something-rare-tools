// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://tools.something-rare.com/check"}
// On the production host the cookie is shared with the atlas: Domain=something-rare.com and Secure.
import { describe, expect, it, vi } from 'vitest';
import { denyConsent, getStoredConsent, grantConsent } from '../../src/app/analytics';

describe('the cookie on tools.something-rare.com', () => {
  it('is set for the whole domain, Secure, SameSite=Lax, 180 days', () => {
    const set = vi.spyOn(document, 'cookie', 'set');
    grantConsent();
    expect(String(set.mock.calls[0]![0])).toBe('ac_consent=granted; Path=/; Max-Age=15552000; SameSite=Lax; Secure; Domain=something-rare.com');
    expect(getStoredConsent()).toBe('granted');
  });

  it('Decline expires the Google cookies on the host and on every parent domain suffix', () => {
    document.cookie = '_ga=GA1.1.1; Path=/';
    const set = vi.spyOn(document, 'cookie', 'set');
    denyConsent();
    const lines = set.mock.calls.map((c) => String(c[0]));
    expect(lines).toContain('_ga=; Path=/; Max-Age=0');
    expect(lines).toContain('_ga=; Path=/; Max-Age=0; Domain=tools.something-rare.com');
    expect(lines).toContain('_ga=; Path=/; Max-Age=0; Domain=something-rare.com');
  });
});
