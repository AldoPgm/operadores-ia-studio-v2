import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { syncModels } from "../scripts/sync-models.mjs";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (!specifier.startsWith(".")) throw error;
      if (error.code === "ERR_UNSUPPORTED_DIR_IMPORT") return nextResolve(`${specifier}/index.ts`, context);
      if (error.code === "ERR_MODULE_NOT_FOUND") return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});
const { seedance25, seedance25Edit, seedance25Extend } = await import("../generation/catalog/models/seedance-2.5.ts");
const { seedance2 } = await import("../generation/catalog/models/seedance-2.ts");
const { soul2Image } = await import("../generation/catalog/models/soul.ts");
const { toPlatform } = await import("../generation/to-platform.ts");
const { MODELS } = await import("../generation/catalog/index.ts");
const { MODELS: installedModels } = await import("../generation/catalog/models.generated.ts");
const mediaInputs = await import("../generation/catalog/media-inputs.ts");
const uploadContract = await import("../generation/upload-contract.ts");

function items(role, count, kind = role === "source" || role === "video" ? "video" : role === "audio" ? "audio" : "image") {
  return Array.from({ length: count }, (_, n) => ({ id: `${role}-${n}`, role, kind, url: `https://cdn.example.com/${role}-${n}` }));
}
function plane(model, media = {}, extra = {}) {
  return { model: model.id, prompt: { text: "A cinematic scene" }, media, settings: { duration: 5, resolution: "720p", aspectRatio: "16:9", generateAudio: true, bitrateMode: "high", outputFormat: "mov" }, ...extra };
}

test("every installed model remains available in the public catalog", () => {
  assert.deepEqual(MODELS.map((model) => model.id), installedModels.map((model) => model.id));
});

test("mixed picker routes files by kind and never fills the source slot", () => {
  const selected = [...items("reference", 2), ...items("video", 2), ...items("audio", 1)];
  const next = mediaInputs.mergeReferences([], selected, seedance25Edit.roles);
  assert.deepEqual(next.map((item) => item.role), ["reference", "reference", "video", "video", "audio"]);
  assert.equal(mediaInputs.mergeReferences(next, selected, seedance25Edit.roles).length, 5);
  assert.throws(() => mediaInputs.mergeReferences([], items("video", 11), seedance25.roles), /maximum/i);
  assert.throws(() => mediaInputs.mergeReferences([], items("audio", 1), { reference: 3 }), /not supported/i);
});

test("mixed routing respects each installed model's declared kinds and caps", () => {
  for (const model of MODELS) {
    for (const [kind, role] of Object.entries(mediaInputs.REFERENCE_ROLE)) {
      const max = model.roles[role] ?? 0;
      if (!max) {
        assert.throws(() => mediaInputs.mergeReferences([], items(role, 1, kind), model.roles), /not supported/i, model.id);
        continue;
      }
      const added = mediaInputs.mergeReferences([], items(role, max, kind), model.roles);
      assert.equal(added.length, max, `${model.id}: ${kind}`);
      assert.ok(added.every((item) => item.role === role));
      assert.throws(() => mediaInputs.mergeReferences([], items(role, max + 1, kind), model.roles), /maximum/i, model.id);
    }
  }
});

test("mixed selection is atomic when one kind exceeds its capacity", () => {
  const current = items("video", 10);
  assert.throws(() => mediaInputs.mergeReferences(current, [...items("reference", 1), { ...items("video", 1)[0], id: "extra", url: "https://cdn.example.com/extra" }], seedance25.roles), /maximum/i);
  assert.equal(current.length, 10);
});

test("input mode follows the attachments, with no forced empty reference mode", () => {
  assert.equal(mediaInputs.inferInputMode(seedance25, []), undefined);
  assert.equal(mediaInputs.inferInputMode(seedance25, items("reference", 1)), "references");
  assert.equal(mediaInputs.inferInputMode(seedance25, items("start", 1)), "frames");
  assert.equal(mediaInputs.inferInputMode(seedance25Edit, items("source", 1)), undefined);
  const empty = toPlatform(plane(seedance25, {}, { inputMode: mediaInputs.inferInputMode(seedance25, []) }));
  assert.ok(empty.path.endsWith("/text-to-video"));
});

test("image role assignment demotes the previous frame without discarding files", () => {
  const current = [...items("start", 1), ...items("reference", 1)];
  const next = mediaInputs.changeImageRole(seedance25, current, "reference-0", "start");
  assert.deepEqual(next.map((item) => [item.id, item.role]), [["start-0", "reference"], ["reference-0", "start"]]);
  assert.deepEqual(current.map((item) => item.role), ["start", "reference"]);
  assert.throws(() => mediaInputs.changeImageRole(seedance25Edit, items("reference", 1), "reference-0", "start"), /not supported/i);
  assert.throws(() => mediaInputs.changeImageRole(seedance25, items("video", 1), "video-0", "start"), /image/i);
});

test("registry metadata excludes nested input mode IDs and labels", () => {
  syncModels();
  const registry = JSON.parse(readFileSync(new URL("../generation/catalog/models/registry.json", import.meta.url), "utf8"));
  const entry = registry.items.find((item) => item.name === "seedance-2.5");
  assert.deepEqual(entry.meta.ids, ["seedance-2.5", "seedance-2.5-edit", "seedance-2.5-extend"]);
  assert.ok(!entry.description.includes("Text / Frames"));
});

test("Seedance preserves all supported image, video, and audio references", () => {
  const request = toPlatform(plane(seedance25, { reference: items("reference", 30), video: items("video", 10), audio: items("audio", 10) }));
  assert.equal(request.path, "bytedance/seedance-2.5/reference-to-video");
  assert.equal(request.body.image_urls.length, 30);
  assert.equal(request.body.video_urls.length, 10);
  assert.equal(request.body.audio_urls.length, 10);
});
test("Seedance rejects mixed frame and reference inputs instead of dropping references", () => {
  assert.throws(() => toPlatform(plane(seedance25, { start: items("start", 1), audio: items("audio", 1) })), /frames.*references|references.*frames/i);
});
test("end frame requires a start frame", () => {
  assert.throws(() => toPlatform(plane(seedance25, { end: items("end", 1) })), /start frame/i);
});
test("frames map to the image endpoint with both frame fields", () => {
  const { path, body } = toPlatform(plane(seedance25, { start: items("start", 1), end: items("end", 1) }));
  assert.ok(path.endsWith("/image-to-video"));
  assert.equal(body.image_url, items("start", 1)[0].url);
  assert.equal(body.end_image_url, items("end", 1)[0].url);
  assert.ok(!("aspect_ratio" in body));
});
test("role caps are enforced for each Seedance version", () => {
  for (const [model, role, cap] of [[seedance25, "reference", 30], [seedance25, "video", 10], [seedance25, "audio", 10], [seedance2, "reference", 9], [seedance2, "video", 3], [seedance2, "audio", 3]]) {
    assert.throws(() => toPlatform(plane(model, { [role]: items(role, cap + 1) })), /maximum|up to|limit/i);
  }
});
test("wrong media kinds cannot be submitted in a reference array", () => {
  assert.throws(() => toPlatform(plane(seedance25, { reference: items("reference", 1, "video") })), /image/i);
  assert.throws(() => toPlatform(plane(seedance25, { audio: items("audio", 1, "video") })), /audio/i);
});
test("Edit and Extend keep source video separate from ten reference videos", () => {
  for (const model of [seedance25Edit, seedance25Extend]) {
    const { body } = toPlatform(plane(model, { source: items("source", 1), video: items("video", 10), reference: items("reference", 30), audio: items("audio", 10) }));
    assert.equal(body.video_url, items("source", 1)[0].url);
    assert.equal(body.video_urls.length, 10);
    assert.equal(body.image_urls.length, 30);
    assert.equal(body.audio_urls.length, 10);
  }
});
test("Edit and Extend require source video and nonempty prompt", () => {
  for (const model of [seedance25Edit, seedance25Extend]) {
    assert.throws(() => toPlatform(plane(model)), /source video/i);
    assert.throws(() => toPlatform(plane(model, { source: items("source", 1) }, { prompt: { text: "  " } })), /prompt/i);
  }
});
test("optional empty prompt is omitted with references", () => {
  const { body } = toPlatform(plane(seedance25, { audio: items("audio", 1) }, { prompt: { text: "" } }));
  assert.ok(!("prompt" in body));
});
test("text-to-video requires a prompt", () => {
  assert.throws(() => toPlatform(plane(seedance25, {}, { prompt: { text: "" } })), /prompt/i);
});
test("Seedance 2.5 maps the selected output_format from the current parameter table", () => {
  const { body } = toPlatform(plane(seedance25));
  assert.equal(body.output_format, "mov");
  assert.ok(!("bitrate_mode" in body));
});

test("Soul 2 image-to-image requires a reference and maps its public URL", () => {
  assert.throws(() => toPlatform(plane(soul2Image)), /reference/i);
  const { path, body } = toPlatform(plane(soul2Image, { reference: items("reference", 1) }));
  assert.equal(path, "higgsfield-ai/soul/v2/image-to-image");
  assert.equal(body.image_url, "https://cdn.example.com/reference-0");
  assert.equal(body.enhance_prompt, true);
});
test("grouping retains every attachment rather than truncating", () => {
  assert.equal(mediaInputs.groupMedia(items("video", 11)).video.length, 11);
});
test("adding media deduplicates references, enforces capacity, and replaces single slots", () => {
  const current = items("video", 2);
  assert.equal(mediaInputs.mergeMedia(current, "video", items("video", 3), 3).length, 3);
  assert.throws(() => mediaInputs.mergeMedia(current, "video", items("video", 4), 3), /maximum/i);
  const replacement = { ...items("start", 1)[0], id: "new", url: "https://cdn.example.com/new" };
  assert.deepEqual(mediaInputs.mergeMedia(items("start", 1), "start", [replacement], 1), [replacement]);
  assert.throws(() => mediaInputs.mergeMedia([], "audio", items("video", 1), 3), /audio/i);
});
test("audio is classified as audio, unsupported MIME types are rejected", () => {
  assert.equal(uploadContract.mediaKindFromMime("audio/wav"), "audio");
  assert.equal(uploadContract.mediaKindFromMime("audio/x-wav"), "audio");
  assert.equal(uploadContract.mediaKindFromMime("video/mp4"), "video");
  assert.equal(uploadContract.mediaKindFromMime("image/png"), "image");
  assert.throws(() => uploadContract.mediaKindFromMime("text/html"), /Unsupported/);
});
test("reference mode rejects empty input and never ignores incompatible media", () => {
  assert.throws(() => toPlatform(plane(seedance25, {}, { inputMode: "references" })), /reference/i);
  assert.throws(() => toPlatform(plane(seedance25, { start: items("start", 1) }, { inputMode: "references" })), /not supported/i);
  assert.throws(() => toPlatform(plane(seedance25, { audio: items("audio", 1) }, { inputMode: "frames" })), /not supported/i);
  assert.throws(() => toPlatform(plane(seedance25, {}, { inputMode: "unknown" })), /input mode/i);
});
