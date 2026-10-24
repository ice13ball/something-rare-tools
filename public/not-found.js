// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The 404 page: the server chose a language from ?lang= or Accept-Language. This file does what the app pages do on arrival:
// ?lang= (pl|en|de|fr, any case) is stored under 'lang' and removed from the address (other parameters and the hash stay).
// With no ?lang=, the visitor's stored choice (localStorage 'lang') is shown instead. A static file because the CSP allows no inline script.
(function () {
  var LANGS = ['pl', 'en', 'de', 'fr'];
  function show(lang) {
    var blocks = document.querySelectorAll('.nf');
    var shown = null;
    for (var i = 0; i < blocks.length; i++) {
      var on = blocks[i].getAttribute('lang') === lang;
      blocks[i].hidden = !on;
      if (on) shown = blocks[i];
    }
    if (!shown) return;
    document.documentElement.lang = lang;
    document.title = shown.getAttribute('data-title') || document.title;
  }
  try {
    var parts = location.search.replace(/^\?/, '').split('&');
    var arrived = null;
    var keep = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '') continue;
      if (parts[i].split('=')[0] === 'lang') {
        var v = decodeURIComponent((parts[i].split('=')[1] || '').replace(/\+/g, ' ')).toLowerCase();
        if (LANGS.indexOf(v) >= 0) {
          arrived = v; // the last valid one wins; an unknown value is ignored and left in place
          continue;
        }
      }
      keep.push(parts[i]);
    }
    if (arrived) {
      try {
        localStorage.setItem('lang', arrived);
      } catch (e) {
        /* storage blocked: shown for this page only */
      }
      try {
        history.replaceState(history.state, '', location.pathname + (keep.length ? '?' + keep.join('&') : '') + location.hash);
      } catch (e) {
        /* the address stays */
      }
      show(arrived);
      return;
    }
    var stored = localStorage.getItem('lang');
    if (LANGS.indexOf(stored) >= 0) show(stored);
  } catch (e) {
    /* the server's choice stays */
  }
})();
