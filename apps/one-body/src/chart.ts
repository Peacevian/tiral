import type { PartId } from "./parts"
import { formatCap, formatClock, marketCap, type Round } from "./round"

export type Finding = {
  part: string
  text: string
}

export type Chart = {
  title: string
  course: string
  duration: string
  disposition: string
  cap: string
  findings: Finding[]
  close: string
}

export function buildChart(round: Round): Chart {
  return {
    title: title(round),
    course: "01",
    duration: formatClock(round.t),
    disposition: round.ended ?? "walking",
    cap: formatCap(marketCap(round)),
    findings: findings(round),
    close: close(round)
  }
}

function title(round: Round): string {
  if (!round.ended) return "Walking."
  if (round.ended === "early") return "Early."
  if (round.ended === "down") return "Down."
  if (!round.cumFired) return "Lasted."
  return "Teamwork."
}

function close(round: Round): string {
  if (!round.ended) return "The body is still walking."
  if (round.ended === "early") return "Time of death: early."
  if (round.ended === "down") return "The body did not finish."
  return "The body finished in one piece."
}

function findings(round: Round): Finding[] {
  const rows: Finding[] = []
  if (round.log.some((line) => line.part === "dick" && line.kind === "success")) {
    rows.push({ part: "$DICK", text: "claims he carried" })
  }
  if (round.log.some((line) => line.part === "boobs" && line.kind === "success")) {
    rows.push({ part: "$BOOBS", text: "claims she carried" })
  }
  if (round.ended === "clear") rows.push({ part: "$AGENTCUCK", text: "claims he carried" })
  else if (round.ended) rows.push({ part: "$AGENTCUCK", text: "I was watching." })

  rows.push({ part: "$PLUG", text: plugFinding(round) })

  const anal = lastText(round, "anal")
  if (anal) rows.push({ part: "$ANAL", text: anal === "Clear." ? "shortcut clear" : anal })

  const icp = lastText(round, "icp")
  if (icp) rows.push({ part: "$ICP", text: icp === "In the green." ? "released in the green" : icp })

  if (round.ended === "clear" && !round.cumFired) rows.push({ part: "$NONUT", text: "lasted" })
  if (round.ended === "early") rows.push({ part: "$CUM", text: "early" })

  const sh1t = lastText(round, "sh1t")
  rows.push({ part: "$SH1TCOIN", text: sh1t ?? "present" })

  const fuck = lastText(round, "fuck")
  rows.push({ part: "$FUCK", text: fuck ?? "not pressed" })

  rows.push({
    part: "$DOMX",
    text: `orders followed, ${round.ordersHit} of ${round.ordersTotal}`
  })
  return rows
}

function plugFinding(round: Round): string {
  if (round.log.some((line) => line.text === "The plug left.")) return "left on its own"
  if (round.log.some((line) => line.part === "plug" && line.text === "On order.")) return "removed on order"
  if (round.log.some((line) => line.text === "Already out.")) return "already out"
  if (!round.plugIn) return "out early"
  return "still seated"
}

function lastText(round: Round, part: PartId): string | undefined {
  for (let index = round.log.length - 1; index >= 0; index -= 1) {
    const line = round.log[index]
    if (line?.part === part) return line.text
  }
  return undefined
}
