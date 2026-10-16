import { NextRequest, NextResponse } from "next/server"
import { readAvatar } from "@/lib/avatars"

// A player's stored profile photo (see lib/avatars.ts).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const avatar = await readAvatar(userId)
  if (!avatar) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return new NextResponse(new Uint8Array(avatar.bytes), {
    headers: {
      "Content-Type": avatar.type,
      // The URL carries a version (?v=), so a changed photo gets a new URL.
      "Cache-Control": "public, max-age=604800, immutable",
      "X-Content-Type-Options": "nosniff"
    }
  })
}
