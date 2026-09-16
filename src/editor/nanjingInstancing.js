import * as THREE from 'three'

// Render-only proxies. The GLB hierarchy remains the source of truth for editing
// and serialization. Suppressing one mesh's layer test leaves its children,
// editable layer mask, clones and saved hierarchy intact.
export function createNanjingInstancing(editor, options = {}) {
  const scene = editor.scene
  const cellSize = Math.max(0.01, options.cellSize ?? 16)
  const minInstances = Math.max(2, options.minInstances ?? 3)
  const maxInstances = Math.max(minInstances, options.maxInstances ?? 256)
  const group = new THREE.Group()
  group.name = '南京场景 GPU 实例渲染'
  group.userData.nanjingUtility = true
  group.userData.nanjingInstancing = true
  group.matrixAutoUpdate = false
  const inverseScene = new THREE.Matrix4()
  const relativeMatrix = new THREE.Matrix4()
  const instanceMatrix = new THREE.Matrix4()
  const records = []
  const batches = []
  let enabled = options.enabled !== false
  let disposed = false
  let suspended = 0
  let sourceMeshes = 0
  let baselineDrawCalls = 0
  let baselineTriangles = 0
  let lastSyncMs = 0
  let rebuildCount = 0
  let syncCount = 0
  let skippedSyncCount = 0
  let dirty = true
  let rebuildRequested = false
  let lastSelection = []
  let changed = false
  const suppressedLayerTest = () => false
  const noSelection = []

  function currentSelection(selected) {
    let objects
    if (selected !== undefined) objects = Array.isArray(selected) ? selected : selected ? [selected] : noSelection
    else {
      const transformed = editor.transformControls?.object
      const outlined = editor.effectComposer?.effectPass?.outlinePass?.selectedObjects || noSelection
      objects = !transformed || outlined.includes(transformed) ? outlined : [transformed, ...outlined]
    }
    // Large selected groups use a render-only box, so they can keep instancing
    // while moving. A separately selected small child still needs its own mesh
    // for the precise OutlinePass and is retained in this list.
    const largeSelections = editor.__nanjingLargeSelections
    return largeSelections && objects.length ? objects.filter(object => !largeSelections.has(object)) : objects
  }
  function selectionChanged(selected) {
    return selected.length !== lastSelection.length || selected.some((object, index) => object !== lastSelection[index])
  }
  // Call for edits outside TransformControls (material/visibility/layer panels,
  // scripts, undo/redo). Add/remove/clone operations should request a rebuild.
  function invalidate({ rebuild: needsRebuild = false } = {}) {
    if (disposed) return
    dirty = true
    rebuildRequested ||= needsRebuild
  }
  const invalidateTransform = () => invalidate()
  editor.transformControls?.addEventListener?.('objectChange', invalidateTransform)
  editor.transformControls?.addEventListener?.('object-changed', invalidateTransform)

  const materialsOf = object => Array.isArray(object.material) ? object.material : [object.material]
  const now = () => globalThis.performance?.now() ?? Date.now()
  const isUtility = object => {
    for (let parent = object; parent; parent = parent.parent) if (parent.userData?.nanjingUtility) return true
    return false
  }
  const isVisible = object => {
    for (let parent = object; parent; parent = parent.parent) {
      if (!parent.visible) return false
      if (parent === scene) return true
    }
    return false
  }
  const isSelected = (object, selected) => {
    for (let parent = object; parent && parent !== scene; parent = parent.parent) {
      if (selected.has(parent)) return true
    }
    return false
  }
  function canInstance(object) {
    // These thirteen original metal signal fixtures need independent beauty
    // draws for the opt-in static receiver correction. Old snapshots keep the
    // original batching policy; geometry, hierarchy and light flags are intact.
    if (options.fullSurfaceReceivers === true
      && /^道路灯具母版_交通信号灯_模型(?:_(?:[1-9]|1[0-2]))?$/.test(object.name)
      && !Array.isArray(object.material) && object.material?.name === '建筑_深灰金属') return false
    if (!object.isMesh || object.isInstancedMesh || object.isSkinnedMesh || object.isBatchedMesh || !object.geometry?.isBufferGeometry) return false
    if (object.morphTargetInfluences?.length || Object.keys(object.geometry.morphAttributes || {}).length) return false
    if (object.customDepthMaterial || object.customDistanceMaterial) return false
    if (object.layers.test !== THREE.Layers.prototype.test && object.layers.test !== suppressedLayerTest) return false
    // Per-object callbacks may set uniforms or change geometry on each draw.
    for (const key of ['onBeforeRender', 'onAfterRender', 'onBeforeShadow', 'onAfterShadow']) {
      if (object[key] !== THREE.Object3D.prototype[key]) return false
    }
    // Keep custom Group ordering intact; utility proxies have groupOrder 0.
    for (let parent = object.parent; parent; parent = parent.parent) {
      if (parent.isGroup) {
        if (parent.renderOrder !== 0) return false
        break
      }
    }
    const materials = materialsOf(object)
    return materials.length > 0 && materials.every(material => material && !material.isShaderMaterial && !material.isRawShaderMaterial
      && !material.transparent && !(material.transmission > 0) && material.blending === THREE.NormalBlending)
  }
  function validTransform(matrix) {
    // Three's instance normal transform supports positive, orthogonal TRS only.
    const e = matrix.elements
    if (!e.every(Number.isFinite) || matrix.determinant() <= 1e-12) return false
    const x = Math.hypot(e[0], e[1], e[2]), y = Math.hypot(e[4], e[5], e[6]), z = Math.hypot(e[8], e[9], e[10])
    if (Math.min(x, y, z) < 1e-9) return false
    return Math.abs(e[0] * e[4] + e[1] * e[5] + e[2] * e[6]) < x * y * 1e-5
      && Math.abs(e[0] * e[8] + e[1] * e[9] + e[2] * e[10]) < x * z * 1e-5
      && Math.abs(e[4] * e[8] + e[5] * e[9] + e[6] * e[10]) < y * z * 1e-5
  }
  function drawCalls(object) {
    if (!Array.isArray(object.material)) return object.material?.visible ? 1 : 0
    return object.geometry.groups.filter(part => part.count > 0 && object.material[part.materialIndex]?.visible).length
  }
  function triangleCount(object) {
    const geometry = object.geometry
    return Math.min(geometry.drawRange.count, geometry.index?.count ?? geometry.attributes.position?.count ?? 0) / 3
  }
  function renderKey(object, layerMask) {
    return [object.geometry.id, materialsOf(object).map(material => material.id).join(','), layerMask,
      +object.castShadow, +object.receiveShadow, object.renderOrder, +object.frustumCulled].join('|')
  }
  function restoreRecord(record) {
    if (!record.masked) return
    // Keep any custom replacement an editor installed during suppression.
    if (record.object.layers.test === suppressedLayerTest) {
      if (record.layerTestDescriptor) Object.defineProperty(record.object.layers, 'test', record.layerTestDescriptor)
      else delete record.object.layers.test
    }
    record.masked = false
  }
  function suppressRecord(record) {
    if (record.masked) return
    record.layerTestDescriptor = Object.getOwnPropertyDescriptor(record.object.layers, 'test')
    Object.defineProperty(record.object.layers, 'test', { configurable: true, writable: true, value: suppressedLayerTest })
    record.masked = true
  }
  function clearBatches() {
    records.forEach(restoreRecord)
    for (const batch of batches) {
      group.remove(batch.mesh)
      // Dispose only the instance buffers, never the shared source geometry/material.
      batch.mesh.dispose()
    }
    records.length = 0
    batches.length = 0
  }
  function attachGroup() {
    if (group.parent !== scene) scene.add(group)
    group.visible = enabled && !suspended
  }
  function makeBatch(bucket, objects, part) {
    const source = objects[0]
    const mesh = new THREE.InstancedMesh(source.geometry, source.material, objects.length)
    mesh.name = `GPU · ${source.name || source.geometry.name || 'mesh'} · ${bucket.cell.join(',')} · ${part}`
    mesh.userData.nanjingUtility = true
    mesh.userData.nanjingInstancing = true
    mesh.position.set(...bucket.cell.map(value => (value + 0.5) * cellSize))
    mesh.updateMatrix()
    mesh.matrixAutoUpdate = false
    mesh.layers.mask = source.layers.mask
    mesh.castShadow = source.castShadow
    mesh.receiveShadow = source.receiveShadow
    mesh.renderOrder = source.renderOrder
    mesh.frustumCulled = source.frustumCulled
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    const batch = { mesh, records: [], active: [], callsPerInstance: drawCalls(source) }
    for (const object of objects) {
      const record = { object, batch, masked: false, layerTestDescriptor: null, key: renderKey(object, object.layers.mask) }
      batch.records.push(record)
      records.push(record)
    }
    mesh.raycast = function (raycaster, intersects) {
      if (!enabled || suspended || !this.visible || !group.visible) return
      const hits = []
      THREE.InstancedMesh.prototype.raycast.call(this, raycaster, hits)
      for (const hit of hits) {
        const sourceObject = batch.active[hit.instanceId]?.object
        if (!sourceObject || !isVisible(sourceObject)) continue
        hit.object = sourceObject
        delete hit.instanceId
        intersects.push(hit)
      }
    }
    group.add(mesh)
    batches.push(batch)
  }
  function rebuild() {
    if (disposed || suspended) return getStats()
    rebuildRequested = false
    clearBatches()
    scene.updateMatrixWorld(true)
    inverseScene.copy(scene.matrixWorld).invert()
    const buckets = new Map()
    sourceMeshes = 0
    baselineDrawCalls = 0
    baselineTriangles = 0
    scene.traverse(object => {
      if (!object.isMesh || isUtility(object)) return
      sourceMeshes += 1
      baselineDrawCalls += drawCalls(object)
      baselineTriangles += triangleCount(object)
      if (!canInstance(object) || !object.layers.mask) return
      relativeMatrix.multiplyMatrices(inverseScene, object.matrixWorld)
      if (!validTransform(relativeMatrix)) return
      const elements = relativeMatrix.elements
      const cell = [elements[12], elements[13], elements[14]].map(value => Math.floor(value / cellSize))
      const key = `${renderKey(object, object.layers.mask)}|${cell.join(',')}`
      if (!buckets.has(key)) buckets.set(key, { cell, objects: [] })
      buckets.get(key).objects.push(object)
    })
    for (const bucket of buckets.values()) {
      if (bucket.objects.length < minInstances) continue
      for (let offset = 0; offset < bucket.objects.length; offset += maxInstances) {
        const objects = bucket.objects.slice(offset, offset + maxInstances)
        if (objects.length >= minInstances) makeBatch(bucket, objects, offset / maxInstances)
      }
    }
    rebuildCount += 1
    attachGroup()
    sync({ force: true, updateMatrices: false })
    return getStats()
  }
  function sync({ force = false, updateMatrices = true, selected } = {}) {
    if (disposed || suspended || !enabled) return false
    if (rebuildRequested) {
      rebuild()
      return true
    }
    const started = now()
    syncCount += 1
    if (updateMatrices) scene.updateMatrixWorld(true)
    inverseScene.copy(scene.matrixWorld).invert()
    const selectionObjects = currentSelection(selected)
    const selection = new Set(selectionObjects)
    // Material replacement, render flags and layer changes must get a new batch.
    for (const record of records) {
      if (!canInstance(record.object) || renderKey(record.object, record.object.layers.mask) !== record.key) {
        rebuild()
        return true
      }
    }
    changed = false
    for (const batch of batches) {
      const mesh = batch.mesh
      const previous = batch.active
      const active = []
      let dirty = force
      for (const record of batch.records) {
        const object = record.object
        if (!isVisible(object) || isSelected(object, selection)) {
          restoreRecord(record)
          continue
        }
        relativeMatrix.multiplyMatrices(inverseScene, object.matrixWorld)
        if (!validTransform(relativeMatrix)) {
          restoreRecord(record)
          continue
        }
        const index = active.length
        active.push(record)
        suppressRecord(record)
        instanceMatrix.copy(relativeMatrix)
        instanceMatrix.elements[12] -= mesh.position.x
        instanceMatrix.elements[13] -= mesh.position.y
        instanceMatrix.elements[14] -= mesh.position.z
        // Compare at float32 precision: GPU attributes cannot retain JS doubles.
        const matrix = mesh.instanceMatrix.array
        let matrixChanged = previous[index] !== record
        for (let element = 0; element < 16 && !matrixChanged; element++) {
          if (matrix[index * 16 + element] !== Math.fround(instanceMatrix.elements[element])) matrixChanged = true
        }
        if (force || matrixChanged) {
          mesh.setMatrixAt(index, instanceMatrix)
          dirty = true
        }
      }
      if (previous.length !== active.length) dirty = true
      batch.active = active
      mesh.count = active.length
      mesh.visible = active.length > 0
      if (dirty) {
        mesh.instanceMatrix.needsUpdate = true
        mesh.computeBoundingBox()
        mesh.computeBoundingSphere()
        changed = true
      }
    }
    group.updateMatrixWorld(true)
    lastSyncMs = now() - started
    lastSelection = [...selectionObjects]
    dirty = false
    return changed
  }
  // Orbit changes the camera only. Avoid a second full scene matrix update,
  // material compatibility scan and instance upload scan on every orbit frame.
  // Keep sync() as the unconditional path for callers that cannot track edits.
  function syncIfNeeded({ animated = false, ...syncOptions } = {}) {
    if (disposed || suspended || !enabled) return false
    const selected = currentSelection(syncOptions.selected)
    if (!dirty && !rebuildRequested && !animated && !syncOptions.force && !selectionChanged(selected)) {
      skippedSyncCount += 1
      return false
    }
    return sync({ ...syncOptions, selected })
  }
  function setEnabled(value) {
    if (disposed) return false
    enabled = !!value
    if (!enabled) records.forEach(restoreRecord)
    group.visible = enabled && !suspended
    if (enabled && !suspended) sync({ force: true })
    return enabled
  }
  function withOriginals(fn) {
    if (disposed) return fn()
    suspended += 1
    if (suspended === 1) {
      records.forEach(restoreRecord)
      group.removeFromParent()
    }
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      suspended -= 1
      if (suspended || disposed) return
      attachGroup()
      if (enabled) sync({ force: true })
    }
    try {
      const result = fn()
      if (result && typeof result.then === 'function') return Promise.resolve(result).finally(finish)
      finish()
      return result
    } catch (error) {
      finish()
      throw error
    }
  }
  function getStats() {
    const activeInstances = enabled && !suspended ? batches.reduce((sum, batch) => sum + batch.active.length, 0) : 0
    const activeBatches = enabled && !suspended ? batches.filter(batch => batch.active.length).length : 0
    const savedDrawCalls = enabled && !suspended ? batches.reduce((sum, batch) => sum + Math.max(0, batch.active.length - 1) * batch.callsPerInstance, 0) : 0
    return { enabled, sourceMeshes, instances: records.length, batches: batches.length, activeInstances, activeBatches,
      savedDrawCalls, estimatedDrawCallsBefore: baselineDrawCalls, estimatedDrawCallsAfter: baselineDrawCalls - savedDrawCalls,
      sourceTriangles: baselineTriangles, cellSize, maxInstances, rebuildCount, lastSyncMs, syncCount, skippedSyncCount, dirty }
  }
  function dispose() {
    if (disposed) return
    clearBatches()
    group.removeFromParent()
    disposed = true
    enabled = false
    editor.transformControls?.removeEventListener?.('objectChange', invalidateTransform)
    editor.transformControls?.removeEventListener?.('object-changed', invalidateTransform)
  }
  return { rebuild, sync, syncIfNeeded, invalidate, withOriginals, setEnabled, dispose, getStats, get enabled() { return enabled }, group }
}
