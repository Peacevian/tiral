# A height for every OSM building in Kampala from Google Open Buildings 2.5D
# Temporal (2023): fetches only the height-band blocks under buildings
# (HTTP range requests, cached), then takes the 70th percentile of the
# height pixels inside each outline.
# Usage: python3 heights.py WORK_DIR   (reads WORK_DIR/osm, writes WORK_DIR/heights.json)
import glob, json, os, sys, urllib.request
from collections import OrderedDict, defaultdict
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from matplotlib.path import Path

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from tiffhead import fetch, parse
from blocks import utm36
from decode import decode

ROOT = "https://storage.googleapis.com/open-buildings-temporal-data/v1/geotiffs/177dc_2023_06_30/"
# The four 12.5 km tiles over Kampala (UTM 36N): file, west x, north y.
TILES = {
    "nw": ("tile_pUeFyDqzDBE.tif", 439508.0, 50000.0),
    "sw": ("tile_n1nzJzINA5E.tif", 439508.0, 37500.0),
    "ne": ("tile_SALXS2XWUXY.tif", 452008.0, 50000.0),
    "se": ("tile_AQx3P-cWM3s.tif", 452008.0, 37500.0),
}
RES = 0.5
B = 512
PER = 49  # blocks per row and column
SIZE = 12500.0

def tile_of(x, y):
    for key, (_, x0, y0) in TILES.items():
        if x0 <= x < x0 + SIZE and y0 - SIZE < y <= y0:
            return key
    return None

def buildings(work):
    seen = {}
    for path in sorted(glob.glob(os.path.join(work, "osm", "cell_*.json"))):
        for e in json.load(open(path))["elements"]:
            if e["type"] == "way" and "building" in e.get("tags", {}) and len(e.get("geometry") or []) >= 4:
                seen[e["id"]] = e
    return seen

if __name__ == "__main__":
    work = sys.argv[1]
    cache = os.path.join(work, "gob")
    os.makedirs(cache, exist_ok=True)
    found = buildings(work)
    print("buildings", len(found), flush=True)

    # Outline in pixels of its tile, and the blocks it covers.
    shapes = {}
    need = defaultdict(set)
    for id_, e in found.items():
        pts = np.array([utm36(p["lat"], p["lon"]) for p in e["geometry"]])
        cx, cy = pts[:, 0].mean(), pts[:, 1].mean()
        key = tile_of(cx, cy)
        if not key:
            continue
        _, x0, y0 = TILES[key]
        px = (pts[:, 0] - x0) / RES
        py = (y0 - pts[:, 1]) / RES
        shapes[id_] = (key, px, py)
        for r in range(max(0, int(py.min()) // B), min(PER - 1, int(py.max()) // B) + 1):
            for c in range(max(0, int(px.min()) // B), min(PER - 1, int(px.max()) // B) + 1):
                need[key].add((r, c))

    # Fetch the blocks (height is band 2 of 3, planar: its blocks come second).
    jobs = []
    for key, blocks in need.items():
        name = TILES[key][0]
        tags = parse(fetch(ROOT + name, 262144))
        offsets, counts = tags[324], tags[325]
        for r, c in blocks:
            i = PER * PER + r * PER + c
            jobs.append((ROOT + name, offsets[i], counts[i], os.path.join(cache, f"{key}_{r}_{c}.bin")))
    total = sum(j[2] for j in jobs)
    todo = [j for j in jobs if not os.path.exists(j[3])]
    print(f"blocks {len(jobs)} ({total / 1e6:.0f} MB), to fetch {len(todo)}", flush=True)

    def get(job):
        url, offset, count, path = job
        for attempt in range(5):
            try:
                req = urllib.request.Request(url, headers={"Range": f"bytes={offset}-{offset + count - 1}"})
                data = urllib.request.urlopen(req, timeout=120).read()
                if len(data) == count:
                    open(path + ".part", "wb").write(data)
                    os.replace(path + ".part", path)
                    return count
            except Exception:
                pass
        raise RuntimeError(f"block failed {path}")

    done = 0
    with ThreadPoolExecutor(8) as pool:
        for n, size in enumerate(pool.map(get, todo)):
            done += size
            if n % 200 == 0:
                print(f"  fetched {n}/{len(todo)} ({done / 1e6:.0f} MB)", flush=True)

    # Heights, going block by block so only a few decoded blocks are in memory.
    decoded = OrderedDict()

    def block(key, r, c):
        k = (key, r, c)
        if k not in decoded:
            path = os.path.join(cache, f"{key}_{r}_{c}.bin")
            decoded[k] = decode(path) if os.path.exists(path) else None
            if len(decoded) > 64:
                decoded.popitem(last=False)
        decoded.move_to_end(k)
        return decoded[k]

    order = sorted(shapes, key=lambda i: (shapes[i][0], int(shapes[i][2].min()) // B, int(shapes[i][1].min()) // B))
    heights = {}
    for n, id_ in enumerate(order):
        key, px, py = shapes[id_]
        c0, c1 = int(px.min()), int(px.max()) + 1
        r0, r1 = int(py.min()), int(py.max()) + 1
        xs, ys = np.meshgrid(np.arange(c0, c1) + 0.5, np.arange(r0, r1) + 0.5)
        inside = Path(np.c_[px, py]).contains_points(np.c_[xs.ravel(), ys.ravel()]).reshape(xs.shape)
        yy, xx = np.nonzero(inside)
        R, C = r0 + yy, c0 + xx
        ok = (R >= 0) & (R < PER * B) & (C >= 0) & (C < PER * B)
        R, C = R[ok], C[ok]
        values = []
        for br, bc in set(zip((R // B).tolist(), (C // B).tolist())):
            data = block(key, br, bc)
            if data is None:
                continue
            here = (R // B == br) & (C // B == bc)
            values.extend(data[R[here] % B, C[here] % B].tolist())
        if len(values) >= 4:
            heights[id_] = round(float(np.percentile(values, 70)), 1)
        if n % 20000 == 0:
            print(f"  heights {n}/{len(order)}", flush=True)
    json.dump(heights, open(os.path.join(work, "heights.json"), "w"))
    print("with a Google height:", len(heights), "of", len(found), flush=True)
