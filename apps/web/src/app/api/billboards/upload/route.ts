import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"

const MAX_BYTES = 2 * 1024 * 1024

function detectImageType(bytes: Uint8Array): "png" | "jpg" | "webp" | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png"
  }
  if (bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg"
  }
  if (
    bytes.length > 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "webp"
  }
  return null
}

function uploadDir(): string {
  return process.env.BILLBOARD_UPLOAD_DIR ?? path.join(os.tmpdir(), "tiral-uploads")
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const file = form.get("image")
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image must be under 2 MB" }, { status: 400 })
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = detectImageType(bytes)
    if (!type) {
      return NextResponse.json({ error: "Image must be PNG, JPG, or WebP" }, { status: 400 })
    }
    const name = `${randomBytes(16).toString("hex")}.${type}`
    const dir = uploadDir()
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, name), bytes)
    return NextResponse.json({ imagePath: `/api/billboards/image/${name}` })
  } catch (error) {
    console.error("Billboard upload failed:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
