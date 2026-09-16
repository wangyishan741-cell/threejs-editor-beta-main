import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const MODEL_URL = '/nanjing-restore/nanjing-0911-36c1aee71981.glb'
const CONFIG_URL = '/nanjing-restore/reference-73trees-3db12591b264.json'
export const SNAPSHOT_BODY_LIMIT = 128 * 1024 * 1024
const ENDPOINT = '/__nanjing-project-snapshots'
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor'])
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
const fail = (status, message) => Object.assign(new Error(message), { status })

function validate(payload) {
  if (!plain(payload) || Object.keys(payload).some(key => !['name', 'scene'].includes(key))) {
    throw fail(400, '需要 name 和 scene，不能指定存档路径')
  }
  if (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.length > 200 ||
      /[\\/\x00-\x1f\x7f]/.test(payload.name) || ['.', '..'].includes(payload.name.trim())) {
    throw fail(400, '工程名称无效，不能包含路径或控制字符')
  }
  const { scene } = payload
  if (!plain(scene) || !plain(scene.nanjingRestore) || !plain(scene.nanjingRestore.config) ||
      scene.nanjingRestore.modelUrl !== MODEL_URL || scene.nanjingRestore.configUrl !== CONFIG_URL) {
    throw fail(400, '需要当前南京模型的完整工程配置')
  }
  // Do not filter scene fields: material binding paths and history metadata are
  // part of the frozen project. Only reject unsafe JSON, not legitimate paths.
  const pending = [{ value: payload, depth: 0 }]
  while (pending.length) {
    const { value, depth } = pending.pop()
    if (typeof value === 'number' && !Number.isFinite(value)) throw fail(400, '工程包含无效数值')
    if (value === null || typeof value !== 'object') continue
    if (depth > 128 || (!Array.isArray(value) && !plain(value))) throw fail(400, '工程结构无效或嵌套过深')
    for (const key of Object.keys(value)) {
      if (unsafeKeys.has(key)) throw fail(400, '工程包含不安全的对象键')
      pending.push({ value: value[key], depth: depth + 1 })
    }
  }
  return scene
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let bytes = 0
    const cleanup = () => {
      req.off('data', data); req.off('end', end); req.off('error', error); req.off('aborted', aborted)
    }
    const error = error => { cleanup(); reject(error) }
    const aborted = () => error(fail(400, '工程上传中断'))
    const data = chunk => {
      bytes += chunk.length
      if (bytes > SNAPSHOT_BODY_LIMIT) {
        cleanup(); req.resume(); reject(fail(413, '工程超过 128 MiB 存档上限')); return
      }
      chunks.push(chunk)
    }
    const end = () => { cleanup(); resolve(Buffer.concat(chunks, bytes)) }
    req.on('data', data); req.on('end', end); req.on('error', error); req.on('aborted', aborted)
  })
}

// Immutable full-scene archives; this does not publish appearance or rewrite
// the user's local project history. Explicit reads bypass Vite's cached public
// file inventory, which is stale when newly generated public files are unwatched.
export function nanjingProjectSnapshots({ root = process.cwd() } = {}) {
  const projectRoot = path.resolve(root)
  let writing = Promise.resolve()
  const send = (res, status, data) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    res.end(JSON.stringify(data))
  }
  const serveFile = async (req, res, pathname, snapshot) => {
    try {
      if (snapshot) await writing
      const canonicalRoot = await fs.realpath(projectRoot)
      const publicDir = path.join(canonicalRoot, 'public')
      if (await fs.realpath(publicDir) !== publicDir) throw fail(403, '存档目录不能使用重定向路径')
      const directory = snapshot ? path.join(publicDir, 'editorJson') : publicDir
      if (await fs.realpath(directory) !== directory) throw fail(403, '存档目录不能使用重定向路径')
      const file = path.join(directory, snapshot ? pathname.slice('/editorJson/'.length) : 'nanjing-latest.html')
      const stat = await fs.lstat(file)
      if (!stat.isFile() || stat.isSymbolicLink()) throw fail(403, '仅可读取普通存档文件')
      if (stat.size > SNAPSHOT_BODY_LIMIT) throw fail(413, '存档文件超过读取上限')
      const content = req.method === 'HEAD' ? null : await fs.readFile(file)
      res.statusCode = 200
      res.setHeader('Content-Type', snapshot ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', snapshot ? 'public, max-age=31536000, immutable' : 'no-store, max-age=0')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Content-Length', content ? content.length : stat.size)
      res.end(content)
    } catch (error) {
      const status = error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : error.status || 500
      send(res, status, { error: status === 404 ? '指定工程存档不存在' : error.status ? error.message : '工程存档读取失败' })
    }
  }
  const publish = async scene => {
    const content = Buffer.from(JSON.stringify(scene), 'utf8')
    const sha256 = crypto.createHash('sha256').update(content).digest('hex')
    const id = `nanjing-snapshot-${sha256}`
    const canonicalRoot = await fs.realpath(projectRoot)
    const publicDir = path.join(canonicalRoot, 'public')
    await fs.mkdir(publicDir, { recursive: true })
    if (await fs.realpath(publicDir) !== publicDir) throw fail(409, '存档目录不能指向工程外部')
    const directory = path.join(publicDir, 'editorJson')
    await fs.mkdir(directory, { recursive: true })
    if (await fs.realpath(directory) !== directory) throw fail(409, '存档目录不能使用重定向路径')
    const file = path.join(directory, `${id}.json`)
    let handle; let created = false
    try {
      handle = await fs.open(file, 'wx')
      created = true
      await handle.writeFile(content)
      await handle.sync()
    } catch (error) {
      if (!created && error.code === 'EEXIST') {
        const stat = await fs.lstat(file)
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== content.length ||
            !(await fs.readFile(file)).equals(content)) {
          throw fail(409, '已有同名存档与工程内容不一致，未覆盖原文件')
        }
      } else {
        if (handle) { await handle.close(); handle = null }
        if (created) await fs.unlink(file).catch(() => {})
        throw error
      }
    } finally { if (handle) await handle.close() }
    const stat = await fs.stat(file)
    return { created, data: { id, sceneName: id, url: `/editorJson/${id}.json`, sha256,
      bytes: content.length, createdAt: new Date(stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs).toISOString() } }
  }
  return {
    name: 'nanjing-project-snapshots',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url || '').split('?')[0]
        const snapshot = /^\/editorJson\/nanjing-snapshot-[a-f0-9]{64}\.json$/.test(pathname)
        if (pathname === '/nanjing-latest.html' || snapshot) {
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.setHeader('Allow', 'GET, HEAD'); send(res, 405, { error: '仅支持读取固定工程存档' }); return
          }
          await serveFile(req, res, pathname, snapshot); return
        }
        if (pathname.startsWith('/editorJson/nanjing-snapshot-')) {
          send(res, 404, { error: '指定工程存档路径无效' }); return
        }
        if (pathname !== ENDPOINT) { next(); return }
        if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); send(res, 405, { error: '仅支持保存完整工程' }); return }
        const protocol = req.socket.encrypted ? 'https' : 'http'
        if (!req.headers.host || req.headers.origin !== `${protocol}://${req.headers.host}` ||
            req.headers['sec-fetch-site'] === 'cross-site') {
          send(res, 403, { error: '请从同源编辑器页面保存工程' }); return
        }
        if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
          send(res, 415, { error: '需要 JSON 工程数据' }); return
        }
        const declaredLength = req.headers['content-length']
        if (declaredLength !== undefined && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > SNAPSHOT_BODY_LIMIT)) {
          res.setHeader('Connection', 'close')
          req.resume(); send(res, 413, { error: '工程超过 128 MiB 存档上限' }); return
        }
        try {
          const buffer = await readBody(req)
          let scene
          try { scene = validate(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer))) }
          catch (error) { throw error.status ? error : fail(400, '工程 JSON 格式无效') }
          // Serializing writes also makes simultaneous identical submissions
          // idempotent: a request never reads another request's partial file.
          const pending = writing.then(() => publish(scene))
          writing = pending.catch(() => {})
          const result = await pending
          send(res, result.created ? 201 : 200, result.data)
        } catch (error) {
          if (error.status === 413) res.setHeader('Connection', 'close')
          send(res, error.status || 500, { error: error.status ? error.message : '工程存档写入失败，原工程未修改' })
        }
      })
    },
  }
}
