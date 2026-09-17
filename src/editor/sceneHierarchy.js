// Keep actual Object3D references. The hierarchy is a view, never a flattened
// replacement model or a reorder of children/material binding paths.
export function isSceneHierarchyObject(object) {
  return !!object && !object.userData?.skipEditorTree && !object.userData?.nanjingUtility
    && !object.userData?.nanjingInstancing && !object.isHelper && !object.isCamera
    && !object.isTransformControls && !object.isTransformControlsRoot && !object.type?.includes('Helper')
}
export function sceneHierarchyChildren(object) { return (object.children || []).filter(isSceneHierarchyObject) }
export function sceneHierarchyRows(scene, expanded = new Set(), query = '') {
  const rows = [], needle = query.trim().toLocaleLowerCase(), matches = new Map()
  function match(object) {
    if (!isSceneHierarchyObject(object)) return false
    const own = (object.name || object.type).toLocaleLowerCase().includes(needle)
    const descendant = sceneHierarchyChildren(object).map(match).some(Boolean)
    matches.set(object, own || descendant); return own || descendant
  }
  if (needle) sceneHierarchyChildren(scene).forEach(match)
  function visit(object, depth, parentVisible, parentId, includeAll = false) {
    if (needle && !includeAll && !matches.get(object)) return
    const children = sceneHierarchyChildren(object), visible = parentVisible && object.visible
    const ownMatch = needle && (object.name || object.type).toLocaleLowerCase().includes(needle)
    const open = !!needle || expanded.has(object.uuid)
    rows.push({ object, id: object.uuid, parentId, name: object.name || object.type, depth, visible: object.visible,
      effectiveVisible: visible, childCount: children.length, expanded: open, hasChildren: children.length > 0,
      kind: object.editorType === 'isModelGroup' || object.isGroup || object.isScene || (children.length > 0 && !object.isMesh && !object.isLight) ? '集合' : object.isMesh ? '模型' : object.type })
    if (open) children.forEach(child => visit(child, depth + 1, visible, object.uuid, includeAll || ownMatch))
  }
  sceneHierarchyChildren(scene).forEach(object => visit(object, 0, true, null))
  return rows
}

export function observeSceneHierarchy(scene, onChange) {
  const watched = new Set()
  let disposed = false, queued = false
  const schedule = () => {
    if (queued || disposed) return
    queued = true
    queueMicrotask(() => { queued = false; if (!disposed) onChange() })
  }
  const added = event => { if (isSceneHierarchyObject(event.child)) { watch(event.child); schedule() } }
  const removed = event => { if (watched.has(event.child)) { unwatch(event.child); schedule() } }
  function watch(object) {
    if (watched.has(object)) return
    watched.add(object)
    object.addEventListener('childadded', added); object.addEventListener('childremoved', removed)
    sceneHierarchyChildren(object).forEach(watch)
  }
  function unwatch(object) {
    watched.delete(object)
    object.removeEventListener('childadded', added); object.removeEventListener('childremoved', removed)
    for (const child of object.children) if (watched.has(child)) unwatch(child)
  }
  watch(scene)
  scene.addEventListener('collection-changed', schedule)
  return () => {
    disposed = true
    scene.removeEventListener('collection-changed', schedule)
    for (const object of [...watched]) unwatch(object)
  }
}
