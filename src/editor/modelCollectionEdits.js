const VERSION = 1
const ID_KEY = 'collectionId'
const STORAGE_KEY = 'collectionEdits'
const STATE_FIELDS = ['name', 'position', 'quaternion', 'scale', 'visible', 'castShadow', 'receiveShadow', 'renderOrder', 'matrixAutoUpdate', 'matrix']
const OBJECT_FLAGS = new Set(['visible', 'castShadow', 'receiveShadow', 'renderOrder'])
const ignored = object => !object || object.userData?.nanjingUtility || object.userData?.skipEditorTree
  || object.isHelper || object.isTransformControlsRoot || object.type?.endsWith('Helper')
const rootsOf = editor => editor.scene.children.filter(root => root.editorType === 'isModelGroup' && !ignored(root))
const pathKey = path => path.join('/')
const unique = values => values.length === 1 ? values[0] : null
const equal = (a, b) => Array.isArray(a) && Array.isArray(b)
  ? a.length === b.length && a.every((value, index) => value === b[index]) : a === b
const attachedTo = (object, root) => { for (let item = object; item; item = item.parent) if (item === root) return true; return false }

function readState(object) {
  return { name: object.name, position: object.position.toArray(), quaternion: object.quaternion.toArray(),
    scale: object.scale.toArray(), visible: object.visible, castShadow: object.castShadow,
    receiveShadow: object.receiveShadow, renderOrder: object.renderOrder, matrixAutoUpdate: object.matrixAutoUpdate,
    ...(!object.matrixAutoUpdate ? { matrix: object.matrix.toArray() } : {}) }
}
function applyState(object, state) {
  if (typeof state.name === 'string') object.name = state.name
  for (const [key, length] of [['position', 3], ['quaternion', 4], ['scale', 3], ['matrix', 16]]) {
    if (Array.isArray(state[key]) && state[key].length === length && state[key].every(Number.isFinite)) object[key].fromArray(state[key])
  }
  for (const key of ['visible', 'castShadow', 'receiveShadow', 'matrixAutoUpdate']) if (typeof state[key] === 'boolean') object[key] = state[key]
  if (Number.isFinite(state.renderOrder)) object.renderOrder = state.renderOrder
  if (object.matrixAutoUpdate) object.updateMatrix()
  object.matrixWorldNeedsUpdate = true
}
function identity(object, path) {
  return { path: path.slice(), sourceName: object.name, type: object.type,
    ...(object.geometry ? { vertices: object.geometry.attributes?.position?.count ?? 0, indices: object.geometry.index?.count ?? 0 } : {}) }
}
function matches(record, entry) {
  return record && record.identity.type === entry.type && record.identity.sourceName === entry.sourceName
    && (entry.vertices === undefined || record.identity.vertices === entry.vertices && record.identity.indices === entry.indices)
}

/** Keep the imported Object3Ds and shared buffers intact. Stable paths are
 * assigned ONCE, while the original GLB is still complete, so removing an earlier
 * sibling never changes the identity of the remaining objects. */
export function createModelCollectionEdits(editor, initialParams = {}) {
  if (editor.modelCollectionEdits) return editor.modelCollectionEdits
  let params = initialParams, records = new Map(), objects = new WeakMap(), disposed = false
  const controls = editor.transformControls, history = editor.handler?.handlerHistory
  const eventDocument = globalThis.document
  const originalDragCallback = controls?.drag_change_callback
  const originalIndexDescriptor = history && Object.getOwnPropertyDescriptor(history, 'index')
  let historyIndex = history?.index ?? -1, notificationQueued = false, indexWrapped = false

  function notifyChanged({ structure = false } = {}) {
    if (disposed) return
    editor.scene.updateMatrixWorld?.(true)
    controls?.dispatchEvent?.({ type: 'objectChange' })
    editor.scene.dispatchEvent?.({ type: 'collection-changed', structure })
  }
  function queueHistoryNotification() {
    if (notificationQueued || disposed) return
    notificationQueued = true
    queueMicrotask(() => { notificationQueued = false; notifyChanged() })
  }
  // Core undo/redo writes only TRS and does not emit TransformControls events.
  // Observing its public cursor also invalidates GPU source proxies for keyboard
  // undo/redo, while retaining the native history and keyboard implementation.
  if (history && originalIndexDescriptor?.configurable !== false && !originalIndexDescriptor?.get && !originalIndexDescriptor?.set) {
    indexWrapped = true
    Object.defineProperty(history, 'index', { configurable: true, enumerable: true,
      get: () => historyIndex,
      set(value) { historyIndex = value; queueHistoryNotification() } })
  }
  function truncateRedo() {
    if (!history?.list || !history?.reList) return
    const applied = Math.max(0, Math.min(history.list.length, history.list.length + history.index + 1))
    history.list.splice(applied); history.reList.splice(applied); history.index = -1
  }
  function dragCallback(value) {
    if (value) truncateRedo()
    return originalDragCallback?.call(this, value)
  }
  if (controls && originalDragCallback) controls.drag_change_callback = dragCallback

  function findEntry(root) {
    const entries = (params?.modelCores || []).filter(entry => entry?.group)
    const id = root.modelInfo?.[ID_KEY]
    return unique(entries.filter(entry => entry.modelInfo === root.modelInfo))
      || unique(entries.filter(entry => id && entry.modelInfo?.[ID_KEY] === id))
      || unique(entries.filter(entry => entry.group.uuid === root.uuid))
      || unique(entries.filter(entry => entry.modelInfo?.url === root.modelInfo?.url && entry.group.name === root.name))
      || unique(entries.filter(entry => entry.modelInfo?.url === root.modelInfo?.url))
  }
  function registerRoot(root, { pristine = true } = {}) {
    if (!root || root.editorType !== 'isModelGroup' || ignored(root)) return null
    if (records.has(root)) return records.get(root)
    const entry = findEntry(root)
    // modelInfo may have been reused by an import caller; keep each collection's
    // persistent identity independent even when two imports use the same URL.
    root.modelInfo = { ...root.modelInfo, [ID_KEY]: root.modelInfo?.[ID_KEY] || root.uuid }
    const record = { root, entry, nodes: new Map(), pristine, restored: false }
    function visit(object, path) {
      if (ignored(object)) return
      const node = { object, root, identity: identity(object, path), baseline: readState(object) }
      record.nodes.set(pathKey(path), node); objects.set(object, node)
      object.children.forEach((child, index) => visit(child, [...path, index]))
    }
    visit(root, []); records.set(root, record)
    return record
  }
  function getRoot(object) {
    const known = objects.get(object)?.root
    if (known) return known
    for (let parent = object; parent; parent = parent.parent) {
      if (ignored(parent)) return null
      if (parent.editorType === 'isModelGroup') return parent
    }
    return null
  }
  function editable(object) {
    const root = getRoot(object)
    if (!root || !attachedTo(root, editor.scene) || !attachedTo(object, root)) return null
    if (!records.has(root)) registerRoot(root, { pristine: false })
    return objects.has(object) ? root : null
  }
  function capture(root) {
    const record = records.get(root) || registerRoot(root, { pristine: false })
    if (!record) return null
    const nodes = [], deleted = []
    for (const node of record.nodes.values()) {
      const { object, identity: source, baseline } = node
      if (!source.path.length) continue // The core already stores the root TRS.
      if (!attachedTo(object, root)) {
        if (!deleted.some(entry => source.path.length > entry.path.length && entry.path.every((index, i) => source.path[i] === index))) deleted.push(source)
        continue
      }
      const state = readState(object)
      // Legacy Nanjing config.objects is keyed by name. Store exact flags even
      // when equal to the source, so a hidden duplicate cannot hide its unchanged
      // same-name sibling when those legacy material rules run before restore.
      const changed = Object.fromEntries(STATE_FIELDS.filter(key => state[key] !== undefined
        && (OBJECT_FLAGS.has(key) || !record.pristine || !equal(state[key], baseline[key]))).map(key => [key, state[key]]))
      if (Object.keys(changed).length) nodes.push({ ...source, state: changed })
    }
    return { version: VERSION, nodes, deleted }
  }
  function restoreRoot(root, { force = false } = {}) {
    const record = records.get(root) || registerRoot(root)
    if (!record || record.restored && !force) return { restored: false, skipped: [] }
    const descriptor = record.entry?.group?.[STORAGE_KEY]
    if (descriptor?.version !== VERSION || !Array.isArray(descriptor.nodes) || !Array.isArray(descriptor.deleted)) {
      // The first legacy/default rule application is now complete. Later model
      // arrivals and appearance refreshes must preserve edits on this live root.
      record.restored = true
      return { restored: false, skipped: [] }
    }
    const skipped = []
    const resolve = entry => {
      if (!Array.isArray(entry?.path) || entry.path.length === 0 || entry.path.some(index => !Number.isSafeInteger(index) || index < 0)) return null
      const node = record.nodes.get(pathKey(entry.path))
      if (!matches(node, entry)) { skipped.push(entry.path); return null }
      return node.object
    }
    // Resolve from the original path registry; direct child-array indexing would
    // silently edit the next object after a deletion or with duplicate names.
    for (const entry of descriptor.nodes) { const object = resolve(entry); if (object && entry.state) applyState(object, entry.state) }
    for (const entry of descriptor.deleted) { const object = resolve(entry); object?.parent?.remove(object) }
    record.restored = true
    notifyChanged({ structure: descriptor.deleted.length > 0 })
    return { restored: true, skipped }
  }
  function restoreAll(options) { return rootsOf(editor).map(root => restoreRoot(root, options)) }
  function shouldPreserveObjectState(object) {
    const root = getRoot(object)
    return !!root && records.get(root)?.restored === true
  }
  /** Call INSIDE withNanjingSourceScene, after originalSave(). Derived road/tree
   * offsets are temporarily removed there; saving rendered transforms here
   * would apply those offsets twice after a reload. */
  function annotateSave(data) {
    // An explicit empty modelCores array means the user deleted every collection;
    // restore must not treat that saved state as a request for the starter GLB.
    data.modelCollections = { version: VERSION }
    const roots = rootsOf(editor), used = new Set()
    for (const [index, entry] of (data?.modelCores || []).entries()) {
      if (!entry?.group) continue
      const available = roots.filter(root => !used.has(root)), id = entry.modelInfo?.[ID_KEY]
      const root = unique(available.filter(root => id && root.modelInfo?.[ID_KEY] === id))
        || unique(available.filter(root => root.uuid === entry.group.uuid))
        || unique(available.filter(root => root.modelInfo === entry.modelInfo))
        || (available.includes(roots[index]) && roots[index].modelInfo?.url === entry.modelInfo?.url ? roots[index] : null)
      if (!root) continue
      used.add(root)
      entry.group[STORAGE_KEY] = capture(root)
      entry.modelInfo = { ...entry.modelInfo, [ID_KEY]: root.modelInfo[ID_KEY] }
    }
    return data
  }
  function addCommand(before, after, apply) {
    if (!history?.list || !history?.reList) return
    truncateRedo()
    // Native restoreHistoryHandler calls these three setters. The command target
    // never enters the scene and never replaces an editable Object3D.
    const target = { position: { set(value) { apply(value ? after : before) } }, rotation: { set() {} }, scale: { set() {} } }
    const transform = value => ({ position: { x: value, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } })
    history.list.push({ object: target, transform: transform(0) })
    history.reList.push({ object: target, transform: transform(1) })
    history.index = -1
  }
  function change(object, before, after, apply) {
    if (!editable(object)) return false
    const update = value => { apply(value); notifyChanged() }
    update(after); addCommand(before, after, update)
    return true
  }
  function rename(object, name) {
    if (typeof name !== 'string' || !name.trim()) return false
    name = name.trim()
    if (name === object?.name) return true
    return change(object, object?.name, name, value => { object.name = value })
  }
  function setVisible(object, value) {
    value = !!value
    if (value === object?.visible) return true
    return change(object, object?.visible, value, next => { object.visible = next })
  }
  function setTransform(object, patch) {
    if (!editable(object) || !patch || typeof patch !== 'object') return false
    const before = readState(object), after = { ...before }
    for (const [key, length] of [['position', 3], ['quaternion', 4], ['scale', 3]]) {
      if (patch[key] !== undefined) {
        const value = Array.isArray(patch[key]) ? patch[key] : patch[key]?.toArray?.()
        if (!value || value.length !== length || !value.every(Number.isFinite)) return false
        after[key] = value.slice()
      }
    }
    if (['position', 'quaternion', 'scale'].every(key => equal(before[key], after[key]))) return true
    if (!after.matrixAutoUpdate) after.matrix = object.matrix.clone().compose(object.position.clone().fromArray(after.position),
      object.quaternion.clone().fromArray(after.quaternion), object.scale.clone().fromArray(after.scale)).toArray()
    return change(object, before, after, next => applyState(object, next))
  }
  function remove(object) {
    const root = editable(object)
    if (!root || !object.parent) return false
    const parent = object.parent, index = parent.children.indexOf(object)
    const apply = present => {
      if (present) {
        parent.add(object)
        const current = parent.children.indexOf(object)
        parent.children.splice(current, 1); parent.children.splice(Math.min(index, parent.children.length), 0, object)
      } else {
        if (controls?.object && attachedTo(controls.object, object)) controls.detach?.()
        const selected = editor.effectComposer?.effectPass?.outlinePass?.selectedObjects
        if (selected?.some(item => attachedTo(item, object))) editor.setOutlinePass?.(selected.filter(item => !attachedTo(item, object)))
        object.parent?.remove(object)
      }
      notifyChanged({ structure: true })
    }
    apply(false); addCommand(true, false, apply)
    return true
  }
  function keydown(event) {
    if (disposed || event.key !== 'Delete' || event.repeat || event.defaultPrevented || editor.handler?.openKeyEnable === false) return
    const target = event.target, active = eventDocument?.activeElement
    const typing = element => element?.isContentEditable || element?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')
    if (typing(target) || typing(active)) return
    if (target?.closest?.('[role="tree"]')) return // Tree rows delete their focused object explicitly.
    const selected = controls?.object || editor.effectComposer?.effectPass?.outlinePass?.selectedObjects?.[0]
    if (!editable(selected)) return
    // Run before the native bubbling handler, which hides a nested child and
    // provides no undo record. Non-model editing keeps the native key behavior.
    event.preventDefault(); event.stopImmediatePropagation()
    remove(selected)
  }
  function setParams(next = {}) {
    params = next; records = new Map(); objects = new WeakMap()
    // Undo targets belong to the old source graph, which resetEditorStorage will
    // dispose. They must not resurrect nodes from a different project.
    if (history?.list && history?.reList) { history.list.length = 0; history.reList.length = 0; history.index = -1 }
  }
  function dispose() {
    disposed = true; records.clear()
    eventDocument?.removeEventListener?.('keydown', keydown, true)
    if (controls?.drag_change_callback === dragCallback) controls.drag_change_callback = originalDragCallback
    if (indexWrapped && history) {
      Object.defineProperty(history, 'index', { ...(originalIndexDescriptor || { configurable: true, enumerable: true, writable: true }), value: historyIndex })
    }
    if (editor.modelCollectionEdits === controller) delete editor.modelCollectionEdits
  }
  const controller = { setParams, registerRoot, getRoot, capture, restoreRoot, restoreAll, shouldPreserveObjectState, annotateSave,
    remove, rename, setVisible, setTransform, notifyChanged, dispose }
  eventDocument?.addEventListener?.('keydown', keydown, true)
  editor.modelCollectionEdits = controller
  return controller
}
