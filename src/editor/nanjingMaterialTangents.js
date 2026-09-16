import * as THREE from 'three'

const DEFAULT_GROUPS = ['Line211', 'Line211032', 'Line211064']
const numericArray = attribute => attribute ? { itemSize: attribute.itemSize, normalized: attribute.normalized,
  stride: attribute.data?.stride, offset: attribute.offset, array: Array.from(attribute.array ?? attribute.data?.array ?? []) } : null

// Ignore derived bounds/version counters, which normal rendering may update.
// Keep real edits to the generated geometry instead of silently discarding them
// when the project is saved or this temporary render repair is disposed.
function geometryContent(geometry) {
  return JSON.stringify({
    name: geometry.name, userData: geometry.userData, index: numericArray(geometry.index),
    attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([name, value]) => [name, numericArray(value)])),
    morphAttributes: Object.fromEntries(Object.entries(geometry.morphAttributes).map(([name, values]) => [name, values.map(numericArray)])),
    morphTargetsRelative: geometry.morphTargetsRelative, groups: geometry.groups, drawRange: geometry.drawRange
  })
}

export function inspectNanjingTangentGeometry(geometry) {
  const position = geometry?.getAttribute('position'), normal = geometry?.getAttribute('normal')
  const uv = geometry?.getAttribute('uv'), tangent = geometry?.getAttribute('tangent'), index = geometry?.index
  if (!position || !normal || normal.count !== position.count) return { eligible: false, reason: 'missing-normal' }
  const n = new THREE.Vector3(), t = new THREE.Vector3()
  let validTangents = tangent?.itemSize === 4 && tangent.count === position.count
  for (let vertex = 0; vertex < position.count; vertex++) {
    n.fromBufferAttribute(normal, vertex)
    if (!Number.isFinite(n.lengthSq()) || n.lengthSq() < 1e-12) return { eligible: false, reason: 'invalid-normal' }
    if (validTangents) {
      t.fromBufferAttribute(tangent, vertex)
      const length = t.length(), w = tangent.getW(vertex)
      validTangents = Number.isFinite(length) && Math.abs(length - 1) < 0.001
        && Math.abs(t.dot(n.clone().normalize())) < 0.001 && Math.abs(Math.abs(w) - 1) < 0.001
    }
  }
  if (validTangents) return { eligible: false, reason: 'valid-tangents' }
  if (!uv || uv.itemSize < 2 || uv.count !== position.count) return { eligible: false, reason: 'missing-uv' }
  const count = index?.count ?? position.count
  if (count === 0 || count % 3 !== 0) return { eligible: false, reason: 'invalid-triangles' }
  for (let offset = 0; offset < count; offset += 3) {
    const a = index ? index.getX(offset) : offset, b = index ? index.getX(offset + 1) : offset + 1, c = index ? index.getX(offset + 2) : offset + 2
    const determinant = (uv.getX(b) - uv.getX(a)) * (uv.getY(c) - uv.getY(a))
      - (uv.getY(b) - uv.getY(a)) * (uv.getX(c) - uv.getX(a))
    if (!Number.isFinite(determinant)) return { eligible: false, reason: 'invalid-uv' }
    if (Math.abs(determinant) > 1e-12) return { eligible: false, reason: 'has-valid-uv-triangle' }
  }
  return { eligible: true, reason: 'degenerate-uv-without-tangents', vertices: position.count, triangles: count / 3 }
}

function makeFallbackGeometry(source) {
  const geometry = source.clone(), normals = source.getAttribute('normal')
  const values = new Float32Array(normals.count * 4), n = new THREE.Vector3(), axis = new THREE.Vector3(), t = new THREE.Vector3()
  for (let vertex = 0; vertex < normals.count; vertex++) {
    n.fromBufferAttribute(normals, vertex).normalize()
    const x = Math.abs(n.x), y = Math.abs(n.y), z = Math.abs(n.z)
    // The least parallel axis guarantees a well-conditioned cross product.
    // This is a stable fallback; the author's original brush direction is unknown.
    axis.set(x <= y && x <= z ? 1 : 0, y < x && y <= z ? 1 : 0, z < x && z < y ? 1 : 0)
    t.crossVectors(n, axis).normalize()
    values.set([t.x, t.y, t.z, 1], vertex * 4)
  }
  geometry.setAttribute('tangent', new THREE.BufferAttribute(values, 4))
  return geometry
}

// Install before render-only instancing is built. Save using withOriginals();
// capture/render using the repaired geometry so the undefined tangent frame is
// never reintroduced into a reflection capture. No frame callbacks are installed.
export function createNanjingMaterialTangents(editor, options = {}) {
  const groups = new Set(options.groupNames ?? DEFAULT_GROUPS), materialNames = new Set(options.materialNames ?? ['Iron brushed'])
  const sourceCache = new Map(), records = new Map(), skipped = new Map()
  let disposed = false, suspended = 0, enabled = options.enabled !== false
  let suspendedRestores = []
  function selected(object) {
    if (!object.isMesh || object.userData?.nanjingUtility || object.name !== 'Mesh221_4' || Array.isArray(object.material)) return false
    if (!materialNames.has(object.material?.name) || !(object.material.anisotropy > 0)) return false
    for (let parent = object.parent; parent; parent = parent.parent) if (groups.has(parent.name)) return true
    return false
  }
  function retainEdits(entry) {
    if (!entry.edited && geometryContent(entry.geometry) !== entry.baseline) entry.edited = true
    return entry.edited
  }
  function restore(record) {
    if (record.object.geometry === record.entry.geometry && !retainEdits(record.entry)) {
      record.object.geometry = record.entry.source
      return true
    }
    return false
  }
  function scan() {
    if (disposed || suspended) return false
    let changed = false
    const seen = new Set()
    editor.scene.traverse(object => {
      if (!selected(object)) return
      seen.add(object)
      let record = records.get(object)
      if (record && object.geometry !== record.entry.source && object.geometry !== record.entry.geometry) records.delete(object)
      record = records.get(object)
      if (!record) {
        const source = object.geometry
        let entry = sourceCache.get(source)
        if (!entry) {
          const inspection = inspectNanjingTangentGeometry(source)
          if (!inspection.eligible) { skipped.set(object.uuid, { name: object.name, parent: object.parent?.name, reason: inspection.reason }); return }
          const geometry = makeFallbackGeometry(source)
          entry = { source, geometry, inspection, baseline: geometryContent(geometry), edited: false }
          sourceCache.set(source, entry)
        }
        record = { object, entry }; records.set(object, record); skipped.delete(object.uuid)
      }
      if (enabled && object.geometry === record.entry.source) { object.geometry = record.entry.geometry; changed = true }
      else if (!enabled) changed = restore(record) || changed
    })
    for (const [object, record] of records) if (!seen.has(object)) { changed = restore(record) || changed; records.delete(object) }
    if (changed) options.onChange?.(getStatus())
    return changed
  }
  function withOriginals(callback) {
    if (disposed) return callback()
    suspended++
    if (suspended === 1) {
      suspendedRestores = []
      for (const record of records.values()) if (restore(record)) suspendedRestores.push(record)
    }
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true; suspended--
      if (suspended > 0) return
      const restored = suspendedRestores
      suspendedRestores = []
      if (disposed || !enabled) return
      for (const record of restored) if (record.object.geometry === record.entry.source) record.object.geometry = record.entry.geometry
    }
    try {
      const result = callback()
      if (result?.then) return Promise.resolve(result).finally(finish)
      finish(); return result
    } catch (error) { finish(); throw error }
  }
  function setEnabled(value) {
    if (disposed || enabled === !!value) return false
    enabled = !!value
    return scan()
  }
  function getStatus() {
    return { enabled: enabled && !disposed, activeObjects: [...records.values()].filter(record => record.object.geometry === record.entry.geometry).length,
      generatedGeometries: sourceCache.size, fallbackVertices: [...sourceCache.values()].reduce((sum, entry) => sum + entry.inspection.vertices, 0),
      preservedEditedGeometries: [...sourceCache.values()].filter(entry => entry.edited).length,
      direction: 'stable-normal-based-fallback', objects: [...records.values()].map(({ object, entry }) => ({ name: object.name, parent: object.parent?.name,
        material: object.material?.name, triangles: entry.inspection.triangles, vertices: entry.inspection.vertices })), skipped: [...skipped.values()] }
  }
  function dispose() {
    if (disposed) return
    for (const record of records.values()) restore(record)
    for (const entry of sourceCache.values()) if (!retainEdits(entry)) entry.geometry.dispose()
    disposed = true; enabled = false; records.clear(); sourceCache.clear(); skipped.clear()
  }
  scan()
  return { scan, setEnabled, withOriginals, getStatus, dispose }
}
