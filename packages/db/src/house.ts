import { and, eq } from "drizzle-orm"
import {
  FURNITURE_BY_ID,
  FURNITURE_GRADES,
  furniturePrice,
  homeComfort,
  houseChangeFee,
  isValidHouseLoadout,
  sanitizeHouseLoadout,
  sellBackPrice,
  type FurnitureGrade,
  type FurnitureId,
  type HouseLoadout,
  type PlacedItem
} from "@tiral/houses"
import { getDatabase, type Database } from "./client.js"
import { balanceOf, insertEntry, lockUser, type Tx } from "./ledger.js"
import { houseItems, users } from "./schema.js"

// Furniture you own (bought, kept until sold, moves house with you) and
// saving your house: placed pieces must be ones you own, and painting or a
// new floor is paid for. Ledger reasons: furniture_buy, furniture_sell,
// house_paint, house_floor.

export type OwnedItem = { id: string; item: FurnitureId; grade: FurnitureGrade; color: string; price: number }

export async function getHouseItems(userId: string, db: Database | Tx = getDatabase()): Promise<OwnedItem[]> {
  const rows = await db.select().from(houseItems).where(eq(houseItems.userId, userId)).orderBy(houseItems.createdAt)
  return rows.flatMap((row) =>
    row.item in FURNITURE_BY_ID && FURNITURE_GRADES.includes(row.grade as FurnitureGrade)
      ? [{ id: row.id, item: row.item as FurnitureId, grade: row.grade as FurnitureGrade, color: row.color, price: row.price }]
      : []
  )
}

type Failure = { ok: false; reason: "insufficient" | "unknown"; balance: number }

/** Buy a piece (once per `refId`); it goes into your things, unplaced. */
export async function buyHouseItem(
  input: { userId: string; item: string; grade: string; color: string; refId: string },
  db: Database = getDatabase()
): Promise<{ ok: true; owned: OwnedItem | null; balance: number } | Failure> {
  const spec = FURNITURE_BY_ID[input.item as FurnitureId]
  const grade = FURNITURE_GRADES.find((candidate) => candidate === input.grade)
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const balance = await balanceOf(tx, input.userId)
    if (!spec || !grade || !spec.colors.includes(input.color)) return { ok: false, reason: "unknown", balance }
    const price = furniturePrice(spec.id, grade)
    if (balance < price) return { ok: false, reason: "insufficient", balance }
    const inserted = await insertEntry(tx, { userId: input.userId, delta: -price, reason: "furniture_buy", refId: input.refId, meta: { item: spec.id, grade } })
    if (!inserted) return { ok: true, owned: null, balance }
    const [row] = await tx.insert(houseItems).values({ userId: input.userId, item: spec.id, grade, color: input.color, price }).returning()
    return {
      ok: true,
      owned: row ? { id: row.id, item: spec.id, grade, color: row.color, price } : null,
      balance: balance - price
    }
  })
}

/** Sell a piece back for half what you paid; it leaves your room too. */
export async function sellHouseItem(
  input: { userId: string; itemId: string },
  db: Database = getDatabase()
): Promise<{ ok: true; paid: number; balance: number } | Failure> {
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const balance = await balanceOf(tx, input.userId)
    const [row] = await tx
      .select()
      .from(houseItems)
      .where(and(eq(houseItems.id, input.itemId), eq(houseItems.userId, input.userId)))
      .limit(1)
    if (!row) return { ok: false, reason: "unknown", balance }
    const paid = sellBackPrice(row.price)
    await insertEntry(tx, { userId: input.userId, delta: paid, reason: "furniture_sell", refId: row.id, meta: { item: row.item, grade: row.grade } })
    await tx.delete(houseItems).where(eq(houseItems.id, row.id))
    // Take it out of the saved room (and update what the room does for you).
    const [user] = await tx.select({ house: users.houseLoadout }).from(users).where(eq(users.id, input.userId)).limit(1)
    if (user?.house) {
      const house = sanitizeHouseLoadout(user.house)
      const items = house.items.filter((item) => item.id !== row.id)
      await tx.update(users).set({ houseLoadout: { ...house, items }, ...homeComfort(items) }).where(eq(users.id, input.userId))
    }
    return { ok: true, paid, balance: balance + paid }
  })
}

export type SaveHouseResult =
  | { ok: true; house: HouseLoadout; charged: number; balance: number }
  | { ok: false; reason: "invalid" | "not_owned" | "insufficient"; fee: number; balance: number }

/**
 * Save your house: every placed piece must be one you own (its kind and grade
 * come from what you bought), and a painter or a new floor is paid for. Also
 * keeps what your furniture does for you (rest and calm) up to date.
 */
export async function saveHouse(userId: string, input: unknown, db: Database = getDatabase()): Promise<SaveHouseResult> {
  if (!isValidHouseLoadout(input)) return { ok: false, reason: "invalid", fee: 0, balance: 0 }
  return db.transaction(async (tx) => {
    await lockUser(tx, userId)
    const balance = await balanceOf(tx, userId)
    const owned = new Map((await getHouseItems(userId, tx)).map((item) => [item.id, item]))
    const items: PlacedItem[] = []
    for (const placed of input.items) {
      const mine = owned.get(placed.id)
      if (!mine) return { ok: false, reason: "not_owned", fee: 0, balance }
      items.push({ ...placed, item: mine.item, grade: mine.grade })
    }
    const house: HouseLoadout = { ...input, items }
    if (!isValidHouseLoadout(house)) return { ok: false, reason: "invalid", fee: 0, balance }
    const [user] = await tx.select({ house: users.houseLoadout }).from(users).where(eq(users.id, userId)).limit(1)
    const before = user?.house && isValidHouseLoadout(user.house) ? user.house : null
    const fee = houseChangeFee(before, house)
    const charged = fee.paint + fee.floor
    if (balance < charged) return { ok: false, reason: "insufficient", fee: charged, balance }
    const stamp = `${Date.now()}`
    if (fee.paint > 0) await insertEntry(tx, { userId, delta: -fee.paint, reason: "house_paint", refId: stamp, meta: {} })
    if (fee.floor > 0) await insertEntry(tx, { userId, delta: -fee.floor, reason: "house_floor", refId: stamp, meta: {} })
    await tx.update(users).set({ houseLoadout: house, ...homeComfort(items), lastSeenAt: new Date() }).where(eq(users.id, userId))
    return { ok: true, house, charged, balance: balance - charged }
  })
}

/** How many pieces you own (the moving fee depends on it). */
export async function countHouseItems(userId: string, db: Database | Tx = getDatabase()): Promise<number> {
  return (await getHouseItems(userId, db)).length
}
