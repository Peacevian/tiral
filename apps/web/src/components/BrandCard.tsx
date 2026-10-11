"use client"

import type { BillboardPin } from "./BillboardLayer"

export function BrandCard({
  pin,
  onClose,
  onAdvertise
}: {
  pin: BillboardPin
  onClose(): void
  onAdvertise(): void
}) {
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-[min(92vw,340px)] overflow-hidden rounded-2xl border border-amber-300/30 bg-slate-950/95 text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {pin.imagePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pin.imagePath} alt={pin.brandName ?? pin.slotName} className="h-36 w-full object-cover" />
        ) : (
          <div className="flex h-24 w-full items-center justify-center bg-slate-800 text-3xl">
            {pin.kind === "ad" ? "★" : "+"}
          </div>
        )}
        <div className="p-4">
          <div className="text-lg font-black">
            {pin.kind === "ad" ? pin.brandName : pin.slotName}
          </div>
          {pin.kind === "ad" && pin.link ? (
            <a
              href={pin.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block w-full rounded-xl bg-amber-400 px-4 py-3 text-center text-sm font-black text-slate-950"
            >
              Visit brand
            </a>
          ) : (
            <button
              type="button"
              onClick={onAdvertise}
              className="mt-3 w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-slate-950"
            >
              Advertise here — 20k UGX / 3 days
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-slate-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
