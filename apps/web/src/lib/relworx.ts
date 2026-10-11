import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

const BASE = "https://payments.relworx.com/api/mobile-money"
const WEBHOOK_FRESHNESS_MS = 5 * 60 * 1000

function getConfig() {
  const apiKey = process.env.RELWORX_API_KEY
  const accountNo = process.env.RELWORX_ACCOUNT_NO
  if (!apiKey || !accountNo) {
    throw new Error("Relworx is not configured")
  }
  return { apiKey, accountNo }
}

export function getWebhookKey(): string {
  return process.env.RELWORX_WEBHOOK_KEY ?? ""
}

/** Normalize Ugandan numbers to +256… for Relworx. */
export function normalizeUgandaMsisdn(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.startsWith("256") && digits.length === 12) return `+${digits}`
  if (digits.length === 9 && (digits.startsWith("7") || digits.startsWith("3"))) {
    return `+256${digits}`
  }
  if (digits.length === 10 && digits.startsWith("0")) return `+256${digits.slice(1)}`
  throw new Error("Invalid Uganda phone number (use 07… or +2567…)")
}

/** Mint a unique 8–36 char Relworx reference. */
export function mintRelworxReference(prefix = "tiral"): string {
  return `${prefix}${randomBytes(12).toString("hex")}`.slice(0, 36)
}

type RequestPaymentResponse = {
  success: boolean
  message: string
  internal_reference: string
}

export type RelworxRequestResult = {
  internalReference: string
  message: string
}

/** Push a mobile-money prompt to the subscriber. Payment completes async via webhook. */
export async function requestRelworxPayment(input: {
  reference: string
  msisdn: string
  amountUgx: number
  description?: string
}): Promise<RelworxRequestResult> {
  const { apiKey, accountNo } = getConfig()
  const msisdn = normalizeUgandaMsisdn(input.msisdn)
  if (!Number.isInteger(input.amountUgx) || input.amountUgx < 500) {
    throw new Error("Relworx minimum amount is UGX 500")
  }
  if (input.reference.length < 8 || input.reference.length > 36) {
    throw new Error("Relworx reference must be 8–36 characters")
  }

  const response = await fetch(`${BASE}/request-payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/vnd.relworx.v2",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      account_no: accountNo,
      reference: input.reference,
      msisdn,
      currency: "UGX",
      amount: input.amountUgx,
      description: input.description ?? "Tiral billboard"
    })
  })
  const body = (await response.json()) as RequestPaymentResponse
  if (!response.ok || !body.success) {
    throw new Error(body.message || `Relworx request failed (${response.status})`)
  }
  return { internalReference: body.internal_reference, message: body.message }
}

export type RelworxStatus = "success" | "failed" | "pending"

export type RelworxStatusCheck = {
  status: RelworxStatus
  amountUgx: number
}

/** Re-fetch status from Relworx — never trust a webhook body alone. */
export async function checkRelworxRequestStatus(
  internalReference: string
): Promise<RelworxStatusCheck> {
  const { apiKey, accountNo } = getConfig()
  const url = new URL(`${BASE}/check-request-status`)
  url.searchParams.set("internal_reference", internalReference)
  url.searchParams.set("account_no", accountNo)
  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/vnd.relworx.v2",
      Authorization: `Bearer ${apiKey}`
    }
  })
  const body = (await response.json()) as {
    success?: boolean
    status?: string
    request_status?: string
    amount?: number
    currency?: string
  }
  const status = String(body.request_status ?? body.status ?? "pending").toLowerCase()
  return {
    status: status === "success" ? "success" : status === "failed" ? "failed" : "pending",
    amountUgx: body.currency === "UGX" && body.amount ? Math.round(body.amount) : 0
  }
}

export type RelworxWebhookBody = {
  status?: string
  request_status?: string
  customer_reference?: string
  internal_reference?: string
  amount?: number
  currency?: string
  message?: string
}

export function relworxWebhookStatus(body: RelworxWebhookBody): string {
  return String(body.status ?? body.request_status ?? "").toLowerCase()
}

/**
 * Verify the Relworx-Signature header (HMAC-SHA256 over URL + timestamp +
 * sorted params). Skipped when no webhook key is configured, matching the
 * reference integration — status is always re-checked via API regardless.
 */
export function verifyRelworxWebhook(
  webhookUrl: string,
  signatureHeader: string | null,
  body: RelworxWebhookBody
): boolean {
  const key = getWebhookKey()
  if (!key) return true
  if (!signatureHeader) return false

  let timestamp: string | undefined
  let supplied: string | undefined
  for (const part of signatureHeader.split(",")) {
    const eq = part.trim().indexOf("=")
    if (eq === -1) continue
    const prefix = part.trim().slice(0, eq)
    const value = part.trim().slice(eq + 1)
    if (prefix === "t") timestamp = value
    if (prefix === "v") supplied = value
  }
  if (!timestamp || !supplied) return false
  if (Math.abs(Date.now() - Number(timestamp) * 1000) > WEBHOOK_FRESHNESS_MS) return false

  const params: Record<string, string> = {}
  const status = relworxWebhookStatus(body)
  if (status) params.status = status
  if (body.customer_reference) params.customer_reference = String(body.customer_reference)
  if (body.internal_reference) params.internal_reference = String(body.internal_reference)

  let signed = webhookUrl + timestamp
  for (const k of Object.keys(params).sort()) {
    signed += k + params[k]
  }

  const match = (candidate: string) => {
    if (candidate.length !== supplied.length) return false
    try {
      return timingSafeEqual(Buffer.from(candidate), Buffer.from(supplied))
    } catch {
      return false
    }
  }
  const expectedHex = createHmac("sha256", key).update(signed).digest("hex")
  const expectedB64 = createHmac("sha256", key).update(signed).digest("base64")
  return match(expectedHex) || match(expectedB64)
}
