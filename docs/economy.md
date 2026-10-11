# Tiral Economy & Advertising — design tracker

Living document for everything economy, ads, creators, and TikTok-funnel related.
Status: **brainstorm solidified, not yet built.** See “Build order” at the bottom.

Core principle: **everything is tied to the game.** No foot traffic, no GPS,
no real-world logistics. Brands buy placement and attention inside races;
players race avatars remotely.

---

## 1. Currencies

### Coins (spendable, closed-loop)
- Earned: race placements (1st ~100, 2nd ~60, 3rd ~40, finishers ~15),
  first-win-of-day bonus (~25), Pathfinder shortcut bonus, TikTok-linked ×1.5
  multiplier, creator/sponsor prize pools.
- Spent: avatar cosmetics (status only, never power), roadside shout-outs on
  emptier boards, opt-in staked-race buy-ins (later).
- Rules: fixed earn table, server-recorded on validated events only. Client
  never declares balances. Cosmetic prices target ~2–3 weeks of casual play
  for a full set.

### XP (progression, non-spendable)
- Earned: finishing (scaled by field size), daily streaks, personal bests,
  first arrival per bounty ever, finishing instead of quitting.
- Unlocks cosmetic tiers and titles. Never buyable, never convertible —
  intentionally cheat-resistant prestige.
- Anti-farming: diminishing returns on repeated bounties, ~nothing for
  solo/empty races, zero for quitters.

### Invites/tickets (access, not currency)
- Single-use entries to gated rooms (creator code rooms, comment-earned
  invites). Not tradable, not a store of value — keeps the design from
  sprouting a third currency.

---

## 2. Free races vs. paid creator races

### Free races (the commons)
- Anyone creates (rate-limited), anyone joins, guests included. No coins move.
- Earn XP only. Conversion job: surface paid races, locked cosmetics, and
  “staked version of this race” prompts.
- Shared XP/level track with paid; free grinders arrive skilled but poor
  (the exact players sponsors want to fund).

### Paid creator races (the arena)
- Only verified/graduated creators create them. Per-race rules: entry fee,
  placement splits, eligibility (open / code / followers-only / ticket /
  min-level), max players, countdown, bounty (incl. pin-drop), start zone.
- Earn coins + XP; paid wins weigh more in standings.
- Creator tiers: Rookie (free entry + sponsored prizes) → Pro (coin fees +
  rake) → Partner (custom cosmetics, revenue share, tournaments).
- Locked rules at reveal; auto-refunds on technical failure.

### Funnel
TikTok clip → free guest race → XP/levels → link TikTok (×1.5 + identity)
→ creator community race → staked race → coins → cosmetics/bigger races.

---

## 3. Creator dashboard (`/creator`)

- **My rooms:** live/upcoming/past, codes, player counts.
- **Create room:** name, mode, countdown, max players, entry fee.
- **Bounty picker:** drop the pin anywhere walkable; server rejects
  unreachable pins (same guard as random picks).
- **Invites & gates:** open / code-only / ticketed / TikTok-interaction rules.
- **Prizes & coins:** grant pool, entry-fee rake view, payout ledger.
- **Brand kit:** colors, chest skin, community cosmetics.
- **Analytics:** fills, show-up rate, finishes vs DNFs, funnel
  (views → joins → finishes → linked), earnings.
- **Player management:** kick/ban, reserved slots.
- **Public creator page:** avatar, bio, rooms, leaderboard, branded items.

---

## 4. Creator + platform earnings

Money flows (fiat in: sponsors, coin packs; coins accrue from nothing):

| Creator earns | Platform earns |
|---|---|
| 10% rake on entry-fee pots | 5% of every pot before creator cut |
| 30% of branded-cosmetic sales | ~30% margin on coin packs |
| Ticket/grant event income | Sponsored-chest flat fees + analytics upsell |
| LIVE/gift + sponsor income | Withdrawal fees (only if cash-out ever exists) |

Worked example (100 players × 50-coin buy-in = 5,000 pot): platform 250,
creator 475, podium 2,565 / 1,069 / 641.

**Ledger design:** `coin_ledger` immutable rows
(user, delta, reason, race, counterparty); balances derived, never stored.
Reasons: placement, pathfinder_bonus, daily_bonus, entry_fee, prize_payout,
creator_rake, platform_fee, grant, purchase, refund. Fiat payouts live in a
separate `payouts` domain with KYC — never mixed into coin tables.

**Trust rules:** paid/prize races require TikTok-linked accounts; immutable
race logs (placements + trails) settle disputes; refunds auto-issue on
technical failure.

---

## 5. Sponsored bounties (game-tied, no foot traffic)

- Brand pins a bounty with **image + shop name + description + link**;
  validated reachable + roadside like any bounty.
- Racers go there as avatars; tapping the beacon opens the brand card.
- **View radius: generous** (see details anytime during the race).
  **Claim radius: strict** (arrival validation only) — one gate grants both
  placement and the redemption code.
- Redemption codes: single-use, human-readable, expiry = event end + 24h;
  cashier view is a dead-simple mobile page (magic-link login, big input,
  one-tap “mark used”); atomic redeem (unique constraint), rate-limited
  issuance, no codes without validated arrival.
- Campaign tiers: pilot flat fee → standard per-event → branded race days
  → sponsored seasons. Anchor against flyers/radio, stress verified bodies.
- Close-out report auto-generated: finishers, redemption rate, peak hour —
  the renewal pitch.

---

## 6. Roadside banners (Lagos Life model, adapted)

Reference: lagoslife.app — free browser life-sim, viral Oct 2026. Dual-tier
inventory on one board system: businesses pay fiat (₦250k/7d, rotating 15s
slots, transparent 1/(n+1) share, tap-to-link, Flutterwave, no account
needed); players pay in-game naira for shout-outs. Exclusives (airports),
stats-page slot. Critique to learn from: unaudited counters, no placement
reporting, renewal-dependent.

Our adaptation:
- Banner slots along race routes: 2:1 image + link, 7-day blocks, rotation
  with **transparent share display**, self-serve purchase (Flutterwave —
  works with Ugandan mobile money).
- **Dual currency:** fiat priority + coin shout-outs on emptier boards
  (fills the coin sink the economy needs).
- Premium: start/finish/bounty-adjacent slots, leaderboard-page slot,
  sponsored chest (100% share).
- **Honest impression logging from day one** (board-in-viewport during
  active races) — their biggest press criticism becomes our sales slide.
- Copy their ops: banned categories (scams, adult, coins/tokens,
  impersonation) + betting, no-results-guaranteed terms, capped pilots.

---

## 7. Two-layer attention model (how bounties + banners fit)

- **Broadcast (banners):** seen by everyone playing. Rents *awareness*.
- **Destination (bounty detail):** seen by racers who go there. Rents
  *intention* — fewer eyes, each worth more.
- Sell as a bundle: “everyone sees you on the road, racers meet you at
  the door.” Bounty teaser state (brand + reward visible, spot hidden
  until reveal) builds anticipation.
- Bounty record carries brandName/brandImage/brandDescription/brandLink/
  rewardText; content frozen at campaign start (moderated once).

---

## 8. Bounties vs. banners — when each

| | Sponsored bounties | Roadside banners |
|---|---|---|
| Buys | Consideration + redemptions | Awareness + taps |
| Needs scale? | No (works at 20 racers) | Yes (traffic = value) |
| Ops burden | High (race days, stock, support) | Low (self-serve, automatic) |
| Revenue shape | Lumpy, high per deal | Recurring, volume-driven |
| Fraud | Counter collusion, stock-outs | Fake taps, inflated impressions |
| Order | **First** — bridge revenue + proof | **Second**, at ~50 racers/event |

---

## 9. TikTok funnel (acquisition engine, kept architecturally thin)

- **Entry:** creator race codes + deep links (no install), shareable result
  cards, clip moments (finish banner, winner overlay) + copy-invite-link.
- **Conversion:** frictionless guest play; ×1.5 earn multiplier + exclusive
  cosmetics as the reason to link; persistence as retention.
- **Creator loop:** per-code leaderboards, “beat my ghost/time” challenges,
  gift-linked legal effects (info/cosmetic only — never speed/teleport),
  audience bounty votes between heats.
- **Interaction-gated invites (future):** comment/like/follow/duet →
  verified via API polling + idempotency (one reward per user per video),
  cooldowns, spam detection. Needs heavier TikTok scopes — apply early.
  Webhook-based verification considered unreliable; poll, don't subscribe.
- **Rule:** TikTok is loud in marketing, thin in architecture. WhatsApp
  invite codes work with zero approval; the game must survive TikTok
  disappearing (login + share only, never load-bearing).

---

## 10. Brutal risks log (do not delete)

- Free players are a cost center; conversion ~2% needs huge volume.
- Paid races need seeded liquidity + anti-cheat ops or they die embarrassed.
- Closed coins motivate only if cosmetics are desirable; tune with data.
- TikTok dependency is existential (API, scopes, review, algorithm).
- Comment-gating is gameable and rate-limit roulette; marquee-use only.
- Cash-out = fintech company (KYC, regulation, fraud, support). Deferred.
- Crowd/safety dynamics at popular venues; daytime, capped heats.
- Brand mismatch (betting/alcohol) policy needed before sponsors knock.

## 11. Explicitly out of scope

- Physical foot-traffic verification / GPS check-in.
- Real-world location tracking (privacy promise stands).
- Cash prizes, wallets, payments to players.
- Automated TikTok posting.

---

## 12. Build order (proposed)

1. Coin ledger + placement earnings (server-validated).
2. Creator rooms v1 (create + bounty picker + open/code-only, no money).
3. Redemption codes + cashier view + brand campaign CRUD + close-out report.
4. Banner slots + rotation + self-serve purchase + impression logging.
5. Leaderboard-page slot, sponsored seasons, staked races.
6. Comment-to-invite (after scope approvals).
