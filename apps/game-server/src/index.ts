import { Server, matchMaker } from "@colyseus/core"
import { WebSocketTransport } from "@colyseus/ws-transport"
import express from "express"
import cors from "cors"
import { RaceRoom } from "./rooms/RaceRoom.js"
import { HustleRoom } from "./rooms/HustleRoom.js"
import { StallRoom } from "./rooms/StallRoom.js"
import { startPrizeScheduler } from "./prizeScheduler.js"

// A forgotten promise rejection somewhere must not take every race and shift
// down with it: log it and keep serving.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason)
})

const port = Number(process.env.PORT) || 2567
const apiPort = Number(process.env.API_PORT) || 2568

const gameServer = new Server({
  transport: new WebSocketTransport()
})

// Races lock themselves when they start, so matchmaking only finds lobbies.
gameServer.define("race", RaceRoom)
// Solo hustle shifts (simulated jobs); private, so never in the race list.
gameServer.define("hustle", HustleRoom)
// Mini-game hustles at a stall (rolex stand, car wash); private, solo.
gameServer.define("stall", StallRoom)

void gameServer.listen(port).then(() => {
  console.log(`game-server listening on ws://localhost:${port}`)
  // Prize races open (and reopen after a restart) once the server is up.
  startPrizeScheduler()
})

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
          prize?: unknown
        }
        return {
          roomId: room.roomId,
          roomCode: metadata.roomCode ?? room.roomId.slice(0, 4).toUpperCase(),
          phase: metadata.phase ?? "lobby",
          playerCount: metadata.playerCount ?? room.clients,
          maxClients: metadata.maxClients ?? room.maxClients,
          countdownSeconds: metadata.countdownSeconds ?? null,
          prize: metadata.prize ?? null,
          locked: room.locked ?? false
        }
      })
    )
  } catch (error) {
    console.error("Failed to list races:", error)
    res.status(500).json({ error: "Could not list races" })
  }
})

// Who is in a room right now (admin dashboard). Counts only: a player in
// the hub or at home is in no room, so the daily numbers come from the DB.
api.get("/stats/live", async (_req, res) => {
  try {
    const rooms = await matchMaker.query({})
    const live = {
      generatedAt: new Date().toISOString(),
      players: 0,
      race: { rooms: 0, players: 0, lobbies: 0, racing: 0 },
      hustle: { rooms: 0, players: 0 },
      stall: { rooms: 0, players: 0 }
    }
    for (const room of rooms) {
      live.players += room.clients
      if (room.name === "race") {
        live.race.rooms += 1
        live.race.players += room.clients
        const phase = (room.metadata as { phase?: string } | undefined)?.phase ?? "lobby"
        if (phase === "racing") live.race.racing += 1
        else if (phase === "lobby" || phase === "countdown") live.race.lobbies += 1
      } else if (room.name === "hustle") {
        live.hustle.rooms += 1
        live.hustle.players += room.clients
      } else if (room.name === "stall") {
        live.stall.rooms += 1
        live.stall.players += room.clients
      }
    }
    res.json(live)
  } catch (error) {
    console.error("Failed to count live rooms:", error)
    res.status(500).json({ error: "Could not count live rooms" })
  }
})

api.listen(apiPort, () => {
  console.log(`race listings on http://localhost:${apiPort}/races`)
})
