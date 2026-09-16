import * as THREE from 'three'
import { NANJING_JUNCTION_PAVING_V1 as DATA } from './nanjingJunctionPavingData.js'

// Two user-approved, separately derived top faces. Their XZ outlines subtract
// every original road/paving/grass triangle, including sloped curb faces.
// No source vertices, hierarchy, material, or support walls are changed.
export function createNanjingJunctionPaving(editor, config = {}, { onChange } = {}) {
  const scene = editor?.scene
  const settings = { version: config.junctionPaving?.version === 1 ? 1 : 0, enabled: config.junctionPaving?.version === 1 && config.junctionPaving.enabled === true }
  const group = new THREE.Group()
  group.name = '南京门前路口两侧薄铺装（派生顶面）'
  group.userData.nanjingUtility = true; group.userData.skipEditorTree = true
  let disposed = false, suspended = 0, pendingRefresh = false, reason = 'disabled'
  let reference = null, paving = null, material = null, sourceMaterial = null, sourceMaterialVersion = -1
  let guards = [], proxies = [], topY = null
  const position = new THREE.Vector3(), matrixSlots = [0, 2, 4, 6, 8, 10, 12, 14]
  const belongs = object => { for (let n = object; n; n = n.parent) { if (!n.visible) return false; if (n === scene) return true } return false }
  const unique = name => {
    const found = []; scene.traverse(o => { if (o.name === name && !o.userData?.nanjingUtility) found.push(o) })
    return found.length === 1 ? found[0] : null
  }
  function release() {
    group.removeFromParent()
    for (const proxy of proxies) { group.remove(proxy); proxy.geometry.dispose() }
    material?.dispose(); proxies = []; guards = []; material = sourceMaterial = null; topY = null
  }
  function validateFootprints() {
    for (const expected of DATA.guards) {
      const object = unique(expected.name), geometry = object?.geometry, attribute = geometry?.attributes.position
      if (!object?.isMesh || object.isInstancedMesh || !attribute || attribute.count !== expected.vertexCount || geometry.index?.count !== expected.indexCount) return 'source-layout-mismatch'
      object.updateWorldMatrix(true, false)
      if (expected.localXZ.some(([id, x, z]) => Math.abs(attribute.getX(id) - x) > 1e-7 || Math.abs(attribute.getZ(id) - z) > 1e-7)
        || matrixSlots.some((slot, i) => Math.abs(object.matrixWorld.elements[slot] - expected.worldMatrixXZ[i]) > 1e-7)) return 'source-footprint-edited'
      guards.push({ object, geometry, attribute, version: attribute.version, indexVersion: geometry.index.version, expected })
    }
    return null
  }
  function updatePlacement() {
    if (!reference || !paving || !belongs(reference) || !belongs(paving) || !paving.material?.isMeshStandardMaterial || paving.material.name !== DATA.materialName) return false
    for (const guard of guards) {
      const { object, geometry, attribute, expected } = guard
      if (!belongs(object) || object.geometry !== geometry || geometry.attributes.position !== attribute || attribute.version !== guard.version || geometry.index.version !== guard.indexVersion) return false
      object.updateWorldMatrix(true, false)
      if (matrixSlots.some((slot, i) => Math.abs(object.matrixWorld.elements[slot] - expected.worldMatrixXZ[i]) > 1e-7)) return false
    }
    reference.updateWorldMatrix(true, false)
    position.fromBufferAttribute(reference.geometry.attributes.position, DATA.reference.vertexId).applyMatrix4(reference.matrixWorld)
    if (!Number.isFinite(position.y) || Math.abs(position.y - DATA.reference.expectedY) > .01) return false
    topY = position.y + DATA.reference.offset
    for (const proxy of proxies) {
      proxy.matrixWorld.makeTranslation(0, topY, 0)
      proxy.layers.mask = paving.layers.mask
      proxy.receiveShadow = true; proxy.castShadow = false
      proxy.renderOrder = paving.renderOrder
    }
    if (sourceMaterial !== paving.material || sourceMaterialVersion !== paving.material.version) {
      sourceMaterial = paving.material; sourceMaterialVersion = sourceMaterial.version; material.needsUpdate = true
    }
    material.copy(sourceMaterial)
    return true
  }
  function refresh() {
    if (disposed) return getStatus()
    if (suspended) { pendingRefresh = true; return getStatus() }
    pendingRefresh = false; release()
    if (!scene || !settings.enabled || settings.version !== 1) { reason = 'disabled'; return getStatus() }
    reference = unique(DATA.reference.name); paving = unique(DATA.materialSource)
    if (!reference?.isMesh || !paving?.material?.isMeshStandardMaterial || Array.isArray(paving.material) || paving.material.name !== DATA.materialName) { reason = 'source-material-mismatch'; return getStatus() }
    scene.updateMatrixWorld(true)
    reason = validateFootprints()
    if (reason) { guards = []; return getStatus() }
    sourceMaterial = paving.material; sourceMaterialVersion = sourceMaterial.version; material = sourceMaterial.clone()
    material.onBeforeCompile = (shader, renderer) => sourceMaterial.onBeforeCompile.call(sourceMaterial, shader, renderer)
    material.customProgramCacheKey = () => sourceMaterial.customProgramCacheKey() + '|nanjing-junction-paving-v1'
    for (const patch of DATA.patches) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(patch.vertices.flatMap(([x, z]) => [x, 0, z]), 3))
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(patch.vertices.flatMap(() => [0, 1, 0]), 3))
      for (const [name, values] of Object.entries(patch.uvAttributes)) geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, 2))
      geometry.setIndex(patch.indices); geometry.computeBoundingBox(); geometry.computeBoundingSphere()
      const proxy = new THREE.Mesh(geometry, material)
      proxy.name = `南京门前路口薄铺装_${patch.id}（派生顶面）`
      proxy.userData.nanjingUtility = true; proxy.userData.skipEditorTree = true
      proxy.matrixAutoUpdate = false; proxy.matrixWorldAutoUpdate = false; proxy.frustumCulled = false
      proxy.castShadow = false; proxy.receiveShadow = true; proxy.raycast = () => {}
      proxy.onBeforeRender = (_renderer, renderScene) => {
        const show = settings.enabled && !suspended && !disposed && renderScene === scene && updatePlacement()
        geometry.setDrawRange(0, show ? geometry.index.count : 0)
        reason = show ? null : 'source-placement-changed'
      }
      proxies.push(proxy); group.add(proxy)
    }
    if (!updatePlacement()) { release(); reason = 'incompatible-current-height'; return getStatus() }
    scene.add(group); reason = null; onChange?.(getStatus()); return getStatus()
  }
  function update(patch = {}) {
    if (Object.hasOwn(patch, 'version')) settings.version = patch.version === 1 ? 1 : 0
    if (Object.hasOwn(patch, 'enabled')) settings.enabled = patch.enabled === true
    settings.enabled = settings.version === 1 && settings.enabled
    if (Object.hasOwn(patch, 'version') || Object.hasOwn(patch, 'enabled')) config.junctionPaving = { ...settings }
    const status = refresh(); onChange?.(status); return status
  }
  function withOriginals(callback) {
    if (disposed) return callback()
    suspended++; group.removeFromParent()
    const finish = () => {
      suspended--
      if (disposed || suspended) return
      if (pendingRefresh) refresh()
      else if (settings.enabled && proxies.length) scene.add(group)
    }
    try { const result = callback(); if (result && typeof result.then === 'function') return Promise.resolve(result).finally(finish); finish(); return result }
    catch (error) { finish(); throw error }
  }
  function getStatus() {
    return { ...settings, active: proxies.length === 2 && !disposed && !suspended && group.parent === scene && reason === null, reason,
      patches: proxies.length, extraDrawCalls: proxies.length, derivedTriangles: proxies.reduce((n, p) => n + p.geometry.index.count / 3, 0),
      areas: DATA.patches.map(p => p.area), topY, sourceGeometryChanged: false, sourceMaterialChanged: false, supportWalls: 0, castShadow: false, receiveShadow: true }
  }
  function dispose() { if (disposed) return; disposed = true; release(); reference = paving = null }
  refresh()
  return { refresh, update, getStatus, withOriginals, withBaseline: withOriginals, dispose }
}
