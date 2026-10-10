import type { Metadata, Viewport } from "next"
import "./globals.css"
import { ColyseusProvider } from "@/components/ColyseusProvider"

export const metadata: Metadata = {
  title: "Tiral — Kampala Treasure Race",
  description: "Multiplayer map-based treasure-hunting game",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#020617"
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="tiral-game w-screen h-screen overflow-hidden">
        <ColyseusProvider>{children}</ColyseusProvider>
      </body>
    </html>
  )
}
