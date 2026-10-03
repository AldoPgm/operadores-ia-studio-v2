"use server"

import { cookies } from "next/headers"

import { getModel, parseSettings } from "./catalog"
import type { GenerationPlane } from "./catalog/types"
import {
  MissingCredentialsError,
  LEGACY_PLATFORM_KEY_COOKIE,
  PLATFORM_KEY_COOKIE,
  PLATFORM_KEY_COOKIE_OPTIONS,
  decodeCredentials,
  encodeCredentials,
  parseCredentialInput,
} from "./credentials"
import { createPlatformClient, PlatformError } from "./platform"
import type { GenerationEstimate, StatusResult } from "./platform"
import { parseRequestIds } from "./request-ids"
import { submitOnce } from "./submission-guard"
import { toPlatform } from "./to-platform"

export async function savePlatformCredentials(data: unknown) {
  const { apiKey } = parseCredentialInput(data)
  const jar = await cookies()
  discardLegacyCredentials(jar)
  jar.set(
    PLATFORM_KEY_COOKIE,
    encodeCredentials(apiKey),
    PLATFORM_KEY_COOKIE_OPTIONS
  )
}

export async function clearPlatformCredentials() {
  const jar = await cookies()
  discardLegacyCredentials(jar)
  jar.set(PLATFORM_KEY_COOKIE, "", {
    ...PLATFORM_KEY_COOKIE_OPTIONS,
    maxAge: 0,
  })
}

export async function hasPlatformCredentials() {
  return (await readStoredCredentials()) !== null
}

export async function submitGeneration(
  plane: GenerationPlane,
  submissionId: string
) {
  const credentials = await readCredentials()
  const model = getModel(plane.model)
  const parsed: GenerationPlane = {
    ...plane,
    settings: parseSettings(model, plane.settings),
  }
  const { path, body } = toPlatform(parsed)
  return submitOnce(credentials.apiKey, submissionId, () =>
    createPlatformClient(credentials).submit(path, body, submissionId)
  )
}

export async function estimateGeneration(
  plane: GenerationPlane
): Promise<GenerationEstimate> {
  const credentials = await readCredentials()
  const model = getModel(plane.model)
  const parsed: GenerationPlane = {
    ...plane,
    settings: parseSettings(model, plane.settings),
  }
  const { path, body } = toPlatform(parsed)
  return createPlatformClient(credentials).estimate(path, body)
}

/** Every request in flight, answered in one round trip. Next dispatches server
    actions one at a time per client, so a poll per run would queue ahead of the
    next submit — the fan-out belongs on this side of the call, where it is
    genuinely parallel. */
export async function getGenerationStatuses(
  data: unknown
): Promise<StatusResult[]> {
  const requestIds = parseRequestIds(data)
  const client = createPlatformClient(await readCredentials())
  return Promise.all(
    requestIds.map(async (requestId): Promise<StatusResult> => {
      try {
        return { requestId, status: await client.status(requestId) }
      } catch (caught) {
        return {
          requestId,
          error: caught instanceof Error ? caught.message : String(caught),
          ...(caught instanceof PlatformError
            ? { statusCode: caught.status }
            : {}),
        }
      }
    })
  )
}

export async function cancelGeneration(data: unknown) {
  const [requestId] = parseRequestIds(data, true)
  await createPlatformClient(await readCredentials()).cancel(requestId!)
}

async function readStoredCredentials() {
  const jar = await cookies()
  discardLegacyCredentials(jar)
  return decodeCredentials(jar.get(PLATFORM_KEY_COOKIE)?.value)
}

function discardLegacyCredentials(jar: Awaited<ReturnType<typeof cookies>>) {
  if (!jar.get(LEGACY_PLATFORM_KEY_COOKIE)) return
  jar.set(LEGACY_PLATFORM_KEY_COOKIE, "", {
    ...PLATFORM_KEY_COOKIE_OPTIONS,
    sameSite: "lax",
    maxAge: 0,
  })
}

async function readCredentials() {
  const stored = await readStoredCredentials()
  if (!stored) throw new MissingCredentialsError()
  const baseUrl = process.env.HF_API_BASE_URL
  if (!baseUrl) throw new Error("Missing HF_API_BASE_URL")
  return { ...stored, baseUrl }
}
