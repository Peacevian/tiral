# Download OpenStreetMap buildings and roads for all of Kampala, in 0.02°
# (~2.2 km) cells, from Overpass (several mirrors; they're often busy).
# Usage: python3 fetch_osm.py OUT_DIR [reverse]   (skips cells already
# downloaded; run a second one with "reverse" to work from the other end)
import json, os, sys, time, urllib.parse, urllib.request

KAMPALA = (0.235, 32.50, 0.42, 32.68)  # south, west, north, east
CELL = 0.02
MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

def cells():
    s, w, n, e = KAMPALA
    rows = round((n - s) / CELL + 0.5)
    cols = round((e - w) / CELL + 0.5)
    for r in range(rows):
        for c in range(cols):
            yield r, c, (round(s + r * CELL, 4), round(w + c * CELL, 4), round(min(n, s + (r + 1) * CELL), 4), round(min(e, w + (c + 1) * CELL), 4))

def query(box):
    s, w, n, e = box
    q = f'[out:json][timeout:180];(way["building"]({s},{w},{n},{e});way["highway"]({s},{w},{n},{e}););out geom tags;'
    return urllib.parse.urlencode({"data": q}).encode()

def fetch(box, depth=0):
    """The cell's elements; after a few failures, its four quarters instead (busy servers cope with smaller asks)."""
    data = query(box)
    for attempt in range(4 if depth < 2 else 12):
        url = MIRRORS[attempt % len(MIRRORS)]
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "tiral-buildings/1.0 (game map)"})
            parsed = json.loads(urllib.request.urlopen(req, timeout=240).read())
            if "elements" in parsed and not parsed.get("remark", "").startswith("runtime error"):
                return parsed["elements"]
        except Exception as error:  # busy, timeout, bad gateway
            print("  retry", depth, attempt, url.split("/")[2], str(error)[:60], flush=True)
        time.sleep(min(60, 5 * 2 ** attempt))
    if depth >= 2:
        raise RuntimeError(f"gave up on {box}")
    s, w, n, e = box
    ms, mw = round((s + n) / 2, 5), round((w + e) / 2, 5)
    elements = {}
    for part in [(s, w, ms, mw), (s, mw, ms, e), (ms, w, n, mw), (ms, mw, n, e)]:
        for element in fetch(part, depth + 1):
            elements[element["id"]] = element
    return list(elements.values())

if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    order = list(cells())
    if sys.argv[2:] == ["reverse"]:
        order.reverse()
    for r, c, box in order:
        path = os.path.join(out, f"cell_{r}_{c}.json")
        if os.path.exists(path) or os.path.exists(path + ".busy"):
            continue
        open(path + ".busy", "w").close()
        try:
            body = json.dumps({"elements": fetch(box)}).encode()
        except RuntimeError as error:
            print(error, flush=True)
            os.remove(path + ".busy")
            continue
        open(path + ".part", "wb").write(body)
        os.replace(path + ".part", path)
        os.remove(path + ".busy")
        print(f"cell {r},{c} {box}: {len(body)//1024} KB", flush=True)
    print("done", flush=True)
