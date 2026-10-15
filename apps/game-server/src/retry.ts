/**
 * Retry a money write through a short database blip (restart, dropped
 * connection). Only for writes keyed so a repeat is a no-op (ledger refs,
 * race ids): if the first attempt committed but its reply was lost, the retry
 * finds it done. Results like "insufficient" are returned, not thrown, so they
 * are never retried.
 */
const DELAYS_MS = [500, 2000, 5000]

export async function withRetry<T>(label: string, write: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await write()
    } catch (error) {
      const delay = DELAYS_MS[attempt]
      if (delay === undefined) throw error
      console.warn(`${label} failed (attempt ${attempt + 1}), retrying in ${delay} ms:`, error)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}
