# Analytics plan (16 Oct 2026)

How many people play Tiral, how often they come back, what they do, and
whether the economy holds up. Written after reading the schema, the API
routes, the three Colyseus rooms, the privacy page and the deploy config.

## 1. Where we are

**Nothing measures usage today.** There is no PostHog, Plausible, Sentry or
similar, no event table, no admin page, and no "players online" counter. The
original `implementation-plan.md` listed PostHog "or a privacy-conscious
alternative" and said it could wait until the prototype proved fun. It has.

The only admin gate in the codebase is the `x-admin-secret` header on
`PATCH /api/billboards/campaigns/[id]`, and the only usage-style table is
`billboard_impressions` (viewer counts per slot per window, for advertisers).

### What the database already answers

| Table | Question it answers today |
|---|---|
| `users.created_at` | Sign-ups per day, total accounts, since launch |
| `users.last_seen_at` | Who was active *today* (written at most every 5 min by `/api/player`, which the app polls every minute). Not historic. |
| `tiktok_accounts` | Guest vs TikTok-linked split |
| `races`, `race_results` | Races per day, field size, finishers and positions, per-player race history |
| `coin_ledger` | Every earn and spend with a `reason` and receipt `meta`: race pay, `hustle_<gig>` jobs, food, rent, shocks, fines, fuel, bike buys/leases/service, stock. Append-only, so it is a trustworthy money event log. |
| `life_events` | Rent paid / evicted, family requests (paid, refused, expired), shocks, KCCA raids |
| `bikes`, `bike_items` | Ownership funnel: rented → leasing → owned, decorations bought |
| `billboard_impressions` | Ad views per campaign |
| Game server `/races` | Open race lobbies right now (Colyseus `matchMaker.query`) |

So sign-ups, race volume, hustle jobs and the whole economy can be charted
**from day one, with history**, with nothing new recorded.

### What nothing records

- **Visits before sign-in.** The landing page and the sign-in gate leave no
  trace; a guest account only exists once "Play as guest" is tapped. The
  landing → guest → first race funnel is invisible.
- **Activity history per player.** `last_seen_at` is one timestamp, so DAU,
  WAU, MAU and D1/D7/D30 retention cannot be reconstructed for past days.
  (Ledger rows and race results are a proxy for players who earned or raced,
  but miss anyone who only looked around.)
- **Races that did not finish.** `persistResults` returns early when nobody
  reached the treasure, so a timed-out race has no row. Players who raced
  but did not finish are only implied by `player_count − finishers`. Lobbies
  that never filled, and players who joined and left before the countdown,
  leave nothing.
- **Hustle failures.** `failJob` (abandoned, late, no-show, broke down) only
  bumps stress and sends a message; nothing lands in the DB. Shift length,
  offers declined and jobs per shift are unknown. Stall mini-games record
  only the payout (no perfect-rolex rate, no per-car score).
- **Session length, device, errors.** `deviceTier.ts` classifies phones on
  the client but never reports it. No crash or JS error reporting. No frame
  rate or load-time numbers from real phones (the audit asked for these).
- **Attribution.** No referrer or UTM capture, so a TikTok clip's effect on
  sign-ups cannot be seen.
- **Admin access.** No admin flag on users and no admin UI; only the header
  secret above.

### Constraints that shape the design

- **Privacy page** promises: gameplay data is used "to improve the game", no
  selling, no advertising use, no real-world GPS. First-party usage
  recording fits that wording with a one-line addition. A third-party
  tracker would need a bigger rewrite of the policy.
- **Mobile data budget.** The October audit cut the landing payload hard
  (P1-6). A PostHog/Mixpanel browser SDK adds roughly 50–100 KB gzipped to
  every visit on Ugandan mobile data. A first-party beacon is under 1 KB.
- **One VPS, Docker Compose, Postgres on the host, no Redis.** Self-hosting
  PostHog (ClickHouse, Kafka, Redis) is far too heavy for this box.
- **Kampala day** (UTC+3) helpers already exist in `@tiral/game-core`
  (`kampalaDay`, `kampalaDayStart`); every daily number should use them so
  the dashboard agrees with the daily caps the game enforces.

## 2. Approach: first-party analytics in Postgres

Keep everything in the database we already run, next to the ledger and race
results it will be joined with. Three layers, each shippable on its own:

1. **Rollup queries over existing tables** plus one tiny new table
   (`user_activity_days`) that makes retention measurable going forward.
2. **An event log** (`analytics_events`) fed by the web app (page views,
   sign-in funnel) and the game server (race and hustle lifecycle), so the
   gaps above close.
3. **An admin dashboard** at `/admin` in the Next.js app, gated by the
   existing session cookie plus an allow-list of user ids.

PostHog Cloud remains an option later for funnels and session replay; the
event log is designed so it could be forwarded there without changing the
game. Grafana pointed at a read-only Postgres role is a cheap *ops* view
(server load, query times) but is not the product dashboard.

## 3. Phases

### Phase A — numbers from existing data, and activity days (≈1 day)

Deliverable: `GET /api/admin/stats` returning JSON for every metric in §4
that existing tables can answer, and the two cheapest new signals.

- **`user_activity_days (user_id, day)`** with a primary key on both. The
  `/api/player` route already rate-limits `touchLastSeen` to once per 5 min
  per player per process; add one `insert … on conflict do nothing` to that
  same gate. One row per player per Kampala day. This single table gives
  true DAU/WAU/MAU, stickiness and D1/D7/D30 retention from the day it
  ships. Backfill the past from `coin_ledger.created_at` and
  `race_results.finished_at` (players who earned or raced) so the chart is
  not empty on day one; mark backfilled days with a flag.
- **Indexes** for daily rollups: `users(created_at)`, `users(last_seen_at)`,
  `coin_ledger(created_at)`, `coin_ledger(reason, created_at)`. Migration
  `0013`.
- **`packages/db/src/analytics.ts`**: one function per card (sign-ups by
  day, active by day, guest/linked split, races by day with finishers vs
  field, hustle jobs by gig by day, BNG minted vs burned by reason by day,
  balance distribution, evictions and refused requests, bikes by status,
  impressions by campaign). Plain `date_trunc` SQL over indexed columns is
  fine at current volume (thousands of rows, not millions).
- **Live counts** from the game server: add `GET /stats/live` next to
  `/races` on port 2568 (rooms by type, connected clients, racing vs lobby).
  Only players inside a room count; hub browsers are counted by the
  activity-day table instead.
- **Admin gating**: `ADMIN_USER_IDS` (comma-separated user uuids) in
  `web.env`; a `lib/admin.ts` helper that reads the session cookie and
  checks the id. No migration, no new login. Keep `ADMIN_SECRET` for the
  header-only billboard route.

### Phase B — event log (≈1–2 days)

Deliverable: the funnel and the gaps in §1 become measurable.

- **`analytics_events`**: `id, user_id (nullable), anon_id, name, props
  jsonb, created_at`, indexed on `(name, created_at)` and `(user_id,
  created_at)`. No IP, no raw user agent; `props` carries device tier, path,
  referrer host and UTM tags only.
- **Event catalogue** typed in `@tiral/game-core` so the web, the server and
  the dashboard agree on names:
  - Web: `page_view` (landing, hub, play, hustle, home, wallet, leaderboard),
    `signin_guest`, `signin_tiktok`, `intro_completed`, `race_join_clicked`,
    `hustle_opened`, `device_tier`.
  - Game server (server-truth, no client input): `race_countdown_started`,
    `race_started` (field size, destination), `race_finished` (finishers,
    DNFs, duration), `race_timed_out`, `lobby_abandoned`, `player_dnf`,
    `hustle_shift_started/ended` (gig, jobs done, failed, net, duration),
    `hustle_job_failed` (reason), `stall_shift_ended` (rolexes, perfect
    count, raids, cars washed).
- **`POST /api/track`**: accepts a small batch, validates names against the
  catalogue, drops unknown props, caps body size, 204 always. Client sends
  with `navigator.sendBeacon` from a 2 KB `lib/track.ts`, buffered and
  flushed on hide/unload. `anon_id` is a random id in `localStorage` that is
  attached to the user on sign-in (so the pre-sign-in funnel joins up). Add
  a `tiral_track` nginx rate-limit zone like the others.
- **Server emits** call `recordEvent()` from `@tiral/db` at the phase
  changes in `RaceRoom`, `HustleRoom` and `StallRoom` (fire-and-forget,
  `withRetry` not needed; losing an analytics row is fine).
- **Privacy page**: one bullet under "Data we collect": "how the game is
  used (pages opened, races and hustles played, phone performance class)
  to improve it; no third-party trackers."
- **Retention**: delete `analytics_events` older than 180 days with a
  nightly `DELETE` in the game server (it already runs intervals); rollups
  in §4 are computed live, so nothing else depends on old rows.

### Phase C — dashboard (≈1–2 days)

Deliverable: `/admin` in the web app, phone-friendly like the rest, server
components so the data never ships to non-admins.

Cards, in order of what a founder checks first:

1. **Live**: players in rooms now, open lobbies, races in progress.
2. **Users**: total, new today / 7 d / 30 d, guest vs linked, sign-ups by
   day (chart), linked-after-guest conversion.
3. **Activity**: DAU / WAU / MAU, stickiness (DAU÷MAU), retention table
   (D1, D7, D30 by sign-up week), active-by-day chart.
4. **Funnel**: landing views → guest → first race joined → first race
   finished → TikTok linked, with drop-off percentages (Phase B data).
5. **Gameplay**: races by day, average field, finish rate vs DNF, timed-out
   races, lobby wait; hustle jobs by gig by day, fail rate by reason;
   rolex perfect rate, raids, cars washed.
6. **Economy**: BNG minted vs burned by day and by reason, median balance,
   share of players under 1,000 BNG, rent paid vs evicted, family requests
   paid/refused/expired, bikes rented/leasing/owned/repossessed.
7. **Ads**: impressions by campaign and slot, revenue in UGX by month.

Charts as inline SVG (the `dataviz` skill's defaults) or a small lib loaded
only on `/admin` with `next/dynamic`, so nothing is added to the game
bundle. Period picker: 7 d / 30 d / 90 d / all. CSV export per card.

### Later (not in this plan's estimate)

- **Errors**: Sentry (free tier) or self-hosted GlitchTip, with a sampling
  rate; or a `client_error` event into the same log to start.
- **Performance from real phones**: Web Vitals (LCP, INP) and the audit's
  requested frame-rate samples as `perf` events, broken down by device tier.
- **Forwarding** the event log to PostHog Cloud if funnels and session
  replay are wanted; the catalogue makes that a one-file adapter.

## 4. Metric definitions

| Metric | Definition |
|---|---|
| Sign-up | A `users` row; "linked" if a `tiktok_accounts` row exists |
| Active (a day) | A `user_activity_days` row for that Kampala day |
| DAU / WAU / MAU | Distinct active users in the last 1 / 7 / 30 Kampala days |
| Stickiness | DAU ÷ MAU |
| D*n* retention | Of users created on day *d*, share active on day *d+n* |
| Race | A `races` row; finishers = `race_results` rows; DNF = `player_count − finishers`; timed-out = `race_timed_out` event |
| Finish rate | finishers ÷ player_count, per day |
| Hustle job | A `coin_ledger` row with reason `hustle_<gig>`; failed jobs from `hustle_job_failed` events |
| Minted / burned | Sum of positive / negative `coin_ledger.delta` per day, grouped by reason |
| Broke | Balance under 1,000 BNG (price of a race finish) |
| Impression | A `billboard_impressions` row, weighted by `viewer_count` |

All days are Kampala days via `kampalaDay()`.

## 5. Decisions needed before building

1. **First-party in Postgres (recommended) or PostHog Cloud?** First-party
   costs nothing new to run, adds no weight to the game, and matches the
   privacy page. PostHog gives funnels and session replay out of the box but
   adds a tracker SDK and a data processor outside the VPS.
2. **Admin gating by `ADMIN_USER_IDS` allow-list (recommended) or a `role`
   column on `users`?** The allow-list ships without a migration and uses the
   existing session; a column is cleaner once there is more than one admin.
3. **Backfill activity days from the ledger and race results?** Recommended
   so retention charts are not blank on day one; the backfilled days are
   flagged and slightly under-count browsers-only sessions.

## 6. Files touched

| Phase | Files |
|---|---|
| A | `packages/db/src/schema.ts`, `packages/db/drizzle/0013_*.sql`, `packages/db/src/analytics.ts`, `packages/db/src/users.ts` (activity upsert), `apps/web/src/app/api/player/route.ts` (call it under the 5-min gate), `apps/web/src/lib/admin.ts`, `apps/web/src/app/api/admin/stats/route.ts`, `apps/game-server/src/index.ts` (`/stats/live`), `infrastructure/docker/server-env.example` (`ADMIN_USER_IDS`) |
| B | `packages/game-core/src/analytics.ts` (event catalogue), `packages/db/src/schema.ts` + migration `0014`, `packages/db/src/events.ts`, `apps/web/src/lib/track.ts`, `apps/web/src/app/api/track/route.ts`, hooks in `app/page.tsx`, `SignInGate.tsx`, `FirstRunIntro.tsx`, `Hub.tsx`, `play/page.tsx`; emits in `RaceRoom.ts`, `HustleRoom.ts`, `StallRoom.ts`; `nginx-tiral.conf` (track zone); `privacy/page.tsx` |
| C | `apps/web/src/app/admin/layout.tsx` (gate), `admin/page.tsx`, `components/admin/*` (cards, charts), `README.md` (admin section) |

## 7. Status

**Phase A built (16 Oct 2026), not yet deployed.** Migration `0014_activity_days`
adds `user_activity_days` (with the backfill) and the stats indexes;
`touchLastSeen` records the day; `getAdminStats()` in `@tiral/db` answers
`GET /api/admin/stats?days=30` for an allow-listed player (`ADMIN_USER_IDS`)
or a script with the `x-admin-secret` header; the game server answers
`GET /stats/live` (nginx proxies it). Verified on a scratch database with
seeded players, races and ledger rows. To turn it on: run the migration on
the VPS database, set `ADMIN_USER_IDS` in `web.env`, reload nginx.
Phases B (event log) and C (dashboard) are next.
