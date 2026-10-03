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

test("estimate sends the exact model input to the no-generation endpoint", async () => {
  let calls = 0
  const client = createPlatformClient({
    apiKey: "test-id:test-secret",
    baseUrl: "https://api.higgsfield.ai",
    fetch: async (url, options) => {
      calls++
      assert.equal(url, "https://api.higgsfield.ai/estimate/bytedance/seedance-2.5/text-to-video")
      assert.equal(options.method, "POST")
      assert.equal(options.headers.Authorization, "Key test-id:test-secret")
      assert.deepEqual(JSON.parse(options.body), {
        prompt: "A sunset street",
        duration: 5,
        resolution: "720p",
      })
      return Response.json({ usd: "0.094" })
    },
  })
  assert.deepEqual(
    await client.estimate("bytedance/seedance-2.5/text-to-video", {
      prompt: "A sunset street",
      duration: 5,
      resolution: "720p",
    }),
    { usd: "0.094" }
  )
  assert.equal(calls, 1)
})

test("invalid estimate responses and model paths cannot be presented as a quote", async () => {
  const client = createPlatformClient({
    apiKey: "test-key",
    baseUrl: "https://api.higgsfield.ai",
    fetch: async () => Response.json({ usd: "not a number" }),
  })
  await assert.rejects(() => client.estimate("example/model", {}), /Invalid cost estimate response/)
  await assert.rejects(() => client.estimate("../other-host", {}), /Invalid model/)
})
