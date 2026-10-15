"use client"

function Bar({
  icon,
  label,
  value,
  color,
  warn
}: {
  icon: string
  label: string
  value: number
  color: string
  warn: boolean
}) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="flex items-center gap-1.5" title={`${label} ${Math.round(pct)}/100`}>
      <span aria-hidden className="w-4 text-center text-xs">
        {icon}
      </span>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className={`h-2.5 w-24 overflow-hidden rounded-full bg-white/15 ${warn ? "animate-pulse" : ""}`}
      >
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-7 text-right font-mono text-[11px] font-bold text-slate-200">{Math.round(pct)}</span>
    </div>
  )
}

// Energy and health while racing. Energy feeds Sprint; health only drops if
// you keep sprinting on an empty tank.
export function NeedsHud({ energy, health, sprinting }: { energy: number; health: number; sprinting: boolean }) {
  return (
    <div
      className={`pointer-events-none flex flex-col gap-1 rounded-xl border px-2.5 py-1.5 shadow-xl md:backdrop-blur-md transition-colors ${
        sprinting ? "border-amber-300/60 bg-amber-950/70" : "border-white/10 bg-slate-950/75"
      }`}
    >
      <Bar icon="⚡" label="Energy" value={energy} color="#fbbf24" warn={energy < 15} />
      <Bar icon="❤" label="Health" value={health} color="#f87171" warn={health < 30} />
    </div>
  )
}
