// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The only module that imports maplibre-gl (and its stylesheet). Everything else reaches it through a dynamic import(),
// so the index and privacy pages, and the check page until a map is shown, never load it.
import 'maplibre-gl/dist/maplibre-gl.css';
import { Map, Popup, setWorkerUrl } from 'maplibre-gl';
// maplibre 6 looks for its worker next to its own chunk, where the bundler does not put it: build it as an asset
// and tell maplibre where it is (served from /assets, allowed by worker-src 'self').
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);

export { Map, Popup };
