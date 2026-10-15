"use client"

import { useCallback, useEffect, useState } from "react"
import { HOUSING_TIERS, WELCOME_GRANT } from "@tiral/game-core"
import { formatCoins } from "@/lib/useCoins"
import { usePlayer } from "@/lib/player"
import { Modal } from "@/components/ui/Modal"
import { ActionButton } from "@/components/ui"

const key = (userId: string) => `tiral:first-run:${userId}`

function read(userId: string): string | null {
  try {
    return localStorage.getItem(key(userId))
  } catch {
    return null
  }
}

function write(userId: string, value: string) {
  try {
    localStorage.setItem(key(userId), value)
  } catch {
    // private mode: the intro may show again next time, which is harmless
  }
}

/**
 * New players get a three-step intro, then the Quick race button pulses until
 * their first race. Players who have already raced never see it.
 */
export function useFirstRun(userId: string | null) {
  const { player } = usePlayer()
  const [state, setState] = useState<string | null | undefined>(undefined)
  const veteran = player?.entries.some((entry) => entry.reason.startsWith("race")) ?? false

  useEffect(() => {
    setState(userId ? read(userId) : undefined)
  }, [userId])

  const finishIntro = useCallback(() => {
    if (!userId) return
    write(userId, "intro-done")
    setState("intro-done")
  }, [userId])

  const markRaced = useCallback(() => {
    if (!userId) return
    write(userId, "raced")
    setState("raced")
  }, [userId])

  return {
    showIntro: userId !== null && state === null && !veteran,
    highlight: state === "intro-done" && !veteran,
    finishIntro,
    markRaced
  }
}

export function FirstRunIntro({ onDone }: { onDone(): void }) {
  const { player, refresh } = usePlayer()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(player?.user.displayName ?? "")
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const canRename = player ? !player.user.tiktokLinked : false
  const startRent = HOUSING_TIERS[0].rent

  const saveName = async () => {
    const trimmed = name.trim()
    if (!player || !canRename || trimmed === player.user.displayName) return setStep(1)
    setSaving(true)
    setNotice(null)
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: trimmed })
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        setNotice(body.error ?? "Couldn't save that name")
        return
      }
      await refresh()
      setStep(1)
    } finally {
      setSaving(false)
    }
  }

  const steps = [
    {
      title: "What should Kampala call you?",
      body: canRename ? (
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={24}
          aria-label="Your runner name"
          autoFocus
          className="mt-3 min-h-[48px] w-full rounded-xl border border-white/15 bg-slate-900 px-3 font-bold text-white"
        />
      ) : (
        <p className="mt-2 text-sm text-slate-300">
          You&apos;re <span className="font-bold text-white">{player?.user.displayName}</span>, straight from TikTok.
        </p>
      ),
      action: (
        <ActionButton variant="primary" className="w-full" disabled={saving || (canRename && !name.trim())} onClick={() => void saveName()}>
          {saving ? "Saving…" : "That's me"}
        </ActionButton>
      )
    },
    {
      title: "Life here costs money",
      body: (
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          You arrived with <span className="font-mono font-bold text-amber-200">{formatCoins(WELCOME_GRANT)} BNG</span>.
          Your room in Kisenyi costs{" "}
          <span className="font-mono font-bold text-amber-200">{formatCoins(startRent)}</span> every two days, and
          family will message asking for help. Miss rent and you move somewhere worse.
        </p>
      ),
      action: (
        <ActionButton variant="primary" className="w-full" onClick={() => setStep(2)}>
          Banange…
        </ActionButton>
      )
    },
    {
      title: "Race to earn",
      body: (
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Race other people to a treasure on real Kampala streets. Finishing pays, podiums pay more, and your first win
          of the day pays extra. Hold Sprint to go faster, but don&apos;t run on empty.
        </p>
      ),
      action: (
        <ActionButton variant="primary" className="w-full" onClick={onDone}>
          ▶ Let&apos;s race
        </ActionButton>
      )
    }
  ]
  const current = steps[step]!

  return (
    <Modal
      labelledBy="intro-title"
      onClose={onDone}
      closeOnBackdrop={false}
      backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
      className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-950 p-5 text-white shadow-2xl"
    >
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`}>
          {steps.map((_, index) => (
            <span key={index} className={`h-1.5 w-6 rounded-full ${index <= step ? "bg-amber-400" : "bg-white/15"}`} />
          ))}
        </div>
        <button type="button" onClick={onDone} className="min-h-[44px] px-3 text-xs font-bold text-slate-400">
          Skip
        </button>
      </div>
      <h2 id="intro-title" className="mt-4 text-xl font-black">
        {current.title}
      </h2>
      {current.body}
      {notice && <p className="mt-2 text-xs font-bold text-rose-300">{notice}</p>}
      <div className="mt-5">{current.action}</div>
    </Modal>
  )
}
