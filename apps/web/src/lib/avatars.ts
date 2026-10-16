import { mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { getTikTokTokens, saveTikTokTokens, setAvatarUrl } from "@tiral/db"
import { fetchTikTokUser, getTikTokConfig, refreshAccessToken } from "@/lib/tiktok"

// Players' TikTok profile photos, kept as our own copy: TikTok's photo links
// are signed and expire within days (then the top bar shows a broken image
// and share posters lose the photo). Stored next to billboard uploads (a
// persistent volume in production) and served by /api/avatars/[userId].

const MAX_BYTES = 2_000_000
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }

function dir() {
  return path.join(process.env.BILLBOARD_UPLOAD_DIR ?? path.join(os.tmpdir(), "tiral-uploads"), "avatars")
}

const isUserId = (id: string) => /^[0-9a-f-]{36}$/i.test(id)

/** Our URL for a stored photo (the version busts caches when it changes). */
export const avatarPath = (userId: string, version = Date.now()) => `/api/avatars/${userId}?v=${version}`

/** Download a remote photo and keep it; returns our URL for it, or null. */
export async function storeAvatar(userId: string, remoteUrl: string | null): Promise<string | null> {
  if (!isUserId(userId) || !remoteUrl || !/^https:\/\//.test(remoteUrl)) return null
  try {
    const response = await fetch(remoteUrl, { signal: AbortSignal.timeout(5000) })
    const type = (response.headers.get("content-type") ?? "").split(";")[0]!.trim()
    if (!response.ok || !TYPES[type]) return null
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null
    await mkdir(dir(), { recursive: true })
    // One file per player; the type is kept in a small sidecar so the route can serve it.
    await writeFile(path.join(dir(), `${userId}.img`), bytes)
    await writeFile(path.join(dir(), `${userId}.type`), type)
    return avatarPath(userId)
  } catch {
    return null
  }
}

/** A stored photo: bytes and content type, or null. */
export async function readAvatar(userId: string): Promise<{ bytes: Buffer; type: string } | null> {
  if (!isUserId(userId)) return null
  try {
    const [bytes, type] = await Promise.all([readFile(path.join(dir(), `${userId}.img`)), readFile(path.join(dir(), `${userId}.type`), "utf8")])
    return TYPES[type.trim()] ? { bytes, type: type.trim() } : null
  } catch {
    return null
  }
}

const refreshing = new Map<string, Promise<string | null>>()
const lastTried = new Map<string, number>()

/**
 * Fetch the player's current TikTok photo (with their stored tokens, refreshed
 * if needed) and keep a copy. Our URL, or null. At most once per 10 minutes
 * per player per server, and one at a time.
 */
export function refreshTikTokAvatar(userId: string): Promise<string | null> {
  const running = refreshing.get(userId)
  if (running) return running
  if (Date.now() - (lastTried.get(userId) ?? 0) < 10 * 60_000) return Promise.resolve(null)
  lastTried.set(userId, Date.now())
  const job = (async () => {
    try {
      const tokens = await getTikTokTokens(userId)
      if (!tokens) return null
      let accessToken = tokens.accessToken
      if (tokens.expiresAt.getTime() < Date.now() + 60_000) {
        const fresh = await refreshAccessToken(getTikTokConfig(), tokens.refreshToken)
        await saveTikTokTokens(userId, { accessToken: fresh.accessToken, refreshToken: fresh.refreshToken, expiresAt: fresh.expiresAt })
        accessToken = fresh.accessToken
      }
      const profile = await fetchTikTokUser(accessToken)
      const stored = await storeAvatar(userId, profile.avatarUrl)
      if (stored) await setAvatarUrl(userId, stored)
      return stored
    } catch (error) {
      console.error("TikTok photo refresh failed:", error instanceof Error ? error.message : error)
      return null
    } finally {
      refreshing.delete(userId)
    }
  })()
  refreshing.set(userId, job)
  return job
}

/** True for a photo URL that points at TikTok (expires) rather than our copy. */
export const isRemoteAvatar = (url: string | null) => !!url && /^https:\/\//.test(url)
