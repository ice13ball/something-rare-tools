// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { createRoot } from 'react-dom/client';
import { initConsent } from '../analytics';
import { initLang } from '../i18n';
import { ConvertPage } from '../pages/ConvertPage';
import '../styles.css';

initLang();
initConsent();
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvertPage />
  </React.StrictMode>,
);
