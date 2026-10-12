"use client"

import dynamic from "next/dynamic"
import type { HouseLoadout } from "@tiral/houses"

const PreviewScene = dynamic(
  () =>
    import("@/components/house/HousePreviewScene").then((module) => ({
      default: module.HousePreviewScene
    })),
  { ssr: false }
)

export function HousePreview({
  house,
  showRoof
}: {
  house: HouseLoadout
  showRoof?: boolean
}) {
  return (
    <div className="h-72 w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-800 to-slate-950">
      <PreviewScene house={house} showRoof={showRoof} />
    </div>
  )
}
