"use client"

import { useEffect, useRef, useState } from "react"
import maplibregl from "maplibre-gl"
import { VENUES, type VenueId } from "@tiral/game-core"

// Hangouts on the map (Kyadondo first): a pin where the place really is.
// Tapping it opens its card (onOpen). When it's off the screen, a chip at
// the edge points the way; tapping that flies the map there.

export function VenuePins({ map, onOpen }: { map: maplibregl.Map; onOpen(venue: VenueId): void }) {
  const openRef = useRef(onOpen)
  openRef.current = onOpen
  const [offscreen, setOffscreen] = useState<Array<{ id: VenueId; left: number; top: number; angle: number }>>([])

  useEffect(() => {
    const markers = (Object.keys(VENUES) as VenueId[]).map((id) => {
      const venue = VENUES[id]
      const el = document.createElement("button")
      el.type = "button"
      el.className = "tiral-venue-pin"
      el.setAttribute("aria-label", `${venue.name}: go out`)
      el.innerHTML = `<span class="tiral-venue-pin__icon">${venue.icon}</span><span class="tiral-venue-pin__name">${venue.name.split(" ")[0]}</span>`
      el.addEventListener("click", (event) => {
        event.stopPropagation()
        openRef.current(id)
      })
      return new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([venue.position.lng, venue.position.lat]).addTo(map)
    })

    // Off-screen venues: a chip on the edge, pointing at them.
    const update = () => {
      const canvas = map.getCanvas()
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const next: typeof offscreen = []
      for (const id of Object.keys(VENUES) as VenueId[]) {
        const p = map.project([VENUES[id].position.lng, VENUES[id].position.lat])
        if (p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height) continue
        const cx = width / 2
        const cy = height / 2
        const dx = p.x - cx
        const dy = p.y - cy
        const scale = Math.min((width / 2 - 70) / Math.max(1, Math.abs(dx)), (height / 2 - 70) / Math.max(1, Math.abs(dy)))
        next.push({ id, left: cx + dx * scale, top: cy + dy * scale, angle: Math.atan2(dy, dx) })
      }
      setOffscreen(next)
    }
    update()
    map.on("move", update)
    return () => {
      map.off("move", update)
      for (const marker of markers) marker.remove()
    }
  }, [map])

  return (
    <>
      {offscreen.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => {
            const venue = VENUES[chip.id]
            map.flyTo({ center: [venue.position.lng, venue.position.lat], zoom: Math.max(map.getZoom(), 15), essential: false })
          }}
          className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-sheet-line bg-sheet-card/95 px-2.5 py-1 text-xs font-black text-sheet-ink shadow-lg"
          style={{ left: chip.left, top: chip.top }}
          aria-label={`Show ${VENUES[chip.id].name} on the map`}
        >
          {VENUES[chip.id].icon} {VENUES[chip.id].name.split(" ")[0]}
          <span aria-hidden style={{ display: "inline-block", transform: `rotate(${chip.angle}rad)` }}>
            ➜
          </span>
        </button>
      ))}
    </>
  )
}
