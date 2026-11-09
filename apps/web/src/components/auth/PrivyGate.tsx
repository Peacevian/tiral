"use client"

import { Component, useEffect, useState, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { IDENTITY_EVENT, PRIVY_FAILED_EVENT, PRIVY_LOGIN_EVENT, SWITCH_CHAIN_EVENT, privyEnabled } from "@/lib/privy"

// Loaded only after Sign in or a chain switch, so a wallet-extension crash
// cannot take down the rest of the site.
const PrivyClient = dynamic(() => import("./PrivyClient").then((module) => module.PrivyClient), { ssr: false })

class Boundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    window.dispatchEvent(new Event(PRIVY_FAILED_EVENT))
  }
  render() {
    if (this.state.failed) return this.props.fallback
    return this.props.children
  }
}

export function PrivyGate({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const enable = () => setOn(true)
    window.addEventListener(PRIVY_LOGIN_EVENT, enable)
    window.addEventListener(SWITCH_CHAIN_EVENT, enable)
    window.addEventListener(IDENTITY_EVENT, enable)
    return () => {
      window.removeEventListener(PRIVY_LOGIN_EVENT, enable)
      window.removeEventListener(SWITCH_CHAIN_EVENT, enable)
      window.removeEventListener(IDENTITY_EVENT, enable)
    }
  }, [])
  if (!privyEnabled || !on) return <>{children}</>
  return (
    <Boundary fallback={<>{children}</>}>
      <PrivyClient>{children}</PrivyClient>
    </Boundary>
  )
}
