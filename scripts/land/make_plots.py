# Cut central Kampala and Lugogo into 20 m plots players can claim
# (docs/land.md), keeping only empty ones: no building, road, railway or
# stream, and not on public places (parks, schools, places of worship,
# hospitals, sports grounds, water, verges and woods).
#
# Usage: python3 make_plots.py WORK_DIR CITY_TILES OUT_JSON
#   WORK_DIR/landuse/{central,lugogo}.json  OSM land use (Overpass, out geom)
#   CITY_TILES  apps/web/public/data/city/v1 (buildings and roads)
#   OUT_TS      packages/game-core/src/landPlots.ts (generated: do not edit)
#
# The plot grid is 20 m squares in web-mercator metres at the city anchor
# (the same frame as apps/web/src/components/city/cityData.ts), so plot gx_gy
# covers x in [gx*20, gx*20+20), y in [gy*20, gy*20+20), y growing south.
import json, math, os, sys
import numpy as np
from matplotlib.path import Path

ANCHOR = (0.3275, 32.59)  # lat, lng (cityData.ts ANCHOR)
METERS = 2 * math.pi * 6378137 * math.cos(math.radians(ANCHOR[0]))
PLOT = 20
RES = 1.0  # raster metres

def merc_y(lat):
    return (1 - math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) / math.pi) / 2

AY = merc_y(ANCHOR[0])

def local(lat, lng):
    return ((lng - ANCHOR[1]) / 360 * METERS, (merc_y(lat) - AY) * METERS)

AREAS = {
    # name: (south, west, north, east), price list (main road, street, back)
    "central": ((0.309, 32.574, 0.321, 32.588), (4_000_000, 2_000_000, 1_200_000)),
    "lugogo": ((0.320, 32.600, 0.332, 32.616), (2_500_000, 1_500_000, 800_000)),
}
# Further than this from the centre of town, central plots cost a quarter less.
CITY_CENTRE = (0.3149, 32.5813)  # Constitution Square

ROAD_WIDTHS = [13, 11, 9, 8, 6.5, 6, 4.5, 5]  # make_tiles.py ROAD_CLASSES
MAIN_ROADS = {0, 1, 2}  # trunk, primary, secondary

PUBLIC = {
    "landuse": {"grass", "highway", "forest", "flowerbed", "cemetery", "recreation_ground", "religious", "railway", "military", "plant_nursery", "meadow", "village_green", "reservoir", "basin"},
    "leisure": {"pitch", "park", "swimming_pool", "sports_centre", "stadium", "playground", "garden", "golf_course", "track", "nature_reserve", "fitness_centre"},
    "amenity": {"school", "college", "university", "place_of_worship", "hospital", "clinic", "grave_yard", "police", "fire_station", "bus_station", "marketplace"},
    "natural": {"water", "wetland", "wood", "scrub", "grassland"},
    "aeroway": None,
}
LINES = {"waterway": 3.0, "railway": 4.0}  # half-width kept clear (m)

def dilate(mask, n):
    """Grow a mask by n cells in every direction (8-neighbour steps)."""
    out = mask.copy()
    for _ in range(n):
        grown = out.copy()
        grown[1:, :] |= out[:-1, :]; grown[:-1, :] |= out[1:, :]
        grown[:, 1:] |= out[:, :-1]; grown[:, :-1] |= out[:, 1:]
        grown[1:, 1:] |= out[:-1, :-1]; grown[:-1, :-1] |= out[1:, 1:]
        grown[1:, :-1] |= out[:-1, 1:]; grown[:-1, 1:] |= out[1:, :-1]
        out = grown
    return out

class Raster:
    def __init__(self, box):
        s, w, n, e = box
        self.x0, self.y0 = local(n, w)  # north-west corner (y grows south)
        x1, y1 = local(s, e)
        self.W = int(math.ceil((x1 - self.x0) / RES))
        self.H = int(math.ceil((y1 - self.y0) / RES))
        self.used = np.zeros((self.H, self.W), bool)
        xs, ys = np.meshgrid(self.x0 + (np.arange(self.W) + 0.5) * RES, self.y0 + (np.arange(self.H) + 0.5) * RES)
        self.xs, self.ys = xs, ys

    def polygon(self, ring, pad=0.0):
        a = np.array(ring)
        c0 = max(0, int((a[:, 0].min() - self.x0 - pad) / RES)); c1 = min(self.W, int((a[:, 0].max() - self.x0 + pad) / RES) + 2)
        r0 = max(0, int((a[:, 1].min() - self.y0 - pad) / RES)); r1 = min(self.H, int((a[:, 1].max() - self.y0 + pad) / RES) + 2)
        if c0 >= c1 or r0 >= r1:
            return
        pts = np.c_[self.xs[r0:r1, c0:c1].ravel(), self.ys[r0:r1, c0:c1].ravel()]
        inside = Path(a).contains_points(pts).reshape(r1 - r0, c1 - c0)
        if pad:
            inside = dilate(inside, int(round(pad / RES)))
        self.used[r0:r1, c0:c1] |= inside

    def line(self, pts, half):
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            n = max(1, int(math.hypot(bx - ax, by - ay) / RES))
            for k in range(n + 1):
                x = ax + (bx - ax) * k / n; y = ay + (by - ay) * k / n
                c0 = max(0, int((x - half - self.x0) / RES)); c1 = min(self.W, int((x + half - self.x0) / RES) + 1)
                r0 = max(0, int((y - half - self.y0) / RES)); r1 = min(self.H, int((y + half - self.y0) / RES) + 1)
                if c0 < c1 and r0 < r1:
                    self.used[r0:r1, c0:c1] = True

def is_public(tags):
    for key, values in PUBLIC.items():
        if key in tags and (values is None or tags[key] in values):
            return True
    return False

def rings(element):
    if element["type"] == "way" and element.get("geometry"):
        g = element["geometry"]
        if (g[0]["lat"], g[0]["lon"]) == (g[-1]["lat"], g[-1]["lon"]) and len(g) >= 4:
            yield [local(p["lat"], p["lon"]) for p in g]
    elif element["type"] == "relation":
        for m in element.get("members", []):
            if m.get("role") == "outer" and m.get("geometry") and len(m["geometry"]) >= 4:
                yield [local(p["lat"], p["lon"]) for p in m["geometry"]]

if __name__ == "__main__":
    work, tiles_dir, out = sys.argv[1:4]
    index = json.load(open(os.path.join(tiles_dir, "index.json")))
    S, W_, C = index["south"], index["west"], index["cell"]
    plots = []
    stats = {}
    cx, cy = local(*CITY_CENTRE)
    for name, (box, prices) in AREAS.items():
        r = Raster(box)
        s, w, n, e = box
        # Buildings (2 m clear around each) and roads (kerb plus 1.5 m).
        for key in index["tiles"]:
            ty, tx = map(int, key.split("_"))
            ts, tw = S + ty * C, W_ + tx * C
            if ts > n or ts + C < s or tw > e or tw + C < w:
                continue
            tile = json.load(open(os.path.join(tiles_dir, f"{key}.json")))
            for _, _, _, flat in tile["b"]:
                ring = [local(ts + flat[i + 1] / 1e6, tw + flat[i] / 1e6) for i in range(0, len(flat), 2)]
                ring.append(ring[0])
                r.polygon(ring, pad=2.0)
            for cls, flat in tile["r"]:
                pts = [local(ts + flat[i + 1] / 1e6, tw + flat[i] / 1e6) for i in range(0, len(flat), 2)]
                r.line(pts, ROAD_WIDTHS[cls] / 2 + 1.5)
        # Public places, streams and railways.
        landuse = json.load(open(os.path.join(work, "landuse", f"{name}.json")))
        for el in landuse["elements"]:
            tags = el.get("tags", {})
            if is_public(tags):
                for ring in rings(el):
                    r.polygon(ring)
            for key, half in LINES.items():
                if key in tags and el["type"] == "way" and el.get("geometry"):
                    r.line([local(p["lat"], p["lon"]) for p in el["geometry"]], half)
        # Road frontage, from a second raster of just the roads.
        roads = {"main": Raster(box), "any": Raster(box), "near": Raster(box)}
        for key in index["tiles"]:
            ty, tx = map(int, key.split("_"))
            ts, tw = S + ty * C, W_ + tx * C
            if ts > n or ts + C < s or tw > e or tw + C < w:
                continue
            for cls, flat in json.load(open(os.path.join(tiles_dir, f"{key}.json")))["r"]:
                pts = [local(ts + flat[i + 1] / 1e6, tw + flat[i] / 1e6) for i in range(0, len(flat), 2)]
                reach = ROAD_WIDTHS[cls] / 2 + 6  # a plot within ~4.5 m of the kerb fronts the road
                roads["any"].line(pts, reach)
                # Plots deep inside open fields aren't offered: within ~50 m of a street only.
                roads["near"].line(pts, ROAD_WIDTHS[cls] / 2 + 50)
                if cls in MAIN_ROADS:
                    roads["main"].line(pts, reach)
        found = {"main": 0, "street": 0, "back": 0}
        gx0 = math.ceil(r.x0 / PLOT); gx1 = math.floor((r.x0 + r.W * RES) / PLOT) - 1
        gy0 = math.ceil(r.y0 / PLOT); gy1 = math.floor((r.y0 + r.H * RES) / PLOT) - 1
        for gy in range(gy0, gy1 + 1):
            for gx in range(gx0, gx1 + 1):
                c0 = int(round((gx * PLOT - r.x0) / RES)); r0 = int(round((gy * PLOT - r.y0) / RES))
                k = int(PLOT / RES)
                if c0 < 0 or r0 < 0 or c0 + k > r.W or r0 + k > r.H or r.used[r0:r0 + k, c0:c0 + k].any():
                    continue
                if not roads["near"].used[r0:r0 + k, c0:c0 + k].all():
                    continue
                if roads["main"].used[r0:r0 + k, c0:c0 + k].any():
                    front, price = 2, prices[0]
                elif roads["any"].used[r0:r0 + k, c0:c0 + k].any():
                    front, price = 1, prices[1]
                else:
                    front, price = 0, prices[2]
                px, py = (gx + 0.5) * PLOT, (gy + 0.5) * PLOT
                if name == "central" and math.hypot(px - cx, py - cy) > 600:
                    price *= 0.75
                price = int(round(price / 50_000) * 50_000)
                plots.append([gx, gy, price, front, 0 if name == "central" else 1])
                found[["back", "street", "main"][front]] += 1
        stats[name] = found
    os.makedirs(os.path.dirname(out), exist_ok=True)
    rows = ",".join(json.dumps(p, separators=(",", ":")) for p in plots)
    open(out, "w").write(
        "// Generated by scripts/land/make_plots.py: do not edit by hand.\n"
        "// The empty 20 m plots players can claim (docs/land.md): [gx, gy, price, frontage, area].\n"
        "// frontage 2 = main road, 1 = street, 0 = back plot; area 0 = central Kampala, 1 = Lugogo.\n"
        f"export const LAND_PLOTS_VERSION = 1\n"
        f"export const LAND_PLOT_ROWS: ReadonlyArray<readonly [number, number, number, 0 | 1 | 2, 0 | 1]> = [{rows}]\n"
    )
    print(stats, "total", len(plots), f"{os.path.getsize(out) // 1024} KB")
