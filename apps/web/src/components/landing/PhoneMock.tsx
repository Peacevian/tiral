import Image from "next/image"

// Static CSS-only race vignette inside a phone frame: no client JS, no map load.
export function PhoneMock() {
  return (
    <div className="w-[min(78vw,280px)] rounded-[2.2rem] border border-white/15 bg-slate-900 p-2.5 shadow-2xl shadow-black/60">
      <div className="relative overflow-hidden rounded-[1.8rem] bg-slate-950">
        {/* stylized street grid */}
        <div
          className="relative h-[380px] w-full"
          style={{
            background:
              "radial-gradient(circle at 70% 20%, rgba(251,191,36,0.25), transparent 45%), linear-gradient(135deg, #0b1220 0%, #111c2e 60%, #0b1220 100%)"
          }}
        >
          <svg viewBox="0 0 280 380" className="absolute inset-0 h-full w-full opacity-40" aria-hidden>
            <g stroke="#334155" strokeWidth="3">
              <path d="M-10 90 H290" />
              <path d="M-10 190 H290" />
              <path d="M-10 290 H290" />
              <path d="M60 -10 V390" />
              <path d="M150 -10 V390" />
              <path d="M225 -10 V390" />
            </g>
            <g stroke="#475569" strokeWidth="1.5">
              <path d="M-10 140 H290" />
              <path d="M-10 240 H290" />
              <path d="M105 -10 V390" />
              <path d="M190 -10 V390" />
            </g>
            <path d="M60 290 H150 V190 H225" fill="none" stroke="#f59e0b" strokeWidth="4" strokeDasharray="10 8" strokeLinecap="round" />
          </svg>
          {/* bounty beacon */}
          <div className="absolute left-[196px] top-[52px] flex flex-col items-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-amber-300 bg-amber-400/20 text-xl shadow-[0_0_24px_rgba(251,191,36,0.8)]">
              💰
            </div>
            <div className="mt-1 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-bold text-amber-200">
              Bounty · 120m
            </div>
          </div>
          {/* player + rivals */}
          <div className="absolute left-[52px] top-[262px] flex h-9 w-9 items-center justify-center rounded-full border-2 border-cyan-300 bg-cyan-500/30 text-base">
            🏃
          </div>
          <div className="absolute left-[118px] top-[228px] flex h-8 w-8 items-center justify-center rounded-full border-2 border-rose-300 bg-rose-500/30 text-sm">
            🏃
          </div>
          {/* HUD chips */}
          <div className="absolute left-3 top-3 rounded-lg bg-black/70 px-2.5 py-1.5 font-mono text-[11px] font-bold text-cyan-300">
            120m · 2/6
          </div>
          <div className="absolute right-3 top-3 rounded-lg bg-black/70 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300">
            ● Racing
          </div>
          <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-black/70 px-3 py-2 text-center text-[11px] font-bold text-slate-200">
            W walk · A left · D right
          </div>
        </div>
        {/* notch */}
        <div className="absolute left-1/2 top-2 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
      </div>
      <div className="flex items-center justify-center gap-2 px-2 py-3">
        <Image
          src="/tiral-icon-1024.png"
          alt="Tiral"
          width={28}
          height={28}
          className="rounded-lg"
        />
        <span className="text-sm font-black text-white">Tiral</span>
      </div>
    </div>
  )
}
