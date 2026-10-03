import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// Match the extensionless TypeScript imports accepted by Next.js.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith(".")) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});

const { createPlatformClient } = await import("../generation/platform.ts");
const { uploadMedia } = await import("../generation/upload.ts");

const ticket = {
  upload_url: "https://storage.example.com/reference.png?signature=test",
  public_url: "https://cdn.example.com/reference.png",
  content_type: "image/png",
  upload_headers: {
    "Content-Type": "image/png",
    "x-amz-tagging": "retention=temporary",
  },
};

function client(fetch) {
  return createPlatformClient({ apiKey: "test_api_key", baseUrl: "https://api.higgsfield.ai", fetch });
}

function png() {
  return new File([new Uint8Array([137, 80, 78, 71])], "reference.png", { type: "image/png" });
}

test("platform requests a signed upload URL using server credentials", async () => {
  const api = client(async (url, options) => {
    assert.equal(url, "https://api.higgsfield.ai/files/generate-upload-url");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Key test_api_key");
    assert.deepEqual(JSON.parse(options.body), { content_type: "image/png" });
    return Response.json(ticket);
  });
  assert.deepEqual(await api.createUpload("image/png"), ticket);
});

test("platform does not log signed storage URLs", async (t) => {
  const log = t.mock.method(console, "info", () => {});
  await client(async () => Response.json(ticket)).createUpload("image/png");
  assert.ok(!JSON.stringify(log.mock.calls).includes("signature=test"));
});

test("unsupported content types are rejected before calling the platform", async () => {
  let calls = 0;
  const api = client(async () => { calls++; return Response.json(ticket); });
  for (const type of ["image/svg+xml", "text/html", "", null]) {
    await assert.rejects(() => api.createUpload(type), /Unsupported file type/);
  }
  assert.equal(calls, 0);
});

test("platform upload failures preserve the HTTP status", async () => {
  const api = client(async () => Response.json({ detail: "Invalid credentials" }, { status: 401 }));
  await assert.rejects(() => api.createUpload("image/png"), (error) => error.status === 401);
});

test("malformed upload tickets are rejected", async () => {
  for (const invalid of [
    {},
    { ...ticket, upload_url: "http://storage.example.com/file" },
    { ...ticket, public_url: "javascript:alert(1)" },
    { ...ticket, content_type: "image/jpeg" },
    { ...ticket, upload_headers: null },
    { ...ticket, upload_headers: { "Content-Type": "image/jpeg" } },
    { ...ticket, upload_headers: { ...ticket.upload_headers, Authorization: "Key test-id:test-secret" } },
  ]) {
    await assert.rejects(() => client(async () => Response.json(invalid)).createUpload("image/png"), /Invalid upload response/);
  }
});

test("browser PUT forwards signed headers and bytes, never platform credentials", async (t) => {
  const file = png();
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? Response.json(ticket) : new Response(null, { status: 200 });
  });
  assert.deepEqual(await uploadMedia(file), { url: ticket.public_url });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "/api/upload");
  assert.deepEqual(JSON.parse(calls[0].options.body), { contentType: "image/png" });
  assert.equal(calls[1].url, ticket.upload_url);
  assert.equal(calls[1].options.method, "PUT");
  assert.deepEqual(calls[1].options.headers, ticket.upload_headers);
  assert.equal(calls[1].options.body, file);
  assert.equal(calls[1].options.credentials, "omit");
});

test("browser shows actionable missing-key errors without attempting the PUT", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Connect your Higgsfield API key in the sidebar before uploading." }, { status: 401 }));
  await assert.rejects(() => uploadMedia(png()), /Connect your Higgsfield API key/);
  assert.equal(fetch.mock.callCount(), 1);
});

test("browser handles an unexpected non-JSON route error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("<html>server error</html>", { status: 500 }));
  await assert.rejects(() => uploadMedia(png()), /Could not prepare reference upload/);
});

test("browser rejects malformed tickets before attempting storage upload", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ upload_url: ticket.upload_url }));
  await assert.rejects(() => uploadMedia(png()), /Invalid upload response/);
  assert.equal(fetch.mock.callCount(), 1);
});

test("storage failures do not return a public URL", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => ++calls === 1 ? Response.json(ticket) : new Response(null, { status: 403 }));
  await assert.rejects(() => uploadMedia(png()), /Reference upload failed \(403\)/);
});

test("browser rejects unsupported files before requesting a signed URL", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(ticket));
  await assert.rejects(() => uploadMedia(new File(["<svg/>"], "reference.svg", { type: "image/svg+xml" })), /Unsupported file type/);
  assert.equal(fetch.mock.callCount(), 0);
});
