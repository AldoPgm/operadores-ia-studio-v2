import { getModel } from "./catalog"
import { mapByPaths } from "./catalog/mappers"
import { validateMedia } from "./catalog/media-inputs"
import type { GenerationPlane, PlatformRequest } from "./catalog/types"

export function toPlatform(plane: GenerationPlane): PlatformRequest {
  if (
    !plane ||
    typeof plane.model !== "string" ||
    typeof plane.prompt?.text !== "string" ||
    !plane.media ||
    typeof plane.media !== "object" ||
    Array.isArray(plane.media)
  )
    throw new Error("Invalid generation input")
  const model = getModel(plane.model)
  validateMedia(model, plane.media, plane.inputMode)
  if (
    !plane.prompt.text.trim() &&
    !Object.values(plane.media).some((items) => items?.length)
  )
    throw new Error("Enter a prompt or add a reference.")
  if (model.requirePrompt && !plane.prompt.text.trim())
    throw new Error(`A prompt is required for ${model.label}.`)
  if (model.toPlatform) return model.toPlatform(plane)
  if (model.paths) return mapByPaths(plane, model.paths)
  throw new Error(`No platform map for ${plane.model}`)
}
