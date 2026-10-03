const MAX_POLL_IDS = 100
const REQUEST_ID = /^[\x21-\x7e]{1,256}$/

export function parseRequestIds(data: unknown, cancel = false): string[] {
  if (data === null || typeof data !== "object" || Array.isArray(data))
    throw new Error("Invalid status payload")
  const requestIds = (data as Record<string, unknown>).requestIds
  if (
    !Array.isArray(requestIds) ||
    requestIds.length === 0 ||
    requestIds.length > (cancel ? 1 : MAX_POLL_IDS) ||
    requestIds.some((id) => typeof id !== "string" || !REQUEST_ID.test(id))
  )
    throw new Error("Invalid request ids")
  return requestIds as string[]
}
