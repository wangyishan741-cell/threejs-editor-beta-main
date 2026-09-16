// Three r184 stores projected clip-space z in render lists. Its default
// transparent comparator needs the opposite sign with a reversed depth buffer.
function compareTransparent(a, b, reversed) {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder
  if (a.z !== b.z) return reversed ? a.z - b.z : b.z - a.z
  return a.id - b.id
}

const normalOrder = (a, b) => compareTransparent(a, b, false)
const reversedOrder = (a, b) => compareTransparent(a, b, true)

export function createNanjingTransparency(editor) {
  const renderer = editor.renderer
  if (typeof renderer?.render !== 'function' || typeof renderer.renderLists?.get !== 'function') {
    throw new TypeError('The transparency fix requires Three WebGLRenderer.renderLists.')
  }
  const renderDescriptor = Object.getOwnPropertyDescriptor(renderer, 'render')
  const originalRender = renderer.render
  const frames = []
  const ownerRecords = new WeakMap()
  const listRecords = new WeakMap()
  const owners = new Set()
  const lists = new Set()
  const counters = { renderCalls: 0, projectionUpdates: 0, defaultSorts: 0, reversedSorts: 0, customSorts: 0 }
  let disposed = false

  function initializeCamera(camera, reversed) {
    if (!camera) return
    if (camera.reversedDepth !== reversed && typeof camera.updateProjectionMatrix === 'function') {
      camera._reversedDepth = reversed
      camera.updateProjectionMatrix()
      counters.projectionUpdates++
    }
    if (camera.isArrayCamera) {
      for (const child of camera.cameras) initializeCamera(child, reversed)
    }
  }

  function patchList(list) {
    if (!list || typeof list.sort !== 'function' || listRecords.has(list)) return
    const descriptor = Object.getOwnPropertyDescriptor(list, 'sort')
    const originalSort = list.sort
    function wrappedSort(opaqueSort, transparentSort, ...args) {
      const frame = frames[frames.length - 1]
      if (disposed || !frame) return originalSort.call(this, opaqueSort, transparentSort, ...args)
      // Keep a caller's custom comparator, including one installed before this
      // controller. setTransparentSort itself is never replaced or reset.
      if (transparentSort) {
        counters.customSorts++
        return originalSort.call(this, opaqueSort, transparentSort, ...args)
      }
      const reversed = frame.camera?.reversedDepth === true
      counters.defaultSorts++
      if (reversed) counters.reversedSorts++
      return originalSort.call(this, opaqueSort, reversed ? reversedOrder : normalOrder, ...args)
    }
    list.sort = wrappedSort
    listRecords.set(list, { descriptor, originalSort, wrappedSort })
    // Render lists keep object references; don't keep discarded scenes alive.
    lists.add(new WeakRef(list))
  }

  function patchRenderLists() {
    const owner = renderer.renderLists
    if (!owner || typeof owner.get !== 'function' || ownerRecords.has(owner)) return
    const descriptor = Object.getOwnPropertyDescriptor(owner, 'get')
    const originalGet = owner.get
    function wrappedGet(...args) {
      const list = originalGet.apply(this, args)
      if (!disposed) patchList(list)
      return list
    }
    owner.get = wrappedGet
    ownerRecords.set(owner, { descriptor, originalGet, wrappedGet })
    owners.add(new WeakRef(owner))
  }

  function wrappedRender(scene, camera, ...args) {
    if (disposed) return originalRender.call(this, scene, camera, ...args)
    // Context restoration can replace renderer.renderLists. Hook the new owner
    // without overwriting later hooks on an owner that was already installed.
    patchRenderLists()
    const reversed = renderer.state?.buffers?.depth?.getReversed?.()
      ?? renderer.capabilities?.reversedDepthBuffer ?? false
    initializeCamera(camera, !!reversed)
    counters.renderCalls++
    frames.push({ camera })
    try {
      return originalRender.call(this, scene, camera, ...args)
    } finally {
      frames.pop()
    }
  }

  function restore(object, key, descriptor) {
    if (descriptor) Object.defineProperty(object, key, descriptor)
    else delete object[key]
  }

  function dispose() {
    if (disposed) return
    disposed = true
    if (renderer.render === wrappedRender) restore(renderer, 'render', renderDescriptor)
    for (const reference of owners) {
      const owner = reference.deref()
      const record = owner && ownerRecords.get(owner)
      if (record && owner.get === record.wrappedGet) restore(owner, 'get', record.descriptor)
    }
    for (const reference of lists) {
      const list = reference.deref()
      const record = list && listRecords.get(list)
      if (record && list.sort === record.wrappedSort) restore(list, 'sort', record.descriptor)
    }
    owners.clear()
    lists.clear()
  }

  patchRenderLists()
  renderer.render = wrappedRender
  return { dispose, getStats: () => ({ ...counters, disposed, renderDepth: frames.length }) }
}
