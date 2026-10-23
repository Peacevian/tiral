# Tiral's 3D city

The race and hustle maps draw all of Kampala as Tiral's own 3D city: every
OpenStreetMap building with its real height from Google Open Buildings 2.5D,
facades with windows, shops along the ground floors in the centre and on shop
buildings, one-storey houses with plastered walls, iron-sheet and concrete
roofs with water tanks, trees and street lights. The map underneath still
draws the roads and their names, over a pavement ground.

Code: `apps/web/src/components/city/` (`City.tsx` loads and draws,
`cityData.ts` reads the tiles, `cityBuild.ts` makes the geometry,
`cityTextures.ts` paints the textures). Data: `apps/web/public/data/city/v1/`,
made by `scripts/buildings` (see its README).

Look at it and measure it on `/dev/city` (development only), e.g.
`?view=street|city|race|lugogo|kisenyi|ntinda`; `window.__cityStats` and
`window.__cityRenderer.info.render` have the numbers.

## How it loads

- Kampala is cut into tiles of 0.005° (~550 m). `index.json` lists them.
- Only tiles near the middle of the map are fetched: up to ~2 km out when
  zoomed out (zoom 15), ~1.4 km at zoom 16, ~900 m from zoom 17.
- Within ~450 m (from zoom 15.8): the full look. Further: plain blocks at
  their real heights, one mesh a tile. Beyond: the map's own blocks, which
  are flattened wherever Tiral's tiles are drawn.
- Tiles are fetched four at a time and built one at a time between frames,
  nearest first, so the screen never freezes. Tiles out of reach are dropped
  (downloaded ones kept for coming back, up to 120).
- Under zoom 14.8 the city hides (as the map's own 3D blocks do).
- The overlay doesn't redraw for the city alone: only when the map moves or
  a runner animates (`userData.static` in `ThreeLayer`).
- Map pins sit above the 3D overlay, so a building never hides one.
- Files under `/data/` are cached by phones for a year: when the data
  changes, make it as `city/v2` (and point `CITY_DATA` at it).

## Who gets it

- Computers and strong phones: on.
- Cheap phones (`isLiteDevice()`: 2 GB of memory or less, Data Saver or a
  2G/3G connection, 2 cores or fewer): off for now. They keep the map's
  plain 3D blocks until the city has been tried on a real cheap phone.
- `?city=1` or `?city=0` on any page turns it on or off on that phone
  (remembered).
- When it's on for a cheap phone, it's lighter: tiles load 40% less far,
  half the trees, no street lights, textures at half size.
