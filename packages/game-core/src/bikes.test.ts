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
  it("keep the rental exactly as boda launched (2× speed, 0.6/m fuel)", () => {
    const rental = findBikeModel("rental").stats
    expect(bikeSpeedFactor(rental)).toBeCloseTo(2)
    expect(bikeFuelPerMeter(rental)).toBeCloseTo(0.6)
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
