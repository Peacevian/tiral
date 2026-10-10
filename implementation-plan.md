# Tiral — Implementation Plan

Multiplayer, map-based 3D treasure-hunting game. First playable area: Kampala.

---

## Most Important Principle

Build **one complete, enjoyable race** before investing in a large map, advanced graphics, TikTok integrations, or sponsorship systems.

---

## 1. Tech Stack

| Layer | Choice | Purpose |
|---|---|---|
| Game client | Next.js + React + TypeScript | Website, lobby, accounts, leaderboard, rewards, responsive mobile UI |
| Map engine | MapLibre GL JS + OpenStreetMap | Kampala streets, zoom, start points, destination markers, route lines |
| 3D game layer | Three.js + React Three Fiber + Drei | Animated avatars, treasure chests, shadows, character customization |
| Road routing | OSM + OSRM or Valhalla | Valid road routes and distances (self-hosted) |
| Real-time multiplayer | Node.js + TypeScript + Colyseus + WebSockets | Authoritative game rooms, synced players, timers, winner validation |
| Database | PostgreSQL + PostGIS + Redis | Accounts, races, rewards, geographic data, rankings, session state |
| Hosting | Docker + managed hosting + monitoring | Separate deployment for web and game server |
| Language | TypeScript (frontend + backend) | |
| Package manager | pnpm workspaces | |
| UI styling | Tailwind CSS | |
| Input validation | Zod | |
| Auth | TikTok Login Kit (if approved) + fallback | |
| DB access | Drizzle ORM or Prisma | |
| Tests | Vitest + Playwright | |
| 3D assets | Blender + GLB/GLTF | |
| Error monitoring | Sentry | |
| Analytics | PostHog (or privacy-conscious alt) | |
| CI/CD | GitHub Actions | |
| Map tiles | Self-hosted or appropriately licensed provider | |

Don't introduce every service immediately. Redis and dedicated analytics can wait until the prototype proves fun.

---

## 2. Development Phases

### 01 — Foundation

Project setup and technical prototype.

- Set up Next.js frontend + TypeScript multiplayer server
- Create repo, dev environment, deployment pipeline
- Render a real Kampala map with MapLibre
- Load a 3D avatar (Three.js) and position it at a geographic coordinate
- Convert map coordinates into the 3D scene correctly

**Deliverable:** A working map with a 3D character moving on it.

---

### 02 — World

Build the first playable Kampala zone.

- Select a compact, road-connected area
- Import OpenStreetMap road data
- Calculate routes between candidate start points and destinations
- Add road highlighting, junctions, points of interest, bounty marker
- Make it usable on low-end phones and mobile browsers

**Deliverable:** A playable map where routes follow roads, not buildings.

---

### 03 — Gameplay

Implement one complete race.

- Players enter a lobby
- A 5-minute countdown begins
- Players select starting locations
- Server locks starting positions
- Server selects and reveals a valid bounty destination
- Avatars move along calculated routes
- First eligible players to reach the bounty win

**Deliverable:** One complete race that works with test players.

---

### 04 — Multiplayer

Synchronize real players.

- Create game rooms with Colyseus
- Sync countdowns, player positions, routes, race state
- Show other players' avatars moving live
- Add disconnect/reconnect handling
- Validate movement and finish events server-side (anti-cheat)
- Test simultaneous races and network latency

**Deliverable:** Multiple players can race together and see consistent results.

---

### 05 — Identity

Accounts, profiles, and TikTok integration.

- Guest play or fallback sign-in
- TikTok Login Kit (after app registration approved)
- Player profiles: display names, avatars, race history
- Shareable race-result cards or short clips

**Deliverable:** Players can return, build a profile, and share wins.

---

### 06 — Rewards

Reward and leaderboard system.

- Store race results and winning positions
- Daily, weekly, seasonal leaderboards
- Non-cash points, badges, cosmetics
- Admin interface for creating races and configuring rewards
- Reward distribution logging + anti-abuse checks

**Deliverable:** A repeatable competition system with auditable results.

---

### 07 — Revenue

Sponsorships and monetization.

- Sponsored bounty chests and named race events
- Brand-themed avatars and cosmetic items
- Sponsored leaderboard challenges
- Creator tournaments with sponsor-funded prizes
- Basic advertiser dashboard (impressions, participation, engagement)

**Deliverable:** Businesses and creators can pay for visibility; ordinary players never have to pay.

---

### 08 — Launch

Closed beta, performance testing, expansion.

- Test on actual Android phones and mobile networks in Uganda
- Test with small player group before creator-led events
- Measure: race completion, wait times, crashes, retention, cost per active player
- Fix exploits and performance bottlenecks
- Expand to additional Kampala zones only after first zone is stable

**Deliverable:** A launch-ready game with measured performance and expansion plan.

---

## 3. Technical Architecture

```
Player's mobile browser
  MapLibre + Three.js + game interface
          |
Real-time multiplayer server
  Lobby · Countdown · Race state · Movement · Winner validation
          |
Game data and routing
  PostgreSQL · PostGIS · Road routing · Profiles · Results
```

### Race Lifecycle

1. Server creates a race room and starts a 5-minute timer.
2. Players select valid starting points within the zone.
3. At zero, server freezes selections and picks a destination from predefined reachable bounty locations.
4. Routing engine calculates the road route for each player.
5. Server controls each avatar's authoritative progress and sends updates to all connected clients.
6. Server verifies who reaches the destination first and records the result.
7. Clients animate avatars smoothly between server updates, even under fluctuating network.

**Important:** Never trust the browser to declare a winner. The server validates movement and arrival. For v1, avatars travel automatically along routes — this simplifies sync and avoids full open-world movement complexity.

---

## 4. Project Structure

```
kampala-treasure-race/
├── apps/
│   ├── web/                  # Next.js game client
│   ├── game-server/          # Colyseus multiplayer server
│   └── admin/                # Race and sponsor management
├── packages/
│   ├── game-core/            # Shared game rules and types
│   ├── map/                  # Map layers and coordinate utilities
│   ├── routing/              # Route and road utilities
│   ├── avatars/              # 3D avatar and animation components
│   └── config/               # Shared TypeScript and lint config
├── data/
│   └── map/                  # Prepared local map assets
├── infrastructure/
│   └── docker/               # Local development services
└── docs/
    ├── architecture.md
    └── game-rules.md
```

This is a starting point — not every folder needs to exist on day one.

---

## 5. Database Design

### Core Tables

| Table | Purpose |
|---|---|
| `users` | Internal account, display name, avatar, auth reference |
| `player_profiles` | Cosmetics, stats, preferences |
| `game_zones` | Playable geographic areas and boundaries |
| `starting_points` | Approved player starting locations |
| `bounty_locations` | Eligible treasure destinations |
| `races` | Lobby, countdown, status, destination, timestamps |
| `race_players` | Race membership, start point, route, progress |
| `race_results` | Finish order, completion time, verification status |
| `rewards_ledger` | Points and rewards earned or distributed |
| `sponsors` | Sponsor accounts and campaign configuration |

PostGIS handles geographic queries (e.g., is a starting point inside the active zone?). Detailed road data lives in the dedicated routing service, not the application database.

---

## 6. Build First vs. Postpone

### Build First

- One small Kampala zone
- A few valid starting points and bounty destinations
- A functioning 5-minute countdown
- One 3D avatar moving along a road route
- A complete race with server-verified results
- Two or more clients in the same race

### Postpone Until Game Works

- Full Kampala coverage
- Complex avatar customization and realistic buildings
- Cash prizes, payments, wallets
- Automated TikTok posting
- Large-scale tournaments and sponsor self-service portal
- Native iOS/Android apps

---

## 7. Realistic Timeline

| Milestone | Estimate |
|---|---|
| First playable prototype | 2–4 weeks focused work |
| Closed beta (multiplayer, profiles, analytics, anti-cheat) | 6–12+ weeks |

Initial operating costs are low: open-source tools, small server, limited map. Costs grow with traffic, map-tile usage, routing requests, 3D assets, and hosting.

---

## 8. First Sprint — 5 Tasks (In Order)

1. **Create the monorepo** — pnpm, Next.js, TypeScript, basic Colyseus server
2. **Display a real Kampala map** — MapLibre
3. **Load a GLB avatar with Three.js** — position it at a coordinate on the map
4. **Draw a road route and animate the avatar** — between two points
5. **Sync two browser sessions** — one race countdown

When those five tasks work, the hardest foundational integration is proven: a 3D avatar moving correctly on a real map in a web browser. **Make this the first milestone** and resist building the rest until it works reliably on a typical mobile phone.
