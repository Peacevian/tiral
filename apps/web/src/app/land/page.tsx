"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import {
  BUILDING_DESIGNS,
  BUILDING_DESIGN_IDS,
  FRONTAGE_LABEL,
  MAX_PLOTS_PER_PLAYER,
  PLOT_AREAS,
  PLOT_SIZE_METERS,
  ROOF_COLOURS,
  SIGN_MAX,
  WALL_COLOURS,
  allPlots,
  buildProgress,
  buildReadyAt,
  buildingCost,
  buildingMinutes,
  claimCost,
  findPlot,
  weeklyGroundRent,
  type Building,
  type BuildingDesignId,
  type Plot,
  type PlotArea
} from "@tiral/game-core"
import { notifyLandChanged } from "@/lib/landEvents"
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

type Claimed = { plotId: string; ownerName: string; mine: boolean; building: Building | null }
type MyPlot = { plotId: string; price: number; rentPaidUntil: string; rent: "paid" | "overdue"; weeklyRent: number; weeksPayable: number; building: Building | null; home: boolean }

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
  const { player, refresh } = usePlayer()
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

  // A building's name tag (City) or a link (?plot=ID) opens that plot.
  useEffect(() => {
    const open = (id: string) => {
      if (!findPlot(id)) return
      setSelected(id)
      setError(null)
    }
    const fromLink = new URLSearchParams(window.location.search).get("plot")
    if (fromLink) open(fromLink)
    const onTag = (event: Event) => open(String((event as CustomEvent).detail))
    window.addEventListener("tiral:select-plot", onTag)
    return () => window.removeEventListener("tiral:select-plot", onTag)
  }, [])

  const goTo = (target: { lat: number; lng: number; zoom?: number }) => map?.flyTo({ center: [target.lng, target.lat], zoom: target.zoom ?? 18, pitch: 50, duration: 1200 })

  const send = async (url: string, body: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, ref: crypto.randomUUID() }) })
      const result = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) setError(result.error ?? "Something went wrong. Try again.")
      notifyCoinsChanged()
      notifyLandChanged()
      await reload()
      // Where you live may have changed (moving into your house).
      if (url.endsWith("/home") || url.endsWith("/demolish")) await refresh()
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
              onBuild={(plan) => void send("/api/land/build", { plotId: plot.id, ...plan })}
              onDemolish={() => void send("/api/land/demolish", { plotId: plot.id })}
              onMoveIn={() => void send("/api/land/home", { plotId: plot.id })}
            />
          ) : (
            <>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-flame-deep">Land</div>
              <h1 className="mt-1 text-xl font-black">Claim a plot in town</h1>
              <p className="mt-1 text-sm leading-snug text-sheet-mute">
                Every empty {PLOT_SIZE_METERS} m plot in central Kampala and Lugogo is for sale. Tap a coloured square: <b className="text-[#E85F0C]">orange</b> is on a main road, <b className="text-[#D97706]">amber</b> on a street, <b className="text-[#22A06B]">green</b> a back plot. Then build on it: a kiosk, a shop, a bar, flats, an office tower or your own house.
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
  onPayRent,
  onBuild,
  onDemolish,
  onMoveIn
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
  onBuild(plan: { design: BuildingDesignId; floors: number; wall: string; roof: string; sign: string }): void
  onDemolish(): void
  onMoveIn(): void
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
            Ground rent: <b className="text-sheet-ink">{formatCoins(myPlot.weeklyRent)} BNG</b> a week.
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
          <div className="mt-4 border-t border-sheet-line pt-3">
            {myPlot.building ? (
              <OnThePlot building={myPlot.building} home={myPlot.home} busy={busy} onDemolish={onDemolish} onMoveIn={onMoveIn} />
            ) : myPlot.rent === "overdue" ? (
              <p className="text-sm font-bold text-flame-deep">Pay the ground rent to build here.</p>
            ) : (
              <BuildPlanner balance={balance} busy={busy} onBuild={onBuild} />
            )}
          </div>
        </>
      ) : owner ? (
        <p className="mt-2 text-sm text-sheet-mute">
          {owner.building ? `${BUILDING_DESIGNS[owner.building.design].icon} ${owner.building.sign ?? BUILDING_DESIGNS[owner.building.design].name}${buildProgress(owner.building).ready ? "" : " (going up)"}. ` : ""}
          Taken. If its ground rent goes unpaid for four weeks it comes back on the market.
        </p>
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

/** Time left in words: "3 h 20 min", "2 days 4 h". */
function timeLeft(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days) return `${days} day${days === 1 ? "" : "s"}${hours ? ` ${hours} h` : ""}`
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`
}

/** What's on your plot: going up (and how long), or finished. */
function OnThePlot({ building, home, busy, onDemolish, onMoveIn }: { building: Building; home: boolean; busy: boolean; onDemolish(): void; onMoveIn(): void }) {
  const design = BUILDING_DESIGNS[building.design]
  // Builds take minutes: keep the progress bar moving, and tell the city when it's done.
  const [, setTick] = useState(0)
  const { progress, ready } = buildProgress(building)
  useEffect(() => {
    if (ready) return
    const timer = window.setInterval(() => {
      setTick((t) => t + 1)
      if (buildProgress(building).ready) notifyLandChanged()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [ready, building])
  return (
    <div>
      <div className="text-sm font-black">
        {design.icon} {building.sign ?? design.name}
        {design.maxFloors > 1 && <span className="font-bold text-sheet-mute"> · {building.floors} floor{building.floors === 1 ? "" : "s"}</span>}
      </div>
      {ready ? (
        building.design === "house" ? (
          home ? (
            <p className="mt-1 text-sm text-leaf">You live here: no rent while it stands. Moving to a rented home (Home → House) moves you out.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-sheet-mute">Finished. Move in and stop paying rent; your furniture comes with you.</p>
              <button type="button" disabled={busy} onClick={onMoveIn} className={`${actionButtonClass("flame", "lg")} mt-2 w-full`}>
                🏡 Move in
              </button>
            </>
          )
        ) : (
          <p className="mt-1 text-sm text-sheet-mute">Finished, and up in the city for everyone to see. Earning from it is coming next.</p>
        )
      ) : (
        <>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-sheet-soft">
            <div className="h-full rounded-full bg-flame" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="mt-1 text-sm text-sheet-mute">Going up: ready in {timeLeft(buildReadyAt(building).getTime() - Date.now())}.</p>
        </>
      )}
      <ConfirmButton
        disabled={busy}
        onConfirm={onDemolish}
        confirmLabel="Tap again: knock it down, nothing back"
        className={`${actionButtonClass("sheet-danger")} mt-3 w-full`}
        armedClassName="!bg-flame-soft"
      >
        Knock it down
      </ConfirmButton>
    </div>
  )
}

/** Choose what to build: the design, its floors, colours and sign. */
function BuildPlanner({ balance, busy, onBuild }: { balance: number; busy: boolean; onBuild(plan: { design: BuildingDesignId; floors: number; wall: string; roof: string; sign: string }): void }) {
  const [designId, setDesignId] = useState<BuildingDesignId>("shop")
  const design = BUILDING_DESIGNS[designId]
  const [floors, setFloors] = useState(design.minFloors)
  const [wall, setWall] = useState<string>(WALL_COLOURS[0])
  const [roof, setRoof] = useState<string>(ROOF_COLOURS[0])
  const [sign, setSign] = useState("")
  const pick = (id: BuildingDesignId) => {
    setDesignId(id)
    setFloors(BUILDING_DESIGNS[id].minFloors)
  }
  const cost = buildingCost(design, floors)
  const minutes = buildingMinutes(design, floors)
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-[0.12em] text-sheet-mute">Build</div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {BUILDING_DESIGN_IDS.map((id) => {
          const d = BUILDING_DESIGNS[id]
          return (
            <button
              key={id}
              type="button"
              aria-pressed={id === designId}
              onClick={() => pick(id)}
              className={`rounded-xl border p-2 text-center text-xs font-bold ${id === designId ? "border-flame bg-flame-soft" : "border-sheet-line bg-sheet-card"}`}
            >
              <span className="block text-xl">{d.icon}</span>
              {d.name}
              <span className="block font-mono text-[10px] text-sheet-mute">{formatCoins(buildingCost(d, d.minFloors))}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-sm text-sheet-mute">{design.blurb}</p>

      {design.maxFloors > design.minFloors && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-bold">Floors</span>
          <span className="flex items-center gap-2">
            <button type="button" aria-label="Fewer floors" disabled={floors <= design.minFloors} onClick={() => setFloors(floors - 1)} className="grid h-9 w-9 place-items-center rounded-full border border-sheet-line text-lg disabled:opacity-40">
              −
            </button>
            <span className="w-6 text-center font-black">{floors}</span>
            <button type="button" aria-label="More floors" disabled={floors >= design.maxFloors} onClick={() => setFloors(floors + 1)} className="grid h-9 w-9 place-items-center rounded-full border border-sheet-line text-lg disabled:opacity-40">
              +
            </button>
          </span>
        </div>
      )}

      <Swatches label="Walls" colours={WALL_COLOURS} value={wall} onChange={setWall} />
      <Swatches label="Roof" colours={ROOF_COLOURS} value={roof} onChange={setRoof} />

      {design.signed && (
        <label className="mt-3 block text-sm font-bold">
          Sign
          <input
            value={sign}
            onChange={(event) => setSign(event.target.value.slice(0, SIGN_MAX))}
            placeholder={designId === "bar" ? "e.g. Club Bukoto" : designId === "office" ? "e.g. Nakasero House" : "e.g. Mama Rose Shop"}
            maxLength={SIGN_MAX}
            className="mt-1 w-full rounded-xl border border-sheet-line bg-sheet-card px-3 py-2 text-sm font-normal"
          />
        </label>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-sheet-mute">Cost</dt>
        <dd className="text-right font-black text-flame-deep">{formatCoins(cost)} BNG</dd>
        <dt className="text-sheet-mute">Building time</dt>
        <dd className="text-right font-bold">{timeLeft(minutes * 60_000)}</dd>
      </dl>
      {balance < cost ? (
        <p className="mt-3 text-sm font-bold text-flame-deep">You need {formatCoins(cost - balance)} more BNG.</p>
      ) : (
        <ConfirmButton
          disabled={busy}
          onConfirm={() => onBuild({ design: designId, floors, wall, roof, sign })}
          confirmLabel={`Tap again to pay ${formatCoins(cost)}`}
          className={`${actionButtonClass("flame", "lg")} mt-3 w-full`}
          armedClassName="!bg-flame-dark"
        >
          Start building
        </ConfirmButton>
      )}
    </div>
  )
}

function Swatches({ label, colours, value, onChange }: { label: string; colours: readonly string[]; value: string; onChange(colour: string): void }) {
  return (
    <div className="mt-3">
      <div className="text-sm font-bold">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {colours.map((colour) => (
          <button
            key={colour}
            type="button"
            aria-label={`${label} colour ${colour}`}
            aria-pressed={colour === value}
            onClick={() => onChange(colour)}
            className={`h-8 w-8 rounded-full border-2 ${colour === value ? "border-sheet-ink" : "border-sheet-line"}`}
            style={{ background: colour }}
          />
        ))}
      </div>
    </div>
  )
}
