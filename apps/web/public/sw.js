// Tiral service worker: keeps the app on the phone so repeat visits on 3G/4G
// load almost nothing over the network. Registered in production only
// (components/ServiceWorker.tsx).
//
// What it caches:
//   app code (/_next/static, hashed)       cache first
//   models + landing images (versioned)    cache first
//   map style, fonts and tiles             cache first (tile URLs carry the
//                                          planet version), size-capped
//   /api/roads                             cached copy now, refresh behind
//   pages (HTML)                           network first; cached copy only
//                                          when the network itself fails
// Everything else (game data, the game connection, payments) goes straight
// to the network.
//
// Kill switch: to remove it from every phone, replace this file with one that
// calls self.registration.unregister() and clears caches, and deploy.

const VERSION = "v2"
const STATIC = `tiral-static-${VERSION}`
const PAGES = `tiral-pages-${VERSION}`
const MAP = `tiral-map-${VERSION}`
const DATA = `tiral-data-${VERSION}`
const KEEP = [STATIC, PAGES, MAP, DATA]

const LIMITS = { [STATIC]: 400, [PAGES]: 30, [MAP]: 600, [DATA]: 10 }
const MAP_HOST = "tiles.openfreemap.org"

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("tiral-") && !KEEP.includes(key)) await caches.delete(key)
      }
      await self.clients.claim()
    })()
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/models/") || url.pathname.startsWith("/landing/")) {
      event.respondWith(cacheFirst(request, STATIC))
      return
    }
    if (url.pathname === "/api/roads") {
      event.respondWith(staleWhileRevalidate(event, request, DATA))
      return
    }
    if (request.mode === "navigate") {
      event.respondWith(networkFirst(request, PAGES))
      return
    }
    return
  }

  if (url.host === MAP_HOST) {
    // Style JSON can change; fonts and versioned tiles don't.
    event.respondWith(url.pathname.startsWith("/styles/") ? staleWhileRevalidate(event, request, MAP) : cacheFirst(request, MAP))
  }
})

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (cacheable(response)) {
    await cache.put(request, response.clone())
    void trim(cacheName)
  }
  return response
}

async function staleWhileRevalidate(event, request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  const refresh = fetch(request)
    .then(async (response) => {
      if (cacheable(response)) {
        await cache.put(request, response.clone())
        void trim(cacheName)
      }
      return response
    })
    .catch(() => null)
  if (hit) {
    event.waitUntil(refresh)
    return hit
  }
  return (await refresh) ?? Response.error()
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (cacheable(response)) {
      await cache.put(request, response.clone())
      void trim(cacheName)
    }
    return response
  } catch {
    // Offline only. A saved page from the previous deploy points at scripts
    // that no longer exist, which blanks the site.
    const hit = await cache.match(request)
    if (hit) return hit
    return Response.error()
  }
}

function cacheable(response) {
  // Opaque (cross-origin, no-cors) responses can't be checked: skip them.
  return response && response.ok && response.type !== "opaque"
}

/** Keep each cache under its limit by dropping the oldest entries. */
async function trim(cacheName) {
  const limit = LIMITS[cacheName]
  if (!limit) return
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i])
}
