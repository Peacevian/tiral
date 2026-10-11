"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { rotationShare } from "@/lib/billboards"

const PRICE_PER_SLOT_UGX = 20000

type Slot = { id: string; name: string; lat: number; lng: number; tier: string }
type Campaign = { id: string; slotIds: string[] }

type Phase =
  | { step: "form" }
  | { step: "waiting"; campaignId: string }
  | { step: "done" }
  | { step: "failed"; message: string }

export default function AdvertisePage() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<string[]>([])
  const [brandName, setBrandName] = useState("")
  const [link, setLink] = useState("")
  const [msisdn, setMsisdn] = useState("")
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>({ step: "form" })
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/billboards/active")
      .then(async (response) => {
        if (!response.ok) return null
        return (await response.json()) as { slots: Slot[]; campaigns: Campaign[] }
      })
      .then((body) => {
        if (cancelled || !body) return
        setSlots(body.slots)
        setSelected(body.slots.map((slot) => slot.id))
        const counts: Record<string, number> = {}
        for (const campaign of body.campaigns) {
          for (const slotId of campaign.slotIds) {
            counts[slotId] = (counts[slotId] ?? 0) + 1
          }
        }
        setLiveCounts(counts)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const toggleSlot = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((slotId) => slotId !== id) : [...current, id]
    )
  }

  const uploadImage = async (file: File) => {
    setUploading(true)
    setFormError(null)
    try {
      const form = new FormData()
      form.append("image", file)
      const response = await fetch("/api/billboards/upload", { method: "POST", body: form })
      const body = (await response.json()) as { imagePath?: string; error?: string }
      if (!response.ok || !body.imagePath) {
        setFormError(body.error ?? "Upload failed")
        return
      }
      setImagePath(body.imagePath)
    } catch {
      setFormError("Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const submit = async () => {
    setSubmitting(true)
    setFormError(null)
    try {
      const response = await fetch("/api/billboards/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName, imagePath, link, slotIds: selected, msisdn })
      })
      const body = (await response.json()) as { campaignId?: string; error?: string }
      if (!response.ok || !body.campaignId) {
        setFormError(body.error ?? "Purchase failed")
        return
      }
      setPhase({ step: "waiting", campaignId: body.campaignId })
    } catch {
      setFormError("Purchase failed")
    } finally {
      setSubmitting(false)
    }
  }

  const recheck = useCallback(async (campaignId: string) => {
    try {
      const response = await fetch(`/api/billboards/campaigns/${campaignId}`)
      const body = (await response.json()) as { status?: string }
      if (body.status === "active") setPhase({ step: "done" })
      else if (body.status === "failed" || body.status === "expired") {
        setPhase({ step: "failed", message: "Payment did not complete — no charge was kept pending. Try again." })
      }
    } catch {
      // keep waiting; next poll retries
    }
  }, [])

  useEffect(() => {
    if (phase.step !== "waiting") return
    const interval = setInterval(() => void recheck(phase.campaignId), 4000)
    return () => clearInterval(interval)
  }, [phase, recheck])

  const total = PRICE_PER_SLOT_UGX * selected.length

  return (
    <main className="mx-auto min-h-screen w-full max-w-xl bg-slate-950 px-4 py-8 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Advertise in Tiral</h1>
        <Link href="/" className="rounded-lg border border-white/15 px-3 py-2 text-sm font-bold text-slate-200">
          ← Race
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        20,000 UGX per slot · 3 days · your ad rotates with others, 15 seconds each.
      </p>

      {phase.step === "done" && (
        <div className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-5 text-center">
          <div className="text-xl font-black text-emerald-200">You are live!</div>
          <p className="mt-1 text-sm text-slate-300">
            Your billboard is now rotating in every race for the next 3 days.
          </p>
        </div>
      )}

      {phase.step === "failed" && (
        <div className="mt-4 rounded-2xl border border-rose-300/30 bg-rose-400/10 p-5 text-center">
          <div className="text-xl font-black text-rose-200">Payment incomplete</div>
          <p className="mt-1 text-sm text-slate-300">{phase.message}</p>
          <button
            type="button"
            onClick={() => setPhase({ step: "form" })}
            className="mt-3 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold"
          >
            Try again
          </button>
        </div>
      )}

      {phase.step === "waiting" && (
        <div className="mt-4 rounded-2xl border border-cyan-300/30 bg-cyan-400/10 p-5 text-center">
          <div className="text-xl font-black text-cyan-200">Check your phone</div>
          <p className="mt-1 text-sm text-slate-300">
            Approve the mobile-money PIN prompt to complete payment. This page updates automatically.
          </p>
          <button
            type="button"
            onClick={() => void recheck(phase.campaignId)}
            className="mt-3 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold"
          >
            I approved — check now
          </button>
        </div>
      )}

      {phase.step === "form" && (
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Slots ({selected.length} selected)
            </div>
            <div className="grid grid-cols-2 gap-2">
              {slots.map((slot) => {
                const live = liveCounts[slot.id] ?? 0
                const share = Math.round(rotationShare(live) * 100)
                const on = selected.includes(slot.id)
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => toggleSlot(slot.id)}
                    className={`rounded-xl border px-3 py-2 text-left transition ${
                      on ? "border-amber-300 bg-amber-300/15" : "border-white/10 bg-white/5 opacity-60"
                    }`}
                  >
                    <div className="text-sm font-bold">{slot.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {live === 0 ? "empty — ~100% airtime" : `${live} live — ~${share}% airtime`}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Brand name</span>
            <input
              value={brandName}
              maxLength={40}
              onChange={(event) => setBrandName(event.target.value)}
              placeholder="e.g. Kafunda Coffee"
              className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-base"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Link</span>
            <input
              value={link}
              inputMode="url"
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://…"
              className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-base"
            />
          </label>

          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Billboard image (2:1 ideal, under 2 MB)
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void uploadImage(file)
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full rounded-xl border border-dashed border-white/25 px-3 py-3 text-sm font-bold text-slate-200 disabled:opacity-40"
            >
              {uploading ? "Uploading…" : imagePath ? "✓ Image uploaded — replace?" : "Choose image"}
            </button>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Mobile money number (MTN/Airtel)
            </span>
            <input
              value={msisdn}
              inputMode="tel"
              onChange={(event) => setMsisdn(event.target.value)}
              placeholder="07… or +256…"
              className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-base"
            />
          </label>

          {formError && (
            <div className="rounded-xl bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{formError}</div>
          )}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || uploading || selected.length === 0 || !imagePath}
            className="rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-40"
          >
            {submitting ? "Starting payment…" : `Pay UGX ${total.toLocaleString()} for 3 days`}
          </button>
          <p className="text-center text-[11px] text-slate-500">
            You will approve the charge with your mobile-money PIN.
          </p>
        </div>
      )}
    </main>
  )
}
