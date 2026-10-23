# SPDX-License-Identifier: AGPL-3.0-or-later
# Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
"""
Builds src/core/geo/land-mask.bin, the land/sea grid that ROW-ON-LAND reads in the browser.

Source: Natural Earth 1:10m physical vectors (land, minor islands, lakes), public domain
(https://www.naturalearthdata.com/about/terms-of-use/), pinned to release NE_TAG below.

Requires Python 3 with numpy, scipy, shapely and Pillow (none of them is a dependency of the app):
    python3 scripts/land-mask.py [--cache DIR]

Method
- Land (land + minor islands) and lakes are rasterised at 0.01 degree. A lake is "not sea": a marine record in an inland
  lake is as misplaced as one on land, so both are measured by their distance FROM THE SEA. (The Caspian is a hole in
  Natural Earth's land, i.e. sea.)
- For every land-or-lake pixel the distance to the nearest sea pixel, and for every sea pixel the distance to the nearest
  land-or-lake pixel, is computed in km with a Euclidean distance transform per latitude band. The east-west pixel size
  of a band is taken at the band's highest latitude (the smallest pixel), so distances are never overstated.
- Cells near rivers and canals (Natural Earth river lines, three sea canals) and over sea-connected lakes and listed lagoons
  make no claim when they are less than RIVER_REACH_KM from the sea: Natural Earth draws them as land, and estuarine and river
  samples are taken there. Further inland a river corridor is land like any other.
- The output grid is 0.05 degree (5 x 5 pixels). A cell is LAND with a guaranteed distance when all 25 pixels are land:
  the smallest pixel distance minus one pixel diagonal (rasterisation and pixel-centre error), bucketed DOWN. A cell is
  SEA when all 25 pixels are sea at least BUFFER_KM from land by the same rule. Everything else is 0 = no claim.
  ROW-ON-LAND therefore only speaks about positions at least BUFFER_KM inside the land, and never about the coast.

Output format (little-endian, then gzip):
    magic 'ACLM' | u8 version=1 | u16 width | u16 height | u8 cellCentiDegrees | u8 bucketCount | u16 bucketKm[bucketCount]
    then for each row from 90N southwards: RLE pairs (u8 value, varint runLength) covering exactly `width` cells
Values: 0 = no claim (coast, uncertain), 1 = sea at least BUFFER_KM from land or a lake, 2 + i = land or an inland lake at least bucketKm[i] km from the sea.
"""
import argparse
import gzip
import hashlib
import json
import math
import os
import struct
import urllib.request

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt

NE_TAG = 'v5.1.2'
NE_BASE = f'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{NE_TAG}/geojson/'
LAYERS = {'land': 'ne_10m_land.geojson', 'islands': 'ne_10m_minor_islands.geojson', 'lakes': 'ne_10m_lakes.geojson'}
RIVER_LAYERS = ['ne_10m_rivers_lake_centerlines.geojson', 'ne_10m_rivers_europe.geojson', 'ne_10m_rivers_north_america.geojson']
# Natural Earth draws rivers, estuaries above their mouth, river ports and canals as land, and marine and estuarine samples are
# taken there (CoastDOM v1: the Thames at Tower Bridge, the Delaware at Trenton, the Guadalquivir at Seville). Cells within
# RIVER_HALF_WIDTH_PX of a river or canal line make no claim. Lake centerlines are NOT rivers: a lake far from the sea stays land.
RIVER_CLASSES = {'River', 'Canal'}  # perennial only: a desert wadi carries no estuarine samples
RIVER_HALF_WIDTH_PX = 7  # about 7.7 km north-south (less east-west towards the poles)
RIVER_REACH_KM = 200  # corridors make no claim only this close to the sea (every CoastDOM river sample lies within 100 km)
# Sea-connected waters Natural Earth draws as land or as a lake: no claim either way (lon, lat polylines / names).
SEA_CORRIDORS = {
    'Suez Canal': [(32.302, 31.265), (32.31, 30.9), (32.28, 30.58), (32.38, 30.35), (32.47, 30.15), (32.56, 29.95)],
    'Panama Canal': [(-79.92, 9.36), (-79.9, 9.2), (-79.75, 9.1), (-79.6, 9.02), (-79.57, 8.95)],
    'Kiel Canal': [(9.14, 53.895), (9.4, 54.05), (9.67, 54.3), (9.95, 54.33), (10.14, 54.37)],
}
SEA_CONNECTED_LAKES = {'Great Bitter Lake', 'Little Bitter Lake', 'Lago Gatun'}
NO_CLAIM_BOXES = {'Syvash lagoons (Sea of Azov)': (33.9, 45.4, 35.2, 46.25)}  # west, south, east, north

FINE = 100  # pixels per degree (0.01 degree)
COARSE = 5  # fine pixels per output cell (0.05 degree)
BUFFER_KM = 5.0
BUCKETS_KM = [5, 10, 20, 50, 100, 200]  # land distance classes; > 200 km is "at least 200"
MAX_KM = 210.0  # distances beyond this are not needed (largest bucket + margin)
KM_PER_DEG_LAT = 110.574  # WGS84 meridian degree, the smallest value (at the equator)
KM_PER_DEG_LON_EQ = 111.320
BAND_ROWS = 200  # 2 degrees per band

W = 360 * FINE
H = 180 * FINE
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'core', 'geo', 'land-mask.bin')


def fetch(cache: str, name: str) -> dict:
    path = os.path.join(cache, f'{NE_TAG}-{name}')
    if not os.path.exists(path):
        urllib.request.urlretrieve(NE_BASE + name, path)
    with open(path, 'rb') as f:
        data = f.read()
    print(f'{name}: {len(data)} bytes, sha256 {hashlib.sha256(data).hexdigest()}')
    return json.loads(data)


def rings(geom: dict):
    if geom['type'] == 'Polygon':
        yield geom['coordinates']
    elif geom['type'] == 'MultiPolygon':
        yield from geom['coordinates']


def rasterise(features: list) -> np.ndarray:
    img = Image.new('1', (W, H), 0)
    draw = ImageDraw.Draw(img)
    to_px = lambda c: ((c[0] + 180.0) * FINE, (90.0 - c[1]) * FINE)
    for f in features:
        for poly in rings(f['geometry']):
            draw.polygon([to_px(c) for c in poly[0]], fill=1)
            for hole in poly[1:]:
                draw.polygon([to_px(c) for c in hole], fill=0)
    return np.array(img, dtype=bool)


def corridors(cache: str) -> np.ndarray:
    """Pixels near rivers, canals, sea corridors and listed lagoons: where the grid will make no claim."""
    img = Image.new('1', (W, H), 0)
    draw = ImageDraw.Draw(img)
    to_px = lambda c: ((c[0] + 180.0) * FINE, (90.0 - c[1]) * FINE)
    width = 2 * RIVER_HALF_WIDTH_PX + 1
    def line(coords):
        pts = [to_px(c) for c in coords]
        if len(pts) >= 2:
            draw.line(pts, fill=1, width=width, joint='curve')
        for x, y in pts:
            draw.ellipse((x - RIVER_HALF_WIDTH_PX, y - RIVER_HALF_WIDTH_PX, x + RIVER_HALF_WIDTH_PX, y + RIVER_HALF_WIDTH_PX), fill=1)
    for name in RIVER_LAYERS:
        for f in fetch(cache, name)['features']:
            if f['properties'].get('featurecla') not in RIVER_CLASSES:
                continue
            g = f['geometry']
            for part in ([g['coordinates']] if g['type'] == 'LineString' else g['coordinates']):
                line(part)
    for coords in SEA_CORRIDORS.values():
        line(coords)
    for w, s_, e, n in NO_CLAIM_BOXES.values():
        draw.rectangle([to_px((w, n)), to_px((e, s_))], fill=1)
    return np.array(img, dtype=bool)


def coarse_distances(target: np.ndarray) -> np.ndarray:
    """Per 0.05-degree cell, the smallest km from a True pixel of `target` to the nearest False pixel (0 when the cell has a
    False pixel), capped at MAX_KM. Computed band by band so the full-resolution distance grid is never held."""
    out = np.zeros((H // COARSE, W // COARSE), dtype=np.float32)
    dy = KM_PER_DEG_LAT / FINE
    margin = int(math.ceil(MAX_KM / dy)) + 1
    for top in range(0, H, BAND_ROWS):
        bottom = min(H, top + BAND_ROWS)
        r0, r1 = max(0, top - margin), min(H, bottom + margin)
        # smallest east-west pixel in the band including its margin (pixel edge nearest a pole)
        lat_max = max(abs(90.0 - r0 / FINE), abs(90.0 - r1 / FINE))
        dx = max(KM_PER_DEG_LON_EQ * math.cos(math.radians(min(lat_max, 89.99))) / FINE, 1e-3)
        pad = min(W, int(math.ceil(MAX_KM / dx)) + 1)
        band = target[r0:r1]
        wrapped = np.concatenate([band[:, W - pad:], band, band[:, :pad]], axis=1)
        if wrapped.all():
            d = np.full((bottom - top, W), MAX_KM, dtype=np.float32)
        else:
            d = distance_transform_edt(wrapped, sampling=(dy, dx)).astype(np.float32)[top - r0: bottom - r0, pad: pad + W]
        d = np.minimum(d, MAX_KM)
        out[top // COARSE: bottom // COARSE] = d.reshape((bottom - top) // COARSE, COARSE, W // COARSE, COARSE).min(axis=(1, 3))
    return out


def coarse_any(a: np.ndarray) -> np.ndarray:
    return a.reshape(H // COARSE, COARSE, W // COARSE, COARSE).any(axis=(1, 3))


def coarse_all(a: np.ndarray) -> np.ndarray:
    return a.reshape(H // COARSE, COARSE, W // COARSE, COARSE).all(axis=(1, 3))


def varint(n: int) -> bytes:
    b = bytearray()
    while True:
        x = n & 0x7F
        n >>= 7
        b.append(x | (0x80 if n else 0))
        if not n:
            return bytes(b)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.path.join(os.path.expanduser('~'), '.cache', 'abyssal-land-mask'))
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)

    land = rasterise(fetch(args.cache, LAYERS['land'])['features'] + fetch(args.cache, LAYERS['islands'])['features'])
    lake_features = fetch(args.cache, LAYERS['lakes'])['features']
    lakes = rasterise([f for f in lake_features if f['properties'].get('name') not in SEA_CONNECTED_LAKES])
    connected = rasterise([f for f in lake_features if f['properties'].get('name') in SEA_CONNECTED_LAKES])
    not_sea = (land | lakes) & ~connected
    no_claim = corridors(args.cache) | connected
    del land, lakes, connected
    print('rasterised; not-sea pixels', int(not_sea.sum()))

    diag = math.hypot(KM_PER_DEG_LAT / FINE, KM_PER_DEG_LON_EQ / FINE)  # largest pixel diagonal, km
    land_km = coarse_distances(not_sea) - diag
    sea_km = coarse_distances(~not_sea) - diag
    # a river corridor only matters within reach of the sea: beyond RIVER_REACH_KM a gross error must still be found
    all_land = coarse_all(not_sea) & ~(coarse_any(no_claim) & (land_km < RIVER_REACH_KM))
    all_sea = coarse_all(~not_sea) & ~coarse_any(no_claim)
    del not_sea, no_claim

    h, w = all_land.shape
    grid = np.zeros((h, w), dtype=np.uint8)
    grid[all_sea & (sea_km >= BUFFER_KM)] = 1
    for i, km in enumerate(BUCKETS_KM):
        grid[all_land & (land_km >= km)] = 2 + i

    body = bytearray()
    for row in grid:
        change = np.flatnonzero(np.diff(row)) + 1
        starts = np.concatenate([[0], change])
        ends = np.concatenate([change, [w]])
        for s, e in zip(starts, ends):
            body.append(int(row[s]))
            body += varint(int(e - s))
    header = b'ACLM' + struct.pack('<BHHBB', 1, w, h, 100 // (FINE // COARSE), len(BUCKETS_KM)) + struct.pack(f'<{len(BUCKETS_KM)}H', *BUCKETS_KM)
    data = gzip.compress(header + bytes(body), compresslevel=9, mtime=0)
    with open(OUT, 'wb') as f:
        f.write(data)
    counts = {int(v): int(n) for v, n in zip(*np.unique(grid, return_counts=True))}
    print(f'wrote {os.path.normpath(OUT)}: {len(data)} bytes gzip, {len(header) + len(body)} raw; cells by value {counts}')


if __name__ == '__main__':
    main()
