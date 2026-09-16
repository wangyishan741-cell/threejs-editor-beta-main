import { Matrix3, Vector3 } from 'three'

const excluded = object => object.userData?.nanjingUtility || object.userData?.skipEditorTree || object.isHelper
const materialsOf = object => Array.isArray(object.material) ? object.material : [object.material]
function normalize(source) {
  const offsets = source?.offsets || {}
  if (!offsets || typeof offsets !== 'object' || Array.isArray(offsets)) throw new Error('移树配置无效')
  const copy = {}
  for (const [name, offset] of Object.entries(offsets)) {
    if (!/^周边乔木_\d+$/.test(name) || !Array.isArray(offset) || offset.length !== 2 || !offset.every(Number.isFinite)) throw new Error(`移树偏移无效：${name}`)
    copy[name] = offset.slice()
  }
  return { version: 1, enabled: source?.version === 1 && source?.enabled === true, offsets: copy }
}

/** An explicit, history-owned correction of tree group positions. Offsets are
 * world X/Z only; roadLevels owns vertical planting height independently. */
export function createNanjingTreePlacements(editor, config = {}, { onChange } = {}) {
  const scene = editor?.scene
  let settings = normalize(config.treePlacements), records = [], disposed = false, suspended = 0, pendingRefresh = false
  let skipped = []
  function detach() {
    for (const row of records) {
      row.baseX += row.object.position.x - row.appliedX
      row.baseZ += row.object.position.z - row.appliedZ
      row.object.position.x = row.baseX; row.object.position.z = row.baseZ; row.object.updateMatrix()
    }
    scene?.updateMatrixWorld(true)
  }
  function attach() {
    for (const row of records) {
      row.baseX = row.object.position.x; row.baseZ = row.object.position.z
      row.appliedX = row.baseX + row.localDelta.x; row.appliedZ = row.baseZ + row.localDelta.z
      row.object.position.x = row.appliedX; row.object.position.z = row.appliedZ; row.object.updateMatrix()
    }
    scene?.updateMatrixWorld(true)
  }
  function refresh() {
    if (disposed) return getStatus()
    if (suspended) { pendingRefresh = true; return getStatus() }
    const hadRecords = records.length > 0
    detach(); records = []; skipped = []
    if (settings.enabled && scene) {
      const names = new Map()
      scene.traverse(object => { if (excluded(object)) return; const list = names.get(object.name) || []; list.push(object); names.set(object.name, list) })
      for (const [name, offset] of Object.entries(settings.offsets)) {
        const matches = names.get(name) || [], object = matches.length === 1 ? matches[0] : null
        if (!object) { skipped.push({ name, reason: '原树组不存在或名称重复' }); continue }
        // Exact source groups contain both the original trunk and foliage.
        // Never move just one child, a road, or a similarly named helper.
        const meshes = object.children.filter(child => child.isMesh && !excluded(child))
        const hasTrunk = meshes.some(child => materialsOf(child).some(material => material?.name === 'Material_24'))
        const hasLeaves = meshes.some(child => materialsOf(child).some(material => material?.name === 'Material_25'))
        if (object.isMesh || !hasTrunk || !hasLeaves || meshes.length !== object.children.length) {
          skipped.push({ name, reason: '树组构成变化，保留当前对象' }); continue
        }
        const parentMatrix = object.parent?.matrixWorld
        const linear = parentMatrix ? new Matrix3().setFromMatrix4(parentMatrix) : new Matrix3()
        if (Math.abs(linear.determinant()) < 1e-10) { skipped.push({ name, reason: '父级缩放不可逆' }); continue }
        const localDelta = new Vector3(offset[0], 0, offset[1]).applyMatrix3(linear.invert())
        if (Math.abs(localDelta.y) > 1e-8) { skipped.push({ name, reason: '父级倾斜，不能仅水平平移' }); continue }
        const baseX = object.position.x, baseZ = object.position.z
        records.push({ object, name, offset: offset.slice(), localDelta, baseX, baseZ, appliedX: baseX, appliedZ: baseZ })
      }
      attach()
    }
    if (hadRecords || records.length) onChange?.(getStatus())
    return getStatus()
  }
  function update(patch = {}) {
    const next = normalize({ ...settings, ...patch, version: 1 })
    settings = next; config.treePlacements = structuredClone(next)
    return refresh()
  }
  function withOriginals(callback) {
    if (disposed || suspended || !records.length) return callback()
    detach(); suspended++
    const restore = () => {
      suspended--
      if (disposed) return
      if (pendingRefresh) { pendingRefresh = false; records = []; refresh() } else attach()
    }
    try {
      const result = callback()
      if (result && typeof result.then === 'function') return Promise.resolve(result).finally(restore)
      restore(); return result
    } catch (error) { restore(); throw error }
  }
  function getStatus() { return { version: 1, enabled: settings.enabled, active: !disposed && !suspended && records.length > 0,
    movedGroups: records.length, offsets: structuredClone(settings.offsets), skipped: skipped.slice(),
    geometryChanged: false, hierarchyChanged: false, changesY: false } }
  function dispose() { if (disposed) return; if (!suspended) detach(); records = []; disposed = true }
  refresh()
  return { refresh, update, withOriginals, getStatus, dispose }
}
