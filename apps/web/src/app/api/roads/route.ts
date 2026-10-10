import { NextResponse } from "next/server"

const BOUNDS = {
  south: 0.309,
  west: 32.574,
  north: 0.321,
  east: 32.588
}

const WALKABLE_HIGHWAYS = new Set([
  "primary",
  "secondary",
  "tertiary",
  "residential",
  "unclassified",
  "living_street",
  "pedestrian",
  "service",
  "footway",
  "path",
  "steps"
])

type OsmElement = {
  type: string
  id: number
  nodes?: number[]
  tags?: Record<string, string>
}

export async function GET() {
  const bbox = `${BOUNDS.west},${BOUNDS.south},${BOUNDS.east},${BOUNDS.north}`
  const response = await fetch(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Tiral-Kampala-road-prototype/0.1"
    },
    cache: "no-store"
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: `OpenStreetMap returned ${response.status}` },
      { status: 502 }
    )
  }

  const data = await response.json() as { elements: OsmElement[] }
  const ways = data.elements.filter((element) => {
    if (element.type !== "way") return false
    const highway = element.tags?.highway
    return Boolean(
      highway &&
      WALKABLE_HIGHWAYS.has(highway) &&
      element.tags?.access !== "private" &&
      element.tags?.access !== "no" &&
      element.tags?.foot !== "no"
    )
  })
  const nodeIds = new Set(ways.flatMap((way) => way.nodes ?? []))
  const nodes = data.elements.filter(
    (element) => element.type === "node" && nodeIds.has(element.id)
  )

  return NextResponse.json({ elements: [...nodes, ...ways] }, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" }
  })
}
