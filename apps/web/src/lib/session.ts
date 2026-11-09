import { SignJWT, jwtVerify, type JWTPayload } from "jose"

const COOKIE_NAME = "tiral_session"
const SESSION_DAYS = 30

export type SessionClaims = {
  userId: string
  displayName?: string
  avatarUrl?: string | null
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error("SESSION_SECRET is not set")
  }
  return new TextEncoder().encode(secret)
}

export async function mintSession(
  userId: string,
  profile?: { displayName: string; avatarUrl: string | null }
): Promise<string> {
  return new SignJWT({
    userId,
    ...(profile ? { displayName: profile.displayName, avatarUrl: profile.avatarUrl } : {})
  } satisfies SessionClaims & JWTPayload)
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
    return {
      userId: payload.userId,
      displayName: typeof payload.displayName === "string" ? payload.displayName : undefined,
      avatarUrl: typeof payload.avatarUrl === "string" ? payload.avatarUrl : undefined
    }
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

export type OAuthState = {
  nonce: string
  guestUserId: string | null
}

export async function mintOAuthState(guestUserId: string | null): Promise<string> {
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  return new SignJWT({ nonce, guestUserId, purpose: "tiktok-oauth" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getSecret())
}

export async function verifyOAuthState(state: string): Promise<OAuthState | null> {
  try {
    const { payload } = await jwtVerify(state, getSecret())
    if (payload.purpose !== "tiktok-oauth") return null
    if (typeof payload.nonce !== "string") return null
    const guestUserId = payload.guestUserId
    return {
      nonce: payload.nonce,
      guestUserId: typeof guestUserId === "string" ? guestUserId : null
    }
  } catch {
    return null
  }
}

// Guest → TikTok when that TikTok already has a played account: before the
// guest is left behind, the player sees both and decides. This proves the
// TikTok sign-in succeeded (10 minutes, for this guest only).
export type AccountSide = { name: string; balance: number; tier: string }
export type SwitchClaims = { guestUserId: string; ownerUserId: string; guest: AccountSide; owner: AccountSide }

export type SwitchPurpose = "tiktok-switch" | "privy-switch"

export async function mintSwitchToken(claims: SwitchClaims, purpose: SwitchPurpose = "tiktok-switch"): Promise<string> {
  return new SignJWT({ ...claims, purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getSecret())
}

export async function verifySwitchToken(token: string, purpose: SwitchPurpose = "tiktok-switch"): Promise<SwitchClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (payload.purpose !== purpose || typeof payload.guestUserId !== "string" || typeof payload.ownerUserId !== "string") return null
    const side = (value: unknown): AccountSide => {
      const v = (value ?? {}) as Record<string, unknown>
      return { name: String(v.name ?? "Player"), balance: Number(v.balance ?? 0), tier: String(v.tier ?? "") }
    }
    return { guestUserId: payload.guestUserId, ownerUserId: payload.ownerUserId, guest: side(payload.guest), owner: side(payload.owner) }
  } catch {
    return null
  }
}
