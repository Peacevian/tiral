"use client"

// Shown when the app throws while loading. Clears a stale saved copy of the
// site, then lets the player reload the current one.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#f4f7fb", color: "#142033", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Tiral hit a snag while loading</h1>
          <p style={{ fontSize: 14, lineHeight: 1.4 }}>{error.message || "Something in the page failed."}</p>
          <button
            type="button"
            style={{ marginTop: 16, minHeight: 48, padding: "0 18px", border: 0, borderRadius: 12, background: "#e85f0c", color: "white", fontWeight: 800 }}
            onClick={() => {
              const done = () => window.location.reload()
              const clearCaches = "caches" in window ? caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))) : Promise.resolve()
              const workers = "serviceWorker" in navigator ? navigator.serviceWorker.getRegistrations().then((regs) => Promise.all(regs.map((reg) => reg.unregister()))) : Promise.resolve()
              Promise.all([clearCaches, workers]).then(done, done)
            }}
          >
            Reload Tiral
          </button>
        </div>
      </body>
    </html>
  )
}
