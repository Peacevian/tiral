"use client"

import dynamic from "next/dynamic"
import type { AvatarLoadout } from "@tiral/avatars"

const PreviewScene = dynamic(
  () =>
    import("@/components/AvatarPreviewScene").then((module) => ({
      default: module.AvatarPreviewScene
    })),
  { ssr: false }
)

export function AvatarPreview({
  loadout,
  walking
}: {
  loadout: AvatarLoadout
  walking: boolean
}) {
  return (
    <div className="h-64 w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-800 to-slate-950">
      <PreviewScene loadout={loadout} walking={walking} />
    </div>
  )
}
