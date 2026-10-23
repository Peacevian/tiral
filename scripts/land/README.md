# Land plots

Makes `packages/game-core/src/landPlots.ts`: the empty 20 m plots of central
Kampala and Lugogo players can claim (docs/land.md).

Needs the city tiles (`apps/web/public/data/city/v1`, see
`scripts/buildings`) for buildings and roads, and OpenStreetMap land use for
the two areas in `WORK/landuse/{central,lugogo}.json` (23 Oct 2026: 316 KB and
176 KB). Land use comes from Overpass, e.g. for central Kampala:

    [out:json][timeout:120];
    (nwr["landuse"](0.309,32.574,0.321,32.588);
     nwr["leisure"](0.309,32.574,0.321,32.588);
     nwr["amenity"~"school|college|university|place_of_worship|hospital|clinic|grave_yard|police|fire_station|bus_station|marketplace|parking"](0.309,32.574,0.321,32.588);
     nwr["natural"~"water|wetland|wood|scrub|grassland"](0.309,32.574,0.321,32.588);
     nwr["waterway"](0.309,32.574,0.321,32.588);
     nwr["railway"](0.309,32.574,0.321,32.588);
     nwr["aeroway"](0.309,32.574,0.321,32.588););
    out geom tags;

and the same for Lugogo with the box `0.320,32.600,0.332,32.616`. Then:

    python3 make_plots.py WORK apps/web/public/data/city/v1 packages/game-core/src/landPlots.ts

Land use © OpenStreetMap contributors (ODbL).
