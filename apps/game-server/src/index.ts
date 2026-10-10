import { Server } from "@colyseus/core"
import { WebSocketTransport } from "@colyseus/ws-transport"
import { RaceRoom } from "./rooms/RaceRoom.js"

const port = Number(process.env.PORT) || 2567

const gameServer = new Server({
  transport: new WebSocketTransport()
})

gameServer.define("race", RaceRoom)

gameServer.listen(port)
console.log(`game-server listening on ws://localhost:${port}`)
