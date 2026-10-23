import { readFile } from "node:fs/promises"
import path from "node:path"
import { ImageResponse } from "next/og"
import qrcode from "qrcode-generator"
import { PRIZE_CUT_SHARE } from "@tiral/game-core"
import type { SharedPrizeRace } from "@tiral/db"
import { readAvatar } from "@/lib/avatars"

// Share images for prize races, drawn on the server (next/og). The layout
// borrows from Kampala's taxi and boda sign painting (checker bands, a label,
// a slogan, the race code on a number plate) in calm cream-and-terracotta.
//   story   1080×1920  to post on WhatsApp Status / TikTok / Instagram
//   preview 1200×630   what a pasted link shows in chats (Open Graph)
// for the race itself and for each winner (a brag card). Text is Noto Sans
// Bold/Black (assets/fonts); there's no emoji font, so emoji are dropped.

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.PUBLIC_BASE_URL ?? "https://playtiral.com").replace(/\/$/, "")
const HOST = SITE.replace(/^https?:\/\//, "")

// Cream and terracotta: calm, printed-poster colours with one warm accent.
const C = {
  paper: "#F6EFE3",
  ink: "#2A2522",
  accent: "#C65D3B",
  onAccent: "#FFFFFF",
  check: "#E4D8C4",
  soft: "#B7A891",
  white: "#FFFFFF"
}

/** Painted on taxis and bodas around Kampala; used when the host left no message. */
const SLOGANS = ["CHASE ME IF YOU CAN", "I HAVE TO WIN", "KEEP IT BURNING", "NO SLEEP TILL KIKUUBO", "GOD'S PLAN", "TRY ME"]

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
const ordinal = (n: number) => `${n}${n === 1 ? "ST" : n === 2 ? "ND" : n === 3 ? "RD" : "TH"}`
const shout = (text: string) => plain(text).toUpperCase()

function slogan(race: SharedPrizeRace) {
  const message = race.message ? shout(race.message) : ""
  if (message) return message
  let hash = 0
  for (const char of race.roomCode) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return SLOGANS[hash % SLOGANS.length]!
}

/** "FRIDAY 16 OCT · 12:30 EAT" in Kampala time (players are there; the server may not be). */
function kampalaTime(iso: string) {
  const date = new Date(iso)
  const part = (options: Intl.DateTimeFormatOptions) => date.toLocaleString("en-GB", { timeZone: "Africa/Kampala", ...options })
  return `${part({ weekday: "long" })} ${part({ day: "numeric", month: "short" })} · ${part({ hour: "2-digit", minute: "2-digit" })} EAT`.toUpperCase()
}

function when(race: SharedPrizeRace) {
  if (race.status === "scheduled") return kampalaTime(race.startsAt)
  if (race.status === "live") return "RACING NOW"
  if (race.status === "paid") return "RACE FINISHED"
  return "RACE CALLED OFF"
}

/** The host's photo as a data URL: our stored copy, or (older accounts) TikTok's own link. */
async function photo(url: string | null, userId: string): Promise<string | null> {
  if (!url) return null
  if (url.startsWith("/api/avatars/")) {
    const stored = await readAvatar(userId)
    return stored ? `data:${stored.type};base64,${stored.bytes.toString("base64")}` : null
  }
  if (!/^https:\/\//.test(url)) return null
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

/** Black-and-yellow checker band (taxi style). */
function Checkers({ width, size, rows = 2 }: { width: number; size: number; rows?: number }) {
  const cols = Math.ceil(width / size)
  const cells: React.ReactElement[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if ((row + col) % 2 === 0) cells.push(<rect key={`${row}-${col}`} x={col * size} y={row * size} width={size} height={size} fill={C.check} />)
    }
  }
  return (
    <svg width={width} height={size * rows} viewBox={`0 0 ${width} ${size * rows}`} style={{ flexShrink: 0 }}>
      <rect x={0} y={0} width={width} height={size * rows} fill={C.paper} />
      {cells}
    </svg>
  )
}

/** A strip of red tape with white lettering, slapped on at an angle. */
function Tape({ text, size, angle = -2 }: { text: string; size: number; angle?: number }) {
  return (
    <div style={{ display: "flex", background: C.accent, color: C.onAccent, fontSize: size, fontWeight: 900, letterSpacing: size * 0.06, padding: `${size * 0.14}px ${size * 0.5}px`, borderRadius: size * 0.12, transform: `rotate(${angle}deg)` }}>
      {text}
    </div>
  )
}

/** The painted slogan banner. */
function Banner({ text, size }: { text: string; size: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", color: C.ink, borderTop: `${Math.max(3, size * 0.08)}px solid ${C.ink}`, borderBottom: `${Math.max(3, size * 0.08)}px solid ${C.ink}`, fontSize: size, fontWeight: 900, letterSpacing: size * 0.04, padding: `${size * 0.3}px ${size * 0.4}px`, textAlign: "center" }}>
      {`“${text}”`}
    </div>
  )
}

/** A round photo sticker with a thick black ring, slightly crooked. */
function Sticker({ src, name, size }: { src: string | null; name: string; size: number }) {
  const ring = Math.round(size * 0.06)
  return (
    <div style={{ display: "flex", padding: Math.round(size * 0.04), background: C.white, borderRadius: size, transform: "rotate(-4deg)" }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} width={size} height={size} style={{ width: size, height: size, borderRadius: size, border: `${ring}px solid ${C.ink}`, objectFit: "cover" }} />
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: size, border: `${ring}px solid ${C.ink}`, background: C.ink, color: C.paper, fontSize: size * 0.5, fontWeight: 900 }}>
          {shout(name).charAt(0) || "T"}
        </div>
      )}
    </div>
  )
}

/** A Ugandan-style number plate: yellow, thick black border, the code in big black letters. */
function Plate({ text, width, height, caption }: { text: string; width: number; height: number; caption?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width, height, background: C.white, border: `${Math.round(height * 0.06)}px solid ${C.ink}`, borderRadius: height * 0.12 }}>
      {caption && <div style={{ display: "flex", fontSize: height * 0.13, fontWeight: 900, letterSpacing: height * 0.02, color: C.accent }}>{caption}</div>}
      <div style={{ display: "flex", fontSize: height * (caption ? 0.48 : 0.58), fontWeight: 900, letterSpacing: height * 0.08, color: C.ink, lineHeight: 1 }}>{text}</div>
    </div>
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
    <div style={{ display: "flex", padding: size * 0.06, background: C.white, border: `${Math.round(size * 0.035)}px solid ${C.ink}`, borderRadius: size * 0.06 }}>
      <svg width={size} height={size} viewBox={`0 0 ${count} ${count}`}>
        <path d={d} fill={C.ink} />
      </svg>
    </div>
  )
}

function Chips({ race, size }: { race: SharedPrizeRace; size: number }) {
  const payable = Math.floor(race.pot * (1 - PRIZE_CUT_SHARE))
  return (
    <div style={{ display: "flex", gap: size * 0.4 }}>
      {race.shares.map((share, index) => (
        <div key={index} style={{ display: "flex", flexDirection: "column", alignItems: "center", background: C.ink, color: C.paper, borderRadius: size * 0.3, padding: `${size * 0.25}px ${size * 0.5}px` }}>
          <div style={{ display: "flex", fontSize: size * 0.7, fontWeight: 900, color: C.soft }}>{ordinal(index + 1)}</div>
          <div style={{ display: "flex", fontSize: size, fontWeight: 900 }}>{bng(Math.floor((payable * share) / 100))}</div>
        </div>
      ))}
    </div>
  )
}

function Brand({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: size * 0.5, color: C.ink }}>
      <div style={{ display: "flex", fontSize: size, fontWeight: 900, letterSpacing: size * 0.15 }}>TIRAL</div>
      <div style={{ display: "flex", fontSize: size * 0.5, fontWeight: 900, letterSpacing: size * 0.08 }}>· KAMPALA HUSTLE</div>
    </div>
  )
}

/** Shrink huge numbers and long names so they still fit the width. */
const fit = (text: string, base: number, maxChars: number) => (text.length > maxChars ? Math.floor((base * maxChars) / text.length) : base)

async function render(node: React.ReactElement, width: number, height: number) {
  return new ImageResponse(node, {
    width,
    height,
    fonts: await loadFonts(),
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" }
  })
}

const page = { fontFamily: "Noto Sans", color: C.ink, background: C.paper, display: "flex", flexDirection: "column" as const }

/** The race poster for stories (1080×1920). */
export async function raceStory(race: SharedPrizeRace) {
  const avatar = await photo(race.hostAvatarUrl, race.host.id)
  const pot = bng(race.pot)
  const line = slogan(race)
  return render(
    <div style={{ ...page, width: 1080, height: 1920 }}>
      <Checkers width={1080} size={60} />
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: "36px 64px 34px" }}>
        <Brand size={44} />
        <div style={{ display: "flex", marginTop: 34, marginLeft: -90 }}>
          <Tape text="PRIZE RACE" size={88} />
        </div>
        <div style={{ display: "flex", fontSize: fit(pot, 300, 6), fontWeight: 900, letterSpacing: -12, lineHeight: 1, marginTop: 26, marginBottom: 14 }}>{pot}</div>
        <div style={{ display: "flex", fontSize: 92, fontWeight: 900, letterSpacing: 2, lineHeight: 1 }}>BNG UP FOR GRABS</div>
        <div style={{ display: "flex", marginTop: 30 }}>
          <Chips race={race} size={56} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 44, marginTop: 44 }}>
          <Sticker src={avatar} name={race.host.name} size={210} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 900, letterSpacing: 4 }}>HOSTED BY</div>
            <div style={{ display: "flex", fontSize: fit(race.host.name, 84, 12), fontWeight: 900, lineHeight: 1.05, maxWidth: 560 }}>{shout(race.host.name)}</div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 46 }}>
          <Banner text={line} size={fit(line, 56, 22)} />
        </div>
        <div style={{ display: "flex", flexGrow: 1 }} />
        <div style={{ display: "flex", fontSize: 46, fontWeight: 900, letterSpacing: 2, marginBottom: 22 }}>{when(race)}</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 36 }}>
          <Qr text={`${SITE}/r/${race.roomCode}`} size={210} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Plate text={race.roomCode} caption="RACE CODE" width={600} height={170} />
            <div style={{ display: "flex", fontSize: 36, fontWeight: 900, letterSpacing: 1 }}>{`PLAY FREE · ${HOST.toUpperCase()}`}</div>
          </div>
        </div>
      </div>
      <Checkers width={1080} size={60} />
    </div>,
    1080,
    1920
  )
}

/** What a pasted race link shows in WhatsApp and other chats (1200×630). */
export async function racePreview(race: SharedPrizeRace) {
  const avatar = await photo(race.hostAvatarUrl, race.host.id)
  const pot = bng(race.pot)
  return render(
    <div style={{ ...page, width: 1200, height: 630 }}>
      <Checkers width={1200} size={36} />
      <div style={{ display: "flex", flexGrow: 1, padding: "30px 48px 26px" }}>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
          <Brand size={30} />
          <div style={{ display: "flex", marginTop: 22, marginLeft: -64 }}>
            <Tape text="PRIZE RACE" size={52} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 14 }}>
            <div style={{ display: "flex", fontSize: fit(pot, 150, 7), fontWeight: 900, letterSpacing: -6, lineHeight: 1 }}>{pot}</div>
            <div style={{ display: "flex", fontSize: 56, fontWeight: 900 }}>BNG</div>
          </div>
          <div style={{ display: "flex", marginTop: 14 }}>
            <Chips race={race} size={34} />
          </div>
          <div style={{ display: "flex", flexGrow: 1 }} />
          <div style={{ display: "flex", fontSize: 34, fontWeight: 900 }}>{when(race)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", width: 360 }}>
          <Sticker src={avatar} name={race.host.name} size={170} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 900, letterSpacing: 3 }}>HOSTED BY</div>
            <div style={{ display: "flex", fontSize: fit(race.host.name, 40, 14), fontWeight: 900 }}>{shout(race.host.name)}</div>
          </div>
          <Plate text={race.roomCode} width={330} height={110} />
        </div>
      </div>
      <Checkers width={1200} size={36} />
    </div>,
    1200,
    630
  )
}

function winner(race: SharedPrizeRace, place: number) {
  return race.winners.find((entry) => entry.place === place) ?? null
}

/** A winner's brag card for stories (1080×1920). */
export async function winStory(race: SharedPrizeRace, place: number) {
  const won = winner(race, place)
  if (!won) return null
  const avatar = await photo(race.hostAvatarUrl, race.host.id)
  const amount = bng(won.amount)
  return render(
    <div style={{ ...page, width: 1080, height: 1920 }}>
      <Checkers width={1080} size={60} />
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: "36px 64px 34px" }}>
        <Brand size={44} />
        <div style={{ display: "flex", marginTop: 34, marginLeft: -90 }}>
          <Tape text={`${ordinal(place)} PLACE`} size={92} />
        </div>
        <div style={{ display: "flex", fontSize: fit(shout(won.name), 120, 12), fontWeight: 900, lineHeight: 1.05, marginTop: 40 }}>{shout(won.name)}</div>
        <div style={{ display: "flex", fontSize: 60, fontWeight: 900, marginTop: 8 }}>WON</div>
        <div style={{ display: "flex", fontSize: fit(amount, 300, 6), fontWeight: 900, letterSpacing: -12, lineHeight: 1, marginBottom: 10 }}>{amount}</div>
        <div style={{ display: "flex", fontSize: 92, fontWeight: 900, lineHeight: 1 }}>BNG</div>
        <div style={{ display: "flex", alignItems: "center", gap: 36, marginTop: 40 }}>
          <Sticker src={avatar} name={race.host.name} size={150} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 38, fontWeight: 900, letterSpacing: 3 }}>IN THE PRIZE RACE BY</div>
            <div style={{ display: "flex", fontSize: fit(race.host.name, 70, 14), fontWeight: 900 }}>{shout(race.host.name)}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexGrow: 1 }} />
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 44 }}>
          <Banner text="THINK YOU CAN BEAT ME?" size={50} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 36 }}>
          <Qr text={SITE} size={210} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Plate text="TIRAL" caption="PLAY FREE AT" width={600} height={170} />
            <div style={{ display: "flex", fontSize: 40, fontWeight: 900 }}>{HOST.toUpperCase()}</div>
          </div>
        </div>
      </div>
      <Checkers width={1080} size={60} />
    </div>,
    1080,
    1920
  )
}

/** What a pasted brag link shows in chats (1200×630). */
export async function winPreview(race: SharedPrizeRace, place: number) {
  const won = winner(race, place)
  if (!won) return null
  const avatar = await photo(race.hostAvatarUrl, race.host.id)
  const amount = bng(won.amount)
  return render(
    <div style={{ ...page, width: 1200, height: 630 }}>
      <Checkers width={1200} size={36} />
      <div style={{ display: "flex", flexGrow: 1, alignItems: "center", padding: "26px 48px", gap: 40 }}>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
          <Brand size={30} />
          <div style={{ display: "flex", marginTop: 22, marginLeft: -64 }}>
            <Tape text={`${ordinal(place)} PLACE`} size={52} />
          </div>
          <div style={{ display: "flex", fontSize: fit(shout(won.name), 64, 14), fontWeight: 900, marginTop: 22 }}>{shout(won.name)}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 900 }}>WON</div>
            <div style={{ display: "flex", fontSize: fit(amount, 130, 7), fontWeight: 900, letterSpacing: -5, lineHeight: 1.05 }}>{amount}</div>
            <div style={{ display: "flex", fontSize: 50, fontWeight: 900 }}>BNG</div>
          </div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 900, marginTop: 8 }}>{`IN ${shout(race.host.name)}'S PRIZE RACE`}</div>
        </div>
        <Sticker src={avatar} name={race.host.name} size={210} />
      </div>
      <Checkers width={1200} size={36} />
    </div>,
    1200,
    630
  )
}
