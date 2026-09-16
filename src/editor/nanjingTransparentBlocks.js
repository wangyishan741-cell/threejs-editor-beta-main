import * as THREE from 'three'

const OBJECT_NAMES = new Set(['场地区块_近景建筑群_01', '场地区块_近景建筑群_02'])
const MATERIAL_NAME = '场地_蓝灰玻璃'
const DISTANT_MATERIAL_NAME = '远景_蓝色玻璃'
const DISTANT_NAMES = new Set(["中远景补楼_LL补齐_01","中远景补楼_LL补齐_02","中远景补楼_LL补齐_03","中远景补楼_LL补齐_04","中远景补楼_LL补齐_05","中远景补楼_LL补齐_06","中远景补楼_LL补齐_07","中远景补楼_LL补齐_08","中远景补楼_ML01_01","中远景补楼_ML01_02","中远景补楼_ML01_03","中远景补楼_ML01_04","中远景补楼_ML01_05","中远景补楼_ML01_06","中远景补楼_ML01_07","中远景补楼_ML01_08","中远景补楼_ML02_01","中远景补楼_ML02_02","中远景补楼_ML03_01","中远景补楼_ML03_02","中远景补楼_ML03_03","中远景补楼_ML03_04","中远景补楼_ML03_05","中远景补楼_MR01_01","中远景补楼_MR01_02","中远景补楼_MR01_03","中远景补楼_MR01_04","中远景补楼_MR01_05","中远景补楼_MR01_06","中远景补楼_MR02_01","中远景补楼_MR02_02","中远景补楼_MR02_03","中远景补楼_MR02_04","中远景补楼_MR02_05","中远景补楼_MR02_06","中远景补楼_MR02_07","中远景补楼_MR02_08","中远景补楼_MR02_09","中远景补楼_MR02_10","中远景补楼_MR02_11","中远景补楼_MR03_01","中远景补楼_MR03_02","中远景补楼_MR03_03","中远景补楼_MR03_04","中远景补楼_MR03_05","中远景补楼_MR03_06","中远景补楼_MR03_07","中远景补楼_MR03_08","远景_建筑体块","远景补楼_N01_01","远景补楼_N01_02","远景补楼_N01_03","远景补楼_N01_04","远景补楼_N01_05","远景补楼_N01_06","远景补楼_N01_07","远景补楼_N01_08","远景补楼_N01_09","远景补楼_N01_10","远景补楼_N01_11","远景补楼_N01_12","远景补楼_N01_13","远景补楼_N02_01","远景补楼_N02_02","远景补楼_N02_03","远景补楼_N02_04","远景补楼_N02_05","远景补楼_N02_06","远景补楼_N02_07","远景补楼_N02_08","远景补楼_N02_09","远景补楼_N03_01","远景补楼_N03_02","远景补楼_N03_03","远景补楼_N03_04","远景补楼_N03_05","远景补楼_N03_06","远景补楼_N03_07","远景补楼_N03_08","远景补楼_N03_09","远景补楼_N03_10","远景补楼_N04_01","远景补楼_N04_02","远景补楼_N04_03","远景补楼_N04_04","远景补楼_N05_01","远景补楼_N05_02","远景补楼_N05_03","远景补楼_N05_04","远景补楼_N05_05","远景补楼_N05_06","远景补楼_N05_07","远景补楼_N06_01","远景补楼_N06_02","远景补楼_SE01_01","远景补楼_SE01_02","远景补楼_SE01_03","远景补楼_SE01_04","远景补楼_SE01_05","远景补楼_SE01_06","远景补楼_SE01_07","远景补楼_SE01_08","远景补楼_SE01_09","远景补楼_SE01_10","远景补楼_SE01_11","远景补楼_SE01_12","远景补楼_SE01_13","远景补楼_SE01_14","远景补楼_SE01_15","远景补楼_SE01_16","远景补楼_SE01_17","远景补楼_SE01_18","远景补楼_SE01_19","远景补楼_SE01_20","远景补楼_SE01_21","远景补楼_SE01_22","远景补楼_SE02_01","远景补楼_SE02_02","远景补楼_SE02_03","远景补楼_SE02_04","远景补楼_SE02_05","远景补楼_SE02_06","远景补楼_SE02_07","远景补楼_SE02_08","远景补楼_SE03_01","远景补楼_SE03_02","远景补楼_SE03_03","远景补楼_SE03_04","远景补楼_SE03_05","远景补楼_SE03_06","远景补楼_SE03_07","远景补楼_SE03_08","远景补楼_SE03_09","远景补楼_SE03_10","远景补楼_SE04_01","远景补楼_SW01_01","远景补楼_SW01_02","远景补楼_SW01_03","远景补楼_SW01_04","远景补楼_SW01_05","远景补楼_SW01_06","远景补楼_SW01_07","远景补楼_SW01_08","远景补楼_SW02_01","远景补楼_SW02_02","远景补楼_SW03_01","远景补楼_SW03_02","远景补楼_SW03_03","远景补楼_SW03_04","远景补楼_SW03_05","远景补楼_SW03_06","远景补楼_SW03_07","远景补楼_SW03_08","远景补楼_SW03_09","远景补楼_SW03_10","远景补楼_SW03_11","远景补楼_SW03_12","远景补楼_SW03_13","远景补楼_SW03_14","远景补楼_SW03_15","远景补楼_SW03_16","远景补楼_SW03_17","远景补楼_SW03_18","远景补楼_SW03_19","远景补楼_SW03_20","远景补楼_SW03_21","远景补楼_SW03_22","远景补楼_SW03_23","远景补楼_SW04_01","远景补楼_SW04_02","远景补楼_SW04_03","远景补楼_SW04_04","远景补楼_SW04_05","远景补楼_SW04_06","远景补楼_SW04_07"])
// Previous opaque history keeps its exact original render path. Extend the
// established per-component ordering only for this audited blended material.
const isDistant = object => DISTANT_NAMES.has(object.name) && object.material?.name === DISTANT_MATERIAL_NAME
  && object.material.transparent && object.material.opacity < 1
const isTarget = object => OBJECT_NAMES.has(object.name) || isDistant(object)
const isCandidate = object => OBJECT_NAMES.has(object.name) || DISTANT_NAMES.has(object.name)
const WELD_EPSILON = 1e-5
const SOURCE = Symbol('nanjing-transparent-block-source')
const automaticDepthNames = new Set(['南京透明物体实体投影（运行时）', '南京透明物体实体投影（点光源）'])

// Split only the colour render list. The editable scene and its shadow casters
// retain the original object, material, hierarchy and triangle/index buffers.
export function createNanjingTransparentBlocks(editor) {
  const renderer = editor.renderer, scene = editor.scene
  const originalRender = renderer?.render
  const renderDescriptor = renderer && Object.getOwnPropertyDescriptor(renderer, 'render')
  const records = new Map(), candidates = new Map(), owners = new Map(), lists = new Map(), frames = []
  const uploadMaterial = new THREE.MeshBasicMaterial({ visible: false })
  const projection = new THREE.Matrix4(), projected = new THREE.Vector4(), sphere = new THREE.Sphere()
  const frustum = new THREE.Frustum()
  const counters = { replacements: 0, renderedBlocks: 0, culledBlocks: 0, rebuilds: 0, geometryBuilds: 0, uploadPasses: 0 }
  const unsupported = typeof originalRender !== 'function' || typeof renderer?.renderLists?.get !== 'function'
    ? '当前渲染器不支持透明区块排序' : null
  let dirty = true, disposed = false, suspended = 0, error = null, skipped = []

  function reason(object) {
    if (!isTarget(object) || object[SOURCE]) return 'object-name'
    const material = object.material, geometry = object.geometry
    if (!object.isMesh || object.isInstancedMesh || object.isSkinnedMesh || object.isBatchedMesh) return 'dynamic-mesh'
    if (material?.name !== (isDistant(object) ? DISTANT_MATERIAL_NAME : MATERIAL_NAME) || !material.transparent || (material.transmission ?? 0) > 0) return 'material-mode'
    if (!geometry?.isBufferGeometry || !geometry.attributes.position || geometry.groups.length) return 'geometry-layout'
    if (object.morphTargetInfluences?.length) return 'morph-geometry'
    for (const name in geometry.morphAttributes) if (Object.hasOwn(geometry.morphAttributes, name)) return 'morph-geometry'
    for (const name in geometry.attributes) {
      const attribute = geometry.attributes[name]
      if (attribute.isInterleavedBufferAttribute || attribute.isGLBufferAttribute) return 'external-attribute'
    }
    // These known depth materials stay on the source mesh in the original scene.
    if (object.customDepthMaterial && !automaticDepthNames.has(object.customDepthMaterial.name)) return 'custom-shadow-material'
    if (object.customDistanceMaterial && !automaticDepthNames.has(object.customDistanceMaterial.name)) return 'custom-shadow-material'
    return null
  }

  function signature(geometry) {
    return { geometry, index: geometry.index, indexVersion: geometry.index?.version, indexArray: geometry.index?.array,
      start: geometry.drawRange.start, count: geometry.drawRange.count,
      attributes: Object.keys(geometry.attributes).map(name => {
        const a = geometry.attributes[name]
        return [name, a, a.array, a.version, a.count, a.itemSize, a.normalized, a.usage, a.gpuType]
      }) }
  }
  function matchesSignature(saved, geometry) {
    if (!geometry || saved.geometry !== geometry || saved.index !== geometry.index || saved.indexVersion !== geometry.index?.version
      || saved.indexArray !== geometry.index?.array || saved.start !== geometry.drawRange.start || saved.count !== geometry.drawRange.count) return false
    let count = 0
    for (const name in geometry.attributes) if (Object.hasOwn(geometry.attributes, name)) count++
    if (count !== saved.attributes.length) return false
    for (const values of saved.attributes) {
      const a = geometry.attributes[values[0]]
      if (a !== values[1] || a.array !== values[2] || a.version !== values[3] || a.count !== values[4]
        || a.itemSize !== values[5] || a.normalized !== values[6] || a.usage !== values[7] || a.gpuType !== values[8]) return false
    }
    return true
  }

  function release(record) {
    record.sourceGeometry.removeEventListener('dispose', record.onDispose)
    // Private wrappers are shared only within this record and are all retired
    // together. Source BufferAttribute identities are never disposed here.
    for (const part of record.parts) part.geometry.dispose()
  }

  function split(object) {
    const geometry = object.geometry, position = geometry.attributes.position, index = geometry.index
    const available = index?.count ?? position.count
    const start = Math.max(0, geometry.drawRange.start)
    const end = Math.min(available, start + geometry.drawRange.count)
    if (start % 3 || end % 3 || !Number.isFinite(end) || start >= end) throw new Error('非完整三角形绘制范围')
    const parent = [], welded = new Map(), ids = new Map(), triangles = []
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
    function vertex(i) {
      if (ids.has(i)) return ids.get(i)
      const xyz = [position.getX(i), position.getY(i), position.getZ(i)]
      if (!xyz.every(Number.isFinite)) throw new Error('区块包含无效顶点')
      const key = xyz.map(value => Math.round(value / WELD_EPSILON)).join(',')
      if (!welded.has(key)) { welded.set(key, parent.length); parent.push(parent.length) }
      const id = welded.get(key); ids.set(i, id); return id
    }
    for (let offset = start; offset < end; offset += 3) {
      const original = [0, 1, 2].map(j => index ? index.getX(offset + j) : offset + j)
      if (original.some(i => i < 0 || i >= position.count)) throw new Error('区块索引超出顶点范围')
      const vertices = original.map(vertex)
      for (const id of vertices) parent[find(id)] = find(vertices[0])
      triangles.push({ original, id: vertices[0] })
    }
    const components = new Map()
    for (const triangle of triangles) {
      const id = find(triangle.id)
      if (!components.has(id)) components.set(id, [])
      components.get(id).push(...triangle.original)
    }
    const attributes = {}
    for (const [name, source] of Object.entries(geometry.attributes)) {
      const attribute = new THREE.BufferAttribute(source.array, source.itemSize, source.normalized)
      attribute.name = source.name; attribute.usage = source.usage; attribute.gpuType = source.gpuType
      if (source.isFloat16BufferAttribute) attribute.isFloat16BufferAttribute = true
      attributes[name] = attribute
    }
    const parts = [], point = new THREE.Vector3()
    for (const indices of components.values()) {
      const component = new THREE.BufferGeometry()
      for (const [name, attribute] of Object.entries(attributes)) component.setAttribute(name, attribute)
      component.setIndex(indices)
      // computeBoundingBox() would include every shared source vertex, not
      // just this component. Its independent bounds must follow its index.
      component.boundingBox = new THREE.Box3()
      for (const i of indices) component.boundingBox.expandByPoint(point.fromBufferAttribute(position, i))
      component.boundingSphere = new THREE.Sphere(component.boundingBox.getCenter(new THREE.Vector3()), 0)
      for (const i of indices) component.boundingSphere.radius = Math.max(component.boundingSphere.radius,
        point.fromBufferAttribute(position, i).distanceTo(component.boundingSphere.center))
      const proxy = new THREE.Mesh(component, object.material)
      Object.defineProperty(proxy, SOURCE, { value: object })
      proxy.matrixAutoUpdate = false; proxy.matrixWorldAutoUpdate = false
      proxy.onBeforeRender = (...args) => object.onBeforeRender.apply(object, args)
      proxy.onAfterRender = (...args) => object.onAfterRender.apply(object, args)
      parts.push({ geometry: component, proxy })
    }
    const record = { object, sourceGeometry: geometry, signature: signature(geometry), parts,
      triangles: triangles.length, uploaded: false, invalid: false,
      onDispose: () => { record.invalid = true; dirty = true } }
    geometry.addEventListener('dispose', record.onDispose)
    counters.geometryBuilds++
    return record
  }

  function refresh() { if (!disposed) dirty = true }

  function rebuild() {
    skipped = []; error = null
    candidates.clear()
    for (const state of lists.values()) { state.items.length = 0; state.pool.length = 0 }
    const seen = new Set()
    scene.traverse(object => {
      if (!isCandidate(object) || object[SOURCE]) return
      const skip = reason(object)
      // Keep opaque far sources under observation too: a material-panel edit
      // can enable blending without a full appearance/controller refresh.
      candidates.set(object, !skip)
      if (!isTarget(object)) return
      if (skip) { skipped.push({ name: object.name, reason: skip }); return }
      seen.add(object)
      const previous = records.get(object)
      if (previous && !previous.invalid && matchesSignature(previous.signature, object.geometry)) return
      if (previous) { release(previous); records.delete(object) }
      try { records.set(object, split(object)) }
      catch (failure) { error = failure.message || String(failure); skipped.push({ name: object.name, reason: error }) }
    })
    for (const [object, record] of records) if (!seen.has(object)) { release(record); records.delete(object) }
    counters.rebuilds++; dirty = false
  }

  function registerGeometry(camera) {
    let pending
    for (const record of records.values()) if (!record.uploaded) (pending ??= []).push(record)
    if (!pending) return
    const uploadScene = new THREE.Scene()
    for (const record of pending) for (const part of record.parts) {
      const mesh = new THREE.Mesh(part.geometry, uploadMaterial)
      mesh.frustumCulled = false; mesh.castShadow = false
      mesh.layers.mask = camera.layers.mask
      uploadScene.add(mesh)
    }
    const target = renderer.getRenderTarget?.(), face = renderer.getActiveCubeFace?.() ?? 0, mip = renderer.getActiveMipmapLevel?.() ?? 0
    const viewport = renderer.getViewport?.(new THREE.Vector4())?.clone()
    const scissor = renderer.getScissor?.(new THREE.Vector4())?.clone(), scissorTest = renderer.getScissorTest?.()
    const autoClear = renderer.autoClear, xrEnabled = renderer.xr?.enabled, autoReset = renderer.info?.autoReset
    const shadow = renderer.shadowMap && { enabled: renderer.shadowMap.enabled, autoUpdate: renderer.shadowMap.autoUpdate, needsUpdate: renderer.shadowMap.needsUpdate }
    try {
      renderer.autoClear = false
      if (renderer.xr) renderer.xr.enabled = false
      if (renderer.info) renderer.info.autoReset = false
      if (renderer.shadowMap) { renderer.shadowMap.enabled = false; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false }
      // r184 projectObject calls objects.update before checking material.visible.
      // This zero-draw pass registers normal GPU upload/disposal without adding
      // proxies to the editable scene or allocating another render target.
      originalRender.call(renderer, uploadScene, camera)
      for (const record of pending) record.uploaded = true
      counters.uploadPasses++
      error = null
    } finally {
      renderer.autoClear = autoClear
      if (renderer.xr) renderer.xr.enabled = xrEnabled
      if (renderer.info) renderer.info.autoReset = autoReset
      if (renderer.shadowMap) Object.assign(renderer.shadowMap, shadow)
      if (renderer.getRenderTarget?.() !== target || renderer.getActiveCubeFace?.() !== face || renderer.getActiveMipmapLevel?.() !== mip) renderer.setRenderTarget?.(target, face, mip)
      // Restore logical defaults only if a wrapper changed them. For an active
      // render target, rebinding it restores its physical viewport/scissor.
      if (viewport && !renderer.getViewport(new THREE.Vector4()).equals(viewport)) renderer.setViewport(viewport)
      if (scissor && !renderer.getScissor(new THREE.Vector4()).equals(scissor)) renderer.setScissor(scissor)
      if (renderer.getScissorTest?.() !== scissorTest) renderer.setScissorTest?.(scissorTest)
      if (target) renderer.setRenderTarget?.(target, face, mip)
    }
  }

  function substitute(list, frame, items, pool) {
    if (!frame.active || suspended || disposed || frame.scene.overrideMaterial || !list.transparent?.length) return
    const camera = frame.camera
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projection, camera.coordinateSystem, camera.reversedDepth)
    items.length = 0
    let poolIndex = 0
    for (const item of list.transparent) {
      const record = records.get(item.object)
      if (!record?.uploaded || item.geometry !== record.sourceGeometry || item.group !== null || reason(item.object)) { items.push(item); continue }
      const source = record.object
      for (const part of record.parts) {
        const proxy = part.proxy
        proxy.name = source.name; proxy.parent = source.parent; proxy.userData = source.userData
        proxy.layers.mask = source.layers.mask; proxy.material = item.material
        proxy.castShadow = source.castShadow; proxy.receiveShadow = source.receiveShadow
        proxy.renderOrder = source.renderOrder; proxy.frustumCulled = source.frustumCulled
        proxy.matrixWorld.copy(source.matrixWorld)
        if (source.frustumCulled && !camera.isArrayCamera && !frustum.intersectsSphere(sphere.copy(part.geometry.boundingSphere).applyMatrix4(source.matrixWorld))) {
          counters.culledBlocks++; continue
        }
        const center = part.geometry.boundingSphere.center
        projected.set(center.x, center.y, center.z, 1).applyMatrix4(source.matrixWorld).applyMatrix4(projection)
        // Three reuses its native render items; do the same for these derived
        // items instead of allocating hundreds of objects on every camera frame.
        const derived = pool[poolIndex] ?? (pool[poolIndex] = {})
        Object.assign(derived, item)
        derived.id = proxy.id; derived.object = proxy; derived.geometry = part.geometry
        derived.z = projected.z; derived.group = null
        items.push(derived); poolIndex++
        counters.renderedBlocks++
      }
      counters.replacements++
    }
    list.transparent.splice(0, list.transparent.length, ...items)
    for (let i = poolIndex; i < pool.length && pool[i].object !== null; i++) {
      pool[i].object = null; pool[i].geometry = null; pool[i].material = null
    }
  }

  function patchList(list) {
    if (!list || lists.has(list) || typeof list.sort !== 'function') return
    const original = list.sort, descriptor = Object.getOwnPropertyDescriptor(list, 'sort')
    const items = [], pool = []
    function sort(...args) { const frame = frames.at(-1); if (frame) substitute(this, frame, items, pool); return original.apply(this, args) }
    list.sort = sort; lists.set(list, { original, descriptor, wrapper: sort, items, pool })
  }
  function patchLists() {
    const owner = renderer.renderLists
    if (owners.has(owner)) return
    const original = owner.get, descriptor = Object.getOwnPropertyDescriptor(owner, 'get')
    function get(...args) { const list = original.apply(this, args); if (!disposed && args[0] === scene) patchList(list); return list }
    owner.get = get; owners.set(owner, { original, descriptor, wrapper: get })
  }
  function checkCandidate(eligible, object) { if ((reason(object) === null) !== eligible) dirty = true }
  function render(renderScene, camera, ...args) {
    if (disposed || unsupported) return originalRender.call(this, renderScene, camera, ...args)
    patchLists()
    const active = renderScene === scene && !suspended && !renderScene.overrideMaterial && renderer.sortObjects !== false && !!camera?.isCamera
    if (active && !frames.length) {
      candidates.forEach(checkCandidate)
      for (const record of records.values()) if (record.invalid || !matchesSignature(record.signature, record.object.geometry)) dirty = true
      if (dirty) rebuild()
      try { registerGeometry(camera) } catch (failure) { error = failure.message || String(failure) }
    }
    frames.push({ scene: renderScene, camera, active })
    try { return originalRender.call(this, renderScene, camera, ...args) }
    finally { frames.pop() }
  }

  function withOriginals(callback) {
    suspended++
    let value
    try { value = callback() } catch (failure) { suspended--; throw failure }
    if (value?.then) return Promise.resolve(value).finally(() => { suspended-- })
    suspended--; return value
  }
  function restore(object, key, record) {
    if (!object) return
    if (object[key] !== record.wrapper) return
    if (record.descriptor) Object.defineProperty(object, key, record.descriptor)
    else delete object[key]
  }
  function dispose() {
    if (disposed) return
    disposed = true
    renderer?.domElement?.removeEventListener?.('webglcontextrestored', contextRestored)
    for (const record of records.values()) release(record)
    records.clear(); candidates.clear(); uploadMaterial.dispose()
    restore(renderer, 'render', { descriptor: renderDescriptor, wrapper: render })
    for (const [owner, record] of owners) restore(owner, 'get', record)
    for (const [list, record] of lists) {
      record.items.length = 0; record.pool.length = 0
      restore(list, 'sort', record)
    }
    owners.clear(); lists.clear()
  }
  function getStatus() {
    const values = [...records.values()]
    return { enabled: !disposed && !unsupported && !suspended, sources: records.size,
      blocks: values.reduce((sum, record) => sum + record.parts.length, 0),
      sourceTriangles: values.reduce((sum, record) => sum + record.triangles, 0),
      proxyTriangles: values.reduce((sum, record) => sum + record.parts.reduce((n, part) => n + part.geometry.index.count / 3, 0), 0),
      sourceDetails: values.map(record => ({ name: record.object.name, material: record.object.material.name,
        blocks: record.parts.length, triangles: record.triangles, uploaded: record.uploaded })),
      extraRenderTargets: 0, ...counters, pending: dirty, skipped: [...skipped], error, unsupported, disposed,
      strategy: 'connected-component-transparent-sort', weldEpsilon: WELD_EPSILON }
  }
  function contextRestored() {
    for (const record of records.values()) record.uploaded = false
    refresh()
  }
  if (!unsupported) { patchLists(); renderer.render = render; renderer.domElement?.addEventListener?.('webglcontextrestored', contextRestored) }
  return { refresh, dispose, withOriginals, getStatus }
}
