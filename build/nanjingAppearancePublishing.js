import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { pickNanjingAppearance } from '../src/editor/nanjingAppearanceSync.js'

const MODEL_URL = '/nanjing-restore/nanjing-0911-36c1aee71981.glb'
const CONFIG_URL = '/nanjing-restore/reference-73trees-3db12591b264.json'
export const APPEARANCE_URL = '/nanjing-restore/appearance-current.json'

// The shared appearance stays outside watched source files: publishing a
// preset must not hot-reload an editor while it is saving its local project.
export function nanjingAppearancePublishing({ root = process.cwd() } = {}) {
  const file = path.resolve(root, '.nanjing', 'appearance-current.json')
  let writing = Promise.resolve()
  const read = async () => {
    try { return JSON.parse(await fs.readFile(file, 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') return null; throw error }
  }
  const send = (res, status, data) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    res.end(JSON.stringify(data))
  }
  function install(server) {
    server.middlewares.use(async (req, res, next) => {
      const pathname = (req.url || '').split('?')[0]
      if (pathname === APPEARANCE_URL && req.method === 'GET') {
        try { const value = await read(); send(res, value ? 200 : 404, value || { error: '尚未同步共享效果' }) }
        catch { send(res, 500, { error: '共享效果文件读取失败，本地工程仍保留' }) }
        return
      }
      if (pathname !== '/__nanjing-appearance') { next(); return }
      if (req.method !== 'POST') { send(res, 405, { error: '仅支持同步当前效果' }); return }
      if (req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) {
        send(res, 403, { error: '请从当前编辑器页面同步效果' }); return
      }
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) { send(res, 415, { error: '需要JSON效果配置' }); return }
      try {
        const chunks = []; let length = 0
        for await (const chunk of req) {
          length += chunk.length
          if (length > 4 * 1024 * 1024) { send(res, 413, { error: '效果配置过大' }); return }
          chunks.push(chunk)
        }
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (payload.modelUrl !== MODEL_URL || payload.configUrl !== CONFIG_URL || !payload.appearance || typeof payload.appearance !== 'object') {
          send(res, 400, { error: '模型或参考版本不匹配' }); return
        }
        const appearance = pickNanjingAppearance(payload.appearance)
        if (!Object.keys(appearance).length) { send(res, 400, { error: '没有可同步的效果参数' }); return }
        const publish = async () => {
          const current = await read()
          if ((payload.expectedRevision ?? null) !== (current?.revision ?? null)) {
            send(res, 409, { error: '其他浏览器已同步新效果，请先检测并同步', currentRevision: current?.revision }); return
          }
          const revision = crypto.createHash('sha256').update(JSON.stringify(appearance)).digest('hex').slice(0, 16)
          if (current?.revision === revision) { send(res, 200, current); return }
          const manifest = { version: 1, revision, modelUrl: MODEL_URL, configUrl: CONFIG_URL,
            publishedAt: new Date().toISOString(), appearance }
          await fs.mkdir(path.dirname(file), { recursive: true })
          const temporary = `${file}.next`
          await fs.writeFile(temporary, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
          await fs.rename(temporary, file)
          send(res, 200, manifest)
        }
        const pending = writing.then(publish)
        writing = pending.catch(() => {})
        await pending
      } catch (error) { send(res, 400, { error: `同步未完成：${error.message}` }) }
    })
  }
  return {
    name: 'nanjing-shared-appearance',
    configureServer: install,
    configurePreviewServer: install,
    async generateBundle() {
      const manifest = await read()
      if (manifest) this.emitFile({ type: 'asset', fileName: APPEARANCE_URL.slice(1), source: JSON.stringify(manifest) })
    }
  }
}
