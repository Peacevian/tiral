import json, zlib, numpy as np
B=512
def decode(path):
    raw=np.frombuffer(zlib.decompress(open(path,"rb").read()), dtype=np.uint8).reshape(B, B*4)
    # Floating-point predictor: bytes differenced along each row, then
    # stored as byte planes (most significant first).
    rows=np.cumsum(raw.astype(np.uint16), axis=1).astype(np.uint8)
    planes=rows.reshape(B, 4, B)
    be=np.stack([planes[:,0,:],planes[:,1,:],planes[:,2,:],planes[:,3,:]], axis=-1).copy()
    return be.view(">f4").reshape(B,B).astype(np.float32)
def mosaic():
    d=json.load(open("gob-urls/kampala_blocks.json"))
    out={}
    for (r,c) in d["blocks"]:
        out[(r,c)]=decode(f"gob-blocks/h_{r}_{c}.bin")
    return out
if __name__=="__main__":
    m=mosaic()
    allv=np.concatenate([a.ravel() for a in m.values()])
    print("blocks", len(m), "min", float(allv.min()), "max", float(allv.max()), "mean", float(allv.mean()), "share>3m", float((allv>3).mean()))
