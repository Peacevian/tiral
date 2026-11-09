import type { Metadata, Viewport } from "next"
import "./globals.css"
import { PrivyGate } from "@/components/auth/PrivyGate"
import { ColyseusProvider } from "@/components/ColyseusProvider"
import { PlayerProvider } from "@/lib/player"
import { AppNav } from "@/components/shell/AppNav"
import { ServiceWorker } from "@/components/ServiceWorker"

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://playtiral.com"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Tiral — Kampala Hustle",
  description:
    "Hustle on the real streets of Kampala: race rivals to hidden treasure, carry loads, ride boda, run a rolex stand. Free multiplayer browser game, no install.",
  openGraph: {
    title: "Tiral — Kampala Hustle",
    description:
      "Race, hustle and get by on real Kampala streets. Free multiplayer, in your browser, no install.",
    url: "/",
    siteName: "Tiral",
    type: "website",
    images: [{ url: "/tiral-icon-1024.png", width: 1024, height: 1024, alt: "Tiral" }]
  },
  twitter: {
    card: "summary",
    title: "Tiral — Kampala Hustle",
    description: "Race, hustle and get by on real Kampala streets. Free, no install.",
    images: ["/tiral-icon-1024.png"]
  }
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F4F8FD"
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
      <body className="w-screen min-h-screen overflow-x-hidden">
        <PrivyGate>
          <PlayerProvider>
            <ColyseusProvider>
              {children}
              <AppNav />
            </ColyseusProvider>
          </PlayerProvider>
        </PrivyGate>
        <ServiceWorker />
      </body>
    </html>
  )
}
