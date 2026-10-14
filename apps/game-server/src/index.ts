import { Server, matchMaker } from "@colyseus/core"
import { WebSocketTransport } from "@colyseus/ws-transport"
import express from "express"
import cors from "cors"
import { RaceRoom } from "./rooms/RaceRoom.js"
import { HustleRoom } from "./rooms/HustleRoom.js"
import { StallRoom } from "./rooms/StallRoom.js"

const port = Number(process.env.PORT) || 2567
const apiPort = Number(process.env.API_PORT) || 2568

const gameServer = new Server({
  transport: new WebSocketTransport()
})

gameServer.define("race", RaceRoom).filterBy(["phase"])
// Solo hustle shifts (simulated jobs); private, so never in the race list.
gameServer.define("hustle", HustleRoom)
// Mini-game hustles at a stall (rolex stand, car wash); private, solo.
gameServer.define("stall", StallRoom)

gameServer.listen(port)
console.log(`game-server listening on ws://localhost:${port}`)

const api = express()
api.use(cors())
api.get("/health", (_req, res) => {
  res.json({ ok: true })
})
api.get("/races", async (_req, res) => {
  try {
    const rooms = await matchMaker.query({ name: "race" })
    res.json(
      rooms.map((room) => {
        const metadata = (room.metadata ?? {}) as {
          roomCode?: string
          phase?: string
          playerCount?: number
          maxClients?: number
          countdownSeconds?: number | null
        }
        return {
          roomId: room.roomId,
          roomCode: metadata.roomCode ?? room.roomId.slice(0, 4).toUpperCase(),
          phase: metadata.phase ?? "lobby",
          playerCount: metadata.playerCount ?? room.clients,
          maxClients: metadata.maxClients ?? room.maxClients,
          countdownSeconds: metadata.countdownSeconds ?? null,
          locked: room.locked ?? false
        }
      })
    )
  } catch (error) {
    console.error("Failed to list races:", error)
    res.status(500).json({ error: "Could not list races" })
  }
})

api.listen(apiPort, () => {
  console.log(`race listings on http://localhost:${apiPort}/races`)
})
