import Link from "next/link"

export function AdvertiseCta() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="rounded-2xl border border-amber-300/25 bg-gradient-to-br from-amber-400/15 via-transparent to-transparent p-6 text-center sm:p-10">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
          For brands
        </div>
        <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">
          Put your brand on Kampala&apos;s streets
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-300 sm:text-base">
          In-game billboards from 20,000 UGX per 3 days. Pay with mobile money,
          live in minutes — players tap your pin to meet you.
        </p>
        <Link
          href="/advertise"
          className="mt-5 inline-block rounded-xl border border-amber-300/50 px-6 py-3 text-sm font-black text-amber-200 transition hover:bg-amber-400/10"
        >
          Advertise in Tiral →
        </Link>
      </div>
    </section>
  )
}
