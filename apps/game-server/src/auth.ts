import { jwtVerify } from "jose"

export type VerifiedIdentity = {
  guest: false
  userId: string
  displayName: string | null
  avatarUrl: string | null
}

export type GuestIdentity = {
  guest: true
}

export type JoinIdentity = VerifiedIdentity | GuestIdentity

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error("SESSION_SECRET is not set")
  }
  return new TextEncoder().encode(secret)
}

export async function verifyJoinToken(token: unknown): Promise<JoinIdentity> {
  if (typeof token !== "string" || token.length === 0) {
    return { guest: true }
  }
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (typeof payload.userId !== "string" || payload.userId.length === 0) {
      return { guest: true }
    }
    return {
      guest: false,
      userId: payload.userId,
      displayName: typeof payload.displayName === "string" ? payload.displayName : null,
      avatarUrl: typeof payload.avatarUrl === "string" ? payload.avatarUrl : null
    }
  } catch {
    return { guest: true }
  }
}
