import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { test } from "node:test"

import { submitOnce } from "../generation/submission-guard.ts"

test("one submission ID sends one provider POST even when invoked twice", async () => {
  const id = randomUUID()
  let calls = 0
  const send = async () => {
    calls += 1
    return { status: "queued", requestId: "request-1", statusUrl: "", cancelUrl: "" }
  }
  const first = submitOnce("key-a", id, send)
  const second = submitOnce("key-a", id, send)
  assert.strictEqual(first, second)
  assert.equal((await second).requestId, "request-1")
  assert.equal(calls, 1)
  await submitOnce("key-b", id, send)
  assert.equal(calls, 2)
})
