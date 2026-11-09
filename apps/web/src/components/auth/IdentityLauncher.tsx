"use client"

import { useEffect, useRef, useState } from "react"
import { usePrivy, useWallets } from "@privy-io/react-auth"
import { createPublicClient, createWalletClient, custom, http, type Address } from "viem"
import { celo } from "viem/chains"
import {
  CELO_CHAIN_ID,
  IDENTITY_EVENT,
  clearIdentityCheck,
  identityCheckPending,
  reportIdentityResult
} from "@/lib/privy"

// Starts GoodDollar's face check once the embedded wallet can sign. Loaded
// only after the player asks, together with the rest of the wallet code.
export function IdentityLauncher() {
  const { ready, authenticated, login } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const [nonce, setNonce] = useState(0)
  const askedLogin = useRef(false)
  const working = useRef(false)

  useEffect(() => {
    const kick = () => setNonce((value) => value + 1)
    window.addEventListener(IDENTITY_EVENT, kick)
    return () => window.removeEventListener(IDENTITY_EVENT, kick)
  }, [])

  useEffect(() => {
    if (!identityCheckPending() || working.current) return
    if (!ready || !walletsReady) return
    if (!authenticated) {
      if (!askedLogin.current) {
        askedLogin.current = true
        void login()
      }
      return
    }
    const embedded = wallets.find((wallet) => wallet.walletClientType === "privy")
    if (!embedded) {
      clearIdentityCheck()
      reportIdentityResult("This account has no wallet yet. Sign out, sign in again, then try the face check.")
      return
    }
    working.current = true
    clearIdentityCheck()
    void (async () => {
      try {
        await embedded.switchChain(CELO_CHAIN_ID)
        const provider = await embedded.getEthereumProvider()
        const account = embedded.address as Address
        const walletClient = createWalletClient({ account, chain: celo, transport: custom(provider) })
        const publicClient = createPublicClient({ chain: celo, transport: http() })
        const { IdentitySDK } = await import("@goodsdks/citizen-sdk")
        // The SDK ships its own viem types. The clients are the same shape at runtime.
        const sdk = await IdentitySDK.init({ publicClient, walletClient, env: "production" } as Parameters<typeof IdentitySDK.init>[0])
        const link = await sdk.generateFVLink(false, `${window.location.origin}/verify`, 42220)
        window.location.assign(link)
      } catch (error) {
        working.current = false
        askedLogin.current = false
        reportIdentityResult(error instanceof Error && error.message ? error.message : "The face check didn't start. Try again.")
      }
    })()
  }, [nonce, ready, walletsReady, authenticated, wallets, login])

  return null
}
