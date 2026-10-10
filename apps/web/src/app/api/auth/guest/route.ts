import { NextRequest, NextResponse } from "next/server"
import { createGuest } from "@tiral/db"
import { mintSession, sessionCookie, isSecureRequest } from "@/lib/session"

function randomNickname(): string {
  return `Runner-${Math.floor(1000 + Math.random() * 9000)}`
}

export async function POST(request: NextRequest) {
  try {
    const user = await createGuest(randomNickname())
    const token = await mintSession(user.id)
    const response = NextResponse.json({
      user: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl }
    })
    response.headers.set(
      "Set-Cookie",
      sessionCookie(token, isSecureRequest(request.url))
    )
    return response
  } catch (error) {
    console.error("Guest login failed:", error)
    return NextResponse.json({ error: "Could not create guest session" }, { status: 500 })
  }
}
