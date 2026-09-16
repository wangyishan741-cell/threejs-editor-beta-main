import * as THREE from 'three'

const GROUND_NAME = '远景_地形底板'
const MATERIAL_NAME = '远景_绿化底板'
const EARLY_ORDER = -1
const HEIGHT_EPSILON = 0.0001

// A transparent ground decal spans the whole site. Its bounding-sphere centre
// cannot order it against a nearer transparent building wall. Draw only this
// known horizontal ground before the other blended surfaces when viewed above.
export function createNanjingGroundOrder(editor) {
  const scene = editor.scene
  const renderer = editor.renderer
  const renderDescriptor = Object.getOwnPropertyDescriptor(renderer, 'render')
  const originalRender = renderer.render
  const candidates = new Set()
  const watched = new Set()
  const frames = []
  const point = new THREE.Vector3()
  const cameraPosition = new THREE.Vector3()
  const counters = { renderCalls: 0, reordered: 0, refreshes: 0 }
  let dirty = true
  let disposed = false

  function invalidate() { dirty = true }

  function watch(object) {
    if (!object || watched.has(object)) return
    object.addEventListener('childadded', invalidate)
    object.addEventListener('childremoved', invalidate)
    watched.add(object)
  }

  function refresh() {
    if (disposed) return
    for (const object of watched) {
      object.removeEventListener('childadded', invalidate)
      object.removeEventListener('childremoved', invalidate)
    }
    watched.clear()
    candidates.clear()
    watch(scene)
    scene.traverse(object => {
      if (object.isMesh && object.name === GROUND_NAME && !object.userData?.nanjingUtility) {
        candidates.add(object)
        // Catch a cloned/replaced ground under the same model without walking
        // the thousands of static scene nodes on every camera frame.
        for (let parent = object.parent; parent && parent !== scene; parent = parent.parent) watch(parent)
      }
    })
    dirty = false
    counters.refreshes++
  }

  function belongsToScene(object) {
    for (let parent = object.parent; parent; parent = parent.parent) if (parent === scene) return true
    return false
  }

  function horizontalHeight(object) {
    const geometry = object.geometry
    const positions = geometry?.getAttribute('position')
    if (positions?.count !== 4 || (geometry.index?.count ?? positions.count) !== 6
      || object.isSkinnedMesh || object.isInstancedMesh
      || geometry.morphAttributes.position?.length) return null
    object.updateWorldMatrix(true, false)
    let height
    for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld)
      if (!Number.isFinite(point.y)) return null
      if (height === undefined) height = point.y
      else if (Math.abs(point.y - height) > HEIGHT_EPSILON) return null
    }
    return height
  }

  function isAbove(camera, height) {
    if (camera?.isArrayCamera) return camera.cameras.length > 0 && camera.cameras.every(child => isAbove(child, height))
    if (!camera?.isCamera) return false
    camera.updateWorldMatrix(true, false)
    cameraPosition.setFromMatrixPosition(camera.matrixWorld)
    return cameraPosition.y > height + HEIGHT_EPSILON
  }

  function restore(changes) {
    for (const change of changes) {
      if (change.object.renderOrder === EARLY_ORDER) change.object.renderOrder = change.original
    }
  }

  function wrappedRender(renderScene, camera, ...args) {
    if (disposed) return originalRender.call(this, renderScene, camera, ...args)
    // An above-ground main render may trigger a nested below-ground/cubemap
    // render. The inner render must evaluate the source order independently.
    const outer = frames[frames.length - 1]
    if (outer) restore(outer)
    const changes = []
    frames.push(changes)
    counters.renderCalls++
    try {
      if (renderScene === scene) {
        if (dirty) refresh()
        for (const object of candidates) {
          const material = object.material
          if (object.name !== GROUND_NAME || !belongsToScene(object) || object.renderOrder !== 0
            || material?.name !== MATERIAL_NAME || !material.transparent || material.opacity !== 1
            || (material.transmission ?? 0) > 0 || !material.depthTest) continue
          const height = horizontalHeight(object)
          if (height === null || !isAbove(camera, height)) continue
          changes.push({ object, original: object.renderOrder })
          object.renderOrder = EARLY_ORDER
          counters.reordered++
        }
      }
      return originalRender.call(this, renderScene, camera, ...args)
    } finally {
      restore(changes)
      frames.pop()
      if (!disposed && outer) {
        for (const change of outer) {
          if (change.object.renderOrder === change.original) change.object.renderOrder = EARLY_ORDER
        }
      }
    }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    for (const changes of frames) restore(changes)
    for (const object of watched) {
      object.removeEventListener('childadded', invalidate)
      object.removeEventListener('childremoved', invalidate)
    }
    watched.clear()
    candidates.clear()
    // Keep later wrappers/custom renderers. A captured wrapper becomes inert.
    if (renderer.render === wrappedRender) {
      if (renderDescriptor) Object.defineProperty(renderer, 'render', renderDescriptor)
      else delete renderer.render
    }
  }

  watch(scene)
  renderer.render = wrappedRender
  return { refresh, dispose, getStats: () => ({ ...counters, candidates: candidates.size, disposed }) }
}
