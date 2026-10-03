import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const profile = mkdtempSync(join(tmpdir(), "higgsfield-pricing-"))
const browser = spawn(
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--window-size=1280,900",
    "about:blank",
  ],
  { stdio: "ignore" }
)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let socket
try {
  const portFile = join(profile, "DevToolsActivePort")
  for (let i = 0; i < 50 && !existsSync(portFile); i++) await wait(100)
  if (!existsSync(portFile)) throw new Error("Chrome did not open")
  const port = readFileSync(portFile, "utf8").split("\n")[0]
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) =>
    r.json()
  )
  const page = targets.find((target) => target.type === "page")
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve) =>
    socket.addEventListener("open", resolve, { once: true })
  )
  let id = 0
  const pending = new Map()
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data)
    if (!message.id || !pending.has(message.id)) return
    pending.get(message.id)(message)
    pending.delete(message.id)
  })
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const next = ++id
      pending.set(next, resolve)
      socket.send(JSON.stringify({ id: next, method, params }))
    })
  const evaluate = async (expression) =>
    (await send("Runtime.evaluate", { expression, returnByValue: true })).result
      .result.value
  await send("Page.enable")
  await send("Runtime.enable")
  await send("Page.navigate", { url: "http://localhost:3000/?connect-key=1" })
  await wait(1600)
  await evaluate('document.querySelector("input[type=password]")?.focus()')
  await send("Input.insertText", { text: "test-key-for-ui-only" })
  await evaluate(
    'document.querySelector("[role=dialog] button[type=submit]")?.click()'
  )
  await wait(850)
  if (process.argv[2] === "image") {
    await evaluate(
      '[...document.querySelectorAll("button")].find(b=>b.textContent?.trim()==="Image")?.click()'
    )
    await wait(250)
  }
  await evaluate('document.querySelector("textarea")?.focus()')
  await send("Input.insertText", {
    text: "Una calle cinematográfica al atardecer",
  })
  const before = await evaluate(
    `({button:document.querySelector('.q-prompt-box-generate')?.textContent,disabled:document.querySelector('.q-prompt-box-generate')?.disabled})`
  )
  let after
  for (let attempt = 0; attempt < 20; attempt++) {
    await wait(500)
    after = await evaluate(
      `({button:document.querySelector('.q-prompt-box-generate')?.textContent,disabled:document.querySelector('.q-prompt-box-generate')?.disabled,error:document.querySelector('[role=alert]')?.textContent??null,dialog:document.querySelector('[role=dialog]')?.textContent??null})`
    )
    if (after.error?.includes("Precio no disponible")) break
  }
  if (
    !before.disabled ||
    after?.disabled ||
    !after.error?.includes("Precio no disponible") ||
    after.error?.includes("Reintentar") ||
    after.dialog
  )
    throw new Error(
      `Pre-click pricing guard failed: ${JSON.stringify({ before, after })}`
    )
  const screenshot = await send("Page.captureScreenshot", { format: "png" })
  writeFileSync(
    join(
      process.cwd(),
      "verification",
      process.argv[2] === "image"
        ? "pricing-image-preclick.png"
        : "pricing-video-preclick.png"
    ),
    Buffer.from(screenshot.result.data, "base64")
  )
  console.log(JSON.stringify({ before, after }, null, 2))
} finally {
  socket?.close()
  browser.kill()
}
