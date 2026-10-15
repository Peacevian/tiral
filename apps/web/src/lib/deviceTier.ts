/**
 * Low-end or slow phones get lighter 3D: 1× resolution, no shadows, no
 * antialiasing. Android Chrome reports Data Saver, the connection type,
 * device memory and CPU cores; elsewhere (iOS, desktop) nothing is reported
 * and we assume a capable device.
 */
let lite: boolean | null = null

export function isLiteDevice(): boolean {
  if (lite !== null) return lite
  if (typeof navigator === "undefined") return false
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
    deviceMemory?: number
  }
  const slow = Boolean(nav.connection?.saveData) || ["slow-2g", "2g", "3g"].includes(nav.connection?.effectiveType ?? "")
  const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2
  const fewCores = typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4
  lite = slow || lowMemory || fewCores
  return lite
}

/** Canvas settings for the stand-alone 3D scenes (stalls, house, showroom). */
export function sceneQuality(): { shadows: boolean; dpr: number | [number, number]; antialias: boolean } {
  return isLiteDevice() ? { shadows: false, dpr: 1, antialias: false } : { shadows: true, dpr: [1, 2], antialias: true }
}

/** Data Saver on, or a 2G-class connection: skip optional downloads (music). */
export function isDataSaver(): boolean {
  if (typeof navigator === "undefined") return false
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  return Boolean(connection?.saveData) || ["slow-2g", "2g"].includes(connection?.effectiveType ?? "")
}
