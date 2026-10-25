// The realistic young man and woman (NewBody) replace the old avatar behind
// this switch while they're tested. On for a browser with ?bodies=new (off
// again with ?bodies=old), remembered there; or for everyone with
// NEXT_PUBLIC_NEW_BODIES=1 at build time.

const KEY = "tiral:bodies"
let cached: boolean | null = null

export function newBodiesOn(): boolean {
  if (cached !== null) return cached
  if (typeof window === "undefined") return false
  let choice: string | null = null
  try {
    choice = new URLSearchParams(window.location.search).get("bodies")
    if (choice === "new" || choice === "old") window.localStorage.setItem(KEY, choice)
    else choice = window.localStorage.getItem(KEY)
  } catch {
    // Storage blocked (private mode): the URL alone decides, for this page.
  }
  cached = choice ? choice === "new" : process.env.NEXT_PUBLIC_NEW_BODIES === "1"
  return cached
}
