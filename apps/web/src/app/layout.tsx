import type { Metadata } from "next"
import "./globals.css"

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
      <body className="w-screen h-screen overflow-hidden">{children}</body>
    </html>
  )
}
