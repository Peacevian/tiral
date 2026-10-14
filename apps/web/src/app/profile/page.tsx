import { redirect } from "next/navigation"

// The profile became Home; keep old links (and ?tab=…) working.
export default async function ProfileRedirect({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = new URLSearchParams()
  for (const [name, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(name, value)
  }
  const query = params.toString()
  redirect(query ? `/home?${query}` : "/home")
}
