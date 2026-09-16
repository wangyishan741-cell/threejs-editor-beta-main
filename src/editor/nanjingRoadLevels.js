import defaultPreset from './nanjingRoadLevelPreset.js'

const EPS = 1e-7
const nameOf = object => object.userData?.name || object.name
const SOURCE_ROADS = new Set(['支路_路面', '支路_路缘'])

function visit(object, callback) {
  if (!object || object.userData?.nanjingUtility || object.userData?.skipEditorTree || object.isHelper
    || object.isTransformControlsRoot || object.type?.endsWith('Helper')) return
  callback(object)
  for (const child of object.children || []) visit(child, callback)
}

/** The GLB's authoring Z is the editor's vertical axis. Apply the audited
 * per-object position offsets once, with the original mesh data untouched.
 * This is a static scene correction; no render-loop work or extra passes. */
export function createNanjingRoadLevels(editor, config = {}, { onChange, snapshot } = {}) {
  const scene = editor?.scene
  const pinned = snapshot?.version === 1
  if (pinned && (!Array.isArray(snapshot.preset?.rows) || snapshot.preset.rows.some(row => !Array.isArray(row)
    || typeof row[0] !== 'string' || typeof row[1] !== 'string' || !Number.isFinite(row[2])
    || !Number.isSafeInteger(row[3]) || !Number.isSafeInteger(row[4])))) throw new Error('历史标高快照无效，未使用当前预设覆盖')
  const preset = pinned ? structuredClone(snapshot.preset) : defaultPreset
  const settings = { version: 3, enabled: pinned ? snapshot.enabled === true : config.roadLevels?.version === 3 && config.roadLevels?.enabled === true }
  config.roadLevels = settings
  let disposed = false, suspended = 0, records = [], signature = null, elapsedMs = 0
  let state = resetState()
  function resetState() {
    return { active: false, groundMeshes: 0, internalRoadMeshes: 0, attachments: 0, buildings: 0,
      addedTriangles: 0, changedVertices: 0, geometryReplaced: 0, topologyChanged: false,
      renderPasses: 0, errors: [], skippedObjects: [], affectedObjects: [], attachmentChanges: [],
      targets: { ...preset.targets }, preservedGroups: [...preset.preservedGroups],
      preset: preset.id, sourcePreserved: true, heightPolicy: 'audited-object-vertical-layer-offsets' }
  }
  function detach() {
    for (const record of records) {
      record.baseY += record.object.position.y - record.appliedY
      record.object.position.y = record.baseY; record.object.updateMatrix()
    }
    scene?.updateMatrixWorld(true)
  }
  function attach() {
    for (const record of records) {
      record.baseY = record.object.position.y; record.appliedY = record.baseY + record.delta
      record.object.position.y = record.appliedY; record.object.updateMatrix()
    }
    scene?.updateMatrixWorld(true)
  }
  function release() { if (!suspended) detach(); records = [] }
  function inventory() {
    const names = new Map()
    visit(scene, object => {
      for (const name of new Set([object.name, nameOf(object)])) {
        const list = names.get(name) || []; list.push(object); names.set(name, list)
      }
    })
    return preset.rows.map(row => {
      const exact = names.get(row[0]) || [], source = names.get(row[1]) || []
      return { row, object: exact.length === 1 ? exact[0] : source.length === 1 ? source[0] : null }
    })
  }
  function inputSignature(data) {
    const applied = new Map(records.map(record => [record.object, record.delta]))
    return data.map(({ row, object }) => object ? [object, object.parent, object.geometry,
      object.geometry?.attributes.position?.count, object.geometry?.index?.count,
      object.position.x, object.position.y - (suspended ? 0 : applied.get(object) || 0), object.position.z,
      ...object.quaternion.toArray(), ...object.scale.toArray(), ...(object.parent?.matrixWorld.elements || [])] : [row[0], null])
  }
  function equal(a, b) {
    return a && a.length === b.length && a.every((row, i) => row.length === b[i].length
      && row.every((value, j) => typeof value === 'number' && typeof b[i][j] === 'number'
        ? Math.abs(value - b[i][j]) < 1e-11 : value === b[i][j]))
  }
  function refresh() {
    if (disposed || suspended) return getStatus()
    const start = performance.now()
    scene?.updateMatrixWorld(true)
    const data = inventory(), next = inputSignature(data)
    if (equal(signature, next)) return getStatus()
    const hadChanges = records.length > 0
    release(); signature = null; state = resetState()
    if (!scene || !settings.enabled) {
      signature = inputSignature(data); elapsedMs = performance.now() - start
      if (hadChanges) onChange?.(getStatus())
      return getStatus()
    }
    const candidates = new Set(data.map(record => record.object).filter(Boolean))
    for (const { row, object } of data) {
      if (!object) { state.skippedObjects.push({ name: row[0], reason: '原对象不存在或名称重复' }); continue }
      const geometry = object.geometry, vertices = geometry?.attributes.position?.count || 0, indices = geometry?.index?.count || 0
      if (vertices !== row[3] || indices !== row[4]) { state.skippedObjects.push({ name: row[0], reason: '模型几何版本变化，保留用户模型' }); continue }
      const e = object.parent?.matrixWorld.elements
      if (e && (Math.abs(e[4]) > EPS || Math.abs(e[6]) > EPS || Math.abs(e[5]) < EPS)) {
        state.skippedObjects.push({ name: row[0], reason: '父级已经倾斜，不能仅移动垂直轴' }); continue
      }
      let parent = object.parent, hasMovingParent = false
      while (parent) { if (candidates.has(parent)) { hasMovingParent = true; break } parent = parent.parent }
      if (hasMovingParent) { state.skippedObjects.push({ name: row[0], reason: '由已调整父对象带动，避免重复移动' }); continue }
      const delta = row[2]
      const baseY = object.position.y
      object.position.y += delta; object.updateMatrix()
      records.push({ object, delta, baseY, appliedY: object.position.y })
      if (row[5] === 'attachment') {
        state.attachments++
        state.attachmentChanges.push({ name: row[1], delta: delta * (e?.[5] || 1) })
      } else if (row[5] === 'building') state.buildings++
      else { state.groundMeshes++; state.affectedObjects.push(object.name); if (SOURCE_ROADS.has(object.name)) state.internalRoadMeshes++ }
    }
    scene.updateMatrixWorld(true)
    state.active = records.length > 0; signature = inputSignature(data); elapsedMs = performance.now() - start
    if (state.active || hadChanges) onChange?.(getStatus())
    return getStatus()
  }
  function update(patch = {}) {
    if (Object.hasOwn(patch, 'enabled') && settings.enabled !== (patch.enabled !== false)) {
      settings.enabled = patch.enabled !== false; signature = null
    }
    return refresh()
  }
  function withOriginals(callback) {
    if (disposed || !records.length || suspended) return callback()
    detach(); suspended++
    const restore = () => { suspended--; if (!disposed) attach() }
    try {
      const result = callback()
      if (result && typeof result.then === 'function') return Promise.resolve(result).finally(restore)
      restore(); return result
    } catch (error) { restore(); throw error }
  }
  function getStatus() { return { version: 3, enabled: settings.enabled, ...state, pinned, active: state.active && !suspended, buildMs: elapsedMs } }
  function getSnapshot() { return { version: 1, enabled: settings.enabled, preset: structuredClone(preset) } }
  function dispose() { if (disposed) return; release(); signature = null; disposed = true; state.active = false }
  refresh()
  return { refresh, update, withOriginals, getStatus, getSnapshot, dispose }
}
