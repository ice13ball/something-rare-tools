// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useEffect, useRef, useState } from 'react';
import type { DatasetSummary, Engine, RowDetail } from '../../worker/protocol';
import { t, useLang } from '../i18n';
import { BASEMAP_STYLE, SEVERITIES_ORDER, SEVERITY_COLORS, popupContent, prepareMapData, type MapData, type PopupProps } from '../mapModel';

/** The few maplibre calls the preview uses, so a test can stand in for the library (WebGL does not exist in jsdom). */
export interface MapLike {
  on(type: string, layerOrListener: unknown, listener?: unknown): unknown;
  addSource(id: string, source: unknown): unknown;
  addLayer(layer: unknown): unknown;
  fitBounds(bounds: [[number, number], [number, number]], options?: unknown): unknown;
  getCanvas(): { style: { cursor: string } };
  remove(): void;
}
export interface PopupLike {
  setLngLat(lngLat: [number, number]): PopupLike;
  setDOMContent(node: Node): PopupLike;
  addTo(map: MapLike): PopupLike;
  remove(): unknown;
}
export interface MapLib {
  Map: new (options: Record<string, unknown>) => MapLike;
  Popup: new (options?: Record<string, unknown>) => PopupLike;
}

export interface MapPreviewProps {
  datasets: DatasetSummary[];
  engine: Pick<Engine, 'export' | 'row'>;
  /** Replaced in tests. The default loads maplibre-gl on demand. */
  loadLib?: () => Promise<MapLib>;
}

const defaultLoad = (): Promise<MapLib> => import('../maplibre') as unknown as Promise<MapLib>;

/** circle-color: the row's worst severity -> its colour. */
export const CIRCLE_COLOR = [
  'match',
  ['get', 'worstSeverity'],
  'error',
  SEVERITY_COLORS.error,
  'warning',
  SEVERITY_COLORS.warning,
  'info',
  SEVERITY_COLORS.info,
  SEVERITY_COLORS.none,
] as const;

type Status = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * Points from the worker's GeoJSON on a dark basemap, coloured by the worst finding on the row. A click opens a popup with the
 * file, line, station, date and the values of that row (fetched from the worker by file and line, built with textContent).
 * maplibre-gl is imported only when there is something to show.
 */
export function MapPreview({ datasets, engine, loadLib = defaultLoad }: MapPreviewProps): React.ReactElement {
  useLang();
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [skipped, setSkipped] = useState(0);
  const points = datasets.reduce((n, d) => n + d.pointCount, 0);
  const key = datasets.map((d) => d.id).join('|');

  useEffect(() => {
    if (points === 0) return;
    let cancelled = false;
    let map: MapLike | undefined;
    let popup: PopupLike | undefined;
    setStatus('loading');
    const fail = (): void => {
      if (!cancelled) setStatus('failed');
    };
    (async () => {
      const [text, lib] = await Promise.all([engine.export('geojson', key === '' ? [] : key.split('|')), loadLib()]);
      if (cancelled || !container.current) return;
      const data: MapData = prepareMapData(text);
      setSkipped(data.skipped);
      if (data.collection.features.length === 0 || !data.bounds) {
        setStatus('ready');
        return;
      }
      const m = new lib.Map({
        container: container.current,
        style: BASEMAP_STYLE,
        attributionControl: { compact: true },
        center: [(data.bounds.west + data.bounds.east) / 2, (data.bounds.south + data.bounds.north) / 2],
        zoom: 2,
      });
      map = m;
      let loaded = false;
      m.on('error', () => {
        if (!loaded) fail();
      });
      m.on('load', () => {
        loaded = true;
        m.addSource('rows', { type: 'geojson', data: data.collection });
        m.addLayer({
          id: 'rows',
          type: 'circle',
          source: 'rows',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3.5, 10, 7],
            'circle-color': CIRCLE_COLOR,
            'circle-opacity': 0.92,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
            'circle-stroke-opacity': 0.9,
          },
        });
        const b = data.bounds!;
        m.fitBounds(
          [
            [b.west, b.south],
            [b.east, b.north],
          ],
          { padding: 40, maxZoom: 9, duration: 0 },
        );
        setStatus('ready');
      });
      m.on('mouseenter', 'rows', () => {
        m.getCanvas().style.cursor = 'pointer';
      });
      m.on('mouseleave', 'rows', () => {
        m.getCanvas().style.cursor = '';
      });
      m.on('click', 'rows', (e: unknown) => {
        const ev = e as { features?: { properties?: Record<string, unknown>; geometry?: { coordinates?: number[] } }[] };
        const f = ev.features?.[0];
        if (!f?.properties || !f.geometry?.coordinates) return;
        const p = f.properties;
        const props: PopupProps = { file: String(p.file ?? ''), line: Number(p.line ?? 0) };
        if (p.station !== undefined) props.station = String(p.station);
        if (p.date !== undefined) props.date = String(p.date);
        const [lon, lat] = f.geometry.coordinates;
        popup?.remove();
        const pop = new lib.Popup({ maxWidth: '340px' }).setLngLat([lon, lat]).setDOMContent(popupContent(document, props, null, (k) => t(k as never))).addTo(m);
        popup = pop;
        engine.row(props.file, props.line).then(
          (detail: RowDetail | null) => {
            if (popup === pop) pop.setDOMContent(popupContent(document, props, detail, (k) => t(k as never)));
          },
          () => undefined,
        );
      });
    })().catch(fail);
    return () => {
      cancelled = true;
      popup?.remove();
      try {
        map?.remove();
      } catch {
        /* the map was never fully created */
      }
    };
  }, [engine, key, points, loadLib]);

  return (
    <section className="map-preview" aria-labelledby="map-title">
      <h2 id="map-title">{t('map.title')}</h2>
      {points === 0 ? (
        <p className="muted">{t('map.empty')}</p>
      ) : (
        <>
          <p className="muted">{t('map.intro')}</p>
          {status === 'loading' && <p className="muted">{t('map.loading')}</p>}
          {status === 'failed' && (
            <p className="notice" role="status">
              {t('map.failed')}
            </p>
          )}
          {skipped > 0 && <p className="muted">{t('map.skipped', { count: skipped })}</p>}
          <div ref={container} className="map-canvas" role="img" aria-label={t('map.title')} hidden={status === 'failed'} />
          <ul className="map-legend" aria-label={t('map.legend')}>
            {SEVERITIES_ORDER.map((s) => (
              <li key={s}>
                <span className="swatch" style={{ background: SEVERITY_COLORS[s] }} aria-hidden="true" />
                {t(`map.legend.${s}` as never)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
