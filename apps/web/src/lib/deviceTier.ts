/**
 * Weak or slow phones get lighter 3D: no shadows and a lower resolution.
 * Only signals that mean it: Data Saver or a 2G/3G connection, and little
 * memory (Android Chrome reports it). CPU cores aren't trusted on iPhones and
 * iPads: WebKit reports 4 or fewer for privacy on every model, which once put
 * every iPhone in this mode (blurry, jagged 3D on a 3× screen). Elsewhere only
 * 2 cores or fewer counts. Scenes also step their resolution down on their own
 * if they actually run slowly (AdaptiveQuality).
 */
let lite: boolean | null = null

function isAppleMobile(nav: Navigator): boolean {
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1)
}

export function isLiteDevice(): boolean {
  if (lite !== null) return lite
  if (typeof navigator === "undefined") return false
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
    deviceMemory?: number
  }
  const slow = Boolean(nav.connection?.saveData) || ["slow-2g", "2g", "3g"].includes(nav.connection?.effectiveType ?? "")
  const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2
  const fewCores =
    !isAppleMobile(nav) && typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 2
  lite = slow || lowMemory || fewCores
  return lite
}

/** The sharpest resolution a scene may use: up to 2× (1.5× on weak phones), never above the screen's. */
export function maxSceneDpr(): number {
  const screen = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1
  return Math.max(1, Math.min(screen, isLiteDevice() ? 1.5 : 2))
}

/** Canvas settings for the stand-alone 3D scenes (stalls, house, showroom). */
export function sceneQuality(): { shadows: boolean; dpr: number | [number, number]; antialias: boolean } {
  return { shadows: !isLiteDevice(), dpr: [1, maxSceneDpr()], antialias: true }
}

/** Data Saver on, or a 2G-class connection: skip optional downloads (music). */
export function isDataSaver(): boolean {
  if (typeof navigator === "undefined") return false
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  return Boolean(connection?.saveData) || ["slow-2g", "2g"].includes(connection?.effectiveType ?? "")
}

/**
 * Tiral's city: is it on for this phone? On for computers and strong phones;
 * cheap phones keep the map's plain blocks until it's been tried on one.
 * `?city=1` / `?city=0` turns it on or off on any phone (remembered).
 */
export function cityEnabled(): boolean {
  if (typeof window === "undefined") return false
  try {
    const asked = new URLSearchParams(window.location.search).get("city")
    if (asked === "1" || asked === "0") localStorage.setItem("tiral-city", asked)
    const saved = localStorage.getItem("tiral-city")
    if (saved === "1") return true
    if (saved === "0") return false
  } catch {
    // Storage blocked: fall back to the phone's tier.
  }
  return !isLiteDevice()
}
