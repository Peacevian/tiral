# Career roadmap: porter to tycoon

Tracks building the career tiers planned in
[economy-progress.md §18](economy-progress.md) (the numbers live there; this
file tracks the work). Tick items as they land; note the commit next to a
phase when it ships.

**Target:** about 20 hours of play from porter to Tycoon (a week at 3 h a
day). Progress depends on time played; energy and food are the brake.

| Tier | Unlock | Put into the business | Net per hour of play |
|---|---|---|---|
| 1 Street jobs | open (ladder, §17) | — | ~125k |
| 2 Small business | 500,000 | ~150k | ~900k |
| 3 Town business | 5,000,000 | ~2M | ~8M (grows with reinvestment) |
| 4 Big business | 50,000,000 | ~20M | ~35M |
| 5 Tycoon | 250,000,000 net worth | — | — |

**Status key:** ⬜ not started · 🟡 in progress · ✅ shipped

| Phase | What | Migration | Status |
|---|---|---|---|
| — | Hustle ladder (porter → car wash → boda → rolex) | no | ✅ `a5975ac` |
| 0 | Foundations (inside 1–2) | no | 🟡 tier rules and big-amount check done |
| 1 | Tier 1 rebalance | no | ✅ `99899a4` |
| 2 | Career path and moving up | no | ✅ live (moving up shipped with 3a) |
| 3a | LivTok mitumba (+ moving up) | **yes** (0015) | ✅ live |
| 3b | Mobile money kiosk | maybe | ⬜ |
| 3c | Salon / phone repair | maybe | ⬜ |
| 4 | Town business (boda fleet, wholesale shop) | **yes** | ⬜ |
| 5 | Big business (property, imports) | **yes** | ⬜ |
| 6 | Tycoon and showing off | no | ⬜ |

---

## Phase 0: Foundations
- [x] Tier rules in game-core (tiers.ts): tiers, capital, investment,
      savings towards the next tier. Net worth = coins until businesses exist.
- [ ] Your tier read from the coin ledger (a one-time "invested in your first
      business" entry per tier); no migration.
- [x] Big amounts: balances are summed as bigint (safe far past 250M);
      single entries are int4 (fine to ~2.1B each).
- [x] Anti-farming without daily caps: jobs are paced by the server (walking
      and riding speed, customer arrivals, car arrivals) and a car can't be
      paid faster than a person can wash it.

## Phase 1: Tier 1 rebalance
- [x] Remove the daily limits: porter (20), car wash (4), boda (15), rolex
      shifts (2).
- [x] Porter pay ×1.5 (measured: ×2.5 would overshoot to ~200k/hour).
- [x] Boda: fare ×1.6, fuel 0.2/m, more time before "late" (real trips all
      netted 0 before).
- [x] Car wash: next car in 45–75 s; no pay faster than 2.5 s a panel.
- [x] Rolex: fewer customers a minute (no shift limit).
- [x] Update game-core tests (64 pass).
- [x] Time real play from the live ledger; numbers in economy-progress §18.1.
- [x] Update the hustle cards' pay text and the career path's pay hints.
- [x] Deploy (16 Oct).

## Phase 2: Career path and moving up
- [x] Tier labels on the Earn BNG career path.
- [x] Savings bar ("Small business: 230,000 / 500,000"); the Earn BNG row
      shows it once every street job is open.
- [x] "Move up" screen: put ~150k into your first business → Small business
      owner; inbox note (shipped with 3a). Share card: later.
- [x] Kampala Rich List (net worth = coins for now): a "Rich list" tab on
      Ranks (`/leaderboard?board=rich`), with your own rank.
- [x] Deploy part one (16 Oct).

## Phase 3: Tier 2, Small business
### 3a LivTok mitumba (named LivTok, 16 Oct)
- [x] **Migration 0015** (`users.followers`, `livtok_stock`); applied to the
      test DB and the VPS (17 Oct).
- [x] Rules in game-core (livtok.ts): bales (tops 150k/100, jeans 300k/80,
      dresses 600k/60), grade mix with bad bales, prices low/fair/high, sale
      chance, viewers and followers, ghosting 12%, delivery 1,000 (tests).
- [x] LiveRoom on the game server: Owino market, 4-minute live, simulated
      viewers/comments/claims, pay-up and one ledger payment per live.
- [x] Moving up (POST /api/career/move-up): 5 rolex shifts + TikTok + 500k →
      150k becomes your first tops bale, 50 followers, inbox note.
- [x] Screens: Move up on the career path, LivTok setup + market, the live
      "phone", receipt; career path shows the tier and next tier.
- [x] Pace tuned: ~8–10 s a piece (~20 sold a live, ~900k/hour).
- [x] Apply migration 0015 to the VPS; deploy (17 Oct).

### 3b Mobile money kiosk
- [ ] Float vs cash balancing mini-game; commission per transaction.
- [ ] Tune; deploy.

### 3c Salon / barber kiosk, phone repair
- [ ] Design, build, tune; deploy.

## Phase 4: Tier 3, Town business
- [ ] **Migration:** businesses you own (type, size, assets); feeds net worth.
- [ ] 4a Boda fleet: buy bikes (garage/lease), simulated riders, send them
      out, collect dues; crashes, theft, breakdowns; managed while playing.
- [ ] 4b Kikuubo wholesale shop: bulk stock, restock, sell to simulated
      shops (later: live sellers buy from it).
- [ ] Costs: wages, upkeep, weekly URA tax (scheduled on the game server).
- [ ] Reinvestment grows income towards ~8M/hour; deploy.

## Phase 5: Tier 4, Big business
- [ ] Property: rental rooms with simulated tenants (later: player tenants).
- [ ] Bale imports: containers sold on to live sellers.
- [ ] Hotel share / Kololo property: big, slow returns.
- [ ] Tune to ~35M/hour; deploy.

## Phase 6: Tycoon and showing off
- [ ] Net worth counts assets; Tycoon title at 250M.
- [ ] Tycoon badge on names (races, map).
- [ ] "Became a Tycoon" share poster.
- [ ] Tycoon spending: big prize races and billboards at tycoon prices.

---

## Throughout every phase
- Server-decided pay; each job pays once; rate limits; admin analytics of
  coins created per source per hour.
- Every migration shown before it's applied to the VPS.
- Tested on the test database with screenshots before deploy.
- Balance tuned by timing real play; numbers updated in economy-progress §18.

## Open decisions
- [ ] Rent rising with tier, or always the player's choice (needed by Phase 4).
- [ ] Players working for other players (Phase 5 or later; start simulated).

## Log
- **16 Oct 2026** — Roadmap written. Hustle ladder already live (`a5975ac`).
- **16 Oct 2026** — Phase 1 (tier 1 rebalance) deployed (`99899a4`).
- **16 Oct 2026** — Phase 2 part one (tier label, savings bar, Rich List) deployed.
- **17 Oct 2026** — Phase 3a LivTok mitumba and moving up to Small business live; migration 0015 applied.
