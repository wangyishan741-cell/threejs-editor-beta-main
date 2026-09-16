import * as THREE from 'three'

// Large selections keep their normal editable objects and transforms, while a
// twelve-edge box replaces OutlinePass's extra full-scene depth/mask renders.
export function createNanjingSelection(editor, options = {}) {
  const meshThreshold = Math.max(2, options.meshThreshold ?? 128)
  const triangleThreshold = Math.max(1, options.triangleThreshold ?? 500000)
  const scene = editor.scene
  const controls = editor.transformControls
  const outline = editor.effectComposer?.effectPass?.outlinePass
  const previousLargeSelections = Object.getOwnPropertyDescriptor(editor, '__nanjingLargeSelections')
  const largeSelections = new WeakSet()
  Object.defineProperty(editor, '__nanjingLargeSelections', { configurable: true, value: largeSelections })
  const group = new THREE.Group()
  group.name = '南京场景选择提示'
  group.userData.nanjingUtility = true
  group.matrixAutoUpdate = false
  const boxes = new Map()
  const marked = new Set()
  const scratchBox = new THREE.Box3()
  let complexityCache = new WeakMap()
  let lastRequested = []
  let lastTransformed = null
  let filteredOutline = []
  let dirty = true
  let disposed = false
  let suspended = 0
  let renderingOutline = false
  let boxUpdates = 0
  let lastTickMs = 0
  const outlineSelectionDescriptor = outline && Object.getOwnPropertyDescriptor(outline, 'selectedObjects')
  const outlineRenderDescriptor = outline && Object.getOwnPropertyDescriptor(outline, 'render')
  const originalOutlineRender = outline?.render
  let requestedOutline = outline?.selectedObjects || []
  const methodDescriptor = Object.getOwnPropertyDescriptor(editor, 'setOutlinePass')
  const originalSetOutline = editor.setOutlinePass
  let wrappedSetOutline
  let wrappedOutlineRender

  function isUtility(object) {
    return object.userData?.nanjingUtility || object.isHelper || object.type?.endsWith('Helper')
  }
  function isAttached(object) {
    for (let parent = object; parent; parent = parent.parent) if (parent === scene) return true
    return false
  }
  function isLarge(object) {
    if (!object?.isObject3D || isUtility(object)) return false
    if (complexityCache.has(object)) return complexityCache.get(object)
    let meshes = 0
    let triangles = 0
    const pending = [object]
    while (pending.length) {
      const node = pending.pop()
      if (isUtility(node)) continue
      if (node.isMesh && node.geometry) {
        meshes += 1
        triangles += (node.geometry.index?.count ?? node.geometry.attributes.position?.count ?? 0) / 3
          * (node.isInstancedMesh ? node.count : 1)
        if (meshes >= meshThreshold || triangles >= triangleThreshold) {
          complexityCache.set(object, true)
          return true
        }
      }
      pending.push(...node.children)
    }
    complexityCache.set(object, false)
    return false
  }
  function invalidate({ structure = false } = {}) {
    if (disposed) return
    if (structure) complexityCache = new WeakMap()
    dirty = true
    options.onChange?.()
  }
  function selectionChanged() {
    return controls?.object !== lastTransformed || requestedOutline.length !== lastRequested.length
      || requestedOutline.some((object, index) => object !== lastRequested[index])
  }
  function refreshSelection() {
    if (disposed) return
    const nextLarge = new Set()
    for (const object of [...requestedOutline, controls?.object]) {
      if (object && isAttached(object) && isLarge(object)) nextLarge.add(object)
    }
    for (const object of marked) {
      if (nextLarge.has(object)) continue
      marked.delete(object)
      largeSelections.delete(object)
      const helper = boxes.get(object)
      helper?.removeFromParent()
      helper?.dispose()
      boxes.delete(object)
    }
    for (const object of nextLarge) {
      if (marked.has(object)) continue
      marked.add(object)
      largeSelections.add(object)
      const helper = new THREE.Box3Helper(new THREE.Box3(), options.color ?? 0xffdc65)
      helper.name = `${object.name || '选中对象'} · 选择边框`
      helper.userData.nanjingUtility = true
      helper.isHelper = true
      helper.material.depthTest = false
      helper.material.depthWrite = false
      helper.material.transparent = true
      helper.material.opacity = 0.95
      helper.frustumCulled = false
      helper.renderOrder = 10000
      helper.raycast = () => {}
      boxes.set(object, helper)
      group.add(helper)
    }
    filteredOutline = requestedOutline.filter(object => !largeSelections.has(object))
    lastRequested = [...requestedOutline]
    lastTransformed = controls?.object
  }
  function updateBox(object, helper) {
    object.updateWorldMatrix(true, true)
    helper.box.makeEmpty()
    const pending = [object]
    while (pending.length) {
      const node = pending.pop()
      if (isUtility(node)) continue
      if ((node.isMesh || node.isLine || node.isPoints) && node.geometry) {
        let bounds
        if (node.isInstancedMesh) {
          if (!node.boundingBox) node.computeBoundingBox()
          bounds = node.boundingBox
        } else {
          if (!node.geometry.boundingBox) node.geometry.computeBoundingBox()
          bounds = node.geometry.boundingBox
        }
        if (bounds) helper.box.union(scratchBox.copy(bounds).applyMatrix4(node.matrixWorld))
      }
      pending.push(...node.children)
    }
    helper.visible = !helper.box.isEmpty()
    boxUpdates += 1
  }
  function tick({ animated = false } = {}) {
    if (disposed || suspended) return false
    if (!dirty && !selectionChanged() && !(animated && boxes.size)) return false
    const started = globalThis.performance?.now() ?? Date.now()
    refreshSelection()
    for (const [object, helper] of boxes) updateBox(object, helper)
    if (boxes.size) {
      // The boxes use world bounds, even if the scene itself has a transform.
      group.matrix.copy(scene.matrixWorld).invert()
      if (group.parent !== scene) scene.add(group)
      group.updateMatrixWorld(true)
    } else group.removeFromParent()
    dirty = false
    lastTickMs = (globalThis.performance?.now() ?? Date.now()) - started
    return true
  }

  // Keep selectedObjects unchanged for the editor's context menus and Tab key.
  // Only the OutlinePass render sees the filtered array, so a large group remains
  // selected/editable without triggering its expensive mask/depth passes.
  if (outline && (!outlineSelectionDescriptor || outlineSelectionDescriptor.configurable)) {
    Object.defineProperty(outline, 'selectedObjects', {
      configurable: true,
      enumerable: outlineSelectionDescriptor?.enumerable ?? true,
      get: () => renderingOutline ? filteredOutline : requestedOutline,
      set: value => { requestedOutline = Array.isArray(value) ? value : []; invalidate() },
    })
    if (originalOutlineRender) outline.render = wrappedOutlineRender = function (...args) {
      if (dirty || selectionChanged()) refreshSelection()
      renderingOutline = true
      try { return originalOutlineRender.apply(this, args) }
      finally { renderingOutline = false }
    }
  }
  if (originalSetOutline) editor.setOutlinePass = wrappedSetOutline = function (objects = [], ...args) {
    const result = originalSetOutline.call(this, objects, ...args)
    if (!outline) requestedOutline = objects
    invalidate()
    return result
  }
  const changedTransform = () => invalidate()
  controls?.addEventListener?.('object-changed', changedTransform)
  controls?.addEventListener?.('objectChange', changedTransform)

  function withOriginals(fn) {
    if (disposed) return fn()
    suspended += 1
    if (suspended === 1) group.removeFromParent()
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      suspended -= 1
      if (suspended || disposed) return
      if (boxes.size && group.parent !== scene) scene.add(group)
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
    return { largeSelections: boxes.size, outlineSelections: filteredOutline.length, boxUpdates, lastTickMs, dirty }
  }
  function dispose() {
    if (disposed) return
    disposed = true
    controls?.removeEventListener?.('object-changed', changedTransform)
    controls?.removeEventListener?.('objectChange', changedTransform)
    for (const helper of boxes.values()) helper.dispose()
    boxes.clear()
    group.removeFromParent()
    for (const object of marked) largeSelections.delete(object)
    marked.clear()
    if (previousLargeSelections) Object.defineProperty(editor, '__nanjingLargeSelections', previousLargeSelections)
    else delete editor.__nanjingLargeSelections
    if (wrappedSetOutline && editor.setOutlinePass === wrappedSetOutline) {
      if (methodDescriptor) Object.defineProperty(editor, 'setOutlinePass', methodDescriptor)
      else delete editor.setOutlinePass
    }
    if (outline && (!outlineSelectionDescriptor || outlineSelectionDescriptor.configurable)) {
      if (outlineSelectionDescriptor) {
        Object.defineProperty(outline, 'selectedObjects', 'value' in outlineSelectionDescriptor
          ? { ...outlineSelectionDescriptor, value: requestedOutline } : outlineSelectionDescriptor)
        if (outlineSelectionDescriptor.set) outline.selectedObjects = requestedOutline
      } else {
        delete outline.selectedObjects
        outline.selectedObjects = requestedOutline
      }
      if (wrappedOutlineRender && outline.render === wrappedOutlineRender) {
        if (outlineRenderDescriptor) Object.defineProperty(outline, 'render', outlineRenderDescriptor)
        else delete outline.render
      }
    }
  }
  return { tick, invalidate, withOriginals, dispose, getStats, group }
}
