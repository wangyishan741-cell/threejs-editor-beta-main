import { DefaultLoadingManager } from 'three'

const HOOKS = Symbol.for('three-editor.project-load-hooks.v1')

// Preserve callbacks assigned before or after this subscriber, including the
// common `previous = service.complete; service.complete = () => previous()` form.
function subscribe(target, key, listener) {
  let hooks = target[HOOKS]
  if (!hooks) Object.defineProperty(target, HOOKS, { configurable: true, value: hooks = new Map() })
  let hub = hooks.get(key)
  if (!hub) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key)
    if (descriptor && (!descriptor.configurable || !('value' in descriptor) || !descriptor.writable)) throw new Error(`无法跟踪模型加载回调 ${key}`)
    const callbacks = [target[key]], stack = [], listeners = new Set()
    const invoke = (index, context, args) => {
      if (index < 0 || typeof callbacks[index] !== 'function') return
      stack.push(index)
      try { return callbacks[index].apply(context, args) } finally { stack.pop() }
    }
    function dispatch(...args) {
      if (stack.length) return invoke(stack.at(-1) - 1, this, args)
      let error = null
      try { return invoke(callbacks.length - 1, this, args) }
      catch (failure) { error = failure; throw failure }
      finally { for (const callback of [...listeners]) { try { callback({ args, error }) } catch { /* Do not disrupt another loader. */ } } }
    }
    const get = () => dispatch, set = callback => { if (callback !== dispatch) callbacks.push(callback) }
    Object.defineProperty(target, key, { configurable: true, enumerable: descriptor?.enumerable ?? true, get, set })
    hub = { listeners, release() {
      if (listeners.size) return
      const current = Object.getOwnPropertyDescriptor(target, key)
      if (current?.get === get && current?.set === set) {
        const latest = callbacks.at(-1)
        const value = callbacks.length > 1 && typeof latest === 'function' ? function(...args) { return invoke(callbacks.length - 1, this, args) } : latest
        Object.defineProperty(target, key, descriptor ? { ...descriptor, value } : { configurable: true, enumerable: true, writable: true, value })
      }
      hooks.delete(key)
      if (!hooks.size && target[HOOKS] === hooks) delete target[HOOKS]
    } }
    hooks.set(key, hub)
  }
  hub.listeners.add(listener)
  return () => { hub.listeners.delete(listener); hub.release() }
}

function normalizedUrl(value) {
  if (typeof value !== 'string') return ''
  try { return new URL(value, globalThis.location?.href || 'http://localhost/').href }
  catch { return value }
}

/** Initial saved-model readiness, not a global network/texture progress bar.
 * ADDCALL occurs before the core restores child/material data; only the core's
 * loaderService.complete callback can release this save guard. */
export function createProjectLoadState({ manager = DefaultLoadingManager, onChange } = {}) {
  let editor = null, generation = 0, entries = null, completed = 0, attached = false, error = null, disposed = false
  const pending = new Set(), releases = []
  function getStatus() {
    const ready = !disposed && attached && entries !== null && completed === entries.length && !error
    return { ready, loading: !ready, error, generation, expectedModels: entries?.length ?? null, completedModels: completed }
  }
  function publish() {
    const status = getStatus()
    if (editor) { editor.__projectLoading = status.loading; editor.__projectLoadError = status.error }
    try { onChange?.(status) } catch { /* UI feedback cannot break model loading. */ }
  }
  function fail(failure, expectedGeneration = generation) {
    if (disposed || expectedGeneration !== generation) return
    error ||= failure?.message || String(failure || '工程模型加载失败')
    publish()
  }
  function configure(params) {
    if (params?.modelCores !== undefined && !Array.isArray(params.modelCores)) throw new Error('工程模型列表损坏')
    entries = params == null ? null : params.modelCores || []
    pending.clear()
    for (const entry of entries || []) {
      if (!entry?.modelInfo?.url) throw new Error('已保存模型缺少文件地址')
      pending.add(normalizedUrl(entry.modelInfo.url))
    }
  }
  let releaseError = () => {}
  try {
    releaseError = subscribe(manager, 'itemError', ({ args }) => {
      if (pending.has(normalizedUrl(args[0]))) fail(new Error('工程模型载入失败：' + args[0]))
    })
  } catch (failure) { error = failure.message }

  function begin(params) {
    if (disposed) throw new Error('工程加载跟踪已销毁')
    generation++; attached = false; completed = 0; error = null
    for (const release of releases.splice(0)) release()
    try { configure(params) } catch (failure) { fail(failure) }
    publish()
    return generation
  }
  function attach(nextEditor, params) {
    if (disposed) return
    editor = nextEditor
    if (params !== undefined) { try { configure(params) } catch (failure) { fail(failure); return } }
    if (!editor || entries === null) { fail(new Error('工程尚未准备好模型列表')); return }
    const activeGeneration = generation, progress = editor.modelCores?.progressList || []
    if (entries.length && progress.length !== entries.length) { fail(new Error('工程模型加载任务数量不完整')); return }
    attached = true
    const check = () => {
      if (completed === entries.length) {
        const models = editor.scene?.children?.filter(object => object.editorType === 'isModelGroup').length || 0
        if (models < entries.length) fail(new Error('已保存模型尚未完整恢复，已阻止保存空场景'))
      }
      publish()
    }
    for (let index = 0; index < entries.length; index++) {
      const service = progress[index]?.loaderService
      if (typeof service?.complete !== 'function') { fail(new Error('已保存模型没有可用的加载完成回调')); return }
      let done = false
      try {
        releases.push(subscribe(service, 'complete', result => {
          if (disposed || activeGeneration !== generation || done) return
          if (result.error) { fail(result.error, activeGeneration); return }
          done = true; completed++
          pending.delete(normalizedUrl(entries[index].modelInfo.url))
          check()
        }))
      } catch (failure) { fail(failure); return }
    }
    check()
  }
  function dispose() {
    if (disposed) return
    disposed = true; generation++
    for (const release of releases.splice(0)) release()
    releaseError(); pending.clear(); publish()
  }
  return { begin, attach, fail, getStatus, dispose }
}
