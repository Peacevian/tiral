"use client"

import { useEffect, useState } from "react"
import { Modal } from "@/components/ui/Modal"
import { ActionButton } from "@/components/ui"

export type ShareCard = {
  /** The story poster (PNG) to share or save. */
  imageUrl: string
  /** The link that goes with it (its chat preview shows the same card). */
  link: string
  text: string
  title: string
  filename: string
}

/**
 * Share a poster: preview it, then hand image + link to the phone's share
 * sheet (WhatsApp Status, TikTok, Instagram…), or save the image and copy the
 * link where sharing files isn't supported. The image loads first, so the
 * share tap that follows still counts as the player's own gesture.
 */
export function ShareSheet({ card, onClose }: { card: ShareCard; onClose(): void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    fetch(card.imageUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        const blob = await response.blob()
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setPreview(url)
        setFile(new File([blob], card.filename, { type: blob.type || "image/png" }))
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [card.imageUrl, card.filename])

  const canShareFile = !!file && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] })

  const share = async () => {
    try {
      if (canShareFile) await navigator.share({ files: [file!], title: card.title, text: `${card.text} ${card.link}` })
      else if (navigator.share) await navigator.share({ title: card.title, text: card.text, url: card.link })
      else return copy()
      setNote("Shared")
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") setNote("Couldn't open sharing here. Save the image and copy the link instead.")
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${card.text} ${card.link}`)
      setNote("Link copied")
    } catch {
      setNote(card.link)
    }
  }

  return (
    <Modal
      label="Share"
      onClose={onClose}
      portal
      backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center"
      className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-sm flex-col gap-3 overflow-y-auto rounded-3xl border border-sheet-line bg-sheet p-4 text-sheet-ink shadow-2xl"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-black">Share</h2>
        <button type="button" onClick={onClose} className="min-h-[44px] px-3 text-xs font-bold text-sheet-mute">
          Close
        </button>
      </div>
      <div className="flex aspect-[9/16] max-h-[52dvh] items-center justify-center self-center overflow-hidden rounded-2xl border border-sheet-line bg-sheet-soft">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Your share image" className="h-full w-full object-contain" />
        ) : (
          <span className="px-6 text-center text-xs text-sheet-mute">{failed ? "Couldn't make the image. You can still share the link." : "Making your image…"}</span>
        )}
      </div>
      <ActionButton variant="flame" size="lg" disabled={!file && !failed} onClick={() => void share()}>
        {canShareFile ? "Share image + link" : "Share link"}
      </ActionButton>
      <div className="grid grid-cols-2 gap-2">
        {preview ? (
          <a href={preview} download={card.filename} className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-sheet-line text-sm font-black text-sheet-ink">
            Save image
          </a>
        ) : (
          <span className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-sheet-line text-sm font-black text-sheet-mute">Save image</span>
        )}
        <ActionButton variant="sheet" onClick={() => void copy()}>
          Copy link
        </ActionButton>
      </div>
      {note && (
        <p role="status" className="break-all text-center text-xs font-bold text-leaf">
          {note}
        </p>
      )}
    </Modal>
  )
}

/** The share card for a prize race (poster + its link). */
export function raceShareCard(race: { roomCode: string; pot: number; host: string }): ShareCard {
  return {
    imageUrl: `/api/share/race/${race.roomCode}`,
    link: `${window.location.origin}/r/${race.roomCode}`,
    text: `${race.pot.toLocaleString("en-US")} BNG prize race by ${race.host} on Tiral. Code ${race.roomCode}`,
    title: "Tiral prize race",
    filename: `tiral-prize-race-${race.roomCode}.png`
  }
}

/** The brag card for a prize race winner. */
export function winShareCard(win: { roomCode: string; place: number; amount: number; host: string }): ShareCard {
  return {
    imageUrl: `/api/share/win/${win.roomCode}/${win.place}`,
    link: `${window.location.origin}/w/${win.roomCode}/${win.place}`,
    text: `I won ${win.amount.toLocaleString("en-US")} BNG in ${win.host}'s prize race on Tiral. Think you can beat me?`,
    title: "I won on Tiral",
    filename: `tiral-win-${win.roomCode}.png`
  }
}
