/**
 * The game server's address as seen from the page. Tiral is served on more
 * than one address (playtiral.com), with the game
 * server behind the same one, so a build-time URL is moved onto whichever
 * address the page is on: same origin, so the player's cookie and no
 * cross-site requests. Local development keeps its own ports.
 */
export function onThisHost(url: string): string {
  if (typeof window === "undefined") return url
  try {
    const target = new URL(url)
    const page = window.location
    if (["localhost", "127.0.0.1"].includes(target.hostname) || ["localhost", "127.0.0.1"].includes(page.hostname)) return url
    target.host = page.host
    return target.toString().replace(/\/$/, "")
  } catch {
    return url
  }
}
