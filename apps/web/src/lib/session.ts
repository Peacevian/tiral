import { SignJWT, jwtVerify, type JWTPayload } from "jose"

const COOKIE_NAME = "tiral_session"
const SESSION_DAYS = 30

export type SessionClaims = {
  userId: string
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error("SESSION_SECRET is not set")
  }
  return new TextEncoder().encode(secret)
}

export async function mintSession(userId: string): Promise<string> {
  return new SignJWT({ userId } satisfies SessionClaims & JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret())
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (typeof payload.userId !== "string" || payload.userId.length === 0) {
      return null
    }
    return { userId: payload.userId }
  } catch {
    return null
  }
}

export function sessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`
  ]
  if (secure) parts.push("Secure")
  return parts.join("; ")
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function readSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=")
    if (name === COOKIE_NAME) return rest.join("=")
  }
  return null
}

export function isSecureRequest(url: string): boolean {
  return url.startsWith("https://")
}
