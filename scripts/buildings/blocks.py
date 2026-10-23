import sys, math, json
sys.path.insert(0, "tools")
from tiffhead import fetch, parse
def utm36(lat, lon):
    a=6378137.0; f=1/298.257223563; k0=0.9996; e2=f*(2-f); ep2=e2/(1-e2)
    lam0=math.radians(33); phi=math.radians(lat); lam=math.radians(lon)
    N=a/math.sqrt(1-e2*math.sin(phi)**2); T=math.tan(phi)**2; C=ep2*math.cos(phi)**2; A=math.cos(phi)*(lam-lam0)
    M=a*((1-e2/4-3*e2**2/64-5*e2**3/256)*phi-(3*e2/8+3*e2**2/32+45*e2**3/1024)*math.sin(2*phi)+(15*e2**2/256+45*e2**3/1024)*math.sin(4*phi)-(35*e2**3/3072)*math.sin(6*phi))
    x=k0*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*ep2)*A**5/120)+500000
    y=k0*(M+N*math.tan(phi)*(A*A/2+(5-T+9*C+4*C*C)*A**4/24+(61-58*T+T*T+600*C-330*ep2)*A**6/720))
    return x,y
URL="https://storage.googleapis.com/open-buildings-temporal-data/v1/geotiffs/177dc_2023_06_30/tile_AQx3P-cWM3s.tif"
X0,Y0=452008.0,37500.0; RES=0.5; B=512; PER=49
AREAS={"play":(0.309,32.574,0.321,32.588),"lugogo":(0.3236,32.6058,0.3268,32.6094)}
if __name__=="__main__":
    t=parse(fetch(URL, 262144))
    offs=t[324]; cnts=t[325]
    blocks=set()
    for name,(s,w,n,e) in AREAS.items():
        x0,y1=utm36(n,w); x1,y0=utm36(s,e)
        c0=int((x0-X0)/RES)//B; c1=int((x1-X0)/RES)//B
        r0=int((Y0-y1)/RES)//B; r1=int((Y0-y0)/RES)//B
        for r in range(r0,r1+1):
            for c in range(c0,c1+1): blocks.add((r,c))
        print(name, "cols", c0,c1, "rows", r0,r1)
    idx=[1*PER*PER + r*PER + c for r,c in sorted(blocks)]
    total=sum(cnts[i] for i in idx)
    print("blocks", len(blocks), "bytes", total, f"({total/1e6:.1f} MB)")
    json.dump({"blocks":sorted(blocks),"offsets":[offs[i] for i in idx],"counts":[cnts[i] for i in idx]}, open("gob-urls/kampala_blocks.json","w"))
