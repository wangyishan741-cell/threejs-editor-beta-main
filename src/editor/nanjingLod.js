import * as THREE from 'three'

// This is an optional render geometry policy. Materials, source geometry data,
// transforms and GLB files are never edited. It deliberately keeps whole leaf
// cards, including their original UVs, instead of collapsing their corners.
export const NANJING_LOD_DEFAULTS = Object.freeze({
  enabled: false,
  materialNames: ['Material_25'],
  ratios: [0.7, 0.4],
  pixelDiameters: [48, 20],
  maxPixelError: 1.25,
  hysteresis: 0.2,
  updateIntervalMs: 180
})

const now = () => globalThis.performance?.now() ?? Date.now()
const triangleCount = geometry => (geometry.index?.count ?? geometry.attributes.position?.count ?? 0) / 3

function vertexTree(points, depth = 0) {
  if (!points.length) return null
  const axis = depth % 3
  points.sort((a, b) => a[axis] - b[axis])
  const middle = points.length >> 1
  return { point: points[middle], axis, left: vertexTree(points.slice(0, middle), depth + 1), right: vertexTree(points.slice(middle + 1), depth + 1) }
}

function nearestSquared(tree, point, best = Infinity) {
  if (!tree) return best
  const dx = point[0] - tree.point[0], dy = point[1] - tree.point[1], dz = point[2] - tree.point[2]
  best = Math.min(best, dx * dx + dy * dy + dz * dz)
  const delta = point[tree.axis] - tree.point[tree.axis]
  best = nearestSquared(delta < 0 ? tree.left : tree.right, point, best)
  if (delta * delta < best) best = nearestSquared(delta < 0 ? tree.right : tree.left, point, best)
  return best
}

/** Build nested, spatially distributed subsets of a disconnected leaf-card mesh.
 * coverageError measures the greatest source-vertex distance to a retained
 * vertex. It is a conservative vertex-to-surface bound, not a pixel/color error
 * guarantee for layered transparent foliage. Retained vertices have zero error.
 */
export function buildNanjingFoliageLods(source, options = {}) {
  const position = source?.attributes?.position
  const index = source?.index
  if (!source?.isBufferGeometry || !position || !index || source.groups.length > 1
    || source.drawRange.start !== 0 || source.drawRange.count < index.count
    || Object.keys(source.morphAttributes || {}).length || Object.values(source.attributes).some(attribute => attribute.isInterleavedBufferAttribute)) return null
  const ratios = (options.ratios ?? NANJING_LOD_DEFAULTS.ratios).map(value => Math.min(0.99, Math.max(0.05, value)))
  const parent = new Uint32Array(index.count / 3)
  for (let i = 0; i < parent.length; i++) parent[i] = i
  const find = value => {
    while (parent[value] !== value) { parent[value] = parent[parent[value]]; value = parent[value] }
    return value
  }
  const join = (a, b) => { parent[find(a)] = find(b) }
  // GLB normal/UV seams duplicate the vertices of 252 of this model's leaf
  // quads. Connect triangles by identical geometric edges, rather than their
  // attribute indices, so those quads are never cut into half-leaves.
  const positionIds = new Map(), canonical = new Uint32Array(position.count), edges = new Map()
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`
    if (!positionIds.has(key)) positionIds.set(key, positionIds.size)
    canonical[i] = positionIds.get(key)
  }
  for (let i = 0; i < index.count; i += 3) {
    for (let j = 0; j < 3; j++) {
      const a = canonical[index.getX(i + j)], b = canonical[index.getX(i + (j + 1) % 3)]
      const edge = a < b ? `${a},${b}` : `${b},${a}`
      if (edges.has(edge)) join(i / 3, edges.get(edge))
      else edges.set(edge, i / 3)
    }
  }
  const byRoot = new Map()
  for (let i = 0; i < index.count; i += 3) {
    const root = find(i / 3)
    if (!byRoot.has(root)) byRoot.set(root, { triangles: [], vertices: new Set(), center: [0, 0, 0] })
    const card = byRoot.get(root)
    card.triangles.push(i)
    for (let j = 0; j < 3; j++) card.vertices.add(index.getX(i + j))
  }
  const cards = [...byRoot.values()]
  // A connected solid tree/trunk needs a different simplifier. Failing closed
  // also prevents accidentally decimating a differently named building.
  if (cards.length < 32 || cards.some(card => card.triangles.length > 2 || card.vertices.size > 6)) return null
  const points = Array.from({ length: position.count }, (_, i) => [position.getX(i), position.getY(i), position.getZ(i)])
  for (const card of cards) {
    for (const vertex of card.vertices) for (let axis = 0; axis < 3; axis++) card.center[axis] += points[vertex][axis] / card.vertices.size
  }
  // Keep support vertices along 128 directions. These retain the outer envelope
  // before filling the interior with a deterministic farthest-point ordering.
  const selected = new Uint8Array(cards.length), order = [], distances = new Float64Array(cards.length).fill(Infinity)
  function add(cardIndex) {
    if (selected[cardIndex]) return
    selected[cardIndex] = 1
    order.push(cardIndex)
    const p = cards[cardIndex].center
    for (let i = 0; i < cards.length; i++) {
      const q = cards[i].center, x = p[0] - q[0], y = p[1] - q[1], z = p[2] - q[2]
      distances[i] = Math.min(distances[i], x * x + y * y + z * z)
    }
  }
  const directions = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
  for (let i = 0; i < 128; i++) {
    const y = 1 - (i + 0.5) / 64, radius = Math.sqrt(1 - y * y), angle = i * Math.PI * (3 - Math.sqrt(5))
    directions.push([Math.cos(angle) * radius, y, Math.sin(angle) * radius])
  }
  for (const direction of directions) {
    let best = -Infinity, bestCard = 0
    cards.forEach((card, i) => {
      for (const vertex of card.vertices) {
        const p = points[vertex], dot = p[0] * direction[0] + p[1] * direction[1] + p[2] * direction[2]
        if (dot > best) { best = dot; bestCard = i }
      }
    })
    add(bestCard)
  }
  const envelopeCards = order.length
  const target = Math.max(envelopeCards, Math.ceil(cards.length * Math.max(...ratios)))
  while (order.length < target) {
    let farthest = -1, largestDistance = -1
    for (let i = 0; i < cards.length; i++) if (!selected[i] && distances[i] > largestDistance) { farthest = i; largestDistance = distances[i] }
    if (farthest < 0) break
    add(farthest)
  }
  const levels = ratios.map(ratio => {
    const keep = new Set(order.slice(0, Math.max(envelopeCards, Math.ceil(cards.length * ratio))))
    const retainedVertices = new Set(), retainedTriangles = new Uint8Array(index.count / 3), values = []
    // Keep the GLB's triangle order. Changing transparent triangle order would
    // otherwise introduce an avoidable compositing difference.
    cards.forEach((card, i) => {
      if (!keep.has(i)) return
      for (const vertex of card.vertices) retainedVertices.add(vertex)
      for (const triangle of card.triangles) retainedTriangles[triangle / 3] = 1
    })
    for (let i = 0; i < index.count; i += 3) if (retainedTriangles[i / 3]) values.push(index.getX(i), index.getX(i + 1), index.getX(i + 2))
    const geometry = new THREE.BufferGeometry()
    geometry.name = `${source.name || '叶片'} · LOD ${Math.round(ratio * 100)}%`
    // Distinct attribute wrappers avoid disposal of a LOD releasing a source
    // attribute's WebGL buffer. Typed arrays are shared and never mutated here.
    for (const [name, attribute] of Object.entries(source.attributes)) {
      const copy = new THREE.BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized)
      copy.name = attribute.name
      copy.usage = attribute.usage
      copy.gpuType = attribute.gpuType
      geometry.setAttribute(name, copy)
    }
    geometry.setIndex(values)
    for (const group of source.groups) geometry.addGroup(0, values.length, group.materialIndex)
    if (!source.boundingBox) source.computeBoundingBox()
    if (!source.boundingSphere) source.computeBoundingSphere()
    geometry.boundingBox = source.boundingBox.clone()
    geometry.boundingSphere = source.boundingSphere.clone()
    const kdTree = vertexTree([...retainedVertices].map(vertex => points[vertex]))
    let maxSquared = 0, sumSquared = 0, removedVertices = 0
    for (let i = 0; i < points.length; i++) if (!retainedVertices.has(i)) {
      const distance = nearestSquared(kdTree, points[i])
      maxSquared = Math.max(maxSquared, distance); sumSquared += distance; removedVertices++
    }
    const coverageError = Math.sqrt(maxSquared)
    geometry.userData.nanjingLod = { ratio, sourceUuid: source.uuid, coverageError }
    return { geometry, ratio: values.length / index.count, requestedRatio: ratio, triangles: values.length / 3,
      cards: keep.size, coverageError, rmsRemovedVertexDistance: Math.sqrt(sumSquared / Math.max(1, removedVertices)) }
  })
  return { source, levels, cards: cards.length, envelopeCards, triangles: index.count / 3 }
}

/** Apply LODs to logical meshes before rebuilding GPU batches. Native
 * InstancedMesh is supported conservatively using its nearest/largest instance.
 * Render proxies generated by nanjingInstancing are intentionally excluded.
 */
export function createNanjingLod(editor, options = {}) {
  const config = { ...NANJING_LOD_DEFAULTS, ...options }
  const names = new Set(config.materialNames)
  const cache = new Map(), derivedSources = new WeakMap(), records = new Map()
  const worldSphere = new THREE.Sphere(), instance = new THREE.Matrix4(), world = new THREE.Matrix4(), center = new THREE.Vector3()
  let enabled = !!config.enabled, disposed = false, suspended = 0, lastUpdate = -Infinity, lastCamera = null
  let changes = 0, buildMilliseconds = 0, updates = 0, lastHeight = 900
  const originalGeometry = geometry => derivedSources.get(geometry) ?? geometry
  const selected = object => {
    for (let parent = object; parent; parent = parent.parent) if (parent === editor.transformControls?.object && !editor.__nanjingLargeSelections?.has(parent)) return true
    return false
  }
  const eligible = object => {
    if (!object.isMesh || object.isSkinnedMesh || object.isBatchedMesh || object.userData?.nanjingInstancing || !object.geometry) return false
    for (let parent = object; parent; parent = parent.parent) if (parent.userData?.nanjingUtility) return false
    if (object.morphTargetInfluences?.length) return false
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    return materials.length === 1 && names.has(materials[0]?.name)
  }
  function entryFor(geometry) {
    const source = originalGeometry(geometry)
    if (cache.has(source)) return cache.get(source)
    const started = now(), entry = (config.buildGeometryLods ?? buildNanjingFoliageLods)(source, config)
    buildMilliseconds += now() - started
    cache.set(source, entry)
    entry?.levels.forEach(level => derivedSources.set(level.geometry, source))
    return entry
  }
  function scan() {
    if (disposed) return 0
    const found = new Set()
    editor.scene.traverse(object => {
      if (!eligible(object)) return
      found.add(object)
      const source = originalGeometry(object.geometry)
      const previous = records.get(object)
      if (previous?.entry.source === source) return
      const entry = entryFor(source)
      if (entry) records.set(object, { object, entry, level: 0 })
      else records.delete(object)
    })
    for (const [object, record] of records) if (!found.has(object)) {
      if (derivedSources.has(object.geometry)) object.geometry = record.entry.source
      records.delete(object)
    }
    return records.size
  }
  function projection(object, source, camera, height) {
    const sphere = source.boundingSphere
    let pixels = 0, errorScale = 0
    const count = object.isInstancedMesh ? object.count : 1
    for (let i = 0; i < count; i++) {
      if (object.isInstancedMesh) { object.getMatrixAt(i, instance); world.multiplyMatrices(object.matrixWorld, instance) }
      else world.copy(object.matrixWorld)
      worldSphere.copy(sphere).applyMatrix4(world)
      center.copy(worldSphere.center).applyMatrix4(camera.matrixWorldInverse)
      const scale = world.getMaxScaleOnAxis()
      const factor = camera.isOrthographicCamera ? height * Math.abs(camera.projectionMatrix.elements[5]) * 0.5
        : height * Math.abs(camera.projectionMatrix.elements[5]) * 0.5 / Math.max(camera.near, -center.z - worldSphere.radius)
      pixels = Math.max(pixels, worldSphere.radius * 2 * factor)
      errorScale = Math.max(errorScale, scale * factor)
    }
    return { pixels, errorScale }
  }
  function update(camera = editor.camera, height = lastHeight, updateOptions = {}) {
    if (disposed || suspended) return false
    if (updateOptions.scan) scan()
    if (!camera || !Number.isFinite(height) || height <= 0) return false
    const timestamp = now()
    if (!updateOptions.force && timestamp - lastUpdate < config.updateIntervalMs) return false
    lastUpdate = timestamp; lastCamera = camera; lastHeight = height
    camera.updateMatrixWorld()
    if (updateOptions.updateMatrices !== false) editor.scene.updateMatrixWorld(true)
    let changed = 0
    for (const record of records.values()) {
      const { object, entry } = record
      // Preserve a replacement geometry installed by an editing tool.
      if (originalGeometry(object.geometry) !== entry.source) continue
      let level = 0
      if (enabled && !selected(object)) {
        const { pixels, errorScale } = projection(object, entry.source, camera, height)
        for (let i = 0; i < entry.levels.length; i++) {
          const retainingLevel = record.level >= i + 1
          const hysteresis = retainingLevel ? 1 + config.hysteresis : 1 - config.hysteresis
          if (pixels <= config.pixelDiameters[i] * hysteresis
            && entry.levels[i].coverageError * errorScale <= config.maxPixelError * hysteresis) level = i + 1
        }
      }
      const geometry = level ? entry.levels[level - 1].geometry : entry.source
      if (object.geometry !== geometry) { object.geometry = geometry; changed++ }
      record.level = level
    }
    updates++; changes += changed
    if (changed) options.onChange?.({ changed, stats: getStats() })
    return changed > 0
  }
  function restore() {
    let changed = 0
    for (const record of records.values()) if (derivedSources.has(record.object.geometry)) { record.object.geometry = record.entry.source; changed++ }
    return changed > 0
  }
  function withOriginals(callback) {
    suspended++
    const previous = new Map([...records.values()].map(record => [record.object, record.object.geometry]))
    restore()
    const finish = () => {
      suspended--
      if (disposed || !enabled) return
      for (const [object, geometry] of previous) if (object.geometry === originalGeometry(geometry)) object.geometry = geometry
    }
    try {
      const result = callback()
      if (result && typeof result.then === 'function') return Promise.resolve(result).finally(finish)
      finish(); return result
    } catch (error) { finish(); throw error }
  }
  function setEnabled(value) {
    if (enabled === !!value) return false
    enabled = !!value
    if (lastCamera) return update(lastCamera, lastHeight, { force: true })
    return !enabled && restore()
  }
  function getStats() {
    const objectsByLevel = Array(config.ratios.length + 1).fill(0)
    let originalTriangles = 0, renderedTriangles = 0
    for (const record of records.values()) {
      const count = record.object.isInstancedMesh ? record.object.count : 1
      objectsByLevel[derivedSources.has(record.object.geometry) ? record.level : 0] += count
      originalTriangles += record.entry.triangles * count
      renderedTriangles += triangleCount(record.object.geometry) * count
    }
    return { enabled, meshes: records.size, objectsByLevel, originalTriangles, renderedTriangles,
      savedTriangles: originalTriangles - renderedTriangles, changes, updates, buildMilliseconds,
      geometries: [...cache.values()].filter(Boolean).map(entry => ({ sourceUuid: entry.source.uuid, cards: entry.cards,
        envelopeCards: entry.envelopeCards, triangles: entry.triangles, levels: entry.levels.map(({ geometry, ...stats }) => stats) })) }
  }
  function dispose() {
    if (disposed) return
    restore(); disposed = true
    for (const entry of cache.values()) entry?.levels.forEach(level => level.geometry.dispose())
    records.clear(); cache.clear()
  }
  scan()
  return { update, scan, setEnabled, getStats, withOriginals, dispose, getOriginalGeometry: originalGeometry }
}
