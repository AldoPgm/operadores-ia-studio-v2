import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const profile = mkdtempSync(join(tmpdir(), "higgsfield-resolution-"))
const browser = spawn(
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
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
  socket = new WebSocket(
    targets.find((target) => target.type === "page").webSocketDebuggerUrl
  )
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
  const evaluate = async (expression) => {
    const reply = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (reply.result.exceptionDetails)
      throw new Error(reply.result.exceptionDetails.text)
    return reply.result.result.value
  }
  const click = async (selector) => {
    const rect = await evaluate(
      `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({block:"center"}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`
    )
    if (!rect) throw new Error(`Missing ${selector}`)
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: rect.x,
      y: rect.y,
      button: "left",
      clickCount: 1,
    })
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: rect.x,
      y: rect.y,
      button: "left",
      clickCount: 1,
    })
  }
  await send("Page.enable")
  await send("Runtime.enable")
  for (const viewport of [
    { name: "desktop", width: 1280, height: 900 },
    { name: "mobile", width: 390, height: 844 },
    { name: "image", width: 1280, height: 900, surface: "image" },
  ]) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.name === "mobile",
    })
    await send("Page.navigate", { url: "http://localhost:3000/?connect-key=1" })
    await wait(1300)
    if (await evaluate('!!document.querySelector("input[type=password]")')) {
      await evaluate('document.querySelector("input[type=password]").focus()')
      await send("Input.insertText", { text: "test-key-for-ui-only" })
      await evaluate(
        'document.querySelector("[role=dialog] button[type=submit]")?.click()'
      )
      await wait(600)
    }
    if (viewport.surface === "image") {
      await evaluate(
        '[...document.querySelectorAll("button")].find(b=>b.textContent?.trim()==="Image")?.click()'
      )
      await wait(250)
    }
    await click('button[aria-label="All settings"]')
    await wait(300)
    const labels = await evaluate(
      '[...document.querySelectorAll("[data-slot=dialog-content] label")].map(e=>e.textContent)'
    )
    const resolution = await evaluate(
      `(() => { const row=[...document.querySelectorAll('[data-slot=dialog-content] label')].find(e=>e.firstElementChild?.textContent?.trim()==='Resolution'); if(!row)return null; row.querySelector('[data-slot=select-trigger]')?.setAttribute('data-resolution-trigger',''); return row.textContent })()`
    )
    if (!resolution)
      throw new Error(`Resolution missing: ${JSON.stringify(labels)}`)
    await click("[data-resolution-trigger]")
    await wait(350)
    const state = await evaluate(`(() => {
      const r = e => { if(!e)return null; const b=e.getBoundingClientRect(); const s=getComputedStyle(e); return {tag:e.tagName,slot:e.getAttribute('data-slot'),text:e.textContent?.trim().slice(0,80),rect:{x:b.x,y:b.y,width:b.width,height:b.height},z:s.zIndex,position:s.position,pointerEvents:s.pointerEvents,overflow:s.overflow} }
      const option=document.querySelector('[data-slot=select-item]'); const b=option?.getBoundingClientRect();
      const hit=b?document.elementFromPoint(b.x+b.width/2,b.y+b.height/2):null;
      return { viewport:{w:innerWidth,h:innerHeight}, modal:r(document.querySelector('[data-slot=dialog-content]')), backdrop:r(document.querySelector('[data-slot=dialog-overlay]')), positioner:r(document.querySelector('[data-slot=select-content]')?.parentElement), popup:r(document.querySelector('[data-slot=select-content]')), option:r(option), hit:r(hit), optionHit:hit?.closest('[data-slot=select-item]')===option, trigger:r(document.querySelector('[data-resolution-trigger]')) }
    })()`)
    const screenshot = await send("Page.captureScreenshot", { format: "png" })
    writeFileSync(
      join(process.cwd(), "verification", `resolution-${viewport.name}.png`),
      Buffer.from(screenshot.result.data, "base64")
    )
    if (!state.optionHit || state.positioner?.z !== "50")
      throw new Error(
        `${viewport.name}: option remains covered: ${JSON.stringify(state)}`
      )
    const selectedOption = await evaluate(
      `(() => { const current=document.querySelector('[data-resolution-trigger]')?.textContent?.trim(); const choice=[...document.querySelectorAll('[data-slot=select-item]')].find(e=>e.textContent?.trim()!==current); choice?.setAttribute('data-test-choice',''); return choice?.textContent?.trim() })()`
    )
    if (!selectedOption)
      throw new Error(`${viewport.name}: no alternate resolution available`)
    await click("[data-test-choice]")
    await wait(650)
    const selected = await evaluate(
      `(() => { const p=document.querySelector('[data-slot=select-content]'); const t=document.querySelector('[data-resolution-trigger]'); return {value:t?.textContent?.trim(),triggerOpen:t?.hasAttribute('data-popup-open'),popupState:p?.getAttribute('data-open'),popupStyle:p?{display:getComputedStyle(p).display,opacity:getComputedStyle(p).opacity}:null} })()`
    )
    if (selected.value !== selectedOption || selected.triggerOpen)
      throw new Error(
        `${viewport.name}: selection failed: ${JSON.stringify(selected)}`
      )
    console.log(
      viewport.name,
      JSON.stringify(
        { popupZ: state.positioner.z, hit: state.hit.slot, selected },
        null,
        2
      )
    )
  }
} finally {
  socket?.close()
  browser.kill()
}
