import { DefaultLoadingManager } from 'three'

const HUB = Symbol.for('nanjing.asset-invalidation.v1')

function createHub(manager) {
  const descriptor = Object.getOwnPropertyDescriptor(manager, 'onLoad')
  if (descriptor && (!descriptor.configurable || !('value' in descriptor) || !descriptor.writable)) {
    return { unsupported: 'LoadingManager.onLoad cannot be safely subscribed' }
  }
  const callbacks = [manager.onLoad], callbackStack = [], subscribers = new Set()
  let batches = 0
  function invoke(index, context, args) {
    if (index < 0 || typeof callbacks[index] !== 'function') return
    callbackStack.push(index)
    try { return callbacks[index].apply(context, args) }
    finally { callbackStack.pop() }
  }
  function dispatch(...args) {
    // A later callback may have captured manager.onLoad and call it as its
    // predecessor. Resolve that historical callback, not this dispatcher again.
    if (callbackStack.length) return invoke(callbackStack[callbackStack.length - 1] - 1, this, args)
    const batch = ++batches, listeners = [...subscribers]
    try { return invoke(callbacks.length - 1, this, args) }
    finally {
      // Texture/GUI callbacks may finish modifying the scene in this same turn.
      // Notify before the next RAF, once the complete loading callback returns.
      queueMicrotask(() => {
        for (const listener of listeners) {
          if (!listener.active) continue
          listener.completions++
          try { listener.onLoad?.({ manager, batch }) }
          catch (error) {
            listener.lastError = error?.message || String(error)
            try { listener.onError?.(error) } catch { /* Other editors still need their notification. */ }
          }
        }
      })
    }
  }
  const getter = () => dispatch
  const setter = callback => { if (callback !== dispatch) callbacks.push(callback) }
  Object.defineProperty(manager, 'onLoad', { configurable: true, enumerable: descriptor?.enumerable ?? true, get: getter, set: setter })
  const hub = {
    subscribers,
    subscribe(listener) { subscribers.add(listener) },
    unsubscribe(listener) {
      subscribers.delete(listener)
      if (subscribers.size) return
      const current = Object.getOwnPropertyDescriptor(manager, 'onLoad')
      if (current?.get === getter && current?.set === setter) {
        let callback = callbacks[callbacks.length - 1]
        if (callbacks.length > 1 && typeof callback === 'function') {
          // A subsequently registered callback can close over dispatch. Keep a
          // lightweight bridge after disposal so that captured predecessor still
          // resolves safely; it has no subscribers and schedules no work.
          callback = function (...args) { return invoke(callbacks.length - 1, this, args) }
        }
        if (descriptor) Object.defineProperty(manager, 'onLoad', { ...descriptor, value: callback })
        else Object.defineProperty(manager, 'onLoad', { configurable: true, enumerable: true, writable: true, value: callback })
      }
      if (manager[HUB] === hub) delete manager[HUB]
    }
  }
  Object.defineProperty(manager, HUB, { configurable: true, value: hub })
  return hub
}

/** Shared, event-driven completion subscription; no render/texture polling. */
export function createNanjingAssetInvalidation({ onLoad, onError, manager = DefaultLoadingManager } = {}) {
  if (!manager || typeof manager.itemStart !== 'function' || typeof manager.itemEnd !== 'function') {
    throw new TypeError('A Three LoadingManager is required')
  }
  const hub = manager[HUB] || createHub(manager)
  const listener = { active: true, completions: 0, lastError: null, onLoad, onError }
  if (!hub.unsupported) hub.subscribe(listener)
  function getStatus() {
    return { disposed: !listener.active, subscribed: listener.active && !hub.unsupported,
      completions: listener.completions, subscribers: hub.subscribers?.size ?? 0,
      lastError: listener.lastError, unsupported: hub.unsupported || null }
  }
  function dispose() {
    if (!listener.active) return
    listener.active = false
    if (!hub.unsupported) hub.unsubscribe(listener)
  }
  return { getStatus, dispose }
}
