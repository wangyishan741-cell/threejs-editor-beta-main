import * as THREE from 'three'
import { isNanjingSolidRoadLamp } from './nanjingTransparentShadows.js'

// The source uses one translucent material for an entire streetlight. Keep its
// display/depth behavior intact and supply only AO's neighbor samples with the
// opaque pole silhouette. This scene never enters the editor or its save data.
export function createNanjingContactLampDepth(editor) {
  const renderer = editor.renderer
  const scene = new THREE.Scene()
  scene.name = '南京接触阴影灯杆深度'
  scene.userData.nanjingUtility = true
  scene.matrixWorldAutoUpdate = false
  const groups = new Map()
  const candidates = [], watched = new Set()
  let inventoryDirty = true, candidateRefreshes = 0, candidateCacheHits = 0, lastCandidateRefreshMs = 0
  let target = null, disposed = false, rendering = false, renders = 0, error = null
  let lamps = 0, triangles = 0, draws = 0, lastRenderMs = 0, inventoryScans = 0, lastInventoryMs = 0
  const unsupported = !renderer?.render || !renderer?.setRenderTarget || !renderer?.clear ? '当前渲染器不支持灯杆深度通道' : null
  const now = () => globalThis.performance?.now?.() ?? Date.now()
  const materialKeys = ['side', 'displacementMap', 'displacementScale', 'displacementBias', 'clippingPlanes', 'clipIntersection']
  function invalidate() { if (!disposed) inventoryDirty = true }
  function structureChanged(event) {
    // Render-only instance/selection proxies never contain source streetlights.
    if (!event.child?.userData?.nanjingUtility) invalidate()
  }
  function refreshCandidates() {
    const started = now()
    for (const object of watched) {
      object.removeEventListener('childadded', structureChanged)
      object.removeEventListener('childremoved', structureChanged)
    }
    watched.clear(); candidates.length = 0
    const visit = (object, namedParent = false) => {
      if (object.userData?.nanjingUtility) return
      // Three's structural events do not bubble. Watch the existing hierarchy
      // once; the next invalidated collection also registers newly added nodes.
      object.addEventListener('childadded', structureChanged)
      object.addEventListener('childremoved', structureChanged)
      watched.add(object)
      const named = namedParent || /^道路灯具_道路灯_\d+$/.test(object.name)
      // Keep hidden, disabled and temporarily incompatible candidates so direct
      // visibility/material/caster edits can recover without another full scan.
      if (object.isMesh && (named || object.material?.name === '灯具_发光灯罩')) candidates.push(object)
      for (const child of object.children) visit(child, named)
    }
    visit(editor.scene)
    inventoryDirty = false; candidateRefreshes++; lastCandidateRefreshMs = now() - started
  }
  function visibleInScene(object) {
    for (let node = object; node; node = node.parent) {
      if (!node.visible || node.userData?.nanjingUtility) return false
      if (node === editor.scene) return true
    }
    return false
  }
  function release(group) {
    scene.remove(group.proxy)
    group.proxy.dispose?.() // InstancedMesh resources only; source geometry is borrowed.
    group.material.dispose()
  }
  function inventory(camera) {
    // Named/material replacement through editor panels calls invalidate().
    // Arbitrary scripted animation may create new candidates, so preserve the
    // original exhaustive behavior whenever the editor has active update jobs.
    if (inventoryDirty || (editor.scene.COMMON_UPDATE_LIST?.length || 0) > 0) refreshCandidates()
    else candidateCacheHits++
    const buckets = new Map()
    for (const object of candidates) {
      if (!visibleInScene(object)) continue
      if (object.material?.name === '灯具_发光灯罩' && isNanjingSolidRoadLamp(object)
        && object.castShadow !== false && object.material.visible && object.material.opacity > 0 && object.layers.test(camera.layers)) {
        // The beauty pass has already updated source world matrices. Do not
        // update the whole editor scene again for this small auxiliary pass.
        const determinant = object.matrixWorld.determinant()
        if (Number.isFinite(determinant) && Math.abs(determinant) > 1e-12) {
          const mirrored = determinant < 0
          const key = `${object.geometry.id}:${object.material.id}:${mirrored ? object.id : 'instances'}`
          if (!buckets.has(key)) buckets.set(key, { objects: [], mirrored })
          buckets.get(key).objects.push(object)
        }
      }
    }
    for (const [key, group] of groups) if (!buckets.has(key)) { release(group); groups.delete(key) }
    lamps = 0; triangles = 0
    for (const [key, bucket] of buckets) {
      const source = bucket.objects[0], geometry = source.geometry
      let group = groups.get(key)
      if (group && group.capacity !== bucket.objects.length) { release(group); groups.delete(key); group = null }
      if (!group) {
        const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking, colorWrite: false,
          depthTest: true, depthWrite: true, transparent: false, opacity: 1, alphaTest: 0, alphaHash: false })
        material.name = '南京灯杆专用接触深度'
        const proxy = bucket.mirrored ? new THREE.Mesh(geometry, material) : new THREE.InstancedMesh(geometry, material, bucket.objects.length)
        proxy.name = 'GPU · 南京灯杆接触深度'
        proxy.userData.nanjingUtility = true
        proxy.matrixAutoUpdate = false; proxy.castShadow = false; proxy.receiveShadow = false
        scene.add(proxy)
        group = { proxy, material, capacity: bucket.objects.length, sources: [] }
        groups.set(key, group)
      }
      for (const property of materialKeys) if (group.material[property] !== source.material[property]) {
        group.material[property] = source.material[property]
        if (['side', 'displacementMap', 'clippingPlanes', 'clipIntersection'].includes(property)) group.material.needsUpdate = true
      }
      group.proxy.layers.mask = camera.layers.mask
      if (bucket.mirrored) {
        group.proxy.matrix.copy(source.matrixWorld); group.proxy.matrixWorld.copy(source.matrixWorld)
      } else {
        let changed = group.sources.length !== bucket.objects.length
        bucket.objects.forEach((object, index) => {
          const array = group.proxy.instanceMatrix.array, matrix = object.matrixWorld.elements, offset = index * 16
          if (group.sources[index] !== object || matrix.some((value, component) => array[offset + component] !== Math.fround(value))) {
            group.proxy.setMatrixAt(index, object.matrixWorld); changed = true
          }
        })
        if (changed) { group.proxy.instanceMatrix.needsUpdate = true; group.proxy.computeBoundingSphere() }
      }
      group.sources = bucket.objects
      lamps += bucket.objects.length
      const count = geometry.index?.count ?? geometry.attributes.position.count
      triangles += Math.max(0, Math.min(count - geometry.drawRange.start, geometry.drawRange.count)) / 3 * bucket.objects.length
    }
  }
  function render(camera, width, height) {
    draws = 0
    if (disposed || rendering || unsupported) return null
    const started = now()
    inventory(camera)
    inventoryScans++; lastInventoryMs = now() - started
    if (!lamps) { error = null; lastRenderMs = lastInventoryMs; return null }
    width = Math.max(1, Math.floor(width)); height = Math.max(1, Math.floor(height))
    if (!target) {
      target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true, stencilBuffer: false, samples: 0,
        minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })
      target.texture.name = '南京灯杆深度通道颜色附件'
      target.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType)
      target.depthTexture.name = '南京灯杆接触阴影深度'
      target.depthTexture.minFilter = THREE.NearestFilter; target.depthTexture.magFilter = THREE.NearestFilter
      target.scissorTest = false
    }
    target.setSize(width, height)
    const previous = { target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace?.() ?? 0,
      mip: renderer.getActiveMipmapLevel?.() ?? 0, autoClear: renderer.autoClear, xr: renderer.xr?.enabled,
      shadowEnabled: renderer.shadowMap?.enabled, shadowAuto: renderer.shadowMap?.autoUpdate,
      shadowDirty: renderer.shadowMap?.needsUpdate, infoAuto: renderer.info?.autoReset }
    rendering = true
    try {
      if (renderer.xr) renderer.xr.enabled = false
      if (renderer.shadowMap) { renderer.shadowMap.enabled = false; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false }
      if (renderer.info) renderer.info.autoReset = false
      renderer.autoClear = false
      // Target-owned viewport/scissor avoid changing the renderer's default
      // canvas values (setViewport multiplies those values by DPR in r184).
      renderer.setRenderTarget(target)
      renderer.clear(false, true, false)
      const before = renderer.info?.render?.calls
      renderer.render(scene, camera)
      draws = Number.isFinite(before) && Number.isFinite(renderer.info?.render?.calls) ? renderer.info.render.calls - before : groups.size
      renders++; error = null
      return target.depthTexture
    } catch (cause) {
      error = cause?.message || String(cause)
      return null
    } finally {
      renderer.autoClear = previous.autoClear
      if (renderer.xr) renderer.xr.enabled = previous.xr
      if (renderer.shadowMap) { renderer.shadowMap.enabled = previous.shadowEnabled; renderer.shadowMap.autoUpdate = previous.shadowAuto; renderer.shadowMap.needsUpdate = previous.shadowDirty }
      if (renderer.info) renderer.info.autoReset = previous.infoAuto
      renderer.setRenderTarget(previous.target, previous.face, previous.mip)
      rendering = false; lastRenderMs = now() - started
    }
  }
  function getStatus() {
    return { lamps, triangles, draws, renders, proxyBatches: groups.size, extraSceneDraws: draws > 0 ? 1 : 0,
      drawingBuffer: target ? [target.width, target.height] : null, estimatedTargetBytes: target ? target.width * target.height * 8 : 0,
      lastRenderMs, inventoryScans, lastInventoryMs, candidateRefreshes, candidateCacheHits,
      candidateCount: candidates.length, lastCandidateRefreshMs, inventoryPolicy: 'cached-candidates-with-edit-invalidation',
      unsupported, error, disposed, source: 'streetlight-camera-depth' }
  }
  function dispose() {
    if (disposed) return
    disposed = true
    for (const object of watched) {
      object.removeEventListener('childadded', structureChanged)
      object.removeEventListener('childremoved', structureChanged)
    }
    watched.clear(); candidates.length = 0
    for (const group of groups.values()) release(group)
    groups.clear(); target?.depthTexture?.dispose(); target?.dispose(); target = null
    lamps = 0; triangles = 0; draws = 0
  }
  return { render, invalidate, getStatus, dispose }
}
