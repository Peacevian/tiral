"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A real dialog: labelled for screen readers, focus moves in (and back out
 * when it closes), Tab stays inside, Esc and a tap on the backdrop close it.
 * Without `onClose` it can't be dismissed (an alert the player must act on).
 */
export function Modal({
  label,
  labelledBy,
  onClose,
  alert = false,
  focus = "first",
  closeOnBackdrop = true,
  portal = false,
  backdropClassName,
  className,
  children
}: {
  /** Accessible name, unless `labelledBy` points at a visible heading. */
  label?: string
  labelledBy?: string
  onClose?(): void
  /** Urgent and must be answered (role="alertdialog"). */
  alert?: boolean
  /** "panel" when a stray key press must not hit a button (it pops up mid-game). */
  focus?: "first" | "panel"
  /** False when a stray tap outside would lose something (onboarding). */
  closeOnBackdrop?: boolean
  /**
   * Render at the end of <body>: for dialogs opened from inside a panel, whose
   * own stacking would otherwise keep them under the app's tab bar.
   */
  portal?: boolean
  backdropClassName: string
  className: string
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // A portalled dialog mounts one render later (once <body> is known).
  const [body, setBody] = useState<HTMLElement | null>(null)
  useEffect(() => setBody(document.body), [])
  const mounted = !portal || body !== null

  useEffect(() => {
    if (!mounted) return
    const previous = document.activeElement as HTMLElement | null
    const node = panel.current
    // Focus the first control, or the panel itself.
    const first = focus === "first" ? node?.querySelector<HTMLElement>(FOCUSABLE) : null
    ;(first ?? node)?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onCloseRef.current) {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== "Tab" || !node) return
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.offsetParent !== null)
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const firstItem = items[0]!
      const lastItem = items[items.length - 1]!
      if (event.shiftKey && (document.activeElement === firstItem || document.activeElement === node)) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }
    document.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("keydown", onKey, true)
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
    // Set up once per opening (when the dialog is actually on the page).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  const dialog = (
    <div className={backdropClassName} onClick={() => closeOnBackdrop && onCloseRef.current?.()}>
      <div
        ref={panel}
        role={alert ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`${className} outline-none`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
  if (!portal) return dialog
  return body ? createPortal(dialog, body) : null
}
