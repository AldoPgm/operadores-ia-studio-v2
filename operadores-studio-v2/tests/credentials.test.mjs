import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeCredentials,
  encodeCredentials,
  parseCredentialInput,
  toAuthorizationHeader,
} from "../generation/credentials.ts";

test("pasted API keys survive saving and retain the Key authorization scheme", () => {
  for (const apiKey of ["test_api_key", "test-id:test-secret"]) {
    for (const field of ["apiKey", "api_key"]) {
      assert.deepEqual(parseCredentialInput({ [field]: `  ${apiKey}\n` }), { apiKey });
    }
    assert.deepEqual(decodeCredentials(encodeCredentials(apiKey)), { apiKey });
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
    assert.equal(decodeCredentials(encodeCredentials(apiKey)), null);
  }
  for (const raw of [undefined, "not-json", "null", "[]", '{"apiKey":123}']) {
    assert.equal(decodeCredentials(raw), null);
  }
});
