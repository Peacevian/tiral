"use client"

import { useEffect, useRef } from "react"
import maplibregl from "maplibre-gl"

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron"

export type Bill = { id: string; icon: string; place: string; label: string; amount: string; lngLat: [number, number] }

function billElement(bill: Bill): HTMLDivElement {
  const el = document.createElement("div")
  // MapLibre positions the marker element with its own transform, so the
  // pop animation lives on an inner wrapper.
  el.className = "tiral-bill"
  el.innerHTML = `
    <div class="tiral-bill__pop">
      <div class="tiral-bill__card">
        <div class="tiral-bill__place"><span aria-hidden="true">${bill.icon}</span>${bill.place}</div>
        <div class="tiral-bill__label">${bill.label}</div>
        <div class="tiral-bill__amount">UGX ${bill.amount}</div>
      </div>
      <div class="tiral-bill__pin"></div>
    </div>`
  return el
}

// The real game map (same tiles and style as /play) with bill pop-ups pinned
// to real Kampala places. `shown` controls how many bills are visible.
export function BillsMap({
  bills,
  shown,
  center,
  zoom,
  shade
}: {
  bills: Bill[]
  shown: number
  center: [number, number]
  zoom: number
  /** CSS background painted over the map tiles but under the bill pop-ups. */
  shade?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const elementsRef = useRef<HTMLDivElement[]>([])
  const optsRef = useRef({ bills, center, zoom, shade })

  useEffect(() => {
    if (!containerRef.current) return
    const { bills: initialBills, center: c, zoom: z, shade: initialShade } = optsRef.current
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: c,
      zoom: z,
      pitch: 0,
      bearing: 0,
      attributionControl: { compact: true },
      scrollZoom: false,
      boxZoom: false,
      dragRotate: false,
      touchPitch: false,
      keyboard: false,
      renderWorldCopies: false
    })
    // Markers are appended to the canvas container after this, so they stay
    // above the shade while the tiles sit below it.
    if (initialShade) {
      const shadeEl = document.createElement("div")
      shadeEl.style.cssText = `position:absolute;inset:0;pointer-events:none;background:${initialShade}`
      map.getCanvasContainer().appendChild(shadeEl)
    }
    const markers = initialBills.map((bill) => {
      const el = billElement(bill)
      elementsRef.current.push(el)
      return new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(bill.lngLat).addTo(map)
    })
    return () => {
      markers.forEach((marker) => marker.remove())
      elementsRef.current = []
      map.remove()
    }
  }, [])

  useEffect(() => {
    elementsRef.current.forEach((el, index) => {
      el.dataset.shown = index < shown ? "true" : "false"
    })
  }, [shown])

  // No global maplibre-gl.css here: it outlives this page on client-side
  // navigation and collapses the game map. The one rule markers need lives in
  // globals.css, scoped to .tiral-bills.
  return (
    <div className="tiral-bills absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
