import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const width = Number(process.argv[2] ?? 390)
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const profile = mkdtempSync(join(tmpdir(), "higgsfield-layout-"))
const browser = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  `--window-size=${width},844`,
  "about:blank",
], { stdio: "ignore" })

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let socket
try {
  const portFile = join(profile, "DevToolsActivePort")
  for (let i = 0; i < 50 && !existsSync(portFile); i++) await wait(100)
  if (!existsSync(portFile)) throw new Error("Chrome did not open its debug port")
  const port = readFileSync(portFile, "utf8").split("\n")[0]
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())
  const page = targets.find((target) => target.type === "page")
  if (!page) throw new Error("Chrome page target not found")
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true })
    socket.addEventListener("error", reject, { once: true })
  })
  let nextId = 0
  const pending = new Map()
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data)
    if (!message.id || !pending.has(message.id)) return
    pending.get(message.id)(message)
    pending.delete(message.id)
  })
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++nextId
    pending.set(id, resolve)
    socket.send(JSON.stringify({ id, method, params }))
  })
  await send("Page.enable")
  await send("Runtime.enable")
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await send("Page.navigate", { url: "http://localhost:3000" })
  await wait(2500)
  if (process.argv[3] === "key") {
    await send("Runtime.evaluate", {
      expression: `document.querySelector('button[aria-label="Connect API key"]')?.click()`,
    })
    await wait(300)
  }
  const expression = `(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, width: r.width, right: r.right };
    };
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      aside: rect('aside'), main: rect('main'), h1: rect('h1'),
      prompt: rect('.q-prompt-box'), hero: rect('[role="img"]'),
      keyDialog: document.querySelector('[role="dialog"]')?.textContent ?? null,
      passwordFields: document.querySelectorAll('input[type="password"]').length,
    };
  })()`
  const result = await send("Runtime.evaluate", { expression, returnByValue: true })
  console.log(JSON.stringify(result.result.result.value, null, 2))
  const screenshot = await send("Page.captureScreenshot", { format: "png" })
  const name = process.argv[3] === "key" ? "studio-key-dialog.png" : "studio-mobile-verified.png"
  writeFileSync(join(process.cwd(), name), Buffer.from(screenshot.result.data, "base64"))
} finally {
  socket?.close()
  browser.kill()
}
