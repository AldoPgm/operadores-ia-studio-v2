import assert from "node:assert/strict"
import { test } from "node:test"

import { parseRequestIds } from "../generation/request-ids.ts"

test("status batches and cancellations have bounded request IDs", () => {
  assert.deepEqual(parseRequestIds({ requestIds: ["request-1"] }), ["request-1"])
  assert.deepEqual(parseRequestIds({ requestIds: ["request-1"] }, true), ["request-1"])
  for (const ids of [[], [""], ["bad\nvalue"], ["x".repeat(257)], Array(101).fill("x")])
    assert.throws(() => parseRequestIds({ requestIds: ids }), /Invalid request ids/)
  assert.throws(
    () => parseRequestIds({ requestIds: ["a", "b"] }, true),
    /Invalid request ids/
  )
})
