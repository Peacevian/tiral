import type { Metadata, Viewport } from "next"
import "./globals.css"
import { ColyseusProvider } from "@/components/ColyseusProvider"
import { MobileTabBar } from "@/components/MobileTabBar"

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tiral.geinz.lol"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Tiral — Kampala Treasure Race",
  description:
    "Hunt treasure on the real streets of Kampala. Free multiplayer browser game — no install. Pick a start, race rivals to a hidden bounty.",
  openGraph: {
    title: "Tiral — Kampala Treasure Race",
    description:
      "Free multiplayer treasure-hunting on real Kampala streets. Play in your browser, no install.",
    url: "/",
    siteName: "Tiral",
    type: "website",
    images: [{ url: "/tiral-icon-1024.png", width: 1024, height: 1024, alt: "Tiral" }]
  },
  twitter: {
    card: "summary",
    title: "Tiral — Kampala Treasure Race",
    description: "Free multiplayer treasure-hunting on real Kampala streets. No install.",
    images: ["/tiral-icon-1024.png"]
  }
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
      <head>
        {/* Map style, tiles, glyphs and sprites all come from here: open the
            TLS connection while JS is still downloading. */}
        <link rel="preconnect" href="https://tiles.openfreemap.org" crossOrigin="anonymous" />
      </head>
      <body className="tiral-game w-screen min-h-screen overflow-x-hidden">
        <ColyseusProvider>{children}</ColyseusProvider>
        <MobileTabBar />
      </body>
    </html>
  )
}
