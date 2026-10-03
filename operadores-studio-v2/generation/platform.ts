import { toAuthorizationHeader } from "./credentials"
import { parseUploadTicket, requireUploadContentType } from "./upload-contract"
import type { UploadTicket } from "./upload-contract"

const UPLOAD_PATH = "/files/generate-upload-url"
const MODEL_ID = /^[a-z0-9][a-z0-9._/-]*$/i

export class PlatformError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown) {
    super(messageFromBody(status, body))
    this.name = "PlatformError"
    this.status = status
    this.body = body
  }
}

export type QueuedGeneration = {
  status: string
  requestId: string
  statusUrl: string
  cancelUrl: string
}

export type GenerationEstimate = {
  usd: string
}

export type GenerationStatus = {
  status: string
  requestId: string
  images?: Array<{ url: string }>
  video?: { url: string }
  error?: unknown
}

/** One request's answer inside a batched status poll. A request that errors
    carries its reason alone, so it cannot lose the answers standing beside it. */
export type StatusResult =
  | { requestId: string; status: GenerationStatus }
  | { requestId: string; error: string; statusCode?: number }

export type PlatformClientOptions = {
  apiKey: string
  baseUrl: string
  fetch?: typeof fetch
}

export function isModelId(model: string): boolean {
  return MODEL_ID.test(model) && !model.includes("..")
}

export function createPlatformClient(options: PlatformClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, "")
  const fetchImpl = options.fetch ?? fetch
  const auth = toAuthorizationHeader(options.apiKey)

  async function send(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
    timeoutMs?: number,
    idempotencyKey?: string
  ) {
    const url = `${baseUrl}${path}`
    const response = await fetchImpl(url, {
      method,
      signal: AbortSignal.timeout(timeoutMs ?? (method === "GET" ? 30_000 : 60_000)),
      headers: {
        Authorization: auth,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    const payload = await readJson(response)
    if (!response.ok) throw new PlatformError(response.status, payload)
    return payload
  }

  return {
    /** Same input as submit, but Higgsfield only quotes the account cost. */
    async estimate(
      model: string,
      input: Record<string, unknown>
    ): Promise<GenerationEstimate> {
      if (!isModelId(model))
        throw new PlatformError(400, { detail: "Invalid model" })
      return mapEstimate(await send("POST", `/estimate/${model}`, input, 12_000))
    },
    async createUpload(contentType: unknown): Promise<UploadTicket> {
      const type = requireUploadContentType(contentType)
      return parseUploadTicket(
        await send("POST", UPLOAD_PATH, { content_type: type }),
        type
      )
    },
    async submit(
      model: string,
      input: Record<string, unknown>,
      idempotencyKey: string
    ): Promise<QueuedGeneration> {
      if (!isModelId(model))
        throw new PlatformError(400, { detail: "Invalid model" })
      if (!/^[\x21-\x7e]{1,255}$/.test(idempotencyKey))
        throw new PlatformError(400, { detail: "Invalid submission ID" })
      try {
        return mapQueued(await send("POST", `/${model}`, input, undefined, idempotencyKey))
      } catch (error) {
        if (error instanceof PlatformError) throw error
        throw new Error(
          "Submission status is unknown. Check your Higgsfield requests before trying again."
        )
      }
    },
    async status(requestId: string): Promise<GenerationStatus> {
      if (!requestId)
        throw new PlatformError(400, { detail: "Missing request id" })
      return mapStatus(
        await send("GET", `/requests/${encodeURIComponent(requestId)}/status`)
      )
    },
    /** Queued requests only; the platform answers 202 and the status turns "canceled". */
    async cancel(requestId: string): Promise<void> {
      if (!requestId)
        throw new PlatformError(400, { detail: "Missing request id" })
      await send(
        "POST",
        `/requests/${encodeURIComponent(requestId)}/cancel`,
        {}
      )
    },
  }
}

function mapEstimate(payload: unknown): GenerationEstimate {
  const data = asRecord(payload)
  const usd = decimalField(data.usd)
  if (usd === null)
    throw new PlatformError(502, { detail: "Invalid cost estimate response" })
  return { usd }
}

function decimalField(value: unknown): string | null {
  const text = typeof value === "number" ? String(value) : value
  return typeof text === "string" && /^\d+(?:\.\d+)?$/.test(text)
    ? text
    : null
}

function mapQueued(payload: unknown): QueuedGeneration {
  const data = asRecord(payload)
  const requestId = stringField(data, "request_id")
  if (!requestId)
    throw new PlatformError(502, {
      detail: "Platform response missing request_id",
    })
  return {
    status: stringField(data, "status") ?? "queued",
    requestId,
    statusUrl: stringField(data, "status_url") ?? "",
    cancelUrl: stringField(data, "cancel_url") ?? "",
  }
}

function mapStatus(payload: unknown): GenerationStatus {
  const data = asRecord(payload)
  const requestId = stringField(data, "request_id") ?? ""
  const images = Array.isArray(data.images)
    ? data.images.flatMap((item) => {
        const url = asRecord(item).url
        return typeof url === "string" ? [{ url }] : []
      })
    : undefined
  const videoUrl = asRecord(data.video).url

  return {
    status: stringField(data, "status") ?? "unknown",
    requestId,
    ...(images?.length ? { images } : {}),
    ...(typeof videoUrl === "string" ? { video: { url: videoUrl } } : {}),
    ...(data.error !== undefined ? { error: data.error } : {}),
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringField(
  value: Record<string, unknown>,
  key: string
): string | undefined {
  const field = value[key]
  return typeof field === "string" ? field : undefined
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function messageFromBody(status: number, body: unknown): string {
  const detail = asRecord(body).detail
  if (typeof detail === "string" && detail) return detail
  return `Platform request failed (${status})`
}
