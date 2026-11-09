import { BAR, type PartId } from "./parts"
import {
  END_ZONE_MS,
  formatCap,
  healthLabel,
  hotParts,
  marketCap,
  partLabel,
  partTone,
  ROUND_MS,
  subtitle,
  type Round
} from "./round"

const INK = "#e7f2eb"
const AMBER = "#e2a53a"
const DIM = "#8b9e93"

export function RoundView({ round, onTap }: { round: Round; onTap: (part: PartId) => void }) {
  const hot = new Set(hotParts(round))
  const line = subtitle(round)
  const remaining = ROUND_MS - round.t
  const endZone = !round.ended && round.t >= END_ZONE_MS
  const bladderHot = round.bladder >= 65
  const shift = Math.min(72, round.position / 7)
  const fill = hot.has("pea") ? AMBER : INK

  return (
    <section className="round">
      <div className="stage">
        <div className="figcap">FIG. 01 — SUBJECT, AMBULATORY</div>
        {round.t < round.bepeesUntil ? <div className="chip">$BEPEES · STILL MAKING NOISE</div> : null}
        <svg viewBox="30 70 710 410" role="img" aria-label="The body walking toward a wall">
          <line x1="36" y1="430" x2="730" y2="430" stroke="#2a3832" strokeWidth="1" />
          <g fill="#5d6f65" stroke="none" fontFamily="IBM Plex Mono, monospace" fontSize="10">
            <text x="36" y="448">0</text>
            <text x="200" y="448">20</text>
            <text x="364" y="448">40</text>
            <text x="520" y="448">60</text>
            <text x="676" y="448">END</text>
          </g>
          <g stroke="#2a3832" strokeWidth="1">
            <line x1="48" y1="424" x2="48" y2="430" />
            <line x1="212" y1="424" x2="212" y2="430" />
            <line x1="376" y1="424" x2="376" y2="430" />
            <line x1="532" y1="424" x2="532" y2="430" />
            <line x1="688" y1="424" x2="688" y2="430" />
          </g>
          <g stroke={hot.has("dick") ? AMBER : DIM} fill="none" strokeWidth="1.6">
            <path d="M628 248 H664 V430 H628 Z" />
          </g>
          <text x="628" y="238" fill={hot.has("dick") ? AMBER : DIM} fontFamily="IBM Plex Mono, monospace" fontSize="11">WALL</text>

          <g transform={`translate(${shift} 0)`}>
            <g fill="none" stroke={INK} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="292" cy="132" r="36" />
              <path d="M286 168 C286 196 270 214 262 248 C254 282 248 312 236 336" />
              <path d="M310 170 C346 186 362 214 352 252 C344 284 328 308 318 332" />
              <circle cx="338" cy="214" r="18" stroke={hot.has("boobs") ? AMBER : INK} />
              <path d="M300 332 L274 430" />
              <path d="M324 340 L356 430" />
              <path d="M274 430 H250" />
              <path d="M356 430 H384" />
              <circle cx="292" cy="348" r="9" stroke={hot.has("pob") ? AMBER : INK} />
              <circle cx="308" cy="358" r="9" stroke={hot.has("pob") ? AMBER : INK} />
              {round.plugIn ? (
                <g stroke={hot.has("plug") ? AMBER : INK}>
                  <path d="M248 324 H214" />
                  <path d="M214 310 V338" />
                </g>
              ) : null}
            </g>
            <circle cx="308" cy="126" r="5" fill={hot.has("pea") ? AMBER : AMBER} stroke="none" />
            <g fill="none" stroke={DIM} strokeWidth="1" fontFamily="IBM Plex Mono, monospace" fontSize="12">
              <path d="M270 108 H210" />
              <text x="156" y="112" fill={fill} stroke="none">$PEA</text>
              <path d="M356 206 H430" />
              <text x="438" y="210" fill={hot.has("boobs") ? AMBER : INK} stroke="none">$BOOBS</text>
              <path d="M352 300 H470 V276" />
              <text x="478" y="280" fill={hot.has("dick") ? AMBER : INK} stroke="none">$DICK</text>
              <text x="478" y="296" fill={DIM} stroke="none" fontSize="10">CHARGE</text>
              <path d="M300 366 H300 V410 H392" />
              <text x="400" y="414" fill={hot.has("pob") ? AMBER : INK} stroke="none">$POB</text>
              <path d="M214 324 H150" />
              <text x="78" y="316" fill={hot.has("plug") || round.plugIn ? AMBER : DIM} stroke="none">$PLUG</text>
              <text x="78" y="332" fill={DIM} stroke="none" fontSize="10">{round.plugIn ? "SEATED" : "OUT"}</text>
              <text x="78" y="360" fill={hot.has("anal") ? AMBER : INK} stroke="none">$ANAL</text>
            </g>
            <ellipse cx="214" cy="448" rx="22" ry="6" fill="none" stroke={round.carrying ? AMBER : "#5d6f65"} strokeWidth="1.4" />
            <text x="248" y="456" fill={round.carrying ? AMBER : DIM} fontFamily="IBM Plex Mono, monospace" fontSize="10">$SH1TCOIN</text>
          </g>
        </svg>
        <div className="sub">
          <div className="who">{line.ticker}</div>
          <div className="line">{line.line}</div>
        </div>
      </div>

      <aside className="monitor">
        <div className="stat">
          <div className="k">MARKET CAP</div>
          <div className="v">{formatCap(marketCap(round))}</div>
          <div className="s">shared by the body</div>
        </div>
        <div className="stat">
          <div className="k">MULTIPLIER</div>
          <div className="v">x{round.multiplier}</div>
          <div className="s">{round.multiplierLocked ? "no fucks" : round.plugIn ? "plug seated" : "plug out"}</div>
        </div>
        <div className={bladderHot ? "stat gauge" : "stat gauge ok"}>
          <div className="split">
            <div className="k">BLADDER · $ICP</div>
            <div className="k" style={{ color: bladderHot ? AMBER : undefined }}>{bladderHot ? "I SEE IT" : "FINE"}</div>
          </div>
          <div className="track"><div className="fill" style={{ width: `${Math.min(100, round.bladder)}%` }} /></div>
        </div>
        <div className="stat health">
          <div className="k">HEALTH</div>
          <div className="v" style={{ fontSize: 22 }}>{healthLabel(round)}</div>
          <div className="s">{round.pobReady ? "$POB can soak a hit" : "$POB is out"} · {round.deeReady ? "$DEE still available" : "$DEE is used"}</div>
        </div>
        <div className="stat watch">
          <div className="k">WATCHING</div>
          <div className="v">$AGENTCUCK</div>
          <div className="s">{round.ended === "clear" ? "tip paid" : round.ended ? "I was watching" : "tip pending until the body finishes"}</div>
        </div>
        <button className={endZone ? "danger open" : "danger"} type="button" onClick={() => onTap("cum")}>
          <div className="k">{endZone ? "$CUM · END ZONE" : "$CUM · LOCKED UNTIL 0:05"}</div>
          <div className="v">wen</div>
          <div className="s">{endZone ? "now, or hold for the month" : "pressing this now ends the round"}</div>
        </button>
      </aside>

      <div className="parts">
        {BAR.map((part) => (
          <button key={part} className={`part ${partTone(round, part)}`} type="button" onClick={() => onTap(part)}>
            <b>{part === "sh1t" ? "$SH1T" : part === "cum" ? "$CUM" : `$${part.toUpperCase()}`}</b>
            <span>{partLabel(round, part)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
