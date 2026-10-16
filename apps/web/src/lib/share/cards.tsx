import { readFile } from "node:fs/promises"
import path from "node:path"
import { ImageResponse } from "next/og"
import qrcode from "qrcode-generator"
import { PRIZE_CUT_SHARE } from "@tiral/game-core"
import type { SharedPrizeRace } from "@tiral/db"

// Share images for prize races, drawn on the server (next/og):
//   story   1080×1920  to post on WhatsApp Status / TikTok / Instagram
//   preview 1200×630   what a pasted link shows in chats (Open Graph)
// for the race itself (before it runs) and for each winner (a brag card).
// Text is Noto Sans Bold/Black (assets/fonts); no emoji font, so emoji are
// dropped from text and the trophy is drawn.

const SITE = (process.env.PUBLIC_BASE_URL ?? "https://playtiral.com").replace(/\/$/, "")
const HOST = SITE.replace(/^https?:\/\//, "")

const C = {
  ink: "#0f172a",
  night: "#020617",
  amber: "#fbbf24",
  amberSoft: "#fde68a",
  cream: "#fff7e6",
  slate: "#94a3b8",
  emerald: "#34d399"
}

let fonts: Promise<Array<{ name: string; data: Buffer; weight: 700 | 900; style: "normal" }>> | null = null
function loadFonts() {
  fonts ??= Promise.all(
    ([["NotoSans-Bold.ttf", 700], ["NotoSans-Black.ttf", 900]] as const).map(async ([file, weight]) => ({
      name: "Noto Sans",
      data: await readFile(path.join(process.cwd(), "assets/fonts", file)),
      weight,
      style: "normal" as const
    }))
  )
  return fonts
}

/** Emoji have no glyphs in our font: drop them (and tidy the spaces they leave). */
const plain = (text: string) => text.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim()
const bng = (amount: number) => amount.toLocaleString("en-US")
const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`

/** "Friday 18:00" in Kampala time (players are there; the server may not be). */
function kampalaTime(iso: string) {
  return `${new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Kampala", weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} EAT`
}

/** The host's TikTok photo as a data URL, or null (TikTok's photo links expire; never let that break the image). */
async function photo(url: string | null): Promise<string | null> {
  if (!url || !/^https:\/\//.test(url)) return null
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) })
    const type = response.headers.get("content-type") ?? ""
    if (!response.ok || !/^image\/(jpeg|png|webp)/.test(type)) return null
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > 2_000_000) return null
    return `data:${type.split(";")[0]};base64,${bytes.toString("base64")}`
  } catch {
    return null
  }
}

function Avatar({ src, name, size }: { src: string | null; name: string; size: number }) {
  const ring = { width: size, height: size, borderRadius: size, border: `${Math.round(size / 18)}px solid ${C.amber}` }
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} width={size} height={size} style={{ ...ring, objectFit: "cover" }} />
  return (
    <div style={{ ...ring, display: "flex", alignItems: "center", justifyContent: "center", background: "#1e293b", color: C.amber, fontSize: size * 0.48, fontWeight: 900 }}>
      {plain(name).charAt(0).toUpperCase() || "T"}
    </div>
  )
}

/** A drawn trophy (no emoji font). */
function Trophy({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <path d="M18 6h28v8h10v6c0 9-7 15-15 16-2 5-5 8-7 9v7h8v6H22v-6h8v-7c-2-1-5-4-7-9-8-1-15-7-15-16v-6h10V6zm-4 14c0 5 3 9 8 10-1-3-2-7-2-10h-6zm36 0h-6c0 3-1 7-2 10 5-1 8-5 8-10z" fill={C.amber} />
    </svg>
  )
}

function Qr({ text, size }: { text: string; size: number }) {
  const qr = qrcode(0, "M")
  qr.addData(text)
  qr.make()
  const count = qr.getModuleCount()
  let d = ""
  for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`
  return (
    <div style={{ display: "flex", padding: size * 0.06, background: "#ffffff", borderRadius: size * 0.08 }}>
      <svg width={size} height={size} viewBox={`0 0 ${count} ${count}`}>
        <path d={d} fill={C.ink} />
      </svg>
    </div>
  )
}

/** Night-time Kampala streets: a dark gradient with a faint road grid. */
function Backdrop({ width, height }: { width: number; height: number }) {
  const roads = [
    "M-50 300 C 300 220, 600 420, 1300 260",
    "M-50 900 C 400 760, 700 1040, 1300 820",
    "M-50 1500 C 300 1400, 800 1650, 1300 1450",
    "M200 -50 C 260 600, 120 1200, 260 2000",
    "M760 -50 C 700 500, 880 1300, 720 2000",
    "M-50 1150 L 1300 1000"
  ]
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width, height, display: "flex", background: `linear-gradient(160deg, #1e293b 0%, ${C.night} 55%, #3b1d06 100%)` }}>
      <svg width={width} height={height} viewBox={`0 0 1200 ${Math.round((1200 * height) / width)}`} style={{ position: "absolute", left: 0, top: 0 }}>
        {roads.map((d) => (
          <path key={d} d={d} stroke="rgba(251,191,36,0.13)" strokeWidth="18" fill="none" />
        ))}
      </svg>
    </div>
  )
}

function Brand({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: size * 0.4 }}>
      <div style={{ fontSize: size, fontWeight: 900, letterSpacing: size * 0.18, color: C.amber }}>TIRAL</div>
      <div style={{ fontSize: size * 0.42, fontWeight: 700, color: C.slate, letterSpacing: size * 0.05 }}>KAMPALA HUSTLE</div>
    </div>
  )
}

function payouts(race: SharedPrizeRace) {
  const payable = Math.floor(race.pot * (1 - PRIZE_CUT_SHARE))
  return race.shares.map((share, index) => ({ place: index + 1, amount: Math.floor((payable * share) / 100) }))
}

function statusLine(race: SharedPrizeRace) {
  if (race.status === "scheduled") return { text: kampalaTime(race.startsAt), tone: C.cream }
  if (race.status === "live") return { text: "Racing now", tone: C.emerald }
  if (race.status === "paid") return { text: "Race finished", tone: C.slate }
  return { text: "Race called off", tone: C.slate }
}

async function render(node: React.ReactElement, width: number, height: number) {
  return new ImageResponse(node, {
    width,
    height,
    fonts: await loadFonts(),
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" }
  })
}

const font = { fontFamily: "Noto Sans", color: C.cream }

/** The race poster for stories. */
export async function raceStory(race: SharedPrizeRace) {
  const avatar = await photo(race.hostAvatarUrl)
  const when = statusLine(race)
  const link = `${SITE}/r/${race.roomCode}`
  return render(
    <div style={{ ...font, width: 1080, height: 1920, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", padding: "90px 80px" }}>
      <Backdrop width={1080} height={1920} />
      <Brand size={64} />
      <div style={{ display: "flex", marginTop: 90 }}>
        <Trophy size={220} />
      </div>
      <div style={{ fontSize: 54, fontWeight: 900, letterSpacing: 6, color: C.amberSoft, marginTop: 30 }}>PRIZE RACE</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 24, marginTop: 10 }}>
        <div style={{ fontSize: 170, fontWeight: 900, color: C.amber, lineHeight: 1 }}>{bng(race.pot)}</div>
        <div style={{ fontSize: 64, fontWeight: 900, color: C.amber }}>BNG</div>
      </div>
      <div style={{ display: "flex", gap: 22, marginTop: 40 }}>
        {payouts(race).map((payout) => (
          <div key={payout.place} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 26px", borderRadius: 24, background: "rgba(251,191,36,0.14)", border: "3px solid rgba(251,191,36,0.4)" }}>
            <div style={{ fontSize: 30, fontWeight: 700, color: C.amberSoft }}>{ordinal(payout.place)}</div>
            <div style={{ fontSize: 40, fontWeight: 900 }}>{bng(payout.amount)}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 30, marginTop: 70 }}>
        <Avatar src={avatar} name={race.host.name} size={150} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: C.slate }}>Hosted by</div>
          <div style={{ fontSize: 56, fontWeight: 900, maxWidth: 640 }}>{plain(race.host.name)}</div>
        </div>
      </div>
      {race.message && plain(race.message) && (
        <div style={{ fontSize: 40, fontWeight: 700, color: C.amberSoft, marginTop: 36, textAlign: "center", maxWidth: 900 }}>{`“${plain(race.message)}”`}</div>
      )}
      <div style={{ fontSize: 46, fontWeight: 900, color: when.tone, marginTop: 50 }}>{when.text}</div>
      <div style={{ display: "flex", flexGrow: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 50 }}>
        <Qr text={link} size={300} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 34, fontWeight: 700, color: C.slate }}>Race code</div>
          <div style={{ fontSize: 110, fontWeight: 900, letterSpacing: 12, color: C.amber }}>{race.roomCode}</div>
          <div style={{ fontSize: 34, fontWeight: 700 }}>{HOST}</div>
        </div>
      </div>
    </div>,
    1080,
    1920
  )
}

/** What a pasted race link shows in WhatsApp and other chats. */
export async function racePreview(race: SharedPrizeRace) {
  const avatar = await photo(race.hostAvatarUrl)
  const when = statusLine(race)
  return render(
    <div style={{ ...font, width: 1200, height: 630, display: "flex", position: "relative", padding: 60 }}>
      <Backdrop width={1200} height={630} />
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
        <Brand size={40} />
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 40 }}>
          <Trophy size={110} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 4, color: C.amberSoft }}>PRIZE RACE</div>
            <div style={{ fontSize: 96, fontWeight: 900, color: C.amber, lineHeight: 1 }}>{`${bng(race.pot)} BNG`}</div>
          </div>
        </div>
        <div style={{ fontSize: 34, fontWeight: 700, marginTop: 26 }}>
          {payouts(race).map((payout) => `${ordinal(payout.place)} ${bng(payout.amount)}`).join("  ·  ")}
        </div>
        <div style={{ display: "flex", flexGrow: 1 }} />
        <div style={{ fontSize: 40, fontWeight: 900, color: when.tone }}>{when.text}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 320 }}>
        <Avatar src={avatar} name={race.host.name} size={170} />
        <div style={{ fontSize: 26, fontWeight: 700, color: C.slate, marginTop: 18 }}>Hosted by</div>
        <div style={{ fontSize: 38, fontWeight: 900, textAlign: "center" }}>{plain(race.host.name)}</div>
        <div style={{ fontSize: 60, fontWeight: 900, letterSpacing: 8, color: C.amber, marginTop: 20 }}>{race.roomCode}</div>
      </div>
    </div>,
    1200,
    630
  )
}

function winner(race: SharedPrizeRace, place: number) {
  return race.winners.find((entry) => entry.place === place) ?? null
}

/** A winner's brag card for stories. */
export async function winStory(race: SharedPrizeRace, place: number) {
  const won = winner(race, place)
  if (!won) return null
  const avatar = await photo(race.hostAvatarUrl)
  return render(
    <div style={{ ...font, width: 1080, height: 1920, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", padding: "90px 80px" }}>
      <Backdrop width={1080} height={1920} />
      <Brand size={64} />
      <div style={{ display: "flex", marginTop: 120 }}>
        <Trophy size={300} />
      </div>
      <div style={{ fontSize: 60, fontWeight: 900, color: C.amberSoft, marginTop: 30, letterSpacing: 4 }}>{`${ordinal(place).toUpperCase()} PLACE`}</div>
      <div style={{ fontSize: 96, fontWeight: 900, marginTop: 30, textAlign: "center", maxWidth: 920 }}>{plain(won.name)}</div>
      <div style={{ fontSize: 48, fontWeight: 700, color: C.slate, marginTop: 20 }}>won</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
        <div style={{ fontSize: 180, fontWeight: 900, color: C.amber, lineHeight: 1.05 }}>{bng(won.amount)}</div>
        <div style={{ fontSize: 64, fontWeight: 900, color: C.amber }}>BNG</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 26, marginTop: 70 }}>
        <Avatar src={avatar} name={race.host.name} size={110} />
        <div style={{ fontSize: 44, fontWeight: 700 }}>{`in ${plain(race.host.name)}'s prize race`}</div>
      </div>
      <div style={{ display: "flex", flexGrow: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 50 }}>
        <Qr text={SITE} size={240} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 46, fontWeight: 900, color: C.amber }}>Think you can beat me?</div>
          <div style={{ fontSize: 38, fontWeight: 700, marginTop: 8 }}>{`Play free at ${HOST}`}</div>
        </div>
      </div>
    </div>,
    1080,
    1920
  )
}

/** What a pasted brag link shows in chats. */
export async function winPreview(race: SharedPrizeRace, place: number) {
  const won = winner(race, place)
  if (!won) return null
  return render(
    <div style={{ ...font, width: 1200, height: 630, display: "flex", alignItems: "center", position: "relative", padding: 60, gap: 50 }}>
      <Backdrop width={1200} height={630} />
      <Trophy size={260} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <Brand size={36} />
        <div style={{ fontSize: 40, fontWeight: 900, color: C.amberSoft, marginTop: 30 }}>{`${ordinal(place).toUpperCase()} PLACE`}</div>
        <div style={{ fontSize: 64, fontWeight: 900, maxWidth: 760 }}>{plain(won.name)}</div>
        <div style={{ fontSize: 90, fontWeight: 900, color: C.amber, lineHeight: 1.1 }}>{`won ${bng(won.amount)} BNG`}</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: C.slate, marginTop: 10 }}>{`in ${plain(race.host.name)}'s prize race`}</div>
      </div>
    </div>,
    1200,
    630
  )
}
