import { createHash, timingSafeEqual } from "node:crypto"
import type { NextRequest } from "next/server"
import { readSessionCookie, verifySession } from "@/lib/session"

// Who may read admin data (stats, and later the /admin pages):
//   - a signed-in player whose id is listed in ADMIN_USER_IDS (comma-separated), or
//   - a request carrying the ADMIN_SECRET in an x-admin-secret header (scripts, curl).
// Both are read on every request, so a changed env needs no code change.

export function adminSecretOk(request: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false
  // Compare digests in constant time (no timing hints about the secret).
  const digest = (value: string) => createHash("sha256").update(value).digest()
  return timingSafeEqual(digest(request.headers.get("x-admin-secret") ?? ""), digest(secret))
}

export function adminUserIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
  )
}

/** The signed-in admin's user id, or null when the viewer is not an admin. */
export async function adminUserId(request: NextRequest): Promise<string | null> {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  return claims && adminUserIds().has(claims.userId) ? claims.userId : null
}

export async function isAdminRequest(request: NextRequest): Promise<boolean> {
  if (adminSecretOk(request)) return true
  return (await adminUserId(request)) !== null
}
