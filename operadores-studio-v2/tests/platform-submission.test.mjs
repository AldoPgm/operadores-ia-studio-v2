import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { test } from "node:test"

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith(".")) throw error
      return nextResolve(`${specifier}.ts`, context)
    }
  },
})

const { createPlatformClient } = await import("../generation/platform.ts")

test("generation submission sends the copied key and stable idempotency key server-side", async () => {
  let calls = 0
  const client = createPlatformClient({
    apiKey: "copied-key:secret",
    baseUrl: "https://api.higgsfield.ai",
    fetch: async (url, options) => {
      calls++
      assert.equal(url, "https://api.higgsfield.ai/bytedance/seedance-2.5/text-to-video")
      assert.equal(options.method, "POST")
      assert.equal(options.headers.Authorization, "Key copied-key:secret")
      assert.equal(options.headers["Idempotency-Key"], "submission-123")
      assert.deepEqual(JSON.parse(options.body), { prompt: "A coastal road" })
      return Response.json({
        status: "queued",
        request_id: "request-123",
        status_url: "https://api.higgsfield.ai/requests/request-123/status",
        cancel_url: "https://api.higgsfield.ai/requests/request-123/cancel",
      })
    },
  })

  const result = await client.submit(
    "bytedance/seedance-2.5/text-to-video",
    { prompt: "A coastal road" },
    "submission-123"
  )
  assert.equal(result.requestId, "request-123")
  assert.equal(calls, 1)
})

test("invalid idempotency keys never reach the provider", async () => {
  const client = createPlatformClient({
    apiKey: "copied-key",
    baseUrl: "https://api.higgsfield.ai",
    fetch: async () => { throw new Error("Unexpected provider call") },
  })
  await assert.rejects(
    () => client.submit("bytedance/seedance-2.5/text-to-video", { prompt: "x" }, "bad key"),
    /Invalid submission ID/
  )
})
