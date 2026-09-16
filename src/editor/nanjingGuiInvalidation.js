/**
 * Core exposes its lil-gui root as editor.GUI; floating panels remain folders
 * of that root. lil-gui drag/wheel/arrow changes do not dispatch DOM input.
 * Listen to its own dispatch, without replacing registered user callbacks.
 */
export function createNanjingGuiInvalidation(editor, { onChange, onFinishChange, onError } = {}) {
  if (!editor || typeof editor !== 'object') throw new TypeError('An editor is required')
  let disposed = false, root = null, epoch = 0, scheduled = false, lastError = null
  let changeEvents = 0, finishEvents = 0, notifications = 0, replacements = 0
  const hooks = [], pending = new Map()
  const property = Object.getOwnPropertyDescriptor(editor, 'GUI')
  let trackedValue = editor.GUI
  const automaticReplacement = !!property && 'value' in property && property.writable && property.configurable
  let getter, setter

  function report(error) {
    lastError = error?.message || String(error)
    try { onError?.(error) } catch { /* A notification must not break GUI editing. */ }
  }
  function notify(callback, event) {
    if (!callback) return
    try { callback(event); notifications++ } catch (error) { report(error) }
  }
  function enqueue(controller, type) {
    if (disposed || !controller) return
    if (type === 'change') changeEvents++
    else finishEvents++
    let item = pending.get(controller)
    if (!item) { item = { change: false, finish: false }; pending.set(controller, item) }
    item[type] = true
    if (scheduled) return
    scheduled = true
    const token = epoch
    // GUI parents fire before a controller's own callback. Defer until those
    // callbacks have copied proxy values into the actual scene, before RAF.
    queueMicrotask(() => {
      if (disposed || token !== epoch) return
      scheduled = false
      const batch = [...pending]; pending.clear()
      for (const [controller, flags] of batch) {
        if (disposed || token !== epoch) break
        let value
        try { value = controller.getValue?.() ?? controller.object?.[controller.property] } catch (error) { report(error); continue }
        const event = { object: controller.object, property: controller.property, value, controller, gui: root }
        if (flags.change) notify(onChange, event)
        if (!disposed && token === epoch && flags.finish) notify(onFinishChange, event)
      }
    })
  }
  function detach() {
    epoch++; pending.clear(); scheduled = false
    for (const { gui, key, wrapper, descriptor } of hooks) {
      if (gui[key] !== wrapper) continue
      if (descriptor) Object.defineProperty(gui, key, descriptor)
      else delete gui[key]
    }
    hooks.length = 0
    root = null
  }
  function attach(gui, key, type) {
    const original = gui[key], descriptor = Object.getOwnPropertyDescriptor(gui, key)
    if (typeof original !== 'function' || (descriptor && !descriptor.configurable && !descriptor.writable)) return false
    function wrapper(controller, ...args) {
      try { return original.call(this, controller, ...args) }
      finally { if (!disposed && root === gui) enqueue(controller, type) }
    }
    try {
      Object.defineProperty(gui, key, { configurable: true, writable: true, enumerable: descriptor?.enumerable ?? false, value: wrapper })
      hooks.push({ gui, key, wrapper, descriptor })
      return true
    } catch (error) { report(error); return false }
  }
  function refresh() {
    if (disposed) return getStatus()
    let next = editor.GUI
    const visited = new Set()
    while (next?.parent && !visited.has(next)) { visited.add(next); next = next.parent }
    if (next === root) return getStatus()
    detach()
    if (next && typeof next._callOnChange === 'function' && typeof next._callOnFinishChange === 'function') {
      root = next; replacements++
      attach(root, '_callOnChange', 'change')
      attach(root, '_callOnFinishChange', 'finish')
    }
    return getStatus()
  }
  function getStatus() {
    return { disposed, attached: !!root && hooks.length === 2, automaticReplacement,
      changes: changeEvents, finishes: finishEvents, notifications, pending: pending.size, roots: replacements, lastError }
  }
  function dispose() {
    if (disposed) return
    disposed = true; detach()
    const current = Object.getOwnPropertyDescriptor(editor, 'GUI')
    if (automaticReplacement && current?.get === getter && current?.set === setter) {
      // Keep any GUI assigned during this controller's lifetime.
      Object.defineProperty(editor, 'GUI', { ...property, value: trackedValue })
    }
  }
  if (automaticReplacement) {
    getter = () => trackedValue
    setter = value => { trackedValue = value; refresh() }
    Object.defineProperty(editor, 'GUI', { configurable: true, enumerable: property.enumerable, get: getter, set: setter })
  }
  refresh()
  return { refresh, getStatus, dispose }
}
