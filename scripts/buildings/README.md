# Kampala buildings with real heights

Makes `apps/web/public/data/kampala-buildings-v1.json`: every OpenStreetMap
building in the play areas (central Kampala, and Lugogo for Kyadondo) with a
height from **Google Open Buildings 2.5D Temporal** (2023, 4 m effective
resolution), a name where OSM has one, and a colour by kind. The map draws
these in 3D (`apps/web/src/lib/mapStyle.ts`, layer `tiral-buildings-3d`) and
hides the plain OpenFreeMap blocks inside the same areas.

Licences: buildings © OpenStreetMap contributors (ODbL); heights © Google,
CC BY 4.0 (cite Sirko et al., 2023, arXiv:2310.11622), made from Copernicus
Sentinel-2 data. Both credits are shown on the map.

## How it was made (18 Oct 2026)
No Earth Engine needed: Google publishes the dataset as public GeoTIFFs.
1. Uganda's 2023 tiles are listed in `UGA_2023.txt` from
   github.com/saiga143/google-2.5d-bulk-download (`urls_part2.zip`).
   Kampala is `177dc_2023_06_30/tile_AQx3P-cWM3s.tif` (UTM 36N, 12.5 km
   square, 0.5 m pixels in 512×512 deflate blocks, 3 bands: fractional count,
   **height**, presence). Found by reading each tile's header (`tiffhead.py`).
2. `blocks.py` lists the height-band blocks over the play areas (53 blocks,
   2.9 MB) and their byte ranges; they're fetched with HTTP range requests,
   not the whole 240 MB file.
3. `decode.py` undoes deflate and the floating-point predictor.
4. OSM buildings with geometry come from Overpass for the same areas; each
   building's height is the 70th percentile of the height pixels inside it
   (OSM `height` wins, then Google, then `building:levels` × 3.2 m, then 6 m;
   kept within 3–120 m).

To widen the area: add it to `AREAS` in `blocks.py` and to `OWN_AREAS` in
`mapStyle.ts`, then redo steps 2–4 (and bump the file name to v2 so phones
don't keep the old one cached).

## All of Kampala: the city tiles (19 Oct 2026)

`apps/web/public/data/city/v1/`: every OSM building in Kampala (lat
0.235–0.42, lng 32.50–32.68) with its height, and the roads, cut into
0.005° tiles the game loads near the camera (`docs/city.md`). Work files go
in a scratch folder, `WORK` below (not in git: ~150 MB of OSM, ~250 MB of
height blocks).

1. `python3 fetch_osm.py WORK/osm` — buildings and roads from Overpass in
   0.02° cells (busy servers: retries, and splits a stubborn cell in four).
   Run a second copy with `reverse` to go twice as fast.
2. `python3 heights.py WORK` — fetches only the height-band blocks under
   buildings from the four Google tiles over Kampala (range requests,
   cached in `WORK/gob`), writes `WORK/heights.json`.
3. `python3 make_tiles.py WORK apps/web/public/data/city/v1` — the tiles
   and `index.json`. Heights: OSM `height`, else Google (≥ 2.5 m), else
   `building:levels` × 3.2 m, else 3.6 m (small) or 6 m.

When the data changes, write it to `city/v2` instead and point `CITY_DATA`
(`apps/web/src/components/city/cityData.ts`) at it: phones cache `/data/`
for a year.
