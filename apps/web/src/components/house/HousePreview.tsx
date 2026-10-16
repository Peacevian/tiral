"use client"

import dynamic from "next/dynamic"
import type { HouseLoadout } from "@tiral/houses"
import type { AvatarLoadout } from "@tiral/avatars"
import type { HouseView, RoomSpot } from "./roomSpots"

const PreviewScene = dynamic(
  () =>
    import("@/components/house/HousePreviewScene").then((module) => ({
      default: module.HousePreviewScene
    })),
  { ssr: false }
)

export function HousePreview({
  house,
  showRoof,
  view = "outside",
  avatarLoadout,
  avatarSpot,
  selection,
  onSelectTile,
  onSelectAvatar,
  onSelectSurface,
  hero = false,
  fill = false,
  paused = false
}: {
  house: HouseLoadout
  showRoof?: boolean
  view?: HouseView
  avatarLoadout?: AvatarLoadout
  avatarSpot?: RoomSpot
  selection?: RoomSpot | null
  onSelectTile?(x: number, z: number): void
  onSelectAvatar?(): void
  onSelectSurface?(kind: "wall" | "roof"): void
  /** Tall hero framing for the profile top (default keeps the compact card). */
  hero?: boolean
  /** Edge-to-edge fill for full-bleed pages (no rounding, parent positions). */
  fill?: boolean
  /** Stop drawing (scene kept alive, e.g. while another view covers it). */
  paused?: boolean
}) {
  return (
    <div
      className={`w-full overflow-hidden bg-gradient-to-b from-[#CFE2F7] to-[#EEF4FB] ${
        fill
          ? "absolute inset-0 border-0"
          : `border border-sheet-line ${hero ? "h-[52dvh] rounded-3xl" : "h-72 rounded-2xl"}`
      }`}
    >
      <PreviewScene
        house={house}
        showRoof={showRoof}
        view={view}
        avatarLoadout={avatarLoadout}
        avatarSpot={avatarSpot}
        selection={selection}
        onSelectTile={onSelectTile}
        onSelectAvatar={onSelectAvatar}
        onSelectSurface={onSelectSurface}
        paused={paused}
      />
    </div>
  )
}
