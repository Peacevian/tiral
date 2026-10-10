import type { Metadata } from "next"
import "./globals.css"
import { ColyseusProvider } from "@/components/ColyseusProvider"

export const metadata: Metadata = {
  title: "Tiral — Kampala Treasure Race",
  description: "Multiplayer map-based treasure-hunting game",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="w-screen h-screen overflow-hidden">
        <ColyseusProvider>{children}</ColyseusProvider>
      </body>
    </html>
  )
}
