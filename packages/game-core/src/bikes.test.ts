import { describe, expect, it } from "vitest"
import {
  BIKE_MODELS,
  bikeFuelPerMeter,
  bikeSpeedFactor,
  breakdownChancePerKm,
  canBuy,
  canLease,
  findBikeModel,
  leaseTerms,
  serviceCost
} from "./bikes.js"

describe("bikes", () => {
  it("keep the rental at 2× speed and the base fuel rate (0.2/m)", () => {
    const rental = findBikeModel("rental").stats
    expect(bikeSpeedFactor(rental)).toBeCloseTo(2)
    expect(bikeFuelPerMeter(rental)).toBeCloseTo(0.2)
  })

  it("make each bike a trade-off", () => {
    const boxa = findBikeModel("boxa100").stats
    const dragon = findBikeModel("dragon150").stats
    expect(bikeSpeedFactor(dragon)).toBeGreaterThan(bikeSpeedFactor(boxa))
    expect(bikeFuelPerMeter(dragon)).toBeGreaterThan(bikeFuelPerMeter(boxa))
    expect(breakdownChancePerKm(dragon, 60)).toBeGreaterThan(breakdownChancePerKm(boxa, 60))
  })

  it("break down more as wear builds", () => {
    const boxa = findBikeModel("boxa100").stats
    expect(breakdownChancePerKm(boxa, 90)).toBeGreaterThan(breakdownChancePerKm(boxa, 10) * 5)
  })

  it("follow the agreed ways to get each bike", () => {
    expect(canBuy("dragon150")).toBe(true)
    expect(canLease("dragon150")).toBe(false)
    expect(canBuy("zemboE")).toBe(false)
    expect(canLease("zemboE")).toBe(true)
    expect(canLease("boxa100") && canBuy("boxa100")).toBe(true)
    expect(canBuy("rental") || canLease("rental")).toBe(false)
    for (const bike of BIKE_MODELS) {
      const lease = leaseTerms(bike.id)
      if (lease && bike.price) expect(lease.deposit + lease.weekly * lease.weeks).toBeGreaterThan(bike.price)
      if (bike.id !== "rental") expect(serviceCost(bike.id)).toBeGreaterThan(0)
    }
  })
})

describe("bike shop", () => {
  it("prices a look by the items you don't own yet", async () => {
    const { lookCost, plainBikeLook, isValidBikeLook } = await import("./bikes.js")
    const look = { ...plainBikeLook("boxa100"), paint: "chrome", seat: "leopard", slogan: 3, underglow: "#22d3ee" }
    expect(isValidBikeLook(look)).toBe(true)
    expect(lookCost(look, new Set()).total).toBe(40_000 + 12_000 + 3_000 + 25_000)
    expect(lookCost(look, new Set(["paint:chrome", "underglow:#22d3ee"])).total).toBe(15_000)
    expect(lookCost(plainBikeLook("boxa100"), new Set()).total).toBe(0)
  })

  it("rejects looks that use items not in the shop", async () => {
    const { isValidBikeLook, plainBikeLook } = await import("./bikes.js")
    expect(isValidBikeLook({ ...plainBikeLook("boxa100"), underglow: "#123456" })).toBe(false)
    expect(isValidBikeLook({ ...plainBikeLook("boxa100"), slogan: 99 })).toBe(false)
  })
})
