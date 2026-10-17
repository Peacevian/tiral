// The loader on every page: the TIRAL wordmark with an orange bar sliding
// under it, and what's loading. Plain markup and CSS (globals.css), so it
// shows instantly on any phone.

export function Loader({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center gap-3 ${className}`}>
      <div className="text-xl font-black tracking-[0.18em] text-flame-deep">TIRAL</div>
      <div aria-hidden className="tiral-loader-bar h-1.5 w-32 overflow-hidden rounded-full bg-sheet-soft">
        <span className="block h-full w-2/5 rounded-full bg-flame" />
      </div>
      {label && <p className="text-sm font-bold text-sheet-mute">{label}</p>}
    </div>
  )
}

/** A whole page that's loading: the loader in the centre of the screen. */
export function PageLoader({ label }: { label?: string }) {
  return (
    <main className="fixed inset-0 z-[45] flex items-center justify-center bg-sheet px-6">
      <Loader label={label} />
    </main>
  )
}

/** Loading inside a page (a list, a panel): centred in the space below the page's title. */
export function SectionLoader({ label }: { label?: string }) {
  return <Loader label={label} className="min-h-[55dvh] justify-center" />
}
