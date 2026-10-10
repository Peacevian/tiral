# Tiral — Kampala Treasure Race

A multiplayer, map-based 3D treasure-hunting game. Players join a lobby from a mobile browser, pick a starting point in Kampala, wait for the countdown, then race along real roads to find a server-revealed bounty.

Web-first: no installs, join from a link and play.

## How a race works

1. **Join** — open the game, click Join Race to enter the lobby.
2. **Choose your start** — pick one of 5 starting points (Kampala Road, Nakasero, Nasser Road, Jinja Road, Parliament). Taken starts are marked.
3. **Countdown** — starts automatically with 2+ players, or solo via Start now.
4. **Lock + reveal** — at zero, positions lock and the bounty location is revealed (one of 5 spots, picked at random each race).
5. **Race** — walk the real road network, take shortcuts at junctions, chase the glowing treasure chest.
6. **Finish** — first arrival wins; 2nd/3rd places recorded; Play again resets to a fresh lobby.

Movement is constrained to walkable OpenStreetMap roads (streets, footways, paths, steps). You steer with left/straight/right turn requests at junctions — there are no predefined routes, so shortcuts are fair game. All movement and arrival is validated by the authoritative server.

## Tech stack

| Layer | Choice |
|---|---|
| Game client | Next.js + React + TypeScript + Tailwind |
| Map | MapLibre GL JS + OpenStreetMap (restricted to greater Kampala) |
| 3D layer | Three.js + React Three Fiber (avatars, glowing treasure beacon) |
| Multiplayer | Colyseus + WebSockets (authoritative rooms, 10 Hz movement tick) |
| Road data | OpenStreetMap pedestrian graph, shared via `@tiral/road-graph` |
| Database | PostgreSQL + PostGIS + Redis (planned, not yet wired) |
| Package manager | pnpm workspaces |

## Project structure

```txt
apps/
  web/            # Next.js game client (map, 3D overlay, HUD, lobby)
  game-server/    # Colyseus server (rooms, countdown, movement, results)
packages/
  game-core/      # Shared types, Kampala zone, starts, bounties
  road-graph/     # OSM graph build, snapping, traversal, turn classification
  map/            # Mercator projection + map↔3D camera sync
  routing/        # Route utilities (OSRM)
  config/         # Shared TypeScript configs
data/map/         # Prepared local map assets
infrastructure/   # Docker / deployment (planned)
docs/             # Architecture and game-rules notes (planned)
```

## Quickstart

Requirements: Node 20+, pnpm 9.

```bash
pnpm install

# terminal 1 — game server (ws://localhost:2567, listings http://localhost:2568/races)
pnpm --filter @tiral/game-server dev

# terminal 2 — web client (http://localhost:3000)
pnpm --filter @tiral/web dev
```

Open `http://localhost:3000` in two browsers, join in both, pick different starts, and race.

### Environment variables (game server)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `2567` | WebSocket port |
| `RACE_COUNTDOWN_SECONDS` | `300` | Lobby countdown (use `8` for testing) |
| `RACE_ARRIVAL_RADIUS` | `25` | Finish radius in meters |

## Controls

- **Walk** (hold) / **Auto walk** (toggle) — move along the current road
- **Left / Straight / Right** — request a turn at the upcoming junction
- **Turn around** — reverse direction anywhere on a road
- Desktop: `W/↑` walk · `A/←` left · `D/→` right · `S/↓` turn around · `Space` stop

## Current status

- [x] Monorepo, Next.js client, Colyseus server
- [x] Kampala map with 3D avatars synced to coordinates
- [x] Free road-constrained movement with junction choices
- [x] Server-authoritative positions, remote avatars, smoothing
- [x] Start selection, position lock, random bounty reveal
- [x] Arrival validation, finish order, play again
- [x] Reconnect handling, race HUD (distance + rank), solo start
- [x] Matchmaking: one room per race, lobby list, join codes, quick play, locked reveals
- [ ] Accounts, TikTok login, profiles
- [ ] Leaderboards, rewards, admin
- [ ] Sponsorships, launch hardening

See `implementation-plan.md` for the full roadmap.
