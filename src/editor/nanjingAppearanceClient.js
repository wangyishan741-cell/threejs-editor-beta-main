import { mergeNanjingAppearance, parseNanjingAppearanceEnvelope, pickNanjingAppearance } from './nanjingAppearanceSync.js'

const CURRENT_URL = '/nanjing-restore/appearance-current.json'
const PUBLISH_URL = '/__nanjing-appearance'
const clone = value => value == null ? value : structuredClone(value)
const message = error => error?.message || String(error)
const same = (a, b) => {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]))
}
// Published omission is unspecified, not a request to delete a local field.
const matchesPublished = (local, published) => {
  if (!published || typeof published !== 'object' || Array.isArray(published)) return same(local, published)
  return !!local && typeof local === 'object' && Object.keys(published)
    .every(key => Object.hasOwn(local, key) && matchesPublished(local[key], published[key]))
}
async function httpError(response) {
  let body
  try { body = await response.json() } catch { /* The HTTP status still explains the failed request. */ }
  const error = new Error(body?.error || `共享外观请求失败（HTTP ${response.status}）`)
  error.status = response.status
  error.sharedRevision = body?.currentRevision
  return error
}
async function boundedRead(action, { signal, timeoutMs = 8000 } = {}) {
  const controller = new AbortController()
  let timer, abortListener
  const cancelled = new Promise((resolve, reject) => {
    abortListener = () => {
      const error = signal.reason || Object.assign(new Error('共享外观读取已取消'), { name: 'AbortError' })
      controller.abort(error); reject(error)
    }
    if (signal?.aborted) { abortListener(); return }
    signal?.addEventListener('abort', abortListener, { once: true })
    const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 8000
    timer = setTimeout(() => {
      const error = Object.assign(new Error(`读取共享外观超时（${duration / 1000} 秒）`), { name: 'TimeoutError' })
      controller.abort(error); reject(error)
    }, duration)
  })
  try {
    return await Promise.race([cancelled, Promise.resolve().then(() => {
      if (controller.signal.aborted) throw controller.signal.reason
      return action(controller.signal)
    })])
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abortListener)
  }
}

export async function fetchNanjingAppearance({ modelUrl, configUrl, fetcher = globalThis.fetch, signal, timeoutMs = 8000 } = {}) {
  return boundedRead(async combinedSignal => {
    const response = await fetcher(CURRENT_URL, { cache: 'no-store', signal: combinedSignal })
    if (response.status === 404) return null
    if (!response.ok) throw await httpError(response)
    return parseNanjingAppearanceEnvelope(await response.json(), { modelUrl, configUrl })
  }, { signal, timeoutMs })
}

function nextSync(previous, envelope, merged, local, force = false) {
  const result = { ...clone(previous || {}), revision: envelope.revision, base: clone(envelope.appearance),
    previousAppearance: clone(previous?.previousAppearance ?? merged?.previousAppearance ?? pickNanjingAppearance(local)),
    conflicts: clone(merged?.conflicts || []), publishedAt: envelope.publishedAt, syncError: null }
  if (force) result.lastForcedAppearance = pickNanjingAppearance(local)
  return result
}

/** Read-only startup overlay. Never erase local storage after network failure. */
export async function readNanjingSharedAppearance(params, sceneName, { fetcher = globalThis.fetch, timeoutMs = 8000 } = {}) {
  if (params?.projectHistory?.mode === 'restored') return params
  const metadata = params?.nanjingRestore
  if (!metadata) return params
  try {
    const envelope = await fetchNanjingAppearance({ modelUrl: metadata.modelUrl, configUrl: metadata.configUrl, fetcher, timeoutMs })
    if (!envelope) return params
    let local = metadata.config
    if (!local) {
      const reference = await boundedRead(async signal => {
        const response = await fetcher(metadata.configUrl, { cache: 'no-store', signal })
        if (!response.ok) throw await httpError(response)
        return response.json()
      }, { timeoutMs })
      local = { ...reference, ...clone(metadata.preservedConfig || {}) }
    }
    const merged = mergeNanjingAppearance(local, envelope.appearance, metadata.sharedAppearance?.base)
    return { ...params, nanjingRestore: { ...metadata, config: merged.config,
      sharedAppearance: nextSync(metadata.sharedAppearance, envelope, merged, local) } }
  } catch (error) {
    return { ...params, nanjingRestore: { ...metadata,
      sharedAppearance: { ...metadata.sharedAppearance, syncError: message(error) } } }
  }
}

/** Explicit checks/publishes only. Scheduling and editor dirty flags stay local. */
export function createNanjingAppearanceClient({ modelUrl, configUrl, getConfig, getSync = () => null, setSync,
  applyConfig, isBusy = () => false, isDirty = () => false, generation = () => 0, onStatus,
  fetcher = globalThis.fetch, timeoutMs = 8000 } = {}) {
  if (typeof getConfig !== 'function' || typeof setSync !== 'function' || typeof applyConfig !== 'function') {
    throw new TypeError('getConfig, setSync and applyConfig are required')
  }
  const generationValue = () => typeof generation === 'function' ? generation() : generation
  const state = { ready: false, noShared: false, updateAvailable: false, localChanges: false, error: null,
    revision: getSync()?.revision ?? null, sharedRevision: null, conflicts: clone(getSync()?.conflicts || []),
    publishedAt: getSync()?.publishedAt ?? null, event: 'idle', busy: false, operation: null, httpStatus: null }
  let disposed = false, inFlight = null, abort = null, token = 0
  function getStatus() { return { ...state, disposed, conflicts: clone(state.conflicts) } }
  function status(event, patch = {}) {
    Object.assign(state, event === 'checking' || event === 'publishing' ? {} : { busy: false, operation: null }, patch, { event })
    const result = getStatus()
    try { onStatus?.(result) } catch { /* A status view must not alter transaction success. */ }
    return result
  }
  function run(operation, worker) {
    if (disposed) return Promise.resolve(getStatus())
    if (inFlight) return state.operation === operation ? inFlight : Promise.resolve({ ...getStatus(), event: 'busy' })
    const id = ++token, initialGeneration = generationValue()
    const controller = abort = new AbortController()
    const current = () => !disposed && token === id && generationValue() === initialGeneration
    Object.assign(state, { busy: true, operation, error: null, httpStatus: null })
    const promise = Promise.resolve().then(() => current()
      ? worker({ current, signal: controller.signal, generation: initialGeneration }) : { ...getStatus(), event: 'stale' })
      .catch(error => {
        if (!current()) return { ...getStatus(), event: 'stale' }
        return status('error', { error: message(error), httpStatus: error.status ?? null,
          ...(error.status === 409 ? { updateAvailable: true, sharedRevision: error.sharedRevision ?? state.sharedRevision } : {}) })
      }).finally(() => {
        if (token === id) { state.busy = false; state.operation = null; inFlight = null; abort = null }
      })
    inFlight = promise.then(result => ({ ...result, busy: state.busy, operation: state.operation }))
    status(operation === 'check' ? 'checking' : 'publishing')
    return inFlight
  }
  function check({ apply = true, force = false } = {}) {
    return run('check', async ({ current, signal, generation: operationGeneration }) => {
      const envelope = await fetchNanjingAppearance({ modelUrl, configUrl, fetcher, signal, timeoutMs })
      if (!current()) return { ...getStatus(), event: 'stale' }
      const sync = getSync()
      if (!envelope) return status('no-shared', { ready: true, noShared: true, updateAvailable: false, sharedRevision: null, localChanges: !!isDirty() })
      const available = envelope.revision !== sync?.revision
      Object.assign(state, { ready: true, noShared: false, revision: sync?.revision ?? null,
        sharedRevision: envelope.revision, publishedAt: envelope.publishedAt, updateAvailable: available, localChanges: !!isDirty() })
      if (!available && !force) return status('unchanged')
      if (!apply) return status('update-available')
      if (isBusy()) return status('busy')
      if (isDirty() && !force) return status('local-changes', { localChanges: true })
      const local = clone(await getConfig())
      if (!current()) return { ...getStatus(), event: 'stale' }
      if (isBusy()) return status('busy')
      if (isDirty() && !force) return status('local-changes', { localChanges: true })
      const merged = mergeNanjingAppearance(local, envelope.appearance, force ? null : sync?.base)
      await applyConfig(merged.config, { isCurrent: current, generation: operationGeneration,
        revision: envelope.revision, conflicts: clone(merged.conflicts), force })
      if (!current()) return { ...getStatus(), event: 'stale' }
      await setSync(nextSync(sync, envelope, merged, local, force))
      if (!current()) return { ...getStatus(), event: 'stale' }
      return status('applied', { revision: envelope.revision, updateAvailable: false,
        conflicts: clone(merged.conflicts), localChanges: !matchesPublished(merged.appearance, envelope.appearance) })
    })
  }
  function publish() {
    return run('publish', async ({ current, signal }) => {
      if (isBusy()) return status('busy')
      const local = clone(await getConfig()), sync = clone(getSync())
      if (!current()) return { ...getStatus(), event: 'stale' }
      if (isBusy()) return status('busy')
      const appearance = pickNanjingAppearance(local)
      const response = await fetcher(PUBLISH_URL, { method: 'POST', cache: 'no-store', signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelUrl, configUrl, appearance, expectedRevision: sync?.revision ?? null }) })
      if (!response.ok) throw await httpError(response)
      const envelope = parseNanjingAppearanceEnvelope(await response.json(), { modelUrl, configUrl })
      if (!current()) return { ...getStatus(), event: 'stale' }
      const latest = pickNanjingAppearance(await getConfig())
      if (!current()) return { ...getStatus(), event: 'stale' }
      const localChanges = !same(latest, envelope.appearance)
      await setSync(nextSync(sync, envelope, null, local))
      if (!current()) return { ...getStatus(), event: 'stale' }
      return status('published', { ready: true, noShared: false, revision: envelope.revision, sharedRevision: envelope.revision,
        publishedAt: envelope.publishedAt, updateAvailable: false, localChanges, conflicts: [] })
    })
  }
  function dispose() {
    if (disposed) return
    disposed = true; token++; abort?.abort(); abort = null; inFlight = null
    state.busy = false; state.operation = null
  }
  return { check, publish, getStatus, dispose }
}
