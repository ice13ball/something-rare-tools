// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The 404 page: the server chose a language from ?lang= or Accept-Language. When the address names no language, show the
// visitor's stored choice instead (localStorage 'lang', the same key the app uses). A static file because the CSP allows no inline script.
(function () {
  var LANGS = ['pl', 'en', 'de', 'fr'];
  try {
    if (/[?&]lang=(pl|en|de|fr)(&|#|$)/.test(location.search)) return;
    var stored = localStorage.getItem('lang');
    if (LANGS.indexOf(stored) < 0) return;
    var blocks = document.querySelectorAll('.nf');
    var shown = null;
    for (var i = 0; i < blocks.length; i++) {
      var on = blocks[i].getAttribute('lang') === stored;
      blocks[i].hidden = !on;
      if (on) shown = blocks[i];
    }
    if (!shown) return;
    document.documentElement.lang = stored;
    document.title = shown.getAttribute('data-title') || document.title;
  } catch (e) {
    /* storage blocked: the server's choice stays */
  }
})();
