"use client"

import { useEffect } from "react"

/**
 * Registers /sw.js (production only, after the page has loaded, so it never
 * competes with the first visit for bandwidth). See public/sw.js.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("Service worker not registered:", error))
    }
    if (document.readyState === "complete") register()
    else {
      window.addEventListener("load", register, { once: true })
      return () => window.removeEventListener("load", register)
    }
  }, [])
  return null
}
