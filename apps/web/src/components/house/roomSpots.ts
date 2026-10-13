// Plain data shared by the profile page and the 3D scene. Kept out of
// HousePreviewScene so importing it doesn't pull three.js into the page bundle.
export type HouseView = "outside" | "inside"

export type RoomSpot = { x: number; z: number }

// Open floor away from the default furniture layout.
export const AVATAR_HOME: RoomSpot = { x: -1.6, z: 1.6 }
