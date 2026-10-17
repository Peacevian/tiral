// The loader on every page: the TIRAL wordmark with an orange bar sliding
// under it, and what's loading. Plain markup and CSS (globals.css), so it
// shows instantly on any phone.

export function Loader({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center gap-3 ${className}`}>
      <div className="text-xl font-black tracking-[0.18em] text-flame-deep">TIRAL</div>
      <div aria-hidden className="tiral-loader-bar h-1 w-24 overflow-hidden rounded-full bg-sheet-soft">
        <span className="block h-full w-1/3 rounded-full bg-flame" />
      </div>
      {label && <p className="text-sm font-bold text-sheet-mute">{label}</p>}
    </div>
  )
}

/** A whole page that's loading: the loader in the middle of the light sheet. */
export function PageLoader({ label }: { label?: string }) {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-sheet px-6 pb-[var(--shell-bottom)] pt-[var(--shell-top)]">
      <Loader label={label} />
    </main>
  )
}
