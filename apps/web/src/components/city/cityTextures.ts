"use client"

import * as THREE from "three"
import { isLiteDevice } from "@/lib/deviceTier"

// Textures for Kampala's buildings, drawn once in code (no image files).
// Walls are light so each building's colour (vertex colour) tints them;
// windows, glass and shutters stay dark whatever the tint.
//
// One texture tile is one bay: BAY metres wide and FLOOR metres tall, so the
// wall UVs are simply metres / BAY and metres / FLOOR.

export const BAY = 4
export const FLOOR = 3.2
export const SHOP_FLOOR = 3.8

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void

/** Drawn at half size on cheap phones (a quarter of the memory; still reads at street level). */
function paint(width: number, height: number, draw: Draw) {
  const shrink = isLiteDevice() ? 0.5 : 1
  const element = document.createElement("canvas")
  element.width = width * shrink
  element.height = height * shrink
  const ctx = element.getContext("2d")!
  ctx.scale(shrink, shrink)
  draw(ctx, width, height)
  return element
}

function canvas(width: number, height: number, draw: Draw) {
  const texture = new THREE.CanvasTexture(paint(width, height, draw))
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = isLiteDevice() ? 1 : 4
  return texture
}

/** Towers: a band of blue-green glass each floor, concrete between. */
export function towerTexture() {
  return canvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#EDEDED"
    ctx.fillRect(0, 0, w, h)
    const glass = ctx.createLinearGradient(0, 0, w, h)
    glass.addColorStop(0, "#3E5E73")
    glass.addColorStop(0.55, "#7FA3B5")
    glass.addColorStop(1, "#33505F")
    ctx.fillStyle = glass
    ctx.fillRect(0, h * 0.18, w, h * 0.62)
    ctx.fillStyle = "#2B3A44"
    for (const x of [0, w / 2]) ctx.fillRect(x, h * 0.18, 3, h * 0.62)
    ctx.fillStyle = "rgba(255,255,255,0.18)"
    ctx.fillRect(w * 0.08, h * 0.22, w * 0.25, h * 0.08)
  })
}

/** Flats and offices: a framed window with a sill in each bay. */
export function flatsTexture() {
  return canvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#F4F1EA"
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = "#D8D2C6"
    ctx.fillRect(0, h * 0.94, w, h * 0.06)
    const wx = w * 0.24
    const wy = h * 0.22
    const ww = w * 0.52
    const wh = h * 0.48
    ctx.fillStyle = "#FFFFFF"
    ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8)
    const glass = ctx.createLinearGradient(0, wy, 0, wy + wh)
    glass.addColorStop(0, "#40525E")
    glass.addColorStop(1, "#24313A")
    ctx.fillStyle = glass
    ctx.fillRect(wx, wy, ww, wh)
    ctx.fillStyle = "#E9E4D8"
    ctx.fillRect(wx + ww / 2 - 1.5, wy, 3, wh)
    ctx.fillStyle = "#CFC8BA"
    ctx.fillRect(wx - 6, wy + wh + 4, ww + 12, 5)
  })
}

const SIGNS = ["#E85F0C", "#1E56A8", "#F2C14E", "#C8102E", "#2F7D4A", "#6D28D9", "#0EA5E9", "#F59E0B"]

/**
 * Ground floors on Kampala's streets: four shops a tile, each with a painted
 * signboard, a roller shutter half up and the dark shop inside, between
 * pillars. (Four bays wide, so neighbouring shops differ.)
 */
export function shopTexture() {
  return canvas(512, 128, (ctx, w, h) => {
    const bay = w / 4
    for (let i = 0; i < 4; i++) {
      const x = i * bay
      ctx.fillStyle = "#EDE6D8"
      ctx.fillRect(x, 0, bay, h)
      // Signboard.
      ctx.fillStyle = SIGNS[(i * 3 + 1) % SIGNS.length]!
      ctx.fillRect(x + 6, 6, bay - 12, h * 0.2)
      ctx.fillStyle = "rgba(255,255,255,0.85)"
      for (let k = 0; k < 3; k++) ctx.fillRect(x + 14 + k * 30, 12, 22, 6)
      // The shop: dark inside, a shutter pulled part way down.
      const top = h * 0.32
      ctx.fillStyle = "#2A2622"
      ctx.fillRect(x + 10, top, bay - 20, h - top)
      const shutter = h * (0.12 + 0.28 * ((i * 37) % 3) / 2)
      ctx.fillStyle = "#9CA3AF"
      ctx.fillRect(x + 10, top, bay - 20, shutter)
      ctx.fillStyle = "#7B828C"
      for (let y = top + 3; y < top + shutter; y += 5) ctx.fillRect(x + 10, y, bay - 20, 1.5)
      // Goods out front.
      ctx.fillStyle = SIGNS[(i * 5 + 2) % SIGNS.length]!
      ctx.fillRect(x + 16, h - 22, 16, 18)
      ctx.fillStyle = "#D6B37A"
      ctx.fillRect(x + 36, h - 16, 20, 12)
      // Pillar.
      ctx.fillStyle = "#D9D0BE"
      ctx.fillRect(x, 0, 6, h)
    }
  })
}

/** Iron sheets: corrugations, light so the roof colour tints them. */
export function ironRoofTexture() {
  return canvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = "#E6E6E6"
    ctx.fillRect(0, 0, w, h)
    for (let x = 0; x < w; x += 8) {
      ctx.fillStyle = "#C9C9C9"
      ctx.fillRect(x, 0, 3, h)
    }
    ctx.fillStyle = "rgba(120,80,50,0.18)"
    ctx.fillRect(0, h * 0.6, w, h * 0.12)
  })
}

/** Flat concrete roofs. */
export function concreteRoofTexture() {
  return canvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = "#C9C6C0"
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = "rgba(0,0,0,0.05)"
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 37) % w, (i * 53) % h, 6, 6)
  })
}

/** Flats with balconies: a window and a railed balcony slab each bay. */
export function balconyTexture() {
  return canvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#F4F1EA"
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = "#2E3B45"
    ctx.fillRect(w * 0.2, h * 0.16, w * 0.6, h * 0.5)
    ctx.fillStyle = "#E7E2D6"
    ctx.fillRect(w * 0.48, h * 0.16, 3, h * 0.5)
    // Balcony slab and railing.
    ctx.fillStyle = "#D8D1C2"
    ctx.fillRect(w * 0.08, h * 0.66, w * 0.84, h * 0.07)
    ctx.fillStyle = "#6B6F75"
    ctx.fillRect(w * 0.08, h * 0.5, w * 0.84, 3)
    for (let x = w * 0.1; x < w * 0.92; x += 8) ctx.fillRect(x, h * 0.5, 2, h * 0.16)
  })
}

/** Older blocks: two small windows a bay, each with burglar bars. */
export function barredTexture() {
  return canvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#F2EEE6"
    ctx.fillRect(0, 0, w, h)
    for (const x of [w * 0.14, w * 0.56]) {
      ctx.fillStyle = "#33424C"
      ctx.fillRect(x, h * 0.26, w * 0.3, h * 0.42)
      ctx.fillStyle = "#8A8F94"
      for (let i = 1; i < 4; i++) ctx.fillRect(x + (i * w * 0.3) / 4 - 1, h * 0.26, 2, h * 0.42)
      ctx.fillRect(x, h * 0.47, w * 0.3, 2)
    }
    ctx.fillStyle = "#D5CEBF"
    ctx.fillRect(0, h * 0.9, w, h * 0.1)
  })
}

/** Painted walls with louvre windows and a coloured band at each floor. */
export function louvreTexture() {
  return canvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#F3EFE6"
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = "#CFC6B4"
    ctx.fillRect(0, 0, w, h * 0.08)
    ctx.fillStyle = "#3A4852"
    ctx.fillRect(w * 0.25, h * 0.24, w * 0.5, h * 0.46)
    ctx.fillStyle = "#A7B4BC"
    for (let y = h * 0.27; y < h * 0.68; y += 7) ctx.fillRect(w * 0.26, y, w * 0.48, 3)
  })
}

/** Towers with punched square windows on concrete (older office blocks). */
export function gridTowerTexture() {
  return canvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#E4E1DA"
    ctx.fillRect(0, 0, w, h)
    for (const x of [w * 0.08, w * 0.55]) {
      const glass = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.78)
      glass.addColorStop(0, "#56707F")
      glass.addColorStop(1, "#2F4350")
      ctx.fillStyle = glass
      ctx.fillRect(x, h * 0.2, w * 0.37, h * 0.58)
    }
  })
}

/** Houses (one storey): one bay is HOUSE_BAY metres and the whole wall's height. */
export const HOUSE_BAY = 5

/** Plastered house walls: a window with burglar bars, every other bay a door. */
export function houseTexture() {
  return canvas(256, 64, (ctx, w, h) => {
    ctx.fillStyle = "#F1ECE2"
    ctx.fillRect(0, 0, w, h)
    // A darker plinth along the bottom (splashes of murram).
    ctx.fillStyle = "#C9B79E"
    ctx.fillRect(0, h * 0.86, w, h * 0.14)
    const bay = w / 2
    for (let i = 0; i < 2; i++) {
      const x = i * bay
      // Window with bars.
      ctx.fillStyle = "#3B4750"
      ctx.fillRect(x + bay * 0.14, h * 0.3, bay * 0.3, h * 0.34)
      ctx.fillStyle = "#9097A0"
      for (let k = 1; k < 4; k++) ctx.fillRect(x + bay * 0.14 + (k * bay * 0.3) / 4 - 0.75, h * 0.3, 1.5, h * 0.34)
      // A steel door in the first bay, a second window in the other.
      ctx.fillStyle = i === 0 ? "#5E6B52" : "#3B4750"
      if (i === 0) ctx.fillRect(x + bay * 0.6, h * 0.22, bay * 0.22, h * 0.64)
      else ctx.fillRect(x + bay * 0.58, h * 0.3, bay * 0.3, h * 0.34)
    }
    // Eaves' shadow along the top.
    ctx.fillStyle = "rgba(0,0,0,0.12)"
    ctx.fillRect(0, 0, w, h * 0.08)
  })
}

/** A building going up: grey blocks behind scaffolding poles and planks (one floor a tile). */
export function scaffoldTexture() {
  return canvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#B9B4AA"
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = "rgba(0,0,0,0.12)"
    for (let y = 0; y < h; y += 12) for (let x = (y / 12) % 2 ? 0 : 16; x < w; x += 32) ctx.fillRect(x, y, 30, 10)
    ctx.fillStyle = "#7A5C3A"
    for (const x of [6, 64, 122]) ctx.fillRect(x - 3, 0, 6, h)
    ctx.fillStyle = "#9C7A4E"
    ctx.fillRect(0, h * 0.45, w, 7)
    ctx.fillRect(0, h - 9, w, 7)
  })
}

/** A shop sign: the name in white on a painted board. */
export function signTexture(text: string, board: string) {
  const texture = new THREE.CanvasTexture(
    paint(512, 96, (ctx, w, h) => {
      ctx.fillStyle = board
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = "rgba(255,255,255,0.6)"
      ctx.lineWidth = 4
      ctx.strokeRect(6, 6, w - 12, h - 12)
      ctx.fillStyle = "#FFFFFF"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      let size = 60
      do {
        ctx.font = `900 ${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`
        size -= 2
      } while (ctx.measureText(text).width > w - 40 && size > 18)
      ctx.fillText(text, w / 2, h / 2 + 2)
    })
  )
  texture.colorSpace = THREE.SRGBColorSpace
  // The map's frame is mirrored (y runs south), so a plane facing the street
  // shows its texture back to front: flip it to read left to right.
  texture.repeat.x = -1
  texture.offset.x = 1
  return texture
}

/** Pavement: worn concrete slabs and red murram showing through (a map fill pattern, under the map's roads). */
export function groundImage(): ImageData {
  const element = paint(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#D8CDB8"
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = "rgba(160,90,50,0.16)"
    for (let i = 0; i < 26; i++) ctx.fillRect((i * 47) % w, (i * 31) % h, 14, 9)
    ctx.strokeStyle = "rgba(120,110,95,0.25)"
    ctx.lineWidth = 1
    for (let x = 0; x <= w; x += 32) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    for (let y = 0; y <= h; y += 32) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
  })
  return element.getContext("2d")!.getImageData(0, 0, element.width, element.height)
}
