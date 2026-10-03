import assert from "node:assert/strict"
import { test } from "node:test"

import {
  extractPublishedRate,
  pricePreview,
} from "../generation/pricing.ts"

test("uses the exact model's published USD range", () => {
  const html = String.raw`\"related_models\":[{\"slug\":\"other/model\",\"price_range\":{\"min_amount\":\"9\",\"max_amount\":\"10\",\"currency\":\"USD\",\"unit\":\"sec\"}},{\"slug\":\"example/video\",\"price_range\":{\"min_amount\":\"0.04\",\"max_amount\":\"0.08\",\"currency\":\"USD\",\"unit\":\"sec\"}}]`
  assert.deepEqual(extractPublishedRate(html, "example/video"), {
    min: 0.04,
    max: 0.08,
    unit: "sec",
    sourceUrl: "https://open.higgsfield.ai/models/example/video",
  })
  assert.equal(extractPublishedRate(html, "unknown/video"), null)
})

test("multiplies video seconds and image batch size without claiming an exact charge", () => {
  const videoRate = {
    min: 0.04,
    max: 0.08,
    unit: "sec",
    sourceUrl: "https://open.higgsfield.ai/models/example/video",
  }
  assert.deepEqual(pricePreview(videoRate, { duration: 5 }), {
    label: "$0.20–$0.40",
    detail: "5 s de video · rango publicado por Higgsfield",
    hasTotal: true,
  })
  assert.equal(
    pricePreview(videoRate, { duration: 5, video_urls: ["https://example.com/a.mp4"] }).hasTotal,
    false
  )
  assert.deepEqual(
    pricePreview({ ...videoRate, min: 0.0032, max: 0.0057, unit: "image" }, { batch_size: 4 }),
    {
      label: "$0.0128–$0.0228",
      detail: "4 imágenes · rango publicado por Higgsfield",
      hasTotal: true,
    }
  )
})
