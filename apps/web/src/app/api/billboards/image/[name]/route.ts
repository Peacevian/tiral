import { NextRequest, NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"

function uploadDir(): string {
  return process.env.BILLBOARD_UPLOAD_DIR ?? path.join(os.tmpdir(), "tiral-uploads")
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params
  if (!/^[0-9a-f]{32}\.(png|jpg|webp)$/.test(name)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  try {
    const bytes = await readFile(path.join(uploadDir(), name))
    const contentType =
      name.endsWith(".png") ? "image/png" : name.endsWith(".jpg") ? "image/jpeg" : "image/webp"
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400"
      }
    })
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
}
