"use client"

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react"

// Tiral UI kit. Colour language, used everywhere:
//   amber   = primary actions and money      emerald = gains, success, "live"
//   rose    = losses, danger, warnings       violet  = stress
//   cyan    = secondary actions / info       slate   = surfaces and text
// Surfaces are slate-950 glass over the map; radius xl for controls, 2xl for cards.

export function Card({
  children,
  tone = "default",
  className = ""
}: {
  children: ReactNode
  tone?: "default" | "amber" | "rose" | "emerald"
  className?: string
}) {
  const tones = {
    default: "border-white/10 bg-white/5",
    amber: "border-amber-300/40 bg-amber-300/10",
    rose: "border-rose-300/40 bg-rose-400/10",
    emerald: "border-emerald-300/40 bg-emerald-400/10"
  }
  return <div className={`rounded-2xl border p-3 ${tones[tone]} ${className}`}>{children}</div>
}

export function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
      <span>{children}</span>
      {aside && <span className="normal-case tracking-normal">{aside}</span>}
    </div>
  )
}

export function StatMeter({
  label,
  icon,
  value,
  color,
  compact = false
}: {
  label: string
  icon: string
  value: number
  color: string
  compact?: boolean
}) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="min-w-0">
      {!compact && (
        <div className="flex items-baseline justify-between text-xs font-bold text-slate-300">
          <span>
            <span aria-hidden>{icon}</span> {label}
          </span>
          <span className="font-mono">{Math.round(pct)}/100</span>
        </div>
      )}
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className={`overflow-hidden rounded-full bg-white/10 ${compact ? "h-1.5" : "mt-1 h-2.5"}`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}

export function Badge({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      className={`grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-black leading-none text-white ${className}`}
    >
      {count > 9 ? "9+" : count}
    </span>
  )
}

type ActionVariant = "primary" | "secondary" | "ghost" | "danger"

/** ActionButton's look, for other buttons (e.g. ConfirmButton) that should match it. */
export function actionButtonClass(variant: ActionVariant = "secondary", size: "md" | "lg" = "md") {
  const variants: Record<ActionVariant, string> = {
    primary: "bg-amber-400 text-slate-950 hover:bg-amber-300",
    secondary: "bg-white/10 text-white hover:bg-white/15",
    ghost: "border border-white/15 text-slate-200 hover:bg-white/5",
    danger: "border border-rose-300/40 text-rose-200 hover:bg-rose-400/10"
  }
  const sizes = { md: "min-h-[44px] px-3 text-sm", lg: "min-h-[56px] px-4 text-base" }
  return `inline-flex items-center justify-center gap-2 rounded-xl font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:opacity-40 ${variants[variant]} ${sizes[size]}`
}

export function ActionButton({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ActionVariant; size?: "md" | "lg" }) {
  return (
    <button type="button" {...props} className={`${actionButtonClass(variant, size)} ${className}`}>
      {children}
    </button>
  )
}

/**
 * A button for actions that can't be undone (end a shift, drop a job, move
 * house): the first tap arms it ("Tap again to end shift") for a few seconds,
 * only a second tap acts. Pass `confirm={false}` when the action is harmless
 * right now (e.g. a clean car) to act on the first tap.
 */
export function ConfirmButton({
  onConfirm,
  confirmLabel,
  confirm = true,
  className = "",
  armedClassName = "",
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  onConfirm(): void
  confirmLabel: ReactNode
  confirm?: boolean
  armedClassName?: string
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const id = setTimeout(() => setArmed(false), 3500)
    return () => clearTimeout(id)
  }, [armed])
  return (
    <button
      type="button"
      {...props}
      onClick={() => {
        if (!confirm || armed) {
          setArmed(false)
          onConfirm()
        } else {
          setArmed(true)
        }
      }}
      onBlur={() => setArmed(false)}
      className={`${className} ${armed ? armedClassName : ""}`}
    >
      {armed ? confirmLabel : children}
    </button>
  )
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/10 motion-reduce:animate-none ${className}`} />
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-center text-xs text-slate-400">
      {children}
    </p>
  )
}

/** "in 31h 5m" / "now" for a future ISO time. */
/**
 * The server can't be reached. Shown instead of a sign-in screen, so nobody
 * makes a new guest account (and strands the old one) during an outage.
 */
export function ServerUnreachable({ onRetry, retrying = false }: { onRetry(): void; retrying?: boolean }) {
  return (
    <div role="alert" className="px-4 pb-5 pt-2 text-center">
      <div aria-hidden className="text-3xl">
        📡
      </div>
      <p className="mt-1 text-base font-black text-white">Can&apos;t reach Tiral right now</p>
      <p className="mt-1 text-sm text-slate-300">Your account and coins are safe. We&apos;ll keep trying, or check your connection.</p>
      <ActionButton variant="primary" className="mt-3 w-full" disabled={retrying} onClick={onRetry}>
        {retrying ? "Trying again…" : "Try again"}
      </ActionButton>
    </div>
  )
}

export function untilText(iso: string): string {
  const minutes = Math.round((Date.parse(iso) - Date.now()) / 60000)
  if (minutes <= 0) return "now"
  if (minutes < 60) return `in ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `in ${hours}h ${minutes % 60}m`
  return `in ${Math.floor(hours / 24)}d ${hours % 24}h`
}

/** "5m ago" / "3h ago" for a past ISO time. */
export function agoText(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
