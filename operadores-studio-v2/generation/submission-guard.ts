import { createHash } from "node:crypto"

import type { QueuedGeneration } from "./platform"

const CACHE_TTL_MS = 15 * 60_000
const cache = new Map<
  string,
  { createdAt: number; result: Promise<QueuedGeneration> }
>()

/** Keep one provider POST for a client submission ID, including an ambiguous failure. */
export function submitOnce(
  apiKey: string,
  submissionId: string,
  submit: () => Promise<QueuedGeneration>
): Promise<QueuedGeneration> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      submissionId
    )
  )
    throw new Error("Invalid submission ID")

  const now = Date.now()
  for (const [id, entry] of cache)
    if (now - entry.createdAt > CACHE_TTL_MS) cache.delete(id)

  const cacheKey = createHash("sha256")
    .update(apiKey)
    .update("\0")
    .update(submissionId)
    .digest("hex")
  const existing = cache.get(cacheKey)
  if (existing) return existing.result

  const result = submit()
  cache.set(cacheKey, { createdAt: now, result })
  return result
}
