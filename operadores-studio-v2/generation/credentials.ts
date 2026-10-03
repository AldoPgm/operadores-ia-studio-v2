import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

export const PLATFORM_KEY_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-hf_api_key" : "hf_api_key_dev"
export const LEGACY_PLATFORM_KEY_COOKIE = "api_key"

export const PLATFORM_KEY_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
}

export class MissingCredentialsError extends Error {
  constructor() {
    super("Connect your Higgsfield API key")
    this.name = "MissingCredentialsError"
  }
}

export function encodeCredentials(apiKey: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", cookieKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(requireApiKey(apiKey), "utf8"),
    cipher.final(),
  ])
  return [
    "v1",
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".")
}

export function decodeCredentials(
  raw: string | undefined
): { apiKey: string } | null {
  if (!raw) return null
  const [version, iv, encrypted, tag, extra] = raw.split(".")
  if (version !== "v1" || !iv || !encrypted || !tag || extra) return null
  const key = cookieKey()
  try {
    const ivBytes = Buffer.from(iv, "base64url")
    const tagBytes = Buffer.from(tag, "base64url")
    if (ivBytes.length !== 12 || tagBytes.length !== 16) return null
    const decipher = createDecipheriv("aes-256-gcm", key, ivBytes)
    decipher.setAuthTag(tagBytes)
    const apiKey = Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8")
    return { apiKey: requireApiKey(apiKey) }
  } catch {
    return null
  }
}

function cookieKey(): Buffer {
  const secret = process.env.HF_COOKIE_SECRET
  if (!secret || !/^[A-Za-z0-9_-]{43}$/.test(secret))
    throw new Error("HF_COOKIE_SECRET must be a 32-byte base64url secret")
  const key = Buffer.from(secret, "base64url")
  if (key.length !== 32 || key.toString("base64url") !== secret)
    throw new Error("HF_COOKIE_SECRET must be a 32-byte base64url secret")
  return key
}

export function parseCredentialInput(data: unknown): { apiKey: string } {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Enter an API key")
  }
  const record = data as { apiKey?: unknown; api_key?: unknown }
  const apiKey = record.apiKey ?? record.api_key
  if (typeof apiKey !== "string" || !apiKey.trim())
    throw new Error("Enter an API key")
  return { apiKey: requireApiKey(apiKey) }
}

export function toAuthorizationHeader(apiKey: string): string {
  return `Key ${requireApiKey(apiKey)}`
}

function requireApiKey(apiKey: string): string {
  const key = apiKey.trim()
  if (!key) throw new Error("Enter an API key")
  if (key.length > 512) throw new Error("API key is too long")
  if (/[^\x21-\x7E]/.test(key))
    throw new Error("Paste the API key exactly as copied from open.higgsfield.ai")
  return key
}
