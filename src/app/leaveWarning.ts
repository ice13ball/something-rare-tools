// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { useEffect } from 'react';

/**
 * The browser's own "leave site?" prompt while `active` is true (files loaded, a report shown, a run in progress). The text is the
 * browser's: no page can set it. Nothing is persisted, so leaving really does lose the work, which is what the prompt says.
 * Downloads are blob links with a `download` attribute: they never navigate, so they never fire this event.
 */
export function useLeaveWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = ''; // legacy browsers need a value
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);
}
