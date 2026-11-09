"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { getIdentityToken, PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth"
import { base, celo } from "viem/chains"
import {
  BASE_CHAIN_ID,
  CELO_CHAIN_ID,
  CHAIN_EVENT,
  PRIVY_LOGIN_EVENT,
  PRIVY_LOGOUT_EVENT,
  SESSION_REFRESH_EVENT,
  SWITCH_CHAIN_EVENT,
  clearPendingChain,
  consumeLoginRequest,
  peekPendingChain,
  privyAppId
} from "@/lib/privy"
import { ethereumAddress } from "@/lib/privyUser"
import { IdentityLauncher } from "@/components/auth/IdentityLauncher"

export function PrivyClient({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ["email"],
        appearance: { theme: "light", accentColor: "#E85F0C" },
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          solana: { createOnLogin: "off" }
        },
        defaultChain: celo,
        supportedChains: [celo, base]
      }}
    >
      <PrivySessionSync />
      <IdentityLauncher />
      {children}
    </PrivyProvider>
  )
}

function chainNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return null
  if (value.startsWith("eip155:")) {
    const parsed = Number(value.slice("eip155:".length))
    return Number.isFinite(parsed) ? parsed : null
  }
  if (value.startsWith("0x")) {
    const parsed = Number.parseInt(value, 16)
    return Number.isFinite(parsed) ? parsed : null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function PrivySessionSync() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  const posted = useRef("")
  const [attempt, setAttempt] = useState(0)
  const address = user ? ethereumAddress(user) : null

  useEffect(() => {
    if (consumeLoginRequest()) void login()
  }, [login])

  useEffect(() => {
    const onLogin = () => {
      posted.current = ""
      setAttempt((value) => value + 1)
      void login()
    }
    const onLogout = () => {
      posted.current = ""
      if (authenticated) void logout()
    }
    window.addEventListener(PRIVY_LOGIN_EVENT, onLogin)
    window.addEventListener(PRIVY_LOGOUT_EVENT, onLogout)
    return () => {
      window.removeEventListener(PRIVY_LOGIN_EVENT, onLogin)
      window.removeEventListener(PRIVY_LOGOUT_EVENT, onLogout)
    }
  }, [authenticated, login, logout])

  useEffect(() => {
    const embedded = wallets.find((wallet) => wallet.walletClientType === "privy")
    const wanted = peekPendingChain()
    const current = chainNumber(embedded?.chainId)
    if (embedded && wanted) {
      clearPendingChain()
      if (wanted !== current) {
        void embedded.switchChain(wanted).then(() => {
          window.dispatchEvent(new CustomEvent(CHAIN_EVENT, { detail: wanted }))
        })
      }
    } else if (current === CELO_CHAIN_ID || current === BASE_CHAIN_ID) {
      window.dispatchEvent(new CustomEvent(CHAIN_EVENT, { detail: current }))
    }
    const onSwitch = (event: Event) => {
      const chainId = (event as CustomEvent<number>).detail
      if (chainId !== CELO_CHAIN_ID && chainId !== BASE_CHAIN_ID) return
      const wallet = wallets.find((candidate) => candidate.walletClientType === "privy")
      if (!wallet) return
      void wallet.switchChain(chainId).then(() => {
        window.dispatchEvent(new CustomEvent(CHAIN_EVENT, { detail: chainId }))
      })
    }
    window.addEventListener(SWITCH_CHAIN_EVENT, onSwitch)
    return () => window.removeEventListener(SWITCH_CHAIN_EVENT, onSwitch)
  }, [wallets])

  useEffect(() => {
    if (!ready || !authenticated || !user?.id || !address) return
    const key = `${user.id}:${address}`
    if (posted.current === key) return
    posted.current = key
    void (async () => {
      try {
        const token = await getAccessToken()
        if (!token) {
          posted.current = ""
          return
        }
        const idToken = await getIdentityToken()
        const response = await fetch("/api/auth/privy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, idToken })
        })
        const body = (await response.json().catch(() => ({}))) as { status?: string; token?: string }
        if (body.status === "ask" && body.token) {
          window.location.assign(`/sign-in/choose?t=${encodeURIComponent(body.token)}`)
          return
        }
        if (!response.ok) {
          posted.current = ""
          return
        }
        window.dispatchEvent(new Event(SESSION_REFRESH_EVENT))
      } catch {
        posted.current = ""
      }
    })()
  }, [ready, authenticated, user?.id, address, attempt, getAccessToken])

  return null
}
