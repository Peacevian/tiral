import { NextRequest, NextResponse } from "next/server"
import { getAdminStats } from "@tiral/db"
import { isAdminRequest } from "@/lib/admin"

// Usage and economy numbers for the admin dashboard (see docs/analytics-plan.md).
// ?days=30 sets the window of the by-day series (7–365); totals are all-time.
export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const days = Math.min(365, Math.max(7, Math.floor(Number(request.nextUrl.searchParams.get("days")) || 30)))
  try {
    const stats = await getAdminStats({ days })
    return NextResponse.json(stats, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("Admin stats failed:", error)
    return NextResponse.json({ error: "Could not load stats" }, { status: 500 })
  }
}
