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
