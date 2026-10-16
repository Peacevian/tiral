"use client"

// Hold to sprint (×1.35). Pointer events so it works with touch, mouse and pen;
// releasing anywhere — or losing the pointer — stops the sprint.
export function SprintButton({
  active,
  disabled,
  empty,
  onChange
}: {
  active: boolean
  disabled: boolean
  /** Energy is at zero: sprinting now costs health. */
  empty: boolean
  onChange(on: boolean): void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      aria-label="Sprint (hold)"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        onChange(true)
      }}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
      onLostPointerCapture={() => onChange(false)}
      onContextMenu={(event) => event.preventDefault()}
      className={`flex h-[72px] w-[72px] touch-none select-none flex-col items-center justify-center rounded-full border-[3px] text-[11px] font-black uppercase tracking-wide shadow-2xl transition disabled:opacity-40 ${
        active
          ? empty
            ? "scale-95 border-red-300 bg-red-600 text-white"
            : "scale-95 border-flame-soft bg-flame text-white"
          : "border-flame bg-sheet-card/95 text-flame-deep"
      }`}
    >
      <span aria-hidden className="text-xl leading-none">
        ⚡
      </span>
      Sprint
    </button>
  )
}
