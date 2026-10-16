"use client"

import { useEffect, useRef } from "react"
import type maplibregl from "maplibre-gl"

export type BillboardPin = {
  slotId: string
  slotName: string
  lat: number
  lng: number
  kind: "ad" | "house"
  tier?: "standard" | "premium"
  brandName?: string
  imagePath?: string | null
  link?: string
  campaignId?: string
}

// Below this zoom a sold board collapses to a round logo badge; empty slots hide.
const COMPACT_ZOOM = 13.5
// Empty "advertise here" slots only once zoomed into the streets: at the hub
// overview their "+ AD SPACE" tags were clutter (advertisers find /advertise).
const EMPTY_MIN_ZOOM = 15.5
// Gap kept between boards when decluttering overlaps, in px.
const DECLUTTER_GAP = 6

type Look = "board" | "badge" | "empty"

type Entry = {
  el: HTMLButtonElement
  look: Look | null
  contentKey: string
  width: number
  height: number
}

/** Board scale by zoom: small at city view, full size at street level. */
function boardScale(zoom: number, premium: boolean) {
  const base = Math.min(1.1, Math.max(0.6, 0.6 + (zoom - COMPACT_ZOOM) * 0.18))
  return premium ? base * 1.15 : base
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function render(entry: Entry, pin: BillboardPin, look: Look) {
  const key = `${look}|${pin.imagePath ?? ""}|${pin.brandName ?? ""}|${pin.slotName}`
  if (entry.look === look && entry.contentKey === key) return
  const rotated = entry.look === look && look !== "empty"
  entry.look = look
  entry.contentKey = key
  const el = entry.el
  el.className = `tiral-bb tiral-bb--${look}`
  const name = escapeHtml(pin.brandName ?? pin.slotName)
  const image = pin.imagePath
    ? `<img src="${escapeHtml(pin.imagePath)}" alt="${name}" draggable="false" />`
    : `<span class="tiral-bb__fallback">${name.charAt(0) || "★"}</span>`
  if (look === "board") {
    el.innerHTML =
      `<span class="tiral-bb__panel${rotated ? " tiral-bb__panel--in" : ""}">` +
      `<span class="tiral-bb__art">${image}<span class="tiral-bb__tag">AD</span></span>` +
      `<span class="tiral-bb__caption">${name}</span>` +
      `</span><span class="tiral-bb__post"></span><span class="tiral-bb__foot"></span>`
  } else if (look === "badge") {
    el.innerHTML =
      `<span class="tiral-bb__badge">${image}</span>` +
      `<span class="tiral-bb__post tiral-bb__post--short"></span><span class="tiral-bb__foot"></span>`
  } else {
    el.innerHTML =
      `<span class="tiral-bb__empty">+ Ad space</span>` +
      `<span class="tiral-bb__post tiral-bb__post--short"></span><span class="tiral-bb__foot"></span>`
  }
  // A missing/broken ad image falls back to the brand initial, never alt text.
  el.querySelector("img")?.addEventListener(
    "error",
    (event) => {
      const fallback = document.createElement("span")
      fallback.className = "tiral-bb__fallback"
      fallback.textContent = (pin.brandName ?? pin.slotName).charAt(0) || "★"
      ;(event.currentTarget as HTMLImageElement).replaceWith(fallback)
    },
    { once: true }
  )
  el.title = pin.kind === "ad" ? (pin.brandName ?? pin.slotName) : `${pin.slotName} — advertise here`
  // Measure once per look at scale 1; layout multiplies by the zoom scale.
  el.style.transform = "none"
  entry.width = el.offsetWidth
  entry.height = el.offsetHeight
}

/**
 * Roadside billboards drawn as DOM over the map. Each board stands on a post
 * whose foot sits exactly on the slot coordinate, scales with zoom, and is
 * decluttered so boards never pile on top of each other. Repositions only when
 * the map moves or the pins change — no per-frame loop.
 */
export function BillboardLayer({
  map,
  pins,
  showEmpty = true,
  interactive = true,
  onPinClick
}: {
  map: maplibregl.Map | null
  pins: BillboardPin[]
  /** Show unsold "advertise here" slots (off during a race to keep the map clean). */
  showEmpty?: boolean
  /** Off during a race: taps go through to the map instead of opening a card. */
  interactive?: boolean
  onPinClick(pin: BillboardPin): void
}) {
  const layerRef = useRef<HTMLDivElement>(null)
  const pinsRef = useRef(pins)
  pinsRef.current = pins
  const showEmptyRef = useRef(showEmpty)
  showEmptyRef.current = showEmpty
  const interactiveRef = useRef(interactive)
  interactiveRef.current = interactive
  const onPinClickRef = useRef(onPinClick)
  onPinClickRef.current = onPinClick
  const relayoutRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!map || !layerRef.current) return
    const layer = layerRef.current
    const pool = new Map<string, Entry>()
    let raf = 0

    const layout = () => {
      raf = 0
      const zoom = map.getZoom()
      const { clientWidth: viewW, clientHeight: viewH } = map.getContainer()
      const seen = new Set<string>()
      const candidates: { entry: Entry; x: number; y: number; scale: number; priority: number }[] = []

      for (const pin of pinsRef.current) {
        seen.add(pin.slotId)
        let entry = pool.get(pin.slotId)
        if (!entry) {
          const el = document.createElement("button")
          el.type = "button"
          el.addEventListener("click", (event) => {
            event.stopPropagation()
            if (!interactiveRef.current) return
            const current = pinsRef.current.find((p) => p.slotId === pin.slotId)
            if (current) onPinClickRef.current(current)
          })
          layer.appendChild(el)
          entry = { el, look: null, contentKey: "", width: 0, height: 0 }
          pool.set(pin.slotId, entry)
        }

        const look: Look | null =
          pin.kind === "ad"
            ? zoom < COMPACT_ZOOM
              ? "badge"
              : "board"
            : showEmptyRef.current && zoom >= EMPTY_MIN_ZOOM
              ? "empty"
              : null
        const point = map.project([pin.lng, pin.lat])
        const onScreen = point.x > -150 && point.x < viewW + 150 && point.y > -40 && point.y < viewH + 220
        if (!look || !onScreen) {
          entry.el.style.display = "none"
          continue
        }
        entry.el.style.display = ""
        entry.el.style.pointerEvents = interactiveRef.current ? "" : "none"
        entry.el.tabIndex = interactiveRef.current ? 0 : -1
        render(entry, pin, look)
        const premium = pin.tier === "premium"
        candidates.push({
          entry,
          x: point.x,
          y: point.y,
          scale: look === "badge" ? (premium ? 1.1 : 1) : boardScale(zoom, premium),
          // Sold beats empty, premium beats standard, nearer (lower on screen) wins ties.
          priority: (pin.kind === "ad" ? 2 : 0) + (premium ? 1 : 0)
        })
      }

      candidates.sort((a, b) => b.priority - a.priority || b.y - a.y)
      const placed: { left: number; top: number; right: number; bottom: number }[] = []
      for (const c of candidates) {
        const w = c.entry.width * c.scale
        const h = c.entry.height * c.scale
        const box = { left: c.x - w / 2, top: c.y - h, right: c.x + w / 2, bottom: c.y }
        const hit = placed.some(
          (p) =>
            box.left < p.right + DECLUTTER_GAP &&
            box.right > p.left - DECLUTTER_GAP &&
            box.top < p.bottom + DECLUTTER_GAP &&
            box.bottom > p.top - DECLUTTER_GAP
        )
        if (hit) {
          c.entry.el.style.display = "none"
          continue
        }
        placed.push(box)
        // Foot of the post sits exactly on the coordinate.
        c.entry.el.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%, -100%) scale(${c.scale})`
        c.entry.el.style.zIndex = String(Math.round(c.y))
      }

      for (const [id, entry] of pool) {
        if (!seen.has(id)) {
          entry.el.remove()
          pool.delete(id)
        }
      }
    }

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(layout)
    }
    relayoutRef.current = schedule
    map.on("move", schedule)
    map.on("resize", schedule)
    schedule()

    return () => {
      map.off("move", schedule)
      map.off("resize", schedule)
      cancelAnimationFrame(raf)
      relayoutRef.current = () => {}
      for (const entry of pool.values()) entry.el.remove()
      pool.clear()
    }
  }, [map])

  useEffect(() => {
    relayoutRef.current()
  }, [pins, showEmpty, interactive])

  return <div ref={layerRef} className="tiral-bb-layer pointer-events-none absolute inset-0 z-[5] overflow-hidden" />
}
