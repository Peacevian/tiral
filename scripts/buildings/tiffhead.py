# Read a GeoTIFF's size and georeferencing from its first bytes (HTTP range).
import struct, sys, urllib.request

def fetch(url, n=65536):
    req = urllib.request.Request(url, headers={"Range": f"bytes=0-{n-1}"})
    return urllib.request.urlopen(req, timeout=60).read()

TYPES = {1: ("B", 1), 2: ("c", 1), 3: ("H", 2), 4: ("I", 4), 5: ("II", 8), 12: ("d", 8), 16: ("Q", 8)}

def parse(data):
    bo = "<" if data[:2] == b"II" else ">"
    magic = struct.unpack(bo + "H", data[2:4])[0]
    big = magic == 43
    if big:
        off = struct.unpack(bo + "Q", data[8:16])[0]
        count = struct.unpack(bo + "Q", data[off:off + 8])[0]; p = off + 8; esize = 20
    else:
        off = struct.unpack(bo + "I", data[4:8])[0]
        count = struct.unpack(bo + "H", data[off:off + 2])[0]; p = off + 2; esize = 12
    tags = {}
    for i in range(count):
        e = data[p + i * esize: p + (i + 1) * esize]
        if big:
            tag, typ, n = struct.unpack(bo + "HHQ", e[:12]); valraw = e[12:20]
        else:
            tag, typ, n = struct.unpack(bo + "HHI", e[:8]); valraw = e[8:12]
        fmt, size = TYPES.get(typ, ("B", 1))
        total = size * n
        if total <= len(valraw):
            raw = valraw[:total]
        else:
            vo = struct.unpack(bo + ("Q" if big else "I"), valraw[:8 if big else 4])[0]
            raw = data[vo:vo + total]
            if len(raw) < total: continue
        if typ == 12: vals = struct.unpack(bo + "d" * n, raw)
        elif typ == 3: vals = struct.unpack(bo + "H" * n, raw)
        elif typ == 4: vals = struct.unpack(bo + "I" * n, raw)
        elif typ == 16: vals = struct.unpack(bo + "Q" * n, raw)
        else: vals = raw
        tags[tag] = vals
    return tags

if __name__ == "__main__":
    t = parse(fetch(sys.argv[1]))
    print("size", t.get(256), t.get(257), "scale", t.get(33550), "tie", t.get(33922), "geokeys", t.get(34735)[:40] if t.get(34735) else None, "bands", t.get(277), "bits", t.get(258))
