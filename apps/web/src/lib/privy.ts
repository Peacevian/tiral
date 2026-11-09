// Shared by the sign-in button and the Privy provider. No Privy SDK here, so
// screens can ask for a login without loading the wallet code themselves.

export const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? ""
export const privyEnabled = privyAppId.length > 0

export const CELO_CHAIN_ID = 42220
export const BASE_CHAIN_ID = 8453

export const PRIVY_LOGIN_EVENT = "tiral:privy-login"
export const PRIVY_LOGOUT_EVENT = "tiral:privy-logout"
export const PRIVY_FAILED_EVENT = "tiral:privy-failed"
export const IDENTITY_EVENT = "tiral:identity"
export const IDENTITY_RESULT_EVENT = "tiral:identity-result"
export const SWITCH_CHAIN_EVENT = "tiral:switch-chain"
export const CHAIN_EVENT = "tiral:chain"
export const SESSION_REFRESH_EVENT = "tiral:session"

// The wallet library is loaded only after a click. Remember what they asked
// for so the library can do it once it has finished starting.
let loginRequested = false
let pendingChain: number | null = null
let identityCheck = false

export function requestPrivyLogin() {
  loginRequested = true
  window.dispatchEvent(new Event(PRIVY_LOGIN_EVENT))
}

export function consumeLoginRequest() {
  const requested = loginRequested
  loginRequested = false
  return requested
}

export function requestPrivyLogout() {
  window.dispatchEvent(new Event(PRIVY_LOGOUT_EVENT))
}

export function requestChain(chainId: number) {
  pendingChain = chainId
  window.dispatchEvent(new CustomEvent(SWITCH_CHAIN_EVENT, { detail: chainId }))
}

export function peekPendingChain() {
  return pendingChain
}

export function clearPendingChain() {
  pendingChain = null
}

export function requestIdentityCheck() {
  identityCheck = true
  window.dispatchEvent(new Event(IDENTITY_EVENT))
}

export function identityCheckPending() {
  return identityCheck
}

export function clearIdentityCheck() {
  identityCheck = false
}

export function reportIdentityResult(message: string) {
  window.dispatchEvent(new CustomEvent(IDENTITY_RESULT_EVENT, { detail: message }))
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}
