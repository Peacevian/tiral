"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

/** AppNav fires this when the shell appears or goes away. */
export const SHELL_CHANGE_EVENT = "tiral:shell-change"

export type PanelSnap = "peek" | "half" | "full"

const SNAPS: PanelSnap[] = ["peek", "half", "full"]

/** Resolve a CSS length variable (it may contain calc()/env()) to pixels. */
function cssVarPx(name: string): number {
  const probe = document.createElement("div")
  probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;height:var(${name})`
  document.body.appendChild(probe)
  const px = probe.offsetHeight
  probe.remove()
  return px
}

function snapHeight(snap: PanelSnap, peekPx: number): number {
  const top = cssVarPx("--shell-top")
  const bottom = cssVarPx("--shell-bottom")
  const available = window.innerHeight - top - bottom - 8
  if (snap === "peek") return Math.min(peekPx, available)
  if (snap === "half") return Math.min(Math.max(peekPx, window.innerHeight * 0.55), available)
  return available
}

/**
 * One container, two layouts: a draggable bottom sheet with three snap points
 * on phones, a full-height side panel on tablets and desktops. Content is the
 * same either way, so every screen is built once.
 */
export function AdaptivePanel({
  children,
  peekHeight = 216,
  initial = "peek",
  label,
  tone = "light"
}: {
  children: ReactNode
  /** Height of the collapsed sheet on phones (show the primary action). */
  peekHeight?: number
  initial?: PanelSnap
  label: string
  /** "light" (default): sky and orange; "dark" is the old navy look. */
  tone?: "dark" | "light"
}) {
  const light = tone === "light"
  const look = light
    ? {
        shell: "border-sheet-line bg-sheet text-sheet-ink shadow-[0_-6px_24px_rgba(14,42,77,0.12)] md:shadow-[0_8px_32px_rgba(14,42,77,0.18)]",
        handle: "bg-sheet-handle",
        focus: "focus-visible:outline-flame",
        header: "border-sheet-line",
        title: "text-sheet-mute",
        hide: "text-sheet-mute hover:bg-sheet-soft hover:text-sheet-ink",
        show: "border-sheet-line bg-sheet text-sheet-ink hover:bg-sheet-soft"
      }
    : {
        shell: "border-white/10 bg-slate-950/95 text-white shadow-2xl md:backdrop-blur-md",
        handle: "bg-white/25",
        focus: "focus-visible:outline-amber-300",
        header: "border-white/10",
        title: "text-slate-400",
        hide: "text-slate-300 hover:bg-white/10 hover:text-white",
        show: "border-white/10 bg-slate-950/90 text-white hover:bg-slate-900 md:backdrop-blur-md"
      }
  const [snap, setSnap] = useState<PanelSnap>(initial)
  const [height, setHeight] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null)
  // Tablet/desktop: the side panel can be tucked away to see the whole map.
  const storageKey = `tiral:panel-open:${label}`
  const [sideOpen, setSideOpen] = useState(true)
  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === "0") setSideOpen(false)
    } catch {
      // storage unavailable: start open
    }
  }, [storageKey])
  const toggleSide = (open: boolean) => {
    setSideOpen(open)
    try {
      localStorage.setItem(storageKey, open ? "1" : "0")
    } catch {
      // not remembered, still works
    }
  }

  // Recompute the snapped height on resize/rotation (and once the shell is measured).
  useEffect(() => {
    const update = () => setHeight(snapHeight(snap, peekHeight))
    update()
    const id = requestAnimationFrame(update)
    window.addEventListener("resize", update)
    window.addEventListener(SHELL_CHANGE_EVENT, update)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener("resize", update)
      window.removeEventListener(SHELL_CHANGE_EVENT, update)
    }
  }, [snap, peekHeight])

  const onPointerDown = (event: React.PointerEvent) => {
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
    drag.current = { startY: event.clientY, startHeight: height ?? peekHeight, moved: false }
  }
  const onPointerMove = (event: React.PointerEvent) => {
    const state = drag.current
    if (!state) return
    const dy = event.clientY - state.startY
    if (Math.abs(dy) > 4) {
      state.moved = true
      setDragging(true)
    }
    if (state.moved) {
      const max = snapHeight("full", peekHeight)
      setHeight(Math.max(96, Math.min(max, state.startHeight - dy)))
    }
  }
  const onPointerUp = () => {
    const state = drag.current
    drag.current = null
    setDragging(false)
    if (!state) return
    if (!state.moved) {
      // Tap cycles peek → half → full → peek.
      setSnap(SNAPS[(SNAPS.indexOf(snap) + 1) % SNAPS.length]!)
      return
    }
    const current = height ?? peekHeight
    const nearest = SNAPS.reduce((best, candidate) =>
      Math.abs(snapHeight(candidate, peekHeight) - current) < Math.abs(snapHeight(best, peekHeight) - current)
        ? candidate
        : best
    )
    setSnap(nearest)
    setHeight(snapHeight(nearest, peekHeight))
  }

  return (
    <>
    <section
      aria-label={label}
      className={`fixed inset-x-0 bottom-[var(--shell-bottom)] z-30 flex flex-col overflow-hidden rounded-t-3xl border border-b-0 ${look.shell} md:bottom-2 md:left-auto md:right-2 md:top-[calc(var(--shell-top)+0.5rem)] md:w-[24rem] md:rounded-2xl md:border-b xl:w-[26rem] max-md:[height:var(--sheet-h)] ${
        sideOpen ? "" : "md:pointer-events-none md:invisible md:translate-x-[calc(100%+1rem)]"
      }`}
      style={
        {
          "--sheet-h": height ? `${height}px` : `${peekHeight}px`,
          transition: dragging
            ? "none"
            : "height 220ms cubic-bezier(.2,.8,.2,1), transform 260ms cubic-bezier(.2,.8,.2,1), visibility 260ms"
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        aria-label={snap === "full" ? `Collapse ${label}` : `Expand ${label}`}
        aria-expanded={snap !== "peek"}
        onPointerDown={onPointerDown}
        // Keyboard Enter/Space (a click with no pointer): same as a tap.
        onClick={(event) => {
          if (event.detail === 0) setSnap(SNAPS[(SNAPS.indexOf(snap) + 1) % SNAPS.length]!)
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") setSnap(snap === "peek" ? "half" : "full")
          if (event.key === "ArrowDown") setSnap(snap === "full" ? "half" : "peek")
        }}
        className={`flex min-h-[44px] w-full shrink-0 touch-none items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 ${look.focus} md:hidden`}
      >
        <span aria-hidden className={`h-1.5 w-10 rounded-full ${look.handle}`} />
      </button>
      <div className={`hidden shrink-0 items-center justify-between border-b ${look.header} py-1.5 pl-4 pr-1.5 md:flex`}>
        <span className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${look.title}`}>{label}</span>
        <button
          type="button"
          onClick={() => toggleSide(false)}
          aria-label={`Hide ${label}`}
          title="Hide panel"
          className={`inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 text-xs font-bold transition ${look.hide}`}
        >
          Hide <span aria-hidden>›</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-4 md:pb-4 md:pt-3">
        {children}
      </div>
    </section>
    {!sideOpen && (
      <button
        type="button"
        onClick={() => toggleSide(true)}
        aria-label={`Show ${label}`}
        className={`fixed right-2 top-[calc(var(--shell-top)+0.5rem)] z-30 hidden min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-sm font-black shadow-2xl transition md:inline-flex ${look.show}`}
      >
        <span aria-hidden>‹</span> {label}
      </button>
    )}
    </>
  )
}
