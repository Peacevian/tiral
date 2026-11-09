// The shape we read off a verified Privy user. Kept loose so a new SDK field
// name doesn't break sign-in; the address still has to be an EVM address.

const ADDRESS = /^0x[a-f0-9]{40}$/

type WalletLike = {
  type?: string
  address?: string
  walletClientType?: string
  chainType?: string
}

export function ethereumAddress(user: {
  wallet?: { address?: string } | null
  linkedAccounts?: WalletLike[]
}): string | null {
  const accounts = user.linkedAccounts ?? []
  const embedded = accounts.find(
    (account) => account.type === "wallet" && account.walletClientType === "privy" && account.chainType !== "solana"
  )
  const raw =
    embedded?.address ??
    user.wallet?.address ??
    accounts.find((account) => account.type === "wallet" && account.chainType === "ethereum")?.address
  if (typeof raw !== "string") return null
  const address = raw.trim().toLowerCase()
  return ADDRESS.test(address) ? address : null
}

export function emailAddress(user: { email?: { address?: string } | null }): string | null {
  return typeof user.email?.address === "string" ? user.email.address : null
}

/** A new player's name from the part of the email before @. Existing names are left alone. */
export function displayNameFromEmail(email: string | null): string {
  const local = (email ?? "").split("@")[0] ?? ""
  const cleaned = local.replace(/[^a-zA-Z0-9]+/g, " ").trim().slice(0, 24)
  return cleaned.length >= 2 ? cleaned : "Player"
}
