import { Matrix4, Vector3 } from 'three'

const exportRecords = new WeakMap()
const materialsOf = object => Array.isArray(object.material) ? object.material : [object.material]
const isVisible = object => { for (let node = object; node; node = node.parent) if (!node.visible) return false; return true }
const matrixNear = (a, b) => a.elements.every((value, index) => Math.abs(value - b.elements[index]) < 1e-4)
const hasUtilityAncestor = object => { for (let node = object; node; node = node.parent) if (node.userData?.nanjingUtility || node.userData?.nanjingInstancing) return true; return false }

// Hash numeric attributes rather than runtime UUIDs or index integer widths.
function geometryKey(geometry) {
  let hash = 2166136261
  const bits = new DataView(new ArrayBuffer(4))
  const add = value => { bits.setFloat32(0, value, true); hash = Math.imul(hash ^ bits.getUint32(0, true), 16777619) }
  const parts = []
  for (const name of Object.keys(geometry.attributes).sort()) {
    const attribute = geometry.attributes[name]
    parts.push(name, attribute.count, attribute.itemSize, attribute.normalized)
    for (let i = 0; i < attribute.count; i++) for (let j = 0; j < attribute.itemSize; j++) add(attribute.getComponent(i, j))
  }
  const index = geometry.index
  parts.push(index?.count ?? 0)
  for (let i = 0; i < (index?.count || 0); i++) add(index.getX(i))
  return parts.join('|') + '|' + (hash >>> 0)
}

function sameGeometry(a, b) {
  if (a === b) return true
  const names = Object.keys(a.attributes).sort(), otherNames = Object.keys(b.attributes).sort()
  if (names.join('|') !== otherNames.join('|') || (a.index?.count ?? 0) !== (b.index?.count ?? 0)) return false
  for (const name of names) {
    const left = a.attributes[name], right = b.attributes[name]
    if (left.count !== right.count || left.itemSize !== right.itemSize || left.normalized !== right.normalized) return false
    for (let i = 0; i < left.count; i++) for (let j = 0; j < left.itemSize; j++) if (left.getComponent(i, j) !== right.getComponent(i, j)) return false
  }
  for (let i = 0; i < (a.index?.count || 0); i++) if (a.index.getX(i) !== b.index.getX(i)) return false
  return true
}

function writeInstances(record, indices, target = record.object) {
  let changed = target.count !== indices.length
  for (let slot = 0; slot < indices.length; slot++) {
    const source = indices[slot]
    for (let j = 0; j < 16; j++) {
      const value = record.matrices[source * 16 + j], offset = slot * 16 + j
      if (target.instanceMatrix.array[offset] !== value) { target.instanceMatrix.array[offset] = value; changed = true }
    }
    if (record.colors && target.instanceColor) for (let j = 0; j < target.instanceColor.itemSize; j++) {
      const value = record.colors[source * target.instanceColor.itemSize + j], offset = slot * target.instanceColor.itemSize + j
      if (target.instanceColor.array[offset] !== value) { target.instanceColor.array[offset] = value; changed = true }
    }
  }
  target.count = indices.length
  if (changed) {
    target.instanceMatrix.needsUpdate = true
    if (target.instanceColor) target.instanceColor.needsUpdate = true
    target.computeBoundingBox(); target.computeBoundingSphere()
  }
  if (target === record.object) record.appliedVersion = target.instanceMatrix.version
  return changed
}

function isDuplicate(match, record) {
  return match?.duplicates.some(object => record.isDrawableSource(object)) === true
}
function retainedIndices(record, { exportSource = false } = {}) {
  return record.indices.filter(index => {
    const match = record.matches[index]
    // GLTFExporter serializes visible meshes regardless of their render layers
    // and custom layer test, so exported source duplicates use node visibility.
    return !match || isVisible(match.root) && !(exportSource ? match.duplicates.some(isVisible) : isDuplicate(match, record))
  })
}

/** Export a source batch at its full, baseline tree population. A visible,
 * geometrically identical source trunk already exports the duplicate instance. */
export function prepareNanjingImportedBatchExport(source, copy) {
  const record = exportRecords.get(source)
  if (!record) return
  writeInstances(record, retainedIndices(record, { exportSource: true }), copy)
}

/** Old exported GPU groups can be the only surviving trunks. Reconcile each
 * instance with a leaf group; never discard unmatched instances or other props. */
export function createNanjingImportedTreeInstances(editor, { getInstancingGroup, getOriginalGeometry } = {}) {
  const records = new Map(), geometryKeys = new WeakMap(), geometryPairs = new WeakMap()
  const recoveredBatches = new Set(), recoveredGroups = new Set()
  let disposed = false, suspended = 0
  let liveDraws = null, visibilityChanged = false
  const local = new Matrix4(), world = new Matrix4(), origin = new Vector3()
  const drawableTrunkMaterial = object => materialsOf(object).some(material => material?.name === 'Material_24' && material.visible !== false)
  const drawKey = object => [object.geometry.id, ...materialsOf(object).map(material => material?.id)].join('|')
  const drawCell = matrix => [12, 13, 14].map(index => Math.round(matrix.elements[index] * 10000))
  function liveTrunkDraws() {
    if (liveDraws) return liveDraws
    liveDraws = new Map()
    const group = getInstancingGroup?.()
    if (!group || !isVisible(group)) return liveDraws
    group.updateWorldMatrix(true, true)
    group.traverseVisible(object => {
      if (!object.isInstancedMesh || !drawableTrunkMaterial(object)) return
      const key = drawKey(object), cells = liveDraws.get(key) || new Map()
      for (let index = 0; index < object.count; index++) {
        const matrix = new Matrix4().fromArray(object.instanceMatrix.array, index * 16).premultiply(object.matrixWorld)
        const cell = drawCell(matrix).join(','), rows = cells.get(cell) || []
        rows.push({ object, matrix }); cells.set(cell, rows)
      }
      liveDraws.set(key, cells)
    })
    return liveDraws
  }
  function isDrawableSource(source, batch) {
    if (!isVisible(source) || !drawableTrunkMaterial(source)) return false
    const mask = batch.layers.mask & (editor.camera?.layers.mask ?? -1)
    if (!(source.layers.mask & mask)) return false
    const layers = { mask }
    if (source.layers.test(layers)) return true
    // Live instancing suppresses only the source's layer test. Require its
    // actual replacement draw before treating that source as a duplicate.
    const cells = liveTrunkDraws().get(drawKey(source))
    if (!cells) return false
    const center = drawCell(source.matrixWorld)
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const rows = cells.get([center[0] + x, center[1] + y, center[2] + z].join(',')) || []
      if (rows.some(row => row.object.layers.test(layers) && matrixNear(row.matrix, source.matrixWorld))) return true
    }
    return false
  }
  function recoverHiddenTrunkBatch(record) {
    // A previous "remove floating objects" action hid a whole trunk-only GPU
    // group, including its children. These batches can be the only trunks left
    // in an old GLB. Require every instance to match a tree before reviving one;
    // unmatched props and intentionally hidden ordinary source roots stay put.
    if (isVisible(record.object) || !record.indices.length || record.indices.some(index => !record.matches[index])) return
    if (!record.matches.some(match => match && isVisible(match.root) && !isDuplicate(match, record))) return
    const path = new Set(), hidden = []
    let knownGpu = false
    for (let node = record.object; node && node !== editor.scene; node = node.parent) {
      path.add(node)
      const gpu = !!node.userData?.nanjingInstancing
        || !!node.userData?.nanjingUtility && /^南京场景[ _]GPU[ _]实例渲染(?:_\d+)?$/.test(node.name || '')
      knownGpu ||= gpu
      if (!node.visible) {
        if (node !== record.object && !gpu) return
        hidden.push(node)
      }
    }
    if (!knownGpu || !hidden.length) return
    for (const node of hidden) {
      // Revealing a utility ancestor must not reveal unrelated sibling props.
      for (const child of node.children) if (!path.has(child) && child.visible) child.visible = false
      node.visible = true
      if (node !== record.object) recoveredGroups.add(node)
    }
    recoveredBatches.add(record.object)
    // This corrects saved source visibility, unlike density's render policy;
    // keep the repaired flags during source export and controller disposal.
    visibilityChanged = true
  }
  const entryFor = geometry => {
    let entry = geometryKeys.get(geometry)
    const attributes = Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b))
    const signature = attributes.map(([name, attribute]) => `${name}:${attribute.count}:${attribute.itemSize}:${attribute.version}`).join(',') + '|' + geometry.index?.version
    if (!entry || entry.signature !== signature || entry.index !== geometry.index || attributes.some(([, attribute], index) => entry.attributes[index] !== attribute)) {
      entry = {signature, index: geometry.index, attributes: attributes.map(([, attribute]) => attribute), key: geometryKey(geometry)}
      geometryKeys.set(geometry, entry)
    }
    return entry
  }
  const equivalentGeometry = (a, b) => {
    if (a === b) return true
    const left = entryFor(a), right = entryFor(b)
    if (left.key !== right.key) return false
    let pairs = geometryPairs.get(a)
    if (!pairs) { pairs = new WeakMap(); geometryPairs.set(a, pairs) }
    let pair = pairs.get(b)
    if (!pair || pair.left !== left || pair.right !== right) { pair = {left, right, equal: sameGeometry(a, b)}; pairs.set(b, pair) }
    return pair.equal
  }
  function refresh(trees) {
    if (disposed || suspended) return new Set()
    liveDraws = null
    editor.scene.updateMatrixWorld(true)
    const cells = new Map(), scale = 10000
    const cell = point => [point.x, point.y, point.z].map(value => Math.round(value * scale))
    for (const { root } of trees) {
      const points = [new Vector3().setFromMatrixPosition(root.matrixWorld)], trunks = []
      root.traverse(object => {
        if (!object.isMesh || hasUtilityAncestor(object)) return
        if (materialsOf(object).some(material => material?.name === 'Material_25')) points.push(new Vector3().setFromMatrixPosition(object.matrixWorld))
        if (!object.isInstancedMesh && materialsOf(object).some(material => material?.name === 'Material_24')) trunks.push(object)
      })
      for (const point of points) {
        const key = cell(point).join(','); const rows = cells.get(key) || []
        rows.push({ root, point, trunks }); cells.set(key, rows)
      }
    }
    const matchedRoots = new Set(), found = new Set(), liveGroup = getInstancingGroup?.()
    editor.scene.traverse(object => {
      if (!object.isInstancedMesh || !object.instanceMatrix || !object.geometry) return
      let imported = false
      for (let parent = object; parent && parent !== editor.scene; parent = parent.parent) {
        if (parent === liveGroup) return
        if (parent.editorType === 'isModelGroup') imported = true
      }
      // Top-level live controller groups are never imported source geometry.
      if (!imported || !hasUtilityAncestor(object)) return
      found.add(object)
      let record = records.get(object)
      if (!record) {
        record = { object, count: object.count, matrices: object.instanceMatrix.array.slice(), colors: object.instanceColor?.array.slice(),
          indices: Array.from({length:object.count}, (_, i) => i), matches: [], marker: object.userData.nanjingImportedSourceBatch, appliedVersion: object.instanceMatrix.version,
          isDrawableSource: source => isDrawableSource(source, object) }
        records.set(object, record); exportRecords.set(object, record)
      }
      const batchMaterials = materialsOf(object)
      const treeBatch = batchMaterials.length === 1 && batchMaterials[0]?.name === 'Material_24'
      record.matches = []
      if (treeBatch) for (const index of record.indices) {
        local.fromArray(record.matrices, index * 16); world.multiplyMatrices(object.matrixWorld, local); origin.setFromMatrixPosition(world)
        const center = cell(origin), nearest = new Map()
        for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
          for (const row of cells.get([center[0]+x,center[1]+y,center[2]+z].join(',')) || []) {
            const distance = origin.distanceToSquared(row.point)
            if (distance <= 1e-8 && (!nearest.has(row.root) || distance < nearest.get(row.root).distance)) nearest.set(row.root, {...row,distance})
          }
        }
        const ranked = [...nearest.values()].sort((a,b) => a.distance-b.distance)
        if (!ranked.length || ranked[1] && Math.abs(ranked[1].distance-ranked[0].distance) < 1e-12) continue
        const match = ranked[0]
        const duplicates = match.trunks.filter(trunk => matrixNear(trunk.matrixWorld, world)
          && [trunk.geometry, getOriginalGeometry?.(trunk.geometry)].filter(Boolean).some(geometry => equivalentGeometry(geometry, object.geometry)))
        record.matches[index] = { root: match.root, duplicates }; matchedRoots.add(match.root)
      }
      if (treeBatch) recoverHiddenTrunkBatch(record)
      // Unknown prop batches are source data too; preserve them and their group.
      object.userData.nanjingImportedSourceBatch = true
    })
    for (const [object, record] of records) if (!found.has(object)) { restore(record); records.delete(object); exportRecords.delete(object) }
    return matchedRoots
  }
  function sync() {
    if (disposed || suspended) return false
    liveDraws = null
    let changed = visibilityChanged
    visibilityChanged = false
    for (const record of records.values()) {
      recoverHiddenTrunkBatch(record)
      changed = writeInstances(record, retainedIndices(record)) || visibilityChanged || changed
    }
    visibilityChanged = false
    return changed
  }
  function restore(record) {
    writeInstances(record, record.indices)
    if (record.marker === undefined) delete record.object.userData.nanjingImportedSourceBatch
    else record.object.userData.nanjingImportedSourceBatch = record.marker
  }
  function withOriginals(callback) {
    if (disposed) return callback()
    suspended++
    if (suspended === 1) for (const record of records.values()) writeInstances(record, record.indices)
    const finish = () => { suspended--; if (!suspended && !disposed) sync() }
    try { const result = callback(); if (result?.then) return Promise.resolve(result).finally(finish); finish(); return result }
    catch (error) { finish(); throw error }
  }
  function getStatus() {
    const rows = [...records.values()]
    return { batches: rows.length, originalInstances: rows.reduce((sum,row)=>sum+row.count,0),
      activeInstances: rows.reduce((sum,row)=>sum+row.object.count,0),
      matchedInstances: rows.reduce((sum,row)=>sum+row.matches.filter(Boolean).length,0),
      duplicateInstances: rows.reduce((sum,row)=>sum+row.matches.filter(match=>match?.duplicates.length).length,0),
      recoveredBatches: [...recoveredBatches].filter(object => records.has(object)).length,
      recoveredGroups: recoveredGroups.size }
  }
  function dispose() { if (disposed) return; for (const record of records.values()) { restore(record); exportRecords.delete(record.object) }; records.clear(); recoveredBatches.clear(); recoveredGroups.clear(); liveDraws = null; disposed=true }
  return { refresh, sync, withOriginals, getStatus, dispose }
}
