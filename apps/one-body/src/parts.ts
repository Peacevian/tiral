export const PART_IDS = [
  "pea",
  "boobs",
  "dick",
  "pob",
  "dee",
  "domx",
  "plug",
  "anal",
  "icp",
  "sh1t",
  "fuck",
  "nonut",
  "cum",
  "bepees",
  "agentcuck"
] as const

export type PartId = (typeof PART_IDS)[number]

export type Part = {
  id: PartId
  ticker: string
  success: string
  blame: string
  ignored: string
}

export const PARTS: Record<PartId, Part> = {
  pea: { id: "pea", ticker: "$PEA", success: "Wall.", blame: "I blinked.", ignored: "I said wall." },
  boobs: { id: "boobs", ticker: "$BOOBS", success: "Blocked.", blame: "Watched.", ignored: "I was the shield." },
  dick: { id: "dick", ticker: "$DICK", success: "In charge.", blame: "Finished before the wall.", ignored: "I was charging." },
  pob: { id: "pob", ticker: "$POB", success: "Absorbed.", blame: "Tender.", ignored: "I can soak one." },
  dee: { id: "dee", ticker: "$DEE", success: "Deez.", blame: "Deez.", ignored: "Deez." },
  domx: { id: "domx", ticker: "$DOMX", success: "Good.", blame: "I said unplug.", ignored: "Listen." },
  plug: { id: "plug", ticker: "$PLUG", success: "On order.", blame: "The plug left.", ignored: "Still seated." },
  anal: { id: "anal", ticker: "$ANAL", success: "Clear.", blame: "Clearance 99%.", ignored: "I can make that." },
  icp: { id: "icp", ticker: "$ICP", success: "In the green.", blame: "I see it.", ignored: "Release." },
  sh1t: { id: "sh1t", ticker: "$SH1TCOIN", success: "Dropped.", blame: "Still carrying.", ignored: "That was mine." },
  fuck: { id: "fuck", ticker: "$FUCK", success: "No fucks.", blame: "No fucks.", ignored: "No fucks." },
  nonut: { id: "nonut", ticker: "$NONUT", success: "Lasted.", blame: "Early.", ignored: "Quiet." },
  cum: { id: "cum", ticker: "$CUM", success: "Wen.", blame: "Early.", ignored: "Wen." },
  bepees: { id: "bepees", ticker: "$BEPEES", success: "Still making noise.", blame: "Still making noise.", ignored: "Still making noise." },
  agentcuck: { id: "agentcuck", ticker: "$AGENTCUCK", success: "I carried.", blame: "I was watching.", ignored: "I was watching." }
}

export const BAR: PartId[] = [
  "pea",
  "boobs",
  "dick",
  "pob",
  "dee",
  "domx",
  "plug",
  "anal",
  "icp",
  "sh1t",
  "fuck",
  "nonut",
  "cum"
]
