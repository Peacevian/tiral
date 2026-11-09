import { useEffect, useState } from "react"
import { buildChart } from "./chart"
import { ChartView } from "./ChartView"
import { RoundView } from "./RoundView"
import { advance, createRound, formatClock, formatRemaining, ROUND_MS, tap, type Round } from "./round"
import type { PartId } from "./parts"

type View = "round" | "chart"

export function App() {
  const [round, setRound] = useState<Round>(() => createRound(1))
  const [view, setView] = useState<View>("round")

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    let accrued = 0
    const loop = (now: number) => {
      const dt = Math.min(250, now - last)
      last = now
      accrued += dt
      if (accrued >= 80) {
        const step = accrued
        accrued = 0
        setRound((current) => (current.ended ? current : advance(current, step)))
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (round.ended) setView("chart")
  }, [round.ended])

  function press(part: PartId) {
    setRound((current) => tap(current, part))
  }

  function again() {
    setRound(createRound((Date.now() >>> 0) || 1))
    setView("round")
  }

  function showRound() {
    if (round.ended) again()
    else setView("round")
  }

  const clock = view === "chart" || round.ended ? formatClock(round.t) : formatRemaining(ROUND_MS - round.t)

  return (
    <div className="app" data-view={view}>
      <header>
        <div className="brand">ONE BODY</div>
        <div className="live"><i /> LIVE</div>
        <div className="views">
          <button type="button" data-go="round" aria-pressed={view === "round"} onClick={showRound}>ROUND</button>
          <button type="button" data-go="chart" aria-pressed={view === "chart"} onClick={() => setView("chart")}>CHART</button>
        </div>
        <div className="spacer" />
        <div className="course">COURSE 01</div>
        <div className="timer">{clock}</div>
      </header>
      <RoundView round={round} onTap={press} />
      <ChartView chart={buildChart(round)} onAgain={again} />
    </div>
  )
}
