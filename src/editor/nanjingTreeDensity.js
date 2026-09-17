import { createNanjingImportedTreeInstances } from './nanjingImportedTreeInstances.js'

const materialsOf = object => Array.isArray(object.material) ? object.material : [object.material]
const treeGroupPattern = /^(?:植被_乔木\d+(?:_林区)?_\d+(?:[_.]\d+)*|周边乔木_\d+(?:[_.]\d+)*|外扩_街区\d+_乔木_?\d+(?:[_.]\d+)*|西侧补充_远景面片树_\d+(?:[_.]\d+)*)$/
const excluded = object => {
  for (let parent = object; parent; parent = parent.parent) {
    if (parent.userData?.nanjingUtility || parent.userData?.nanjingInstancing || parent.isHelper) return true
  }
  return false
}
const normalize = ratio => Number.isFinite(Number(ratio)) ? Math.max(0, Math.min(100, Number(ratio))) : 100
function treeGroupValue(name) {
  let hash = 2166136261
  for (let index = 0; index < name.length; index++) {
    hash ^= name.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 100) / 100
}

// Leaf-only source roots participate only when an imported trunk instance can
// be associated with that root. Unknown or ambiguous objects remain untouched.
function collectTrees(scene) {
  const candidates = new Map()
  scene?.traverse(object => {
    if (!object.isMesh || excluded(object)) return
    const materials = materialsOf(object)
    const trunk = materials.some(material => material?.name === 'Material_24')
    const leaves = materials.some(material => material?.name === 'Material_25')
    if (!trunk && !leaves) return
    let root = object.parent
    for (let parent = object.parent; parent && parent !== scene; parent = parent.parent) {
      if (!parent.isMesh && treeGroupPattern.test(parent.name)) { root = parent; break }
    }
    if (!root || root === scene || root.isMesh) return
    const entry = candidates.get(root) || { trunk: false, leaves: false }
    entry.trunk ||= trunk; entry.leaves ||= leaves
    candidates.set(root, entry)
  })
  return [...candidates].filter(([root, entry]) => {
    if (!entry.leaves) return false
    let treeOnly = true
    root.traverse(object => {
      if (!object.isMesh || excluded(object)) return
      if (!materialsOf(object).every(material => ['Material_24', 'Material_25'].includes(material?.name))) treeOnly = false
    })
    return treeOnly
  }).map(([root, entry]) => ({ root, hasTrunk: entry.trunk }))
}

/** Render-only whole-tree visibility. Source mesh flags, geometry, transforms
 * and the source hierarchy are untouched; withOriginals also restores roots for
 * serialization. The callback synchronizes render proxies and shadow caches. */
export function createNanjingTreeDensity(editor, { ratio = 100, onChange, getInstancingGroup, getOriginalGeometry } = {}) {
  let keep = normalize(ratio), disposed = false, suspended = 0, pendingRefresh = false
  const records = new Map()
  const importedInstances = createNanjingImportedTreeInstances(editor, { getInstancingGroup, getOriginalGeometry })
  function notify(changed) {
    if (!changed) return false
    if (editor.renderer?.shadowMap) editor.renderer.shadowMap.needsUpdate = true
    onChange?.(getStatus())
    return true
  }
  function apply() {
    let changed = false
    for (const [object, record] of records) {
      // Honor visibility edits performed outside this controller.
      if (object.visible !== record.appliedVisible) record.sourceVisible = object.visible
      const visible = record.sourceVisible && treeGroupValue(object.name || object.uuid) * 100 < keep
      if (object.visible !== visible) { object.visible = visible; changed = true }
      record.appliedVisible = visible
    }
    return importedInstances.sync() || changed
  }
  function refresh() {
    if (disposed) return false
    if (suspended) { pendingRefresh = true; return false }
    const candidates = collectTrees(editor.scene)
    const importedRoots = importedInstances.refresh(candidates)
    const found = new Set(candidates.filter(entry => entry.hasTrunk || importedRoots.has(entry.root)).map(entry => entry.root))
    let changed = false
    for (const [object, record] of records) if (!found.has(object)) {
      if (object.visible === record.appliedVisible && object.visible !== record.sourceVisible) {
        object.visible = record.sourceVisible; changed = true
      }
      records.delete(object)
    }
    for (const object of found) if (!records.has(object)) records.set(object, { sourceVisible: object.visible, appliedVisible: object.visible })
    return notify(apply() || changed)
  }
  function setRatio(value) {
    keep = normalize(value)
    return refresh()
  }
  function withOriginals(callback) {
    if (disposed) return callback()
    suspended++
    if (suspended === 1) for (const [object, record] of records) {
      if (object.visible !== record.appliedVisible) record.sourceVisible = object.visible
      object.visible = record.sourceVisible
    }
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true; suspended--
      if (disposed || suspended) return
      // A source edit inside the callback remains the new editable baseline.
      for (const [object, record] of records) record.sourceVisible = record.appliedVisible = object.visible
      if (pendingRefresh) { pendingRefresh = false; refresh() } else apply()
    }
    try {
      const result = importedInstances.withOriginals(callback)
      if (result && typeof result.then === 'function') return Promise.resolve(result).finally(finish)
      finish(); return result
    } catch (error) { finish(); throw error }
  }
  function getStatus() {
    return { ratio: keep, effectiveRatio: keep, trees: records.size,
      retainedTrees: [...records].filter(([object]) => object.visible).length,
      sourceTrees: [...records.values()].filter(record => record.sourceVisible).length, importedInstances: importedInstances.getStatus() }
  }
  function dispose() {
    if (disposed) return
    for (const [object, record] of records) if (object.visible === record.appliedVisible) object.visible = record.sourceVisible
    importedInstances.dispose()
    records.clear(); disposed = true
  }
  refresh()
  return { refresh, setRatio, getStatus, withOriginals, dispose }
}
