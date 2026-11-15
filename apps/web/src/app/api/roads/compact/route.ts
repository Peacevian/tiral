import { NextResponse } from "next/server"
import { compactRoads, type OverpassResponse } from "@tiral/road-graph"
import roads from "@tiral/road-graph/kampala-roads.json" with { type: "json" }

// The same baked roads as /api/roads, in the compact form (packages/road-graph
// compact.ts): about 100 KB gzipped instead of ~185, and a quarter the JSON to
// parse, which is what a phone feels. Built once at build time.
export const dynamic = "force-static"

export function GET() {
  // Changes only with a deploy (or a new snapshot, which also changes the
  // client's `?v=`): let phones keep it a day, and use a stale copy while revalidating.
  return NextResponse.json(compactRoads(roads as unknown as OverpassResponse), {
    headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" }
  })
}
