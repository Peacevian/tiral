const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/"
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"
const USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/"

const BASIC_SCOPE = "user.info.basic"
const USER_FIELDS = "open_id,union_id,avatar_url,display_name"

export type TikTokConfig = {
  clientKey: string
  clientSecret: string
  redirectUri: string
}

export function getTikTokConfig(): TikTokConfig {
  const clientKey = process.env.TIKTOK_CLIENT_KEY
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET
  const redirectUri = process.env.TIKTOK_REDIRECT_URI
  if (!clientKey || !clientSecret || !redirectUri) {
    throw new Error("TikTok Login Kit is not configured")
  }
  return { clientKey, clientSecret, redirectUri }
}

export function buildAuthorizeUrl(config: TikTokConfig, state: string): string {
  const params = new URLSearchParams({
    client_key: config.clientKey,
    scope: BASIC_SCOPE,
    response_type: "code",
    redirect_uri: config.redirectUri,
    state
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export type TokenResponse = {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  scope: string
}

async function readTokenPayload(response: Response): Promise<TokenResponse> {
  const body = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    error?: string
    error_description?: string
    message?: string
  }
  if (!response.ok || !body.access_token || !body.refresh_token || !body.expires_in) {
    throw new Error(body.error_description ?? body.message ?? `Token exchange failed (${response.status})`)
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scope: body.scope ?? BASIC_SCOPE
  }
}

export async function exchangeCode(
  config: TikTokConfig,
  code: string
): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri
    })
  })
  return readTokenPayload(response)
}

export async function refreshAccessToken(
  config: TikTokConfig,
  refreshToken: string
): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  })
  return readTokenPayload(response)
}

export type TikTokUser = {
  openId: string
  unionId: string | null
  displayName: string
  avatarUrl: string | null
}

export async function fetchTikTokUser(accessToken: string): Promise<TikTokUser> {
  const url = `${USER_INFO_URL}?fields=${USER_FIELDS}`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  const body = (await response.json()) as {
    data?: { user?: { open_id?: string; union_id?: string; display_name?: string; avatar_url?: string } }
    error?: { code?: string; message?: string }
  }
  const user = body.data?.user
  if (!response.ok || !user?.open_id || !user.display_name) {
    throw new Error(body.error?.message ?? `User info failed (${response.status})`)
  }
  return {
    openId: user.open_id,
    unionId: user.union_id ?? null,
    displayName: user.display_name,
    avatarUrl: user.avatar_url ?? null
  }
}
