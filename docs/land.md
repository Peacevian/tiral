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

## Phase 2: building (built)

On a plot you hold (rent paid up), pick a ready-made design and make it
yours: floors within its limits, wall and roof colours, and a sign (shops,
bars, kiosks and towers; up to 24 letters, nothing rude). It's paid up front
and goes up in minutes; the 3D city shows grey blocks and scaffolding as
high as the work has got, then the finished building, for every player.

| Design | Floors | Cost | Time |
|---|---|---|---|
| Kiosk | 1 | 150,000 | 2 min |
| Shop | 1–2 | 400,000 + 200,000 a floor | 5 min + 3 a floor |
| Bar | 1–2 | 1,500,000 + 500,000 a floor | 10 min + 5 a floor |
| Flats | 2–6 | 1,500,000 + 500,000 a floor | 15 min + 5 a floor |
| Office tower | 4–10 | 10,000,000 + 1,000,000 a floor | 30 min + 5 a floor (1 h at 10) |
| House | 1–2 | 2,000,000 (4,500,000 with two floors) | 15 min (25 min) |

Progress follows the build times as they are now (started at + today's
time), so changing the times also moves buildings already going up.

Buildings stand back from the plot's street side (`facing` in the plot list)
with their front and sign towards the street; a house gets a hipped roof and
a compound wall.

**Living in your house:** once it's finished, Move in (the usual moving fee
for your furniture). No rent while you live there: the Home page shows it as
a bungalow (one floor) or a house with a garden (two). Renting a home again
moves you out; if the house goes (knocked down, or the plot lapses) you're
back in your last rented home and the Land office tells you so.
`users.home_plot_id`, migration 0019.

**Knocking down** is free and pays nothing back; you can then build again.

Ledger reasons: `land_build` (and `house_move` for moving in).

## Phase 3: earning

Shops earn from players' race and hustle routes passing them (capped daily),
flats and houses from other players' rent, bars from orders.

## Remaking the plots

1. Land use from Overpass for the two areas (see `scripts/land/README.md`).
2. `python3 scripts/land/make_plots.py WORK apps/web/public/data/city/v1 packages/game-core/src/landPlots.ts`

Plot ids are grid cells (`gx_gy`), so a remake keeps every existing plot's
id. A plot that stops qualifying (a new building mapped on it) just stops
being offered; one already held stays held.
