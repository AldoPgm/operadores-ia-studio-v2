import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeCredentials,
  encodeCredentials,
  parseCredentialInput,
  toAuthorizationHeader,
} from "../generation/credentials.ts";

process.env.HF_COOKIE_SECRET = Buffer.alloc(32, 7).toString("base64url");

test("pasted API keys survive saving and retain the Key authorization scheme", () => {
  for (const apiKey of ["test_api_key", "test-id:test-secret"]) {
    for (const field of ["apiKey", "api_key"]) {
      assert.deepEqual(parseCredentialInput({ [field]: `  ${apiKey}\n` }), { apiKey });
    }
    const cookie = encodeCredentials(apiKey);
    assert.ok(!cookie.includes(apiKey));
    assert.deepEqual(decodeCredentials(cookie), { apiKey });
    assert.equal(toAuthorizationHeader(apiKey), `Key ${apiKey}`);
  }
});

test("invalid keys cannot be saved or turned into authorization headers", () => {
  for (const input of [null, [], {}, { apiKey: 123 }, { apiKey: "  " }]) {
    assert.throws(() => parseCredentialInput(input), /Enter an API key/);
  }
  for (const apiKey of ["", "  ", "test key", "test\r\nInjected: value", "test\0key"]) {
    assert.throws(() => parseCredentialInput({ apiKey }), /API key/);
    assert.throws(() => toAuthorizationHeader(apiKey), /API key/);
    assert.throws(() => encodeCredentials(apiKey), /API key/);
  }
  for (const raw of [undefined, "not-json", "null", "[]", '{"apiKey":123}']) {
    assert.equal(decodeCredentials(raw), null);
  }
});

test("tampered or legacy plaintext cookies never reveal a key", () => {
  const cookie = encodeCredentials("test-id:test-secret");
  assert.equal(decodeCredentials('{"apiKey":"test-id:test-secret"}'), null);
  const parts = cookie.split(".");
  parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;
  assert.equal(decodeCredentials(parts.join(".")), null);
  const oldSecret = process.env.HF_COOKIE_SECRET;
  try {
    process.env.HF_COOKIE_SECRET = Buffer.alloc(32, 8).toString("base64url");
    assert.equal(decodeCredentials(cookie), null);
  } finally {
    process.env.HF_COOKIE_SECRET = oldSecret;
  }
});
