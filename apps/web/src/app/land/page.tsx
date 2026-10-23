"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { FRONTAGE_LABEL, MAX_PLOTS_PER_PLAYER, PLOT_AREAS, PLOT_SIZE_METERS, allPlots, claimCost, findPlot, weeklyGroundRent, type Plot, type PlotArea } from "@tiral/game-core"
import { usePlayer } from "@/lib/player"
import { cityEnabled } from "@/lib/deviceTier"
import { formatCoins, notifyCoinsChanged } from "@/lib/useCoins"
import { ConfirmButton, actionButtonClass } from "@/components/ui"

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false })
const ThreeLayer = dynamic(() => import("@/components/ThreeLayer").then((module) => ({ default: module.ThreeLayer })), { ssr: false })
const City = dynamic(() => import("@/components/city/City").then((module) => ({ default: module.City })), { ssr: false })

// Land (docs/land.md): the empty 20 m plots of central Kampala and Lugogo.
// Tap one to see it; claim it with BNG (plus a small weekly ground rent);
// building on it comes next.

type Claimed = { plotId: string; ownerName: string; mine: boolean }
type MyPlot = { plotId: string; price: number; rentPaidUntil: string; rent: "paid" | "overdue"; weeklyRent: number; weeksPayable: number }

const AREA_VIEW: Record<PlotArea, { lat: number; lng: number; zoom: number }> = {
  central: { lat: 0.3145, lng: 32.5815, zoom: 16.3 },
  lugogo: { lat: 0.3262, lng: 32.6085, zoom: 16.2 }
}

const SOURCE = "tiral-plots"
const FILL = "tiral-plots-fill"
const LINE = "tiral-plots-line"

function useLand() {
  const [claimed, setClaimed] = useState<Claimed[]>([])
  const [mine, setMine] = useState<MyPlot[]>([])
  const [loaded, setLoaded] = useState(false)
  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/land", { cache: "no-store" })
      if (!response.ok) return
      const body = (await response.json()) as { claimed: Claimed[]; mine: MyPlot[] }
      setClaimed(body.claimed)
      setMine(body.mine)
    } finally {
      setLoaded(true)
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])
  return { claimed, mine, loaded, reload }
}

/** When the paid-up ground rent runs out, in words. */
function rentText(plot: MyPlot): string {
  const days = Math.round((new Date(plot.rentPaidUntil).getTime() - Date.now()) / 86_400_000)
  if (plot.rent === "overdue") return `Rent overdue by ${-days} day${days === -1 ? "" : "s"}: pay within 4 weeks or lose the plot`
  return days <= 0 ? "Rent due today" : `Rent paid for ${days} more day${days === 1 ? "" : "s"}`
}

export default function LandPage() {
  const { player } = usePlayer()
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [city, setCity] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { claimed, mine, loaded, reload } = useLand()
  const plots = useMemo(() => allPlots(), [])
  useEffect(() => setCity(cityEnabled()), [])

  const owners = useMemo(() => new Map(claimed.map((c) => [c.plotId, c])), [claimed])

  // The plots on the map: free ones green, others' grey, yours gold.
  const data = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: plots.map((plot) => {
        const owner = owners.get(plot.id)
        return {
          type: "Feature" as const,
          id: plot.gx * 100_000 + plot.gy,
          properties: { id: plot.id, state: owner ? (owner.mine ? "mine" : "taken") : "free", frontage: plot.frontage, selected: plot.id === selected },
          geometry: { type: "Polygon" as const, coordinates: [[...plot.corners, plot.corners[0]].map((p) => [p.lng, p.lat])] }
        }
      })
    }),
    [plots, owners, selected]
  )

  useEffect(() => {
    if (!map) return
    const apply = () => {
      try {
        if (!map.getLayer("background")) return
        const source = map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined
        if (source) {
          source.setData(data)
          return
        }
        map.addSource(SOURCE, { type: "geojson", data })
        // Under the street names, over the roads.
        const labels = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id
        map.addLayer(
          {
            id: FILL,
            type: "fill",
            source: SOURCE,
            minzoom: 14.5,
            paint: {
              "fill-color": ["match", ["get", "state"], "mine", "#F2C14E", "taken", "#8B95A1", ["match", ["get", "frontage"], "main", "#E85F0C", "street", "#F59E0B", "#22A06B"]],
              "fill-opacity": ["case", ["get", "selected"], 0.85, ["==", ["get", "state"], "taken"], 0.45, 0.5]
            }
          },
          labels
        )
        map.addLayer(
          {
            id: LINE,
            type: "line",
            source: SOURCE,
            minzoom: 14.5,
            paint: { "line-color": ["case", ["get", "selected"], "#0F172A", "#ffffff"], "line-width": ["case", ["get", "selected"], 3, 1], "line-opacity": 0.9 }
          },
          labels
        )
      } catch {
        // Style not ready yet: the next style event tries again.
      }
    }
    apply()
    map.on("styledata", apply)
    return () => {
      map.off("styledata", apply)
    }
  }, [map, data])

  useEffect(() => {
    if (!map) return
    if (process.env.NODE_ENV === "development") (window as unknown as { __landMap?: maplibregl.Map }).__landMap = map
    const onClick = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id
      if (typeof id === "string") {
        setSelected(id)
        setError(null)
      }
    }
    const enter = () => (map.getCanvas().style.cursor = "pointer")
    const leave = () => (map.getCanvas().style.cursor = "")
    map.on("click", FILL, onClick)
    map.on("mouseenter", FILL, enter)
    map.on("mouseleave", FILL, leave)
    return () => {
      map.off("click", FILL, onClick)
      map.off("mouseenter", FILL, enter)
      map.off("mouseleave", FILL, leave)
    }
  }, [map])

  const goTo = (target: { lat: number; lng: number; zoom?: number }) => map?.flyTo({ center: [target.lng, target.lat], zoom: target.zoom ?? 18, pitch: 50, duration: 1200 })

  const send = async (url: string, body: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, ref: crypto.randomUUID() }) })
      const result = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) setError(result.error ?? "Something went wrong. Try again.")
      notifyCoinsChanged()
      await reload()
    } catch {
      setError("No connection. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const plot = selected ? findPlot(selected) : null
  const owner = plot ? owners.get(plot.id) : undefined
  const myPlot = plot ? mine.find((m) => m.plotId === plot.id) : undefined
  const balance = player?.balance ?? 0

  return (
    <main className="tiral-game relative h-dvh w-screen overflow-hidden bg-sheet text-sheet-ink">
      <div className="absolute inset-x-0 bottom-[var(--shell-bottom)] top-[var(--shell-top)]">
        <MapView center={AREA_VIEW.central} zoom={AREA_VIEW.central.zoom} pitch={45} bearing={-18} onMapReady={setMap} />
        {map && city && (
          <ThreeLayer map={map}>
            <City map={map} />
          </ThreeLayer>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-[var(--shell-bottom)] z-30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:inset-auto md:right-3 md:top-[calc(var(--shell-top)+0.75rem)] md:w-[24rem] md:p-0">
        <div className="max-h-[55dvh] overflow-y-auto rounded-2xl border border-sheet-line bg-sheet p-4 shadow-2xl">
          {plot ? (
            <PlotCard
              plot={plot}
              owner={owner}
              myPlot={myPlot}
              balance={balance}
              signedIn={Boolean(player)}
              atLimit={mine.length >= MAX_PLOTS_PER_PLAYER}
              busy={busy}
              error={error}
              onClose={() => setSelected(null)}
              onClaim={() => void send("/api/land/claim", { plotId: plot.id })}
              onPayRent={(weeks) => void send("/api/land/rent", { plotId: plot.id, weeks })}
            />
          ) : (
            <>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-flame-deep">Land</div>
              <h1 className="mt-1 text-xl font-black">Claim a plot in town</h1>
              <p className="mt-1 text-sm leading-snug text-sheet-mute">
                Every empty {PLOT_SIZE_METERS} m plot in central Kampala and Lugogo is for sale. Tap a coloured square: <b className="text-[#E85F0C]">orange</b> is on a main road, <b className="text-[#D97706]">amber</b> on a street, <b className="text-[#22A06B]">green</b> a back plot. Building on your land is coming next.
              </p>
              <div className="mt-3 flex gap-2">
                {(Object.keys(PLOT_AREAS) as PlotArea[]).map((area) => (
                  <button key={area} type="button" className={`${actionButtonClass("sheet-outline")} flex-1`} onClick={() => goTo(AREA_VIEW[area])}>
                    {PLOT_AREAS[area].name}
                  </button>
                ))}
              </div>
              {player && (
                <div className="mt-4">
                  <div className="text-xs font-bold uppercase tracking-[0.12em] text-sheet-mute">
                    Your land · {mine.length}/{MAX_PLOTS_PER_PLAYER}
                  </div>
                  {loaded && mine.length === 0 && <p className="mt-1 text-sm text-sheet-mute">No plots yet.</p>}
                  {mine.map((m) => {
                    const p = findPlot(m.plotId)
                    if (!p) return null
                    return (
                      <button
                        key={m.plotId}
                        type="button"
                        onClick={() => {
                          setSelected(m.plotId)
                          goTo(p.center)
                        }}
                        className="mt-2 flex w-full items-center justify-between rounded-xl border border-sheet-line bg-sheet-card p-3 text-left"
                      >
                        <span>
                          <span className="block text-sm font-black">
                            {PLOT_AREAS[p.area].name} · {FRONTAGE_LABEL[p.frontage].toLowerCase()}
                          </span>
                          <span className={`block text-xs ${m.rent === "overdue" ? "font-bold text-flame-deep" : "text-sheet-mute"}`}>{rentText(m)}</span>
                        </span>
                        <span aria-hidden>›</span>
                      </button>
                    )
                  })}
                </div>
              )}
              {!player && (
                <p className="mt-3 text-sm text-sheet-mute">
                  <Link href="/play" className="font-bold text-flame-deep underline">
                    Sign in
                  </Link>{" "}
                  to claim a plot.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}

function PlotCard({
  plot,
  owner,
  myPlot,
  balance,
  signedIn,
  atLimit,
  busy,
  error,
  onClose,
  onClaim,
  onPayRent
}: {
  plot: Plot
  owner: Claimed | undefined
  myPlot: MyPlot | undefined
  balance: number
  signedIn: boolean
  atLimit: boolean
  busy: boolean
  error: string | null
  onClose(): void
  onClaim(): void
  onPayRent(weeks: number): void
}) {
  const cost = claimCost(plot)
  const rent = weeklyGroundRent(plot.price)
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-flame-deep">
            {PLOT_AREAS[plot.area].name} · {PLOT_SIZE_METERS} × {PLOT_SIZE_METERS} m
          </div>
          <h2 className="mt-1 text-lg font-black">{myPlot ? "Your plot" : owner ? `${owner.ownerName}'s plot` : FRONTAGE_LABEL[plot.frontage]}</h2>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-sheet-line text-lg">
          ×
        </button>
      </div>

      {myPlot ? (
        <>
          <p className={`mt-2 text-sm ${myPlot.rent === "overdue" ? "font-bold text-flame-deep" : "text-sheet-mute"}`}>{rentText(myPlot)}.</p>
          <p className="mt-1 text-sm text-sheet-mute">
            Ground rent: <b className="text-sheet-ink">{formatCoins(myPlot.weeklyRent)} BNG</b> a week. Building on it is coming soon.
          </p>
          <div className="mt-3 flex gap-2">
            {[1, 4].map((weeks) =>
              myPlot.weeksPayable >= weeks ? (
                <button key={weeks} type="button" disabled={busy || balance < myPlot.weeklyRent * weeks} onClick={() => onPayRent(weeks)} className={`${actionButtonClass(weeks === 1 ? "sheet-outline" : "flame")} flex-1`}>
                  Pay {weeks} week{weeks === 1 ? "" : "s"} · {formatCoins(myPlot.weeklyRent * weeks)}
                </button>
              ) : null
            )}
            {myPlot.weeksPayable === 0 && <p className="text-sm text-sheet-mute">Rent is paid as far ahead as it can be.</p>}
          </div>
        </>
      ) : owner ? (
        <p className="mt-2 text-sm text-sheet-mute">Taken. If its ground rent goes unpaid for four weeks it comes back on the market.</p>
      ) : (
        <>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-sheet-mute">Price</dt>
            <dd className="text-right font-black">{formatCoins(plot.price)} BNG</dd>
            <dt className="text-sheet-mute">Ground rent</dt>
            <dd className="text-right font-bold">{formatCoins(rent)} a week</dd>
            <dt className="text-sheet-mute">Pay now</dt>
            <dd className="text-right font-black text-flame-deep">{formatCoins(cost)} BNG</dd>
          </dl>
          <p className="mt-2 text-xs text-sheet-mute">The price plus the first week's rent. A game plot: it isn't real land.</p>
          {!signedIn ? null : atLimit ? (
            <p className="mt-3 text-sm font-bold text-flame-deep">You hold {MAX_PLOTS_PER_PLAYER} plots already: that's the most you can have.</p>
          ) : balance < cost ? (
            <p className="mt-3 text-sm font-bold text-flame-deep">You need {formatCoins(cost - balance)} more BNG.</p>
          ) : (
            <ConfirmButton
              disabled={busy}
              onConfirm={onClaim}
              confirmLabel={`Tap again to pay ${formatCoins(cost)}`}
              className={`${actionButtonClass("flame", "lg")} mt-3 w-full`}
              armedClassName="!bg-flame-dark"
            >
              Claim this plot
            </ConfirmButton>
          )}
        </>
      )}
      {error && <p className="mt-2 rounded-xl bg-flame-soft p-2 text-sm font-bold text-flame-deep">{error}</p>}
    </div>
  )
}
