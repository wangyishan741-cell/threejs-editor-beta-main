import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const entryFile = fileURLToPath(import.meta.url)
export const LAUNCHER_SETTINGS = Object.freeze({
  root: path.dirname(entryFile),
  node: process.execPath,
  chrome: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  profile: 'C:\\Users\\Administrator\\Documents\\Codex\\2026-09-11\\d-desktop-webgpu-lnk-d-desktop\\work\\chrome-rtx5080-profile',
  probeUrl: 'http://127.0.0.1:5173/',
  landingUrl: 'http://192.168.1.95:5173/',
  startupTimeoutMs: 45000,
  requestTimeoutMs: 1800,
  pollMs: 500,
})

function refused(error) {
  return error?.code === 'ECONNREFUSED' || (error?.cause && refused(error.cause)) ||
    (Array.isArray(error?.errors) && error.errors.length > 0 && error.errors.every(refused))
}

async function boundedHtml(response) {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder(); let text = ''; let bytes = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return text + decoder.decode()
      bytes += value.byteLength
      if (bytes > 256 * 1024) throw new Error('服务返回的页面超过识别范围')
      text += decoder.decode(value, { stream: true })
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

export async function inspectEditorService(settings = LAUNCHER_SETTINGS, fetcher = fetch) {
  try {
    const response = await fetcher(settings.probeUrl, { redirect: 'manual', cache: 'no-store',
      signal: AbortSignal.timeout(settings.requestTimeoutMs) })
    if (response.status !== 200) { await response.body?.cancel(); return { state: 'occupied', detail: `HTTP ${response.status}` } }
    const html = await boundedHtml(response)
    const title = /<title>\s*三维低代码编辑器\s*<\/title>/i.test(html)
    const application = /id=["']app["']/.test(html) && /(?:\/src\/main\.js|\/assets\/index-[^"']+\.js)/.test(html)
    return title && application ? { state: 'ready' } : { state: 'occupied', detail: '页面不是三维编辑器' }
  } catch (error) {
    return refused(error) ? { state: 'absent' } : { state: 'unresponsive', detail: error.message }
  }
}

export async function verifyLanding(settings = LAUNCHER_SETTINGS, fetcher = fetch) {
  const response = await fetcher(settings.landingUrl, { redirect: 'manual', cache: 'no-store',
    signal: AbortSignal.timeout(settings.requestTimeoutMs) })
  if (response.status !== 200) { await response.body?.cancel(); throw new Error(`编辑器入口尚未就绪（HTTP ${response.status}）`) }
  const html = await boundedHtml(response)
  const title = /<title>\s*三维低代码编辑器\s*<\/title>/i.test(html)
  const application = /id=["']app["']/.test(html) && /\/src\/main\.js/.test(html)
  if (!title || !application) {
    throw new Error('编辑器入口尚未就绪')
  }
}

async function detached(command, args, options, spawnProcess) {
  const child = spawnProcess(command, args, { ...options, shell: false, detached: true, windowsHide: true })
  let exit = null
  child.on('exit', (code, signal) => { exit = { code, signal } })
  await new Promise((resolve, reject) => { child.once('error', reject); child.once('spawn', resolve) })
  child.unref()
  return { pid: child.pid, getExit: () => exit }
}

export async function startDetachedVite(settings = LAUNCHER_SETTINGS, dependencies = {}) {
  const files = dependencies.fs || fs
  const directory = path.join(settings.root, '.nanjing')
  const vite = path.join(settings.root, 'node_modules', 'vite', 'bin', 'vite.js')
  await files.access(vite)
  await files.mkdir(directory, { recursive: true })
  const stdout = await files.open(path.join(directory, 'launcher-vite.stdout.log'), 'a')
  let stderr
  try {
    stderr = await files.open(path.join(directory, 'launcher-vite.stderr.log'), 'a')
    return await detached(settings.node, [vite, '--host', '0.0.0.0', '--port', '5173', '--strictPort'], {
      cwd: settings.root, env: { ...(dependencies.env || process.env), BROWSER: 'none' },
      stdio: ['ignore', stdout.fd, stderr.fd],
    }, dependencies.spawn || spawn)
  } finally { await stdout.close(); if (stderr) await stderr.close() }
}

export async function openConfiguredChrome(settings = LAUNCHER_SETTINGS, dependencies = {}) {
  await (dependencies.fs || fs).access(settings.chrome)
  return detached(settings.chrome, [`--user-data-dir=${settings.profile}`, '--force-high-performance-gpu',
    '--no-first-run', '--no-default-browser-check', '--new-window', settings.landingUrl],
  { cwd: settings.root, stdio: 'ignore' }, dependencies.spawn || spawn)
}

export async function launchEditor(dependencies = {}) {
  const settings = { ...LAUNCHER_SETTINGS, ...dependencies.settings }
  const probe = dependencies.inspect || (() => inspectEditorService(settings))
  const checkLanding = dependencies.verifyLanding || (() => verifyLanding(settings))
  const startService = dependencies.startVite || (() => startDetachedVite(settings))
  const openBrowser = dependencies.openChrome || (() => openConfiguredChrome(settings))
  const now = dependencies.now || Date.now
  const wait = dependencies.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const log = dependencies.log || console.log
  const problem = result => new Error(result.state === 'occupied'
    ? `端口 5173 已被其他服务占用（${result.detail}）。请检查占用程序，启动器不会关闭任何进程。`
    : `端口 5173 无法确认就绪（${result.detail || result.state}），未启动重复服务。`)

  let state = await probe(); let service = null
  if (state.state === 'absent') {
    log('正在启动三维编辑器服务…')
    service = await startService()
    const deadline = now() + settings.startupTimeoutMs
    for (;;) {
      const exit = service.getExit?.()
      if (exit) throw new Error(`编辑器服务启动失败（退出 ${exit.code ?? exit.signal}），请查看 .nanjing/launcher-vite.stderr.log。`)
      state = await probe()
      if (state.state === 'ready') break
      if (state.state === 'occupied') throw problem(state)
      if (now() >= deadline) throw new Error('等待编辑器服务超时，请查看 .nanjing/launcher-vite.stderr.log；未打开浏览器。')
      await wait(settings.pollMs)
    }
  } else if (state.state !== 'ready') throw problem(state)
  else log('已找到正在运行的三维编辑器，复用现有服务。')

  await checkLanding()
  await openBrowser()
  log(`已打开固定工程入口：${settings.landingUrl}`)
  return { reused: !service, servicePid: service?.pid || null, url: settings.landingUrl }
}

if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === entryFile.toLowerCase()) {
  launchEditor().catch(error => { console.error(`启动未完成：${error.message}`); process.exitCode = 1 })
}
