// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageSwitcher } from '../../src/app/components/LanguageSwitcher';
import { detectLang, initLang, t, useLang } from '../../src/app/i18n';

function Probe() {
  const { lang } = useLang();
  return <p data-testid="p">{lang + ':' + t('nav.check')}</p>;
}

describe('language detection', () => {
  it('falls back to en for an unsupported language', () => {
    expect(detectLang(null, ['es-ES'])).toBe('en');
    expect(detectLang(null, [])).toBe('en');
  });
  it('takes the stored language first, then the first supported browser language', () => {
    expect(detectLang('fr', ['de-DE'])).toBe('fr');
    expect(detectLang('xx', ['es-ES', 'pl-PL', 'de'])).toBe('pl');
    expect(detectLang(null, ['de-AT'])).toBe('de');
  });
});

describe('language state', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-ES']);
    initLang();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('starts in en for es-ES and sets <html lang>', () => {
    render(<Probe />);
    expect(screen.getByTestId('p').textContent).toBe('en:Data check');
    expect(document.documentElement.lang).toBe('en');
  });

  it('the switcher stores the choice, updates <html lang> and re-renders, without touching the URL', () => {
    const push = vi.spyOn(history, 'pushState');
    const replace = vi.spyOn(history, 'replaceState');
    const before = location.href;
    render(
      <>
        <LanguageSwitcher />
        <Probe />
      </>,
    );
    act(() => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'pl' } });
    });
    expect(localStorage.getItem('lang')).toBe('pl');
    expect(document.documentElement.lang).toBe('pl');
    expect(screen.getByTestId('p').textContent).toBe('pl:Sprawdzanie danych');
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(location.href).toBe(before);
  });
});
