// GoodDollar face check, as Tiral stores it. The chain read lives next to the
// route so this file can be imported by the menu without a wallet library.

export type IdentityStatus = "none" | "verified" | "expired"

export type IdentityView = {
  status: IdentityStatus
  expiresAt: string | null
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

export function isZeroAddress(value: string): boolean {
  return value.toLowerCase() === ZERO_ADDRESS
}

/** Status from the row we saved. A passed expiry is expired even before the next chain read. */
export function storedIdentity(row: { identityRoot: string | null; identityExpiresAt: Date | null } | null): IdentityView {
  if (!row?.identityRoot) return { status: "none", expiresAt: null }
  const expiresAt = row.identityExpiresAt ? row.identityExpiresAt.toISOString() : null
  if (row.identityExpiresAt && row.identityExpiresAt.getTime() <= Date.now()) {
    return { status: "expired", expiresAt }
  }
  return { status: "verified", expiresAt }
}

/** lastAuthenticated is unix seconds. authenticationPeriod is a number of days. */
export function identityExpiry(lastAuthenticated: bigint, authPeriod: bigint): Date | null {
  if (lastAuthenticated <= 0n) return null
  const millis = lastAuthenticated * 1000n + authPeriod * 86_400_000n
  const asNumber = Number(millis)
  if (!Number.isFinite(asNumber)) return null
  return new Date(asNumber)
}
