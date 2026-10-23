# Land: claiming plots and building on them

Players buy empty plots in town with BNG (never real money), hold them by
paying a small weekly ground rent, and (next) build on them: a kiosk, shop,
bar, flats, an office tower or their own house, which everyone sees in the 3D
city. Plots are game plots, not real land, and the game says so.

## Phase 1: plots and claiming (built)

- **Where:** central Kampala and Lugogo (around Kyadondo). 857 plots: 154 in
  town (7 on a main road), 703 around Lugogo.
- **What a plot is:** a 20 × 20 m square on a fixed grid (web-mercator metres
  at the city anchor, the same frame as the 3D city), with no building, road,
  railway or stream on it, not on a public place (park, school, place of
  worship, hospital, clinic, sports ground, water, verge, wood), and within
  ~50 m of a street.
- **Prices** (made by `scripts/land/make_plots.py`):

  | | Main road | Street | Back plot |
  |---|---|---|---|
  | Central Kampala | 4,000,000 | 2,000,000 | 1,200,000 |
  | Lugogo | 2,500,000 | 1,500,000 | 800,000 |

  Central plots more than 600 m from Constitution Square cost a quarter less.
- **Claiming** pays the price plus the first week's ground rent.
- **Ground rent:** 1% of the price a week, paid up to 8 weeks ahead. Unpaid
  for 4 weeks past due, the plot is back on the market; the next claim takes
  it over, along with whatever was on it.
- **Limit:** 2 plots per player at a time.
- **Ledger reasons:** `land_claim`, `land_rent`.

Code: rules in `packages/game-core/src/land.ts` (plot list generated into
`landPlots.ts`), money and ownership in `packages/db/src/land.ts` (table
`land_plots`, migration 0018), API under `apps/web/src/app/api/land`, the
screen at `/land` (Hub: "Land: claim a plot").

## Phase 2: building (next)

Ready-made designs you personalise (colours, floors within limits, a sign):
kiosk, shop, bar, flats, office tower, your own house. Building takes real
time, with scaffolding in the 3D city meanwhile. Your house can be lived in
(instead of renting a room) or rented out to other players.

## Phase 3: earning

Shops earn from players' race and hustle routes passing them (capped daily),
flats from other players' rent, bars from orders.

## Remaking the plots

1. Land use from Overpass for the two areas (see `scripts/land/README.md`).
2. `python3 scripts/land/make_plots.py WORK apps/web/public/data/city/v1 packages/game-core/src/landPlots.ts`

Plot ids are grid cells (`gx_gy`), so a remake keeps every existing plot's
id. A plot that stops qualifying (a new building mapped on it) just stops
being offered; one already held stays held.
