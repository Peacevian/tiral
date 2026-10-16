import { matchMaker } from "@colyseus/core"
import { HOSTED_MISSED_AFTER_MS } from "@tiral/game-core"
import { dueHostedRaces, hostedRaceStatus, refundHostedRace, sendHostedRaceReminders } from "@tiral/db"
import { openHostedRooms } from "./rooms/RaceRoom.js"

// Keeps prize races running on schedule, also across restarts (each deploy
// restarts the server; rooms only live in memory, the races live in the DB):
//   - opens a room for each race starting within the hour (same code, so
//     invite links keep working), and reopens them after a restart;
//   - refunds races that missed their start or were cut off mid-race;
//   - passes a host's cancellation on to the open room;
//   - sends "I'm in" reminders.
const EVERY_MS = 30_000

async function tick() {
  const now = new Date()
  for (const race of await dueHostedRaces(now)) {
    if (openHostedRooms.has(race.id)) continue
    // Racing when the server went down: there are no results to pay from.
    // Scheduled but long past the start: nobody could have raced it.
    const missed = race.status === "live" || now.getTime() - race.startsAt.getTime() > HOSTED_MISSED_AFTER_MS
    if (missed) {
      if (await refundHostedRace(race.id, "missed")) console.log(`Prize race ${race.roomCode} missed: pot refunded`)
      continue
    }
    try {
      await matchMaker.createRoom("race", { hostedRaceId: race.id })
      console.log(`Prize race ${race.roomCode} open`)
    } catch (error) {
      console.error(`Failed to open prize race ${race.roomCode}:`, error)
    }
  }
  for (const [id, room] of openHostedRooms) {
    if ((await hostedRaceStatus(id)) === "cancelled") room.hostedCancelled()
  }
  await sendHostedRaceReminders(now)
}

export function startPrizeScheduler() {
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await tick()
    } catch (error) {
      console.error("Prize scheduler failed:", error)
    } finally {
      running = false
    }
  }
  void run()
  setInterval(() => void run(), EVERY_MS)
}
