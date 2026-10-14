# Tiral Economy — progress & decisions log

Where we are on the in-game economy, how we got here, what's locked, and
what's still open. Companion to `docs/economy.md` (the forward-looking spec):
**this doc is the record; `economy.md` is the plan.**

Status: **design only — no currency code exists yet.** Current direction is
**§13 Kampala Hustle**; the build plan is **§14**.
Last updated: 14 Oct 2026.

---

## 1. What actually exists in the code today (audit)

There is **no in-game currency**. What exists:

- **Leaderboard points** — 1st = 3, 2nd = 2, 3rd = 1, computed on the fly
  (`packages/db/src/results.ts:71`, `packages/db/src/users.ts:173`). Ranking
  only — never stored, never spendable.
- **UGX** — real money for **billboard ad purchases** via Relworx
  (`apps/web/src/lib/relworx.ts`, `billboard_campaigns.amount_ugx`).
- **Migrations** run `0000`–`0005` (`0005` = `users.house_loadout`). No
  `coin_ledger` table, no balance column on `users`.
- `apps/web/src/app/api/auth/me` returns `{user:{id,displayName,avatarUrl}}`;
  `/api/profile` GET returns `user` + `stats` + `recentRaces`.
- **Rarity tiers exist** for cosmetics (common / rare / epic / legendary) in
  `packages/avatars/src/catalog.ts` (`ITEM_RARITY`, `loadoutRarity`) — no
  prices yet; everything is free.
- **Movement:** one fixed speed for everyone,
  `WALK_SPEED_METERS_PER_SECOND = 18` in `apps/game-server/src/rooms/RaceRoom.ts`.
  No sprint, no stats affect racing. Races last ~1–2 minutes.

Nothing about the economy below is built. It is the agreed design.

---

## 2. Design lineage (how we got here)

1. **First pass — BNG currency spec.** "Banange Coins" (BNG), closed-loop,
   ledger-driven, with welcome grants, faucets, sinks, transfers, anti-abuse.
2. **Lagos Life reference study.** Studied `lagoslife.app` (viral browser
   life-sim, Oct 2026) for what works and what to avoid.
3. **Pivot — survival/running economy.** Tiral is a *running* game, so the
   economy must centre on **energy → food → clothes → health**, not an
   abstract coin shop. "The whole economy should be around that for now."
4. **TikTok lens.** Acquisition is **TikTok**, so the survival loop is
   re-read as a **clip-manufacturing and one-tap-conversion engine**.
5. **Fresh brainstorm — the rivalry economy (§12).** Restarted from "what
   only Tiral has": real Kampala roads, server-timed races, a live map,
   billboards, houses. Proposes **Kings of the Road** (own a street by
   holding its record) as the core, fed by **ghost challenges** and
   **views → BNG**. Not yet reconciled with §4 — see §12.8.
6. **Lean pass (13 Oct 2026).** Cut §4 down to what fits a 1–2 minute race
   game: BNG ledger, **Energy** (sprint resource), light **Health**
   (collapse), food, cosmetics. Fullness, cooking, spoilage, gear wear,
   hydration and upkeep parked. Duels on contact were explored and
   **dropped**.
7. **Kampala Hustle (14 Oct 2026, current direction — §13).** The economy
   should depict real life for Ugandan youth: arrive with little money and
   few connections, hustle informal gigs, juggle rent, food, family and
   loans, face the pull of betting and loan apps, and work towards a
   come-up. Built on the lean pass, grounded in research (§13.1).
   **No real money ever buys coins.**

---

## 3. Locked decisions

- Currency name: **Banange Coins**, ticker **BNG**. Closed-loop, **no
  cash-out, no redemption**, no off-platform trading.
- **No real money ever buys BNG** (decided 14 Oct 2026; replaces the earlier
  "Relworx top-up packs" decision). BNG is earned in-game only. Real money
  (UGX via Relworx) stays limited to **brand billboards / sponsorships**.
  This keeps any in-game betting (§13.6) clear of real-money gambling.
- **Prices mirror real UGX** (a rolex ≈ 2,000 BNG, a room ≈ 150,000/month),
  so players recognise the numbers.
- Welcome grant: guests **10,000 BNG** ("you arrive with 10k"). The
  TikTok-linked **1,000,000** grant conflicts with UGX-scale prices and the
  "arrive broke" premise — **under review**, see open Q 25.
- Spend on **avatar clothes + house items**.
- **Tasks/quests to earn later.**
- **Only TikTok-linked users can send**; **guests cannot send.**
- **Balances are derived from the ledger, never stored.**
- Leaderboard **points stay separate** from BNG (pure ranking).

---

## 4. Earlier model — the survival/running economy

> **Superseded in part.** The lean pass and §13 Kampala Hustle replace this
> section's scope. Kept for reference; prices here are pre-UGX-scale. Top-up
> packs in §4.6 are **cancelled** (no real money buys BNG).

**Core loop: Run → Energy drops → Health at risk → Eat / rest / cook →
Clothing & shoes wear out → back to running.**
Anything that doesn't serve this loop is parked.

### 4.1 Stats (three, plus one optional)
- **Energy** — action currency. Sprinting drains fast, walking slowly,
  standing in shade near zero.
- **Fullness (hunger)** — slow time-decay. When low, energy can't refill and
  health ticks down. Forces eating on a clock.
- **Health** — consequence bar. At 0 → *collapse*: teleport home, short
  recovery debuff, drop a little unbanked BNG.
- *(Optional later)* **Hydration** — drinks restore it; heat/rain drain it.

**Design rule: low energy never hard-blocks movement** — you can always limp
home. It gates sprinting and high-reward actions only.

### 4.2 Food — the heart of the economy
Two paths; the **price gap between them is the whole game**:

**Buy ready-to-eat (instant, pricier per energy):**

| Item | Energy | Fullness | Price (BNG) | Note |
|---|---|---|---|---|
| Gonja (roasted plantain) | +15 | +10 | 200 | cheap snack, instant |
| Rolex (chapati + eggs) | +35 | +25 | 500 | the iconic fuel |
| Kikomando (chapati + beans) | +40 | +30 | 600 | lasts longer |
| Muchomo skewer | +30 | +20 | 700 | +small health |
| Soda / juice | +5 | — | 300 | hydration |
| Restaurant plate | +70 | +50 | 2,000 | +health, +mood |
| Uganda coffee | +10 | — | 400 | temporary **sprint buff** |
| Nsenene (seasonal) | +25 | +15 | 1,500 | seasonal, rare, high demand |

**Cook at home (cheaper per energy, costs a trip + time):**
- Buy raw **ingredients** at markets → cook at your **kitchen** → meal.
  Bulk ingredients ≈ 300 BNG → a +60 meal (~2× cheaper than street food).
- **Recipes** unlock with better kitchen furniture (reuses the houses work).
- **Garden plot** → passive ingredient faucet (slow free food).
- **Fridge** → store food, slows spoilage (soft sink).
- Flavour twist: meals can be slightly **under/over-cooked** (±value) or go
  **cold** if not eaten in time.

Why two paths: rich players buy and keep running; broke/new players cook.
The buy-vs-cook spread justifies top-ups (skip the trip home) **without
pay-to-win**.

### 4.3 Clothing — cosmetic + functional, durability sink
| Item | Effect | Price | Note |
|---|---|---|---|
| Running shoes | +speed, −energy drain | 5,000 | **wear out** → repair/replace |
| Cap / hat | −energy drain in sun | 1,200 | |
| Rain jacket | blocks rain health drain | 3,000 | rainy season |
| Compression gear | −energy drain on long runs | 8,000 | mid-tier |
| Backpack | carry more food/treasure | 2,500 | QoL |
| Jerseys, gomesi, kanzu, shades, chain | pure flex | 3k–250k | whale sink |

**Durability** on gear (degrades per race) = steady BNG burn that scales with
play time. Best recurring sink for a running game.

### 4.4 Health
- **Lost by:** sprinting at 0 energy, boda/cart collisions, falls, rain
  without a jacket, heat exhaustion, mugging in night/danger zones, spoiled
  food.
- **Restored by:** sleep in bed (best), a full meal, **free rest spots**
  (benches/shade/water taps — slow), medicine, hospital/doctor (fast, pricey).
- Free restore points exist so a penniless player can always recover.

### 4.5 Faucets (tuned so ~1 race ≈ 1–2 meals)
- Race placement: 1st +120 / 2nd +70 / 3rd +40, finish +10.
- Treasure chest: +200 common / +1,000 rare.
- Daily quest (1–3): +150 each. 7-day streak: +500.
- **Running delivery/errand gigs** (on-theme): carry a package across town
  → +80–200.
- First-discovery bonus: +250.

### 4.6 Sinks
- Avatar clothes + house items (already locked).
- Shop tiers: Common 2k–5k · Rare 15k–40k · Epic 100k–250k ·
  Legendary 750k–1.5M.
- **Weekly house upkeep** (scales by house tier) — the Lagos "rent" lesson,
  as a flat upkeep rather than progressive tax.
- Gear durability repairs.
- Billboard shout-out: 25,000 BNG / 24h (in-game board, not the UGX ads).
- Staked races: entry fee, winner takes pot minus **10% rake**.
- ~~Relworx top-up packs: 5k / 25k / 100k BNG.~~ Cancelled — no real money
  buys BNG.

### 4.7 Home = survival hub
Kitchen (cook), bed (sleep), fridge (store), shower (hygiene/mood), garden
(grow). Better house = cheaper survival — finally gives house upgrades an
economic reason.

### 4.8 Social layer (later)
- Share/gift food (TikTok-only send still applies).
- **Player-run food stalls** — cook and sell meals to other players. An
  emergent, player-driven economy built entirely on the survival loop.
- Cook for house visitors.

### 4.9 Time, weather, flavour
- Day/night + Kampala rain/heat drive which gear you need → clothes become
  situational.
- Ugandan flavour throughout: rolex, matooke, kikomando, gonja, nsenene,
  mukene, muchomo, Uganda coffee — leans into "Uganda is a running nation."

---

## 5. TikTok is the acquisition engine (design constraint, not a channel)

**Funnel:** see clip → tap link (no download, web) → play as guest in <5s →
first rolex moment → hit a small want → "link TikTok, get 1,000,000 BNG" →
survive & share → their clip recruits the next player.

### 5.1 Why a food/energy economy is TikTok-perfect
Hunger is universal, instantly understood, cheap to depict, and **funny when
it goes wrong**. Lagos Life goes viral on *class*; we go viral on **the
struggle + the come-up**.

### 5.2 Shareable moments to engineer on purpose
- **The collapse** — faint at 0 energy/health; slow-mo + "Banange!" splash.
- **The last rolex** — one meal, two starving players; whoever eats wins.
- **The feed** — gift food to a fainting stranger; kindness content.
- **The cook-off** — two players race to cook a meal; live timer.
- **Nsenene season** — limited-time drop; scramble + FOMO.
- **The come-up** — day 1 broke → day 30 king progression.
- **Brand drops** — a real food truck's meals rain on the city for 10 min.

### 5.3 First 60 seconds
- Guest spawns with 10,000 BNG + one free snack; tutorial nudges a street
  rolex purchase (instant sensory + cultural win).
- Then the wall: *"Running is hungry work. Link TikTok → 1,000,000 BNG."*
- **Auto-generate vertical clips** on key moments (first meal, first win,
  first faint) watermarked + "Banange!" sound.
- **Share-to-earn:** post/link a clip → BNG or a free meal.

### 5.4 Referral & invite economy
- **Link TikTok = the 1M vested grant** (biggest conversion lever).
- Invite a friend who plays 3 races → both get food vouchers + BNG.
- **Crew/Runner tribes** with your TikTok followers; crew leaderboard +
  shared weekly reward.
- **Linked badge** on the leaderboard so linking pays (status + perks).

### 5.5 Creator program (the growth budget)
- Sponsor Kampala TikTok creators with BNG + cosmetic drops.
- **Cameo/celebrity avatars**, visitable houses ("come raid my kitchen"),
  billboards showing creators.
- **Creator food drops** recruit followers into their city.
- **Creator-designed clothes/meals** with revenue share.

### 5.6 Trend & challenge formats
`#BanangeChallenge` (survive N days on 10k, no top-up) · `#BrokeBoyRun`
(how far on empty before you faint) · `#FeedMeDuet` · `#CookOff` ·
`#ComeUp` · community goals (feed the city 100k meals → server reward).

### 5.7 Live & gifting bridges
- **Live gifting hack:** viewers' TikTok gifts trigger in-game food/BNG to a
  streamer's avatar. *(Feasibility: no public TikTok API for LIVE gifts or
  comments — would rely on unofficial libraries. See §12.7.)*
- **Brand-sponsored food:** real Ugandan food brands pay **UGX** (existing
  Relworx/billboard path) for a free food drop → logo on the clip → their
  TikTok campaign. Brand pays us, brand markets us.
- **"Send a meal" deep link** from a TikTok comment lands a new user in-game.

### 5.8 UGC, clout & status
- TikTok handle on leaderboard + avatar from TikTok pfp.
- **Clout rank** (followers/crew size → cosmetic titles) separate from BNG,
  never pay-to-win.
- **In-app clip studio** (trim, add sound, post) — the easiest possible
  export to TikTok is a growth feature, not a nice-to-have.

### 5.9 Rule of thumb
**TikTok is loud in marketing, thin in architecture.** The game must survive
TikTok disappearing — login + share only, never load-bearing (kept from
`economy.md` §9).

---

## 6. Reference study — lagoslife.app

Free browser Sims-style life-sim set in a shared Lagos (18+, no install),
viral Oct 2026. (Homepage is a JS app; findings are from third-party guides
and reported in-game observations, so treat specifics as *reported*.)

- **Birth lottery:** Nepo Baby (₦500k, flat, car, job) vs LAPO Baby (₦60k
  loan, ₦72k debt at ₦12k/week, skills learn 25% faster). The direct
  ancestor of our guest-10k vs TikTok-1M split.
- **Currency:** Game Naira — fictional, no cash value, no withdrawal.
  Optional one-way wallet top-up (Flutterwave). Terms ban selling for cash,
  duplication, exploits, automation.
- **Loop:** six needs bars decay; work earns, food restores, rent every
  Saturday or you lose the home.
- **Earning:** jobs ₦6,600–₦99,000/shift, gigs, daily goals, server-wide
  daily gem hunt; per-action cooldowns.
- **Sinks:** rent ₦1,200–₦1,500,000/week, moving = 3× rent, food,
  transport, furniture, **progressive tax** (first ₦1,000,000/week tax-free,
  then 20/40/45%).
- **Systems:** businesses/property with daily income + bad-day risk, savings
  0.5%/wk, bonds 2%/7d, elections, police/EFCC.
- **Social:** visit houses, chat, restricted player transfers.

**Lessons:** copy the fictional closed-loop + one-way top-up, the class
onboarding hook, the recurring sink, daily goals, and restricted transfers.
Adapt the birth lottery (themed + vested), gem hunts (our chests/tasks), and
businesses (our player food stalls). Avoid the heavy pressure (lock-outs,
debt spirals) and do **not** reuse a fiat symbol — **BNG** stays clean.

---

## 7. Ledger & anti-abuse design

- **`coin_ledger`** (immutable, append-only): `id, user_id, delta, reason,
  race_id, counterparty, created_at`. **Balances derived, never stored.**
- **Reasons:** `grant, placement, finish_bonus, pathfinder_bonus,
  daily_quest, streak_bonus, chest, entry_fee, prize_payout, rake, upkeep,
  purchase, tip, transfer_in, transfer_out, refund`.
- **Dedupe** on `(reason, race_id)` so a race pays once.
- Server-validated awards only; client never declares balances.
- Rate limits per user/day; `race_id` dedupe; OAuth for any
  transfer-capable state.
- **Transfer gates:** TikTok-linked sender, account ≥30 days, ≥10 races,
  **50,000 BNG/day cap**, 5% fee (sink). Guests may **receive**.
- Terms: no real-world value; no purchase path for BNG; duplicated/
  exploited balances may be reversed; no off-platform trading.

---

## 8. Code hook points (where the build lands)

- `packages/db/src/schema.ts` — add `coin_ledger`; migration `0006`.
- `packages/db/src/{users,results}.ts` — `awardCoins()` / `getCoinBalance()`;
  wire into `recordRaceResults`. (Points math at `results.ts:71`,
  `users.ts:173`.)
- `packages/game-core/src/` — pure stat/economy tables (energy drain, food
  values, earn table) → likely `economy.ts`.
- `packages/houses/src/catalog.ts` — furniture gains survival roles
  (kitchen/bed/fridge/garden).
- `apps/game-server/src/rooms/RaceRoom.ts` — race-finish → coin award; later
  energy drain + food consumption.
- `apps/web/src/app/api/{auth/me,profile}/route.ts` — BNG balance in payload.
- `apps/web/src/components/game/TopBar.tsx` + profile HUD — BNG balance chip.
- `apps/web/src/components/ProfileCustomizer.tsx`,
  `components/house/HouseCustomizer.tsx` — spend surfaces.
- `apps/web/src/lib/relworx.ts` — ~~reuse for BNG top-up packs~~ (cancelled; Relworx stays billboards-only).

---

## 9. Build order (proposed — superseded by §14)

1. **Ledger + needs model.** Migration `0006` `coin_ledger`;
   `awardCoins()`/`getCoinBalance()`; pure energy/fullness/health decay in
   `game-core`.
2. **Race-finish awards** wired into `RaceRoom` + `recordRaceResults`.
3. **Food economy v1** — street food buy; "raw item → cook at home" kitchen;
   energy/fullness restore; collapse + respawn.
4. **Balance API + HUD chip.**
5. **Clothing store (functional shoes first)** + gear durability.
6. **Weekly upkeep** sink.
7. **Transfers.** ~~Relworx top-up packs~~ (cancelled).
8. **TikTok link (OAuth) + vested 1M grant + referral.**
9. **Tasks/quests, chests, streaks.**
10. **Player food stalls, creator program, clip studio, live bridges.**

---

## 10. Open questions (need a decision)

1. **Offline decay:** drain energy/fullness while logged out, or freeze?
   *(lean: freeze energy, slowly decay fullness.)*
2. **Collapse penalty:** respawn + debuff only, or also a BNG/treasure loss?
3. **Cooking depth:** full ingredient+recipe system, or v1 = "buy raw item →
   one-button cook at home"?
4. **Functional clothes** (shoes/rain gear affect energy/speed) vs
   cosmetic-only at launch? *(lean: functional shoes only in v1.)*
5. **Player food stalls**: v1 or later?
6. **Welcome gap:** vest the 1M (100k liquid + 900k over 90d) vs plain 1M vs
   shrink to ~250k?
7. **Upkeep vs tax:** flat weekly upkeep vs progressive weekly tax vs none?
   *(lean: flat upkeep.)*
8. **Guests receive gifts:** yes or no? *(lean: yes.)*
9. **Transfer gates:** 30d + ≥10 races + 50k/day + 5% fee — ok?
10. **Points vs BNG:** keep separate? *(lean: yes.)*
11. **Shop gating:** new-items-only, or also gate existing free cosmetics?
    *(lean: new-items-only.)*
12. **TikTok link gate:** OAuth (safer vs bot farms) or lighter "@handle"
    entry?
13. **Auto clip export** at launch, or share-sheet for v1?
14. **Creator program** now, or organic-first?
15. **Live gifting bridge** — worth the hacky overlay, or park?
16. **Lead signature format:** `#BanangeChallenge` or `#BrokeBoyRun`?
17. **Name:** keep **BNG**, or make **"Banange"** the currency *and* the
    sound/brand?

---

## 11. Risks log (do not delete)

- **Chore risk** — hunger must be funny and short, never a grind that kills
  a fast game.
- **Paywall perception** — free survival paths (cooking, free rest spots)
  are mandatory; TikTok will roast a paywall fast.
- **Sybil/bot farms** on the 1M link bonus — vest it, OAuth-only, gate
  transfers.
- **Moderation/child safety** — 18+ framing; no real-cash trading; clear
  "no cash value" terms.
- **Cultural respect** — get Ugandan food/terms right, with creators, not at
  them.
- Carried from `economy.md`: free players are a cost center; paid races need
  seeded liquidity + anti-cheat; closed coins only motivate if cosmetics are
  desirable; TikTok dependency is existential; cash-out = becoming a fintech
  (deferred).

---

## 12. Fresh brainstorm — the rivalry economy

Started over from one question: **what does Tiral have that no other TikTok
game has?** Real Kampala streets, server-authoritative race timing, a live
shared map, billboards, player houses. Every idea below is built on those,
and on one bet: **player-vs-player conflict makes better TikTok content than
solo moments.**

Status: **brainstorm — nothing locked.**

### 12.1 Kings of the Road (core pick)
Strava segments × TikTok beef.
- The road graph is cut into named **segments** (Jinja Road, Nakasero Hill,
  the Owino shortcut…). Fastest server-validated time through a segment
  **owns it**.
- The owner's TikTok handle + avatar is shown on that stretch of the live
  map. The city becomes a visible leaderboard.
- **Economy:** owners earn a small **system-paid tribute** (BNG) every time
  anyone runs their segment; busier roads pay more. Owned roads = passive
  income. Runners never pay to move.
- **TikTok hook:** a dethroning auto-generates a clip — *"@sam just took
  Jinja Road from @brian 👑"* — tagging the old owner. Losing a road is a
  reason to come back and post a reply.
- **Feasibility:** high. `RaceRoom` already tracks server-side positions on
  the road graph; segment entry/exit timing is an extension of that.

### 12.2 Ghost challenges (supporting)
Duets, but for races.
- Every race is recorded as a **ghost** (position samples). Share a link:
  *"Beat my Nakasero → Owino: 2:41."*
- The challenger races the ghost solo — no lobby needed. Both stake BNG
  into a **pot**; winner takes it minus a rake (sink).
- **TikTok hook:** auto-rendered **split-screen clip** (you vs ghost) —
  the native duet/stitch format. A challenge link in a bio is a permanent
  funnel.
- **Side benefit:** fixes the empty-lobby problem — there's always someone
  to race.
- Ghost runs on a segment can take the crown (§12.1) — ties the two together.

### 12.3 Views → BNG (supporting)
Your clip is your paycheck.
- Big moments (photo-finish, road takeover, shortcut nobody saw) are cut
  into vertical clips automatically.
- Posted via TikTok **Content Posting API**; Tiral reads the post's **view
  count** via the **Display API** (own videos only) and pays BNG at tiers
  (e.g. 1k / 10k / 100k views).
- **Economy:** reach becomes a faucet. Every payout is distribution we'd
  otherwise buy with ads.
- **Guards:** only Tiral-generated clips count, daily caps, payouts vest
  over 48h, one payout per tier per clip.

### 12.4 The clue is in the video (creator drops — later)
- A creator **funds a chest** with BNG and drops it on any walkable spot.
  The location is never shown in-game — the **only clue is in their TikTok
  video** (*"near the best rolex in Wandegeya 👀"*).
- Followers decode, open Tiral, race. First arrival takes the chest.
- **TikTok hook:** the video *is* the game; comment sections argue over
  the clue.
- **Economy:** chests are a creator sink; creators earn follows + a
  finder's-fee cut. Reuses the pin-drop bounty idea from `economy.md` §3.

### 12.5 Billboard fame (later)
- Extend the existing billboard system with **player slots**: rent a board
  for 24h with BNG to show your clip or avatar + handle.
- Brands keep premium slots (UGX, Relworx); players bid BNG for the rest.
- **TikTok hook:** *"I put my face on a billboard on Kampala Road."*
- **Economy:** an endless status sink on infrastructure that already exists
  (replaces the flat 25k "shout-out" in §4.6).

### 12.6 Crew turf wars (later)
- Linked users form **crews** from TikTok mutuals. Crews pool owned
  segments (§12.1) into **turf** — neighbourhoods painted in crew colours.
- Weekly turf payout into a crew bank; leaders decide the split.
- **TikTok hook:** *"Kololo is ours now"* + crews recruiting followers to
  defend turf.

### 12.7 The loop, and constraints

```
Run a segment → beat the record → own the road (map + tribute BNG)
      ↓                                         ↓
auto clip "@you took X from @them"    rival notified → ghost-challenges back
      ↓                                         ↓
post to TikTok → views pay BNG   →   new players tap link → race the ghost
```

- **TikTok APIs:** Login Kit, Display API (own videos + view counts) and
  Content Posting API exist. **Direct posting needs app audit** — until
  then clips land in the user's TikTok drafts. **No public API for reading
  comments or LIVE gifts**, so comment-/gift-triggered mechanics are out.
- **Gambling exposure:** ghost pots are stakes. Keep BNG closed-loop (§3);
  since no real money buys BNG (decided 14 Oct), all staked BNG is earned.
- **Anti-cheat:** segment records only from server-validated movement;
  reject physically impossible times; tribute requires a minimum number of
  distinct runners per day; no tribute for running your own segment.
- **Rule of thumb (§5.9) still holds:** if TikTok disappears, segments,
  ghosts and tribute still work; only the clip faucet goes dark.

### 12.8 How this relates to §4 (undecided)
Three options:
1. **Replace** the survival economy with the rivalry economy.
2. **Layer:** rivalry is the core loop; survival shrinks to light flavour
   (food as a sprint buff, shoes as cosmetics + small durability sink).
3. **Keep survival as core**, rivalry as a mode.

*(lean: 2 — rivalry is more TikTok-native and lighter to build; survival
risks the chore problem in §11.)*

### 12.9 New open questions
18. Relationship to §4: replace / layer / keep (see §12.8)?
19. **Segment cutting:** auto (junction-to-junction, merged to ~300–800 m)
    or hand-curated named landmarks?
20. **Tribute rate** and daily cap per owner?
21. **Crowns decay?** Does a record expire after N days so roads churn, or
    stand forever?
22. **Ghost pots:** allowed for guests? Earned-BNG-only?
23. **Views → BNG tiers** and caps; rely on drafts until audit passes?
24. Clip rendering: **client-side** (canvas capture) or **server-side**
    render pipeline?

**Kampala Hustle (§13):**
25. **TikTok-link grant** at UGX scale: drop the 1,000,000, or replace it with
    connections + a modest bonus (e.g. 20,000)?
26. **Game clock:** real days (rent every real week) or a faster in-game day?
27. **Betting:** include BetLeo at all? If yes, confirm caps, 18+ framing
    and how it's presented (cautionary vs neutral).
28. **Starting archetypes** (e.g. village arrival vs city-born, Lagos-Life
    style) or everyone starts the same?
29. **Transfers:** keep "TikTok-linked only can send" — and allow sending to
    family/friends as a gameplay action?

### 12.10 Code hook points (if built)
- `packages/road-graph/src/index.ts` — segment definitions + lookup by edge.
- `apps/game-server/src/rooms/RaceRoom.ts` — segment entry/exit timing in
  the movement tick; ghost sampling; ghost-race room mode.
- `packages/db/src/schema.ts` — `segments`, `segment_records`, `ghosts`,
  `clips` tables; tribute via `coin_ledger` reasons `tribute`, `ghost_pot`,
  `clip_views`.
- `apps/web/src/components/MapView.tsx` / `BillboardLayer.tsx` — owner
  labels on roads; player billboard slots.
- `apps/web/src/lib/tiktok.ts` — Content Posting + Display (video list)
  scopes.

---

## 13. Kampala Hustle — the life economy (current direction)

Players start as **a young person arriving in Kampala with almost nothing**
and build a life: hustle gigs, keep up with rent, food and family, resist (or
fall for) loan apps and betting, and work towards a come-up. Races are the
**big-break events** inside that life. Tone: honest and funny, made *with*
Ugandan creators, never mocking people for being poor.

### 13.1 Research basis (Oct 2026; figures from press summaries, approximate)
- **Jobs are scarce and informal.** Youth unemployment ~16–18% (UBOS 2025;
  17.9% for 15–24 in the Apr 2026 release); ~42% of 15–24s are NEET; ~88–90%
  of workers are informal (boda, market, casual labour).
- **Pay is low.** ~Half of employed Ugandans earned ≤ UGX 200,000/month (NLFS
  2021). Minimum wage (130,000) recommended in 2018, never enforced.
- **Costs.** Rolex ~1,500–2,000; shared room ~200–270k/month; a frugal young
  person's monthly budget ~620–770k.
- **Boda riders** who don't own the bike remit ~8–10k/day to the owner before
  earning; fuel keeps rising.
- **Debt.** Instant mobile-money loans (MoKash, Wewole) with automatic
  deductions; ~61% of digital borrowers borrow for daily consumption;
  collection by threats and public shaming.
- **Betting is mainstream.** ~87% of surveyed Ugandan youth have placed a bet
  (GeoPoll 2025); local studies describe a "vicious cycle of poverty".
- **Family obligations** commit wages before they arrive.

Sources: [Ecofin](https://www.ecofinagency.com/news-services/0907-57225-uganda-s-economy-finds-work-for-only-one-in-three-young-people-entering-the-labor-market) ·
[AllAfrica — youth unemployment 17.9%](https://allafrica.com/stories/202604230738.html) ·
[NTV — UBOS 12%](https://ntv.co.ug/news/ubos-report-ugandas-unemployment-rate-stagnates-at-12) ·
[Monitor — Shs200,000/month](https://www.monitor.co.ug/uganda/business/prosper/60-of-ugandans-earn-shs200-000-per-month-4045490) ·
[GeoPoll — Betting in Africa 2025](https://geopoll.com/blog/report-betting-in-africa-2025) ·
[EPRC — betting & poverty](https://eprcug.org/eprc-in-the-news/sports-betting-youth-left-in-vicious-cycle-of-poverty/) ·
[Monitor — boda remittance](https://www.monitor.co.ug/uganda/news/national/bodas-to-pay-owners-extra-shs5-000-per-day--3872306) ·
[Uni2Study — Kampala budget](https://www.uni2study.com/articles/monthly-student-budget-kampala) ·
[Observer — digital loans](https://observer.ug/news/digital-loans-are-fuelling-new-debt-crisis/) ·
[BusinessTimes — debt culture](https://businesstimesug.com/ugandas-growing-debt-culture-in-the-digital-age/)

### 13.2 Core loop
**Hustle → earn a little → pay needs (food, rent, transport, data, family) →
stress builds → temptation (loan app, betting) or discipline (savings group,
skills) → shocks → race for the big break → come-up (or setback) → repeat.**

### 13.3 Money (BNG at UGX scale)
- Every price mirrors street prices. Start: **10,000 BNG**.
- Balances derived from the ledger only (§7); every award or spend is a
  server-validated ledger row.
- **No purchase path for BNG.** No cash-out. No trading off-platform.

### 13.4 Hustles — how you earn (running gigs on the real map)
| Hustle | Play | Pay (BNG) |
|---|---|---|
| Market porter (Owino) | carry loads stall to stall against a timer | ~5–10k/day |
| Boda courier | pick-up → drop-off across town; owner takes ~10k/day | ~20–30k net |
| Casual labour | run to a site, work a shift | ~15k |
| Races | big-break event; bounty prize ≈ a week's earnings | top prize |

Gigs reuse the existing road graph and movement; they are solo, server-timed
runs. Pay lands in the ledger only on a validated finish. **Superseded by
§16** (simulated passengers/customers, bike ownership, more gig types).

### 13.5 Responsibilities, needs and stats
- **Energy (0–100)** — the race stat (lean pass): **Sprint** ≈ 1.35× speed,
  burns energy; walking is always free; regenerates over real time (full in a
  few hours); food refills it. Speed edge capped — fed players are slightly
  faster, never unbeatable.
- **Health (0–100)** — light: sprinting on empty drains it; at 0 you
  **collapse** for ~6 s ("Banange!") and carry on, never eliminated. Restored
  by sleeping in your house's bed or a proper meal.
- **Stress (0–100)** — the life stat that captures frustration. Up: debt, late
  rent, losses, refused family requests. Down: wins, friends, rest, football,
  church. **High stress raises the frequency of loan-app and betting
  temptations** — mirroring real behaviour, not forcing it.
- **Rent** — weekly, by housing tier; your tier *is* your house (single room in
  Kisenyi → … → flat in Ntinda). Missing rent means a move **down a tier**,
  never a lock-out.
- **Food, transport, data/airtime** — small daily sinks; data gates seeing
  gigs.
- **Family events** — "Maama is in hospital, send 50k", school fees. Paying
  costs money; refusing costs stress and respect.
- **Shocks** — fuel price rise, KCCA confiscates the stall, phone stolen.

### 13.6 Traps (depicted honestly)
- **Loan app ("Fast Cash", fictional)** — instant BNG, steep fee, **automatic
  deduction from your next earnings**, nagging/shaming messages when late.
- **Betting shop ("BetLeo", fictional)** — bet on **live Tiral races between
  other players**. Odds carry a house margin, so most bettors lose over time.
  Rules: BNG only (never real money, never cash-out); no near-miss tricks; a
  plain lifetime **staked vs returned** figure on screen; daily stake cap;
  18+ framing; cool-off after big losses.

### 13.7 Escapes and the come-up
- **Savings group (VSLA/SACCO)** with friends — weekly contribution, rotating
  payout.
- **Connections** — linking TikTok adds contacts who share better gigs
  ("who you know").
- **Skills** — courses unlock better hustles (driving permit, mobile money
  agent, salon).
- **Own business** — rolex stall (daily income, bad-day risk) or your own
  boda (stop paying an owner; rent it out).
- **Status ladder** — Broke → Hustler → Stable → Boss, on the profile and in
  the house you can afford.

### 13.8 Spending
Food, rent, transport/data, family, fees and loans — plus cosmetics: outfits,
hair and trails priced by their existing rarity tier.

### 13.9 Risks specific to this direction
- **Frustration churns players** unless every bad situation has a way out
  that rewards effort. The struggle is the setup; the come-up is the payoff.
- **Betting** — even with no real money, keep it educational, capped and
  18+-framed; review platform (TikTok/app store) rules before launch.
- **Tone** — real hardship; co-create with Ugandan creators.
- **Scope** — large; ship in phases (§14) and balance with a simulation.

---

## 14. Implementation plan (phase by phase)

Each phase ships on its own, is playable, and is balanced before the next.

### Phase 1 — Coins foundation
- **DB:** migration `0006` — `coin_ledger` (`id, user_id, delta, reason,
  ref_id, meta jsonb, created_at`), unique `(user_id, reason, ref_id)` so an
  event can only pay once.
- **`packages/db`:** `awardCoins()`, `spendCoins()` (transactional, refuses to
  go below 0), `getCoinBalance()`, `listLedger()`.
- **`packages/game-core/src/economy.ts`:** pure earn table and price list at
  UGX scale.
- **Earnings:** welcome grant 10,000 (once per user); race payouts in
  `recordRaceResults` — finish, 1st/2nd/3rd, first win of the day, streak.
  Solo/empty races pay little or nothing (anti-farming).
- **API:** balance in `/api/auth/me` and `/api/profile`; `GET /api/wallet`
  (history).
- **UI:** BNG chip in the play TopBar and profile; wallet history tab.
- **Tests:** dedupe, no negative balances, payout table.

### Phase 2 — Energy, Sprint, Health, Food
- **DB:** migration `0007` — `users.energy, energy_at, health, health_at`;
  current values computed lazily from timestamps (regen over real time).
- **`game-core/src/needs.ts`:** regen, sprint drain, 1.35× cap, health drain
  on empty, collapse rules — pure and unit-tested.
- **Game server (`RaceRoom`):** `sprint` message; per-tick drain; 6 s
  collapse; load needs on join, save on finish/leave.
- **Food shop:** gonja, chapati, rolex, kikomando, a full plate (health) —
  `POST /api/shop/eat` spends BNG and applies the effect.
- **Rest at home:** the house bed restores health over time.
- **UI:** Sprint button (+ Shift on desktop), energy/health bars in the race
  HUD and profile, collapse "Banange!" overlay.

### Phase 3 — Survival life: rent, stress, family, hustles
- **Housing tiers + weekly rent** (house catalog gains tier and rent); missed
  rent → move down a tier.
- **Stress** stat + its effects (temptation frequency, slower recovery).
- **Family events and shocks** — server-scheduled, with choices.
- **Hustles v1:** market porter and boda courier as solo timed gig runs on the
  road graph (new room mode), paying through the ledger.
- **Transport/data** daily sinks.

### Phase 4 — Traps and escapes
- **Fast Cash loan app:** borrow limit, fee, auto-deduct from next earnings,
  late nags + stress.
- **Savings groups:** create/join with friends, weekly contribution, rotating
  payout.
- **BetLeo:** markets on live races, house margin, settlement from race
  results, caps, transparency stats, cool-off, 18+ gate.

### Phase 5 — The come-up
- **Skills/courses** unlocking better hustles.
- **Own business:** rolex stall and own boda (passive income with risk).
- **Status ladder** and house moves tied to rent tier.
- **Cosmetics shop:** outfits, hair, trails priced by rarity.

### Cross-cutting (every phase)
- Server-only awards; ledger dedupe; rate limits.
- A small balancing script that simulates a week of play per archetype
  (grinder, gambler, saver) before each phase ships.
- Analytics: earn/spend per day, debt levels, betting losses, churn after
  setbacks.
- **Revenue note:** with no coin sales, money comes from brand billboards,
  sponsored food/items and the creator program.

---

## 16. Hustles — the simulated gig economy (plan, 14 Oct 2026)

Gigs that never need another player. The server simulates the passengers,
customers and goods; the player does the work on the real map (or in a short
mini-game) and gets paid through the ledger. This replaces the Phase 3 "boda
courier" (§14) as the earning path that doesn't depend on other people being
online.

**Decisions taken (14 Oct):** start with **Boda passengers + Kikuubo porter**;
bike ownership goes **rent → lease-to-own → own**; **tap mini-games** for the
rolex stand and car wash while transport gigs stay on the map. Pay levels as
proposed in §16.4 (a hard-working day ≈ a little above the race cap; racing
stays the faster way to earn).

### 16.1 Research basis (Oct 2026; press and survey summaries, approximate)
- ~9 in 10 Ugandan workers are informal; youth unemployment 16.1% (18–30) and
  18% (15–24) per the UBOS 2025 Labour Market Survey; ~41% of youth not in work
  or school (NLFS). Youth stack several small hustles — so: many short gigs.
- **Boda boda** — the biggest youth job; ~⅓ of Kampala public-transport trips.
  Riders on someone else's bike pay the owner **8k–16k/day**; lease-to-own
  schemes **66k–78k/week**. One rider: ~300k/week after fuel; profits
  ~30k–40k/day before the 2026 fuel spike (petrol ~6,500/L).
- **App delivery** (SafeBoda, Glovo 3,000+ riders) — ~12 deliveries/day for
  one rider; platforms take **15–20%**, wiping out their ~12% gross edge.
- **Car washing** — 10k–20k per vehicle (Mulago washer).
- **Rolex / street food** — ~1,000 a rolex; dawn-to-midnight hours; squeezed by
  oil and flour prices; KCCA enforcement risk.
- **Mobile money agents** — 54k → 481k agents (2013–2022); a common way in.
- **Casual labour** (KCCA cleaners etc.) — 6k–18k/day, often paid late.
- Gaps: no reliable current figures for Kikuubo porters, construction labour
  or rolex profit. Figures set *relative* pay, not exact facts.

Sources: UBOS LMS 2025 presentation; Daily Monitor (owner remittances,
lease-to-own, fuel prices, NEET); The Conversation (SafeBoda study); UNCDF
(SafeBoda rider); Glovo Uganda; Global Press Journal (car washing); CS Monitor
(rolex); KFM (KCCA casual pay); Statista (mobile money agents); AllAfrica
(e-boda leases).

### 16.2 Principles
1. **Solo and always available.** Every gig works with zero other players.
2. **Server-simulated, server-paid.** Offers, passengers and customers are
   generated by the game server; the client never says "I earned X". Pay lands
   once per job via the ledger's unique `(user, reason, ref)`.
3. **Real costs, honestly shown.** Bike rent, fuel, app commission and stock
   come off every payout, itemised like a receipt.
4. **Energy is the main limiter**, with soft daily caps against farming.
5. **Always a way to earn when broke.** The porter needs nothing; the boda
   needs a rented bike; better gigs need things you buy or earn.
6. **Short sessions.** One job takes 30 s – 3 min; a "shift" is a chain of jobs
   you can stop any time.

### 16.3 The gig catalogue (rollout order)
| # | Gig | Needs | Play | Costs |
|---|---|---|---|---|
| H1 | 🧺 **Kikuubo porter** | nothing | On foot. Pick a load at a Kikuubo shop pin, carry it to another shop 150–500 m away before the timer. Loaded = no sprint bonus and sprint drains energy ×1.5. | none |
| H1 | 🛵 **Boda passengers** | a bike (rent for the day) | Go to a stage (Old Taxi Park, Wandegeya, Kikuubo, Kisementi). Passengers wait as pins with fare and destination; accept, ride them there (bike speed ≈ 2× walking). Quick = tip; slow = patience runs out, half fare; abandoned = no fare + stress. Rush hour (07–09, 17–20 Kampala) ×1.5 fares. | daily bike rent; fuel per km |
| H2 | 📦 **App delivery** | a bike (rented or owned) | "TiralEats" orders: collect at a shop/restaurant pin, deliver to a customer pin before the timer. Steadier stream than the stage. | 15% commission; fuel |
| H3 | 🍳 **Rolex stand** | stock (eggs, chapati, oil) | Set up at a busy pin; customers queue; tap-to-cook mini-game (flip, roll, serve). Leftover stock spoils at shift end. KCCA raid chance per shift (uses the existing `kcca_fine`). | stock bought up front; can lose money |
| H3 | 🚗 **Car wash** | nothing | At a washing bay pin: short tap/scrub mini-game per car; few customers, good pay each. | energy-heavy |
| H4 | 📱 **Mobile money booth** | a kiosk (bought) | Serve deposits/withdrawals; keep cash vs float balanced or turn customers away; commission per transaction. | kiosk purchase; float |

### 16.4 Pay and costs (BNG, net to the player)
| Gig | Per job (after costs) | Energy per job | Soft cap |
|---|---|---|---|
| Porter | 1,000–2,500 | 4–8 | none (energy) |
| Boda trip | 2,000–6,000 (×1.5 rush) | 3–5 | 15 paid trips/day |
| Delivery | 3,000–7,000 | 4–6 | 12 orders/day |
| Rolex shift | −5,000 … +25,000 | 15 | 2 shifts/day |
| Car wash | 8,000–15,000 per car | 12 | 3 cars/day |

- **Boda costs:** bike rent **10,000/day** (paid when you start your first
  boda job of the Kampala day); fuel **~600 per km** ridden with a passenger
  or empty (petrol ≈ 6,500/L, ~11 km/L).
- **Fare formula (draft):** `base 1,500 + 1,800/km` × rush multiplier, + tip
  up to 20% for a fast ride; minus fuel. A 2 km trip ≈ 5,100 fare, ≈ 3,900 net.
- **A hard day** (energy-limited, ~4 h of play spread through the day):
  ~25k–45k net — real boda profit range, a little above the 30k race cap.
  Two such days cover Kisenyi rent (35k / 48 h) with something left; moving
  up to Kawempe (60k) or Ntinda (120k) needs steady hustling plus racing.
- **Balancing check before shipping each step:** a simulation of a week for
  three archetypes (porter-only grinder, boda rider, racer) must show the
  grinder can pay Kisenyi rent and eat, and the boda rider can save toward a
  lease in ~1–2 game weeks.

### 16.5 Bike ownership (the first big goal)
| Stage | How | Cost | Effect |
|---|---|---|---|
| Rent | from the stage owner, per Kampala day | 10,000/day | can do boda/delivery today |
| Lease-to-own | sign with "Tugende-style" lessor (fictional name) | deposit 50,000 + **70,000 per game week** for 6 game weeks | no daily rent; miss a payment → bike repossessed after 1 week grace, payments so far lost (honest, real-world trap) |
| Own | lease completed, or buy outright | 450,000 outright | no rent; can **rent it out** later (passive income, Phase 5) |

Lease payments are charged lazily like rent (§ Phase 3 code: `settleRent`
pattern). Owning a bike is shown on the Home page and in the race avatar later
(cosmetic).

### 16.6 Engine design (shared by every gig)
**Game core (`packages/game-core/src/hustles.ts`, pure, unit-tested)**
- Gig catalogue (`HUSTLES`), fare/pay formulas, fuel cost, rush-hour check
  (Kampala time), patience/tip curves, energy cost per job, soft caps.
- Spot catalogue: named pins (stages, Kikuubo shops, restaurants, washing
  bays) with coordinates inside the zone; validated to snap to the road graph.

**Game server — new `hustle` room (reuses RaceRoom movement)**
- Extract the movement/needs/tick code from `RaceRoom` into a shared module
  so `RaceRoom` and `HustleRoom` both use it (no copy-paste of 700 lines).
- `HustleRoom`: one player; options `{ gig: "porter" | "boda" | … }`.
  States: `idle` (offers board) → `to_pickup` → `carrying` → `paid`/`failed`
  → back to `idle`. The player can end the shift any time.
- **Offers:** generated server-side every few seconds from the spot
  catalogue (seeded by room + time), each with pickup, drop-off, pay, timer.
  Accept by id; only one active job.
- **Validation:** pickup/drop-off reached within 25 m of the server position;
  timers on the server clock; speed is the server's.
- **Pay:** on drop-off the room calls `payHustle()` (db) with
  `ref = room:job` → ledger reason `hustle_<gig>`; costs recorded in `meta`
  (`{ gross, fuel, rent, commission, tip }`) for the receipt. Bike rent is its
  own ledger entry `bike_rent:<kampala-day>` so it is charged once per day.
- **Stress/energy:** same delta flushing as races (`applyNeedsDeltas`, incl.
  stress −1 per paid job, +3 per abandoned job).
- Mini-game gigs (rolex, car wash) use the same room: the "job" is a sequence
  of server-issued orders; the client sends taps, the server scores timing
  windows (no client-reported totals).

**Database (migration `0009`)**
- `bikes` table: `user_id, status (leasing|owned|repossessed), lease_paid,
  lease_due_at, created_at` (rent is per-day via the ledger, no row).
- `hustle_stats` (optional, for caps/analytics): per user per Kampala day —
  jobs done per gig. Caps can be computed from the ledger instead; decide at
  build time (prefer the ledger, like `payGig`).
- Ledger reasons: `hustle_porter`, `hustle_boda`, `bike_rent`,
  `bike_lease`, `fuel` (folded into meta if itemised per job).

**Web**
- **Hub → Hustles card:** list of gigs with what each needs ("Needs a bike —
  rent 10,000 today"), today's earnings and caps, rush-hour badge.
- **Hustle screen** (`/play` in a hustle room, shell hidden like races):
  offers board as a bottom sheet / side panel (same `AdaptivePanel`),
  pickup/drop-off pins and a route hint on the map, job timer and passenger
  patience bar, End shift.
- **Receipt** after each job (fare, tip, fuel, rent, commission, net) and a
  shift summary at the end.
- **Home:** a "Garage" section once you rent/lease/own a bike.

### 16.7 Anti-abuse
- All money server-side; one payout per job id; daily soft caps from the
  ledger; one hustle room per user at a time (the join is refused if another
  is open); offers expire; minimum job distances so standing still pays
  nothing; energy cost per job makes bots no faster than humans.

### 16.8 Build steps
| Step | Ships | Notes |
|---|---|---|
| **H1a** | Shared movement module; `HustleRoom`; offer board; **Kikuubo porter** end-to-end; hub Hustles card; receipts | retire the old gig room mode (`mode: "gig"`) |
| **H1b** | **Boda passengers**: stages, bike rent per day, fuel, fare/tip/patience, rush hour, bike speed | first gig that costs money to start |
| **H2** | Lease-to-own + Garage; **App delivery** with commission | first long-term goal |
| **H3** | **Rolex stand** and **car wash** mini-games; stock, spoilage, KCCA raid | first gigs where you can lose money |
| **H4** | Mobile money booth; renting out your bike (passive income) | overlaps Phase 5 |

Each step: game-core tests for formulas, a throwaway-DB test of payouts and
caps, a scripted client run of a full job, the archetype simulation, then a
browser check on phone and desktop.

### 16.9 Open questions
- Should a passenger sometimes ask for a stop you can't reach in time (a
  choice to decline)? Proposed: yes, decline is free.
- Night riding (after 22:00 Kampala): higher fares but a small robbery risk
  (a shock)? Proposed: later, H2+.
- Show other players' boda riders on the map (ghosts) for life, without
  interaction? Proposed: later; nice for "the city feels busy".

### 16.10 Bikes — ownership, upkeep and decoration (agreed 14 Oct 2026)

**Decisions:** a real 3D bike model (worth the extra work); the map stays on
Kampala city; fuel shortfalls come out of the fare for now; **made-up bike
names** modelled on real types; **20 fixed mudflap slogans** to start;
the **electric Zembo E** ships in H2a; decorations are **cosmetic only**
(no stats, no rep bonus).

**Lineup**
| Bike | Based on | Speed | Fuel | Comfort | Durability | Price | Get it |
|---|---|---|---|---|---|---|---|
| Stage rental | tired 100cc | ★★ | ★★ | ★ | ★ | 10,000/day | rent at a stage (H1b) |
| Boxa 100 | Boxer-type workhorse | ★★★ | ★★★★ | ★★ | ★★★★ | 450,000 | buy / lease |
| Star 125 | Star-type 125 | ★★★ | ★★★ | ★★★ | ★★★ | 550,000 | buy / lease |
| Dragon 150 | Chinese 150cc | ★★★★ | ★★ | ★★ | ★★ | 600,000 | buy |
| Zembo E | electric boda | ★★★ | battery swaps | ★★★ | ★★★★ | 700,000 | lease only |

Speed = trip time; fuel = cost per km; comfort = slower patience drain and
better tips; durability = breakdown chance (a shock: repair cost, ride ends).

**Upkeep:** wear per km raises breakdown odds; garage service resets it
(5k–15k by bike); missed lease → repossessed after a week's grace; later,
rent your bike out (passive income, small damage risk).

**Decoration (cosmetic only, priced by rarity):** paint and tank stripes;
seat covers (plain, fluffy, leopard, tartan, team colours); mudflap slogans
(fixed list of 20, e.g. "God's Plan", "Maama's Prayers", "Mukama Yamba",
"No Hurry in Africa", "Sente Ziruma"); stickers (generic clubs, flags,
flames); grips, tassels, mirrors; LED underglow and lamp colours; crash bars,
rack, phone holder, grab rail; rider gear (vests, helmets, gloves, poncho).

**3D:** procedural low-poly bike from primitives (like the house builder),
each part a separate mesh so paint/seat/decals/extras swap; avatar posed
seated, wheels spin, slight lean into turns; a seated passenger during
rides. Seen in boda shifts, the Garage, and later as a cosmetic ride to race
starts (races stay on foot).

**Revised steps:** H1b-1 bike model + riding pose + rental bike → H1b-2 boda
passengers → H2a garage & ownership (lease/buy, stats, wear, service,
breakdowns, Zembo E) → H2b customisation shop → H2c app delivery.

---

## 15. Revision log

- **12 Oct 2026** — Doc created. Captured: code audit (no currency; points +
  UGX only), BNG spec, Lagos Life study, pivot to survival/running economy,
  and the TikTok acquisition lens. Next: resolve open questions → fold into
  `economy.md` → start build order step 1.
- **12 Oct 2026** — Added §12, a fresh brainstorm: the rivalry economy
  (Kings of the Road + ghost challenges + views → BNG; creator clue drops,
  billboard fame, crew turf for later). Open Qs 18–24. Flagged that the
  live-gifting idea in §5.7 has no public API.
- **13 Oct 2026** — Lean pass agreed: BNG ledger, Energy + Sprint, light
  Health with collapse, food, cosmetics; duels on contact explored and
  dropped.
- **14 Oct 2026** — New direction **§13 Kampala Hustle** (life economy of
  Ugandan youth, with research and sources) and **§14 phased implementation
  plan**. **Decision: no real money ever buys BNG** (top-up packs
  cancelled; §3, §4.6, §9 updated). Code audit (§1) refreshed. Open Qs
  25–29 added.
- **14 Oct 2026** — Phase 3 shipped (rent, stress, family requests/shocks,
  boda courier gig). Gig economy redesigned as **§16 Hustles**: simulated
  passengers and customers so gigs never need other players; research on
  Kampala youth hustles; catalogue (porter, boda passengers, delivery, rolex
  stand, car wash, mobile money); bike rent → lease → own; pay table; engine,
  DB and UI design; build steps H1a–H4. Decisions: start with porter + boda;
  tap mini-games for rolex/car wash.
