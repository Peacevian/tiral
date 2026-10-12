const STEPS = [
  {
    icon: "📍",
    title: "1. Pick your start",
    body: "Join a race lobby and choose from real Kampala start points — or quick-play straight in."
  },
  {
    icon: "🏃",
    title: "2. Race the bounty",
    body: "A hidden bounty is revealed on real roads. Walk, turn and outsmart rivals to reach it first."
  },
  {
    icon: "🏆",
    title: "3. Climb the ranks",
    body: "Finishes earn leaderboard spots and avatar gear. Link TikTok to keep your name everywhere."
  }
]

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-14">
      <h2 className="text-center text-2xl font-black text-white sm:text-3xl">How it works</h2>
      <p className="mt-2 text-center text-sm text-slate-400">Sixty seconds to your first race.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step) => (
          <div
            key={step.title}
            className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur-sm"
          >
            <div className="text-4xl">{step.icon}</div>
            <div className="mt-3 text-base font-black text-white">{step.title}</div>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
