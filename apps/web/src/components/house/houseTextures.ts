import * as THREE from "three"
import type { FloorMaterial, RoofMaterial, WallMaterial } from "@tiral/houses"

type MaterialKind = WallMaterial | FloorMaterial | RoofMaterial

function drawNoise(
  ctx: CanvasRenderingContext2D,
  size: number,
  count: number,
  alpha: number,
  color = "#000000"
) {
  ctx.fillStyle = color
  ctx.globalAlpha = alpha
  for (let i = 0; i < count; i++) {
    const x = (i * 47) % size
    const y = (i * 89) % size
    ctx.fillRect(x, y, 2, 2)
  }
  ctx.globalAlpha = 1
}

function paint(kind: MaterialKind, ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, size, size)

  switch (kind) {
    case "brick": {
      const row = 16
      for (let y = 0; y < size; y += row) {
        const offset = (y / row) % 2 === 0 ? 0 : row
        for (let x = -row; x < size; x += row * 2) {
          ctx.strokeStyle = "rgba(0,0,0,0.22)"
          ctx.lineWidth = 2
          ctx.strokeRect(x + offset, y, row * 2, row)
        }
      }
      break
    }
    case "wood": {
      for (let x = 0; x < size; x += 20) {
        ctx.strokeStyle = "rgba(0,0,0,0.18)"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, size)
        ctx.stroke()
      }
      drawNoise(ctx, size, 120, 0.05)
      break
    }
    case "concrete":
    case "flat": {
      drawNoise(ctx, size, 320, 0.08)
      break
    }
    case "mud": {
      drawNoise(ctx, size, 420, 0.12)
      ctx.strokeStyle = "rgba(0,0,0,0.08)"
      ctx.lineWidth = 1
      for (let i = 0; i < 30; i++) {
        ctx.beginPath()
        ctx.arc((i * 53) % size, (i * 97) % size, 3 + (i % 4), 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    }
    case "tile": {
      const cell = 32
      ctx.strokeStyle = "rgba(0,0,0,0.18)"
      ctx.lineWidth = 2
      for (let x = 0; x <= size; x += cell) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, size)
        ctx.stroke()
      }
      for (let y = 0; y <= size; y += cell) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(size, y)
        ctx.stroke()
      }
      break
    }
    case "carpet": {
      drawNoise(ctx, size, 900, 0.06)
      break
    }
    case "earth": {
      drawNoise(ctx, size, 500, 0.14)
      break
    }
    case "ironsheet": {
      for (let y = 0; y < size; y += 8) {
        ctx.strokeStyle = "rgba(0,0,0,0.16)"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(size, y)
        ctx.stroke()
      }
      break
    }
    case "thatch": {
      ctx.strokeStyle = "rgba(0,0,0,0.16)"
      ctx.lineWidth = 1
      for (let i = 0; i < 140; i++) {
        const x = (i * 31) % size
        const y = (i * 67) % size
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + 2, y + 10)
        ctx.stroke()
      }
      break
    }
    case "plaster":
    default: {
      drawNoise(ctx, size, 160, 0.04)
      break
    }
  }
}

export function makeMaterialTexture(kind: MaterialKind, repeat = 2): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null
  const size = 128
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  paint(kind, ctx, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat, repeat)
  return texture
}

export function materialSurface(kind: MaterialKind): { roughness: number; metalness: number } {
  switch (kind) {
    case "ironsheet":
      return { roughness: 0.45, metalness: 0.55 }
    case "tile":
      return { roughness: 0.35, metalness: 0.05 }
    case "concrete":
    case "flat":
    case "plaster":
      return { roughness: 0.85, metalness: 0 }
    case "wood":
      return { roughness: 0.7, metalness: 0 }
    case "carpet":
    case "thatch":
    case "mud":
    case "earth":
    case "brick":
    default:
      return { roughness: 0.95, metalness: 0 }
  }
}
