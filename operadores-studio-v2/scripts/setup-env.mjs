import { randomBytes } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"

const file = new URL("../.env.local", import.meta.url)
let contents = existsSync(file) ? readFileSync(file, "utf8") : ""
let changed = false

function append(line) {
  contents = `${contents.trimEnd()}${contents.trim() ? "\n" : ""}${line}\n`
  changed = true
}

if (!/^HF_API_BASE_URL=/m.test(contents))
  append("HF_API_BASE_URL=https://api.higgsfield.ai")

const secret = randomBytes(32).toString("base64url")
if (/^HF_COOKIE_SECRET=[ \t]*$/m.test(contents)) {
  contents = contents.replace(/^HF_COOKIE_SECRET=[ \t]*$/m, `HF_COOKIE_SECRET=${secret}`)
  changed = true
} else if (!/^HF_COOKIE_SECRET=/m.test(contents)) {
  append(`HF_COOKIE_SECRET=${secret}`)
}

if (changed) writeFileSync(file, contents, { mode: 0o600 })
console.log(changed ? "Local environment is ready." : "Local environment is already ready.")
