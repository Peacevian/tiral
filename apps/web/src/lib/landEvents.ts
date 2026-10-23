"use client"

// Fired after anything changes a plot (claimed, built on, knocked down), so
// the 3D city (components/city) shows it straight away.
export const LAND_CHANGED_EVENT = "tiral:land-changed"

export function notifyLandChanged() {
  window.dispatchEvent(new Event(LAND_CHANGED_EVENT))
}
