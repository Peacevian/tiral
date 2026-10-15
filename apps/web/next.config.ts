import type { NextConfig } from "next"
import path from "path"

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  transpilePackages: [
    "three",
    "@react-three/fiber",
    "@react-three/drei",
    "@tiral/game-core",
    "@tiral/map",
    "@tiral/road-graph",
    "@tiral/routing",
    "@tiral/db",
    "@tiral/avatars",
  ],
  async headers() {
    return [
      {
        // 3D models have versioned file names (runner-v2.glb): cache for a year.
        source: "/models/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      },
      {
        // Versioned file names (lofi-v1.mp3): a new file gets a new name.
        source: "/music/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      },
      {
        // Landing images are versioned too (hero-phone-v1.webp).
        source: "/landing/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      }
    ]
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".jsx": [".tsx", ".jsx"],
      ...config.resolve.extensionAlias,
    }
    return config
  },
}

export default nextConfig
