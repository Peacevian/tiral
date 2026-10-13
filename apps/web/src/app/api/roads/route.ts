import { NextResponse } from "next/server"
import roads from "@tiral/road-graph/kampala-roads.json" with { type: "json" }

// Baked snapshot of the walkable play-zone roads (see
// packages/road-graph/scripts/snapshot-roads.mjs). Prerendered at build time,
// so the client gets a ~56 KB gzipped static file instead of waiting on the
// live OSM API (~4 MB, multiple seconds) on every page load.
export const dynamic = "force-static"

export function GET() {
  return NextResponse.json({ elements: roads.elements })
}
