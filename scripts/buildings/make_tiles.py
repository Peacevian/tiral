# Cut Kampala's buildings (with heights) and roads into small square files
# the game loads near where the map looks: apps/web/public/data/city/v1/.
# Usage: python3 make_tiles.py WORK_DIR OUT_DIR
#
# Tile y_x covers lat SOUTH + y*CELL .. +CELL, lng WEST + x*CELL .. +CELL.
# {
#   "b": [[height_dm, colour, kind, [dx, dy, dx, dy, ...]], ...]  buildings
#   "r": [[class, [dx, dy, ...]], ...]                             roads
# }
# dx/dy: micro-degrees east/north of the tile's south-west corner (the ring
# isn't closed). colour indexes CITY_COLOURS in City.tsx; kind 1 = shops on
# the ground floor; road class indexes ROAD_CLASSES.
import glob, gzip, json, math, os, sys
from collections import defaultdict

SOUTH, WEST, NORTH, EAST = 0.235, 32.50, 0.42, 32.68
CELL = 0.005
TOWER = 5  # colours 0-4 towers, 5-14 low buildings, 15 church, 16 hotel, 17 shelter roof
LOW = 10
ROAD_CLASSES = ["trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "service", "living_street"]
SHOPS = {"commercial", "retail", "office", "kiosk", "supermarket", "hotel", "mall", "shop", "market"}
# Kampala's centre: shops along every ground floor.
CBD = (0.307, 32.570, 0.322, 32.592)
HOUSES = {"house", "residential", "detached", "semidetached_house", "hut", "bungalow", "terrace", "apartments"}

def number(value):
    try:
        return float(str(value).lower().replace("m", "").strip())
    except ValueError:
        return None

def area_m2(geometry):
    k = 111320 * math.cos(math.radians(geometry[0]["lat"]))
    pts = [(p["lon"] * k, p["lat"] * 110574) for p in geometry]
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1]))) / 2

def tile_key(lat, lng):
    return f"{int((lat - SOUTH) // CELL)}_{int((lng - WEST) // CELL)}"

def corner(key):
    y, x = map(int, key.split("_"))
    return SOUTH + y * CELL, WEST + x * CELL

if __name__ == "__main__":
    work, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    heights = json.load(open(os.path.join(work, "heights.json")))
    ways = {}
    for path in sorted(glob.glob(os.path.join(work, "osm", "cell_*.json"))):
        for e in json.load(open(path))["elements"]:
            if e["type"] == "way" and e.get("geometry"):
                ways[e["id"]] = e
    tiles = defaultdict(lambda: {"b": [], "r": []})
    stats = defaultdict(int)
    for id_, e in ways.items():
        tags = e.get("tags", {})
        g = e["geometry"]
        if "building" in tags:
            if len(g) < 4:
                continue
            lat = sum(p["lat"] for p in g) / len(g)
            lng = sum(p["lon"] for p in g) / len(g)
            if not (SOUTH <= lat < NORTH and WEST <= lng < EAST):
                continue
            kind = tags["building"]
            h = number(tags.get("height", "")) or None
            google = heights.get(str(id_))
            if not h and google and google >= 2.5:
                h = google
                stats["google"] += 1
            elif not h and tags.get("building:levels"):
                levels = number(tags["building:levels"])
                h = levels * 3.2 if levels else None
            if not h:
                h = 3.6 if area_m2(g) < 150 else 6.0
                stats["guessed"] += 1
            h = max(2.6, min(h, 120.0))
            if kind == "roof":
                h = min(h, 4.0)
            if kind == "church":
                colour = 15
            elif kind == "hotel":
                colour = 16
            elif kind == "roof":
                colour = 17
            elif h > 30:
                colour = id_ % TOWER
            else:
                colour = TOWER + id_ % LOW
            in_cbd = CBD[0] <= lat <= CBD[2] and CBD[1] <= lng <= CBD[3]
            shops = 1 if (kind in SHOPS or "shop" in tags or (in_cbd and kind not in HOUSES and kind not in ("church", "roof"))) else 0
            key = tile_key(lat, lng)
            s, w = corner(key)
            ring = g[:-1] if (g[0]["lat"], g[0]["lon"]) == (g[-1]["lat"], g[-1]["lon"]) else g
            flat = []
            for p in ring:
                flat += [round((p["lon"] - w) * 1e6), round((p["lat"] - s) * 1e6)]
            tiles[key]["b"].append([round(h * 10), colour, shops, flat])
            stats["buildings"] += 1
        elif tags.get("highway") in ROAD_CLASSES:
            road = ROAD_CLASSES.index(tags["highway"])
            # Split the road where it crosses tiles (each piece in the tile of its segments' middles).
            piece, piece_key = [], None
            for a, b in zip(g, g[1:]):
                mid_lat, mid_lng = (a["lat"] + b["lat"]) / 2, (a["lon"] + b["lon"]) / 2
                if not (SOUTH <= mid_lat < NORTH and WEST <= mid_lng < EAST):
                    key = None
                else:
                    key = tile_key(mid_lat, mid_lng)
                if key != piece_key:
                    if piece_key and len(piece) >= 2:
                        tiles[piece_key]["r"].append([road, piece])
                    piece, piece_key = [], key
                if key:
                    s, w = corner(key)
                    if not piece:
                        piece += [round((a["lon"] - w) * 1e6), round((a["lat"] - s) * 1e6)]
                    piece += [round((b["lon"] - w) * 1e6), round((b["lat"] - s) * 1e6)]
            if piece_key and len(piece) >= 4:
                tiles[piece_key]["r"].append([road, piece])
    index = {}
    raw = packed = 0
    for key, tile in tiles.items():
        if not tile["b"]:
            continue
        body = json.dumps(tile, separators=(",", ":")).encode()
        open(os.path.join(out, f"{key}.json"), "wb").write(body)
        index[key] = len(tile["b"])
        raw += len(body)
        packed += len(gzip.compress(body))
    json.dump({"south": SOUTH, "west": WEST, "cell": CELL, "tiles": index}, open(os.path.join(out, "index.json"), "w"), separators=(",", ":"))
    print(dict(stats), "tiles", len(index), f"raw {raw / 1e6:.1f} MB, gzipped {packed / 1e6:.1f} MB", "biggest", max(index.values()))
