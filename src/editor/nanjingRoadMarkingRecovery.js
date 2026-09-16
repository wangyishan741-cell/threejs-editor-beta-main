import * as THREE from 'three'

const SOURCE_NAME = '远景_黄色实线'
const SOURCE_MATERIAL = '道路_棕色路面'
const DETAIL_NAME = '网格_道路_马路纹理'
const STOP_NAME = '网格_道路_马路纹理_1'
const VERTICES = new Set([3944, 3945, 3946, 3947, 3968, 3969, 3970, 3971])
const STOP_VERTICES = [4259, 4260, 4261, 4262]
const STOP_GAP = 0.035
const EXPECTED_XZ = [[-11.94574612, 3.736253389], [-23.02226202, 20.05644008], [-11.91868565, 3.735116277], [-23.02226202, 20.05644008],
  [-11.89048807, 3.761039634], [-22.99407968, 20.08236408], [-11.86344284, 3.759903163], [-22.96701921, 20.08122697]]

// The source mesh merges 1,220 distant road stripes. Two original components
// provide the far endpoints for this detailed road; its other components must
// remain below detailed junctions. This auxiliary draw moves these components
// vertically and clips their junction end. One collapsed endpoint is repaired
// only in this derived draw so both stripes keep their existing width. Source
// vertices/indices stay intact. Version 2 aligns the near run with the detailed
// road lane axis, then eases back to the original far joint after the detailed
// white lane markings end. Version 1 stays available for saved history.
export function createNanjingRoadMarkingRecovery(editor, config = {}, { onChange } = {}) {
  const scene = editor?.scene
  const recoveryVersion = config.roadMarkingRecovery?.version
  const settings = { version: recoveryVersion === 2 ? 2 : 1, enabled: [1, 2].includes(recoveryVersion) && config.roadMarkingRecovery.enabled === true }
  const group = new THREE.Group()
  group.name = '南京道路缺失双黄线（派生绘制）'
  group.userData.nanjingUtility = true
  group.userData.skipEditorTree = true
  const plane = { value: new THREE.Vector4() }
  let disposed = false, suspended = 0, source = null, detail = null, stop = null, proxy = null, geometry = null, material = null
  let pathStatus = null, pendingRefresh = false
  let sourceGeometry = null, sourceMaterial = null, sourceMaterialVersion = -1, verticalDelta = 0, reason = 'disabled'
  const world = new THREE.Vector3(), end = new THREE.Vector3(), normal = new THREE.Vector3()
  const belongs = object => { for (let node = object; node; node = node.parent) { if (!node.visible) return false; if (node === scene) return true } return false }
  const points = (object, ids) => ids.map(id => new THREE.Vector3().fromBufferAttribute(object.geometry.attributes.position, id).applyMatrix4(object.matrixWorld))

  function release() {
    group.removeFromParent()
    if (proxy) group.remove(proxy)
    geometry?.dispose(); material?.dispose()
    proxy = geometry = material = sourceGeometry = sourceMaterial = null
    pathStatus = null
  }
  function updatePlacement() {
    if (!source || source.geometry !== sourceGeometry || source.material !== sourceMaterial || sourceMaterial.visible === false || !belongs(source) || !belongs(detail) || !belongs(stop)) return false
    source.updateWorldMatrix(true, false); detail.updateWorldMatrix(true, false); stop.updateWorldMatrix(true, false)
    world.fromBufferAttribute(sourceGeometry.attributes.position, 3944).applyMatrix4(source.matrixWorld)
    if (Math.hypot(world.x - EXPECTED_XZ[0][0], world.z - EXPECTED_XZ[0][1]) > 0.0001) return false
    end.fromBufferAttribute(detail.geometry.attributes.position, 0).applyMatrix4(detail.matrixWorld)
    verticalDelta = end.y - world.y
    if (!Number.isFinite(verticalDelta) || verticalDelta < 0 || verticalDelta > 0.01) return false
    const corners = points(stop, STOP_VERTICES)
    normal.subVectors(corners[2], corners[0]); normal.set(-normal.z, 0, normal.x).normalize()
    end.fromBufferAttribute(sourceGeometry.attributes.position, 3945).applyMatrix4(source.matrixWorld).sub(world)
    if (normal.dot(end) < 0) normal.negate()
    plane.value.set(normal.x, normal.y, normal.z, Math.max(...corners.map(point => normal.dot(point))) + STOP_GAP)
    proxy.matrixWorld.copy(source.matrixWorld); proxy.matrixWorld.elements[13] += verticalDelta
    proxy.layers.mask = source.layers.mask
    proxy.receiveShadow = source.receiveShadow
    proxy.renderOrder = source.renderOrder
    // Keep edits to the source colour/maps/physical parameters visible. copy()
    // does not replace the private compile/cache callbacks below.
    material.copy(sourceMaterial)
    if (sourceMaterialVersion !== sourceMaterial.version) { sourceMaterialVersion = sourceMaterial.version; material.needsUpdate = true }
    return true
  }
  function refresh() {
    if (disposed) return getStatus()
    if (suspended) { pendingRefresh = true; return getStatus() }
    pendingRefresh = false
    release()
    if (!scene || !settings.enabled) { reason = 'disabled'; return getStatus() }
    const candidates = []
    scene.traverse(object => { if (object.name === SOURCE_NAME && !object.userData?.nanjingUtility) candidates.push(object) })
    source = candidates.length === 1 ? candidates[0] : null
    detail = scene.getObjectByName(DETAIL_NAME); stop = scene.getObjectByName(STOP_NAME)
    if (!source?.isMesh || source.isInstancedMesh || source.material?.name !== SOURCE_MATERIAL || !source.material.isMeshStandardMaterial
      || source.geometry?.attributes.position?.count !== 4880 || source.geometry.index?.count !== 7320
      || detail?.geometry?.attributes.position?.count !== 80 || stop?.geometry?.attributes.position?.count !== 5876
      || stop.geometry.index?.count !== 10140 || source.geometry.groups.length || source.morphTargetInfluences?.length) {
      reason = 'source-layout-mismatch'; return getStatus()
    }
    scene.updateMatrixWorld(true)
    const expected = points(source, [...VERTICES])
    if (expected.some((point, i) => Math.hypot(point.x - EXPECTED_XZ[i][0], point.z - EXPECTED_XZ[i][1]) > 0.0001)) {
      reason = 'source-footprint-edited'; return getStatus()
    }
    sourceGeometry = source.geometry; sourceMaterial = source.material
    const selected = [], index = sourceGeometry.index
    for (let offset = 0; offset < index.count; offset += 3) {
      const triangle = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)]
      if (triangle.every(id => VERTICES.has(id))) selected.push(...triangle)
    }
    if (selected.length !== 12) { reason = 'source-triangles-mismatch'; return getStatus() }
    geometry = new THREE.BufferGeometry()
    for (const [name, attribute] of Object.entries(sourceGeometry.attributes)) {
      if (attribute.isInterleavedBufferAttribute || attribute.isGLBufferAttribute) { release(); reason = 'external-buffer'; return getStatus() }
      const wrapper = new THREE.BufferAttribute(name === 'position' ? attribute.array.slice() : attribute.array, attribute.itemSize, attribute.normalized)
      wrapper.name = attribute.name; wrapper.usage = attribute.usage; wrapper.gpuType = attribute.gpuType
      geometry.setAttribute(name, wrapper)
    }
    // 3945 and 3947 were collapsed to the same far endpoint during source
    // simplification. 3947 is the surviving right edge; reconstruct the left
    // edge using the original near-end width, without touching source data.
    const positions = geometry.attributes.position
    const corrected = new THREE.Vector3().fromBufferAttribute(positions, 3947)
      .sub(new THREE.Vector3().fromBufferAttribute(positions, 3946).sub(new THREE.Vector3().fromBufferAttribute(positions, 3944)))
    positions.setXYZ(3945, corrected.x, corrected.y, corrected.z)
    geometry.setIndex(selected)
    if (settings.version === 2) {
      const aligned = buildAlignedYellowGeometry(source, detail, stop)
      if (!aligned) { release(); reason = 'detailed-alignment-mismatch'; return getStatus() }
      geometry.dispose(); geometry = aligned.geometry; pathStatus = aligned.status
    }
    material = sourceMaterial.clone()
    material.onBeforeCompile = (shader, renderer) => {
      sourceMaterial.onBeforeCompile.call(sourceMaterial, shader, renderer)
      shader.uniforms.nanjingRecoveredPaintStopPlane = plane
      shader.vertexShader = 'varying vec3 vNanjingRecoveredPaintWorld;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvNanjingRecoveredPaintWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = 'varying vec3 vNanjingRecoveredPaintWorld;\nuniform vec4 nanjingRecoveredPaintStopPlane;\n' + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (dot(vNanjingRecoveredPaintWorld, nanjingRecoveredPaintStopPlane.xyz) < nanjingRecoveredPaintStopPlane.w) discard;')
    }
    material.customProgramCacheKey = () => sourceMaterial.customProgramCacheKey() + '|nanjing-recovered-yellow-v' + settings.version
    proxy = new THREE.Mesh(geometry, material)
    proxy.name = '南京道路双黄线恢复（派生绘制）'
    proxy.userData.nanjingUtility = true; proxy.userData.skipEditorTree = true
    proxy.matrixAutoUpdate = false; proxy.matrixWorldAutoUpdate = false; proxy.frustumCulled = false
    proxy.castShadow = false; proxy.raycast = () => {}
    proxy.onBeforeRender = (_renderer, renderScene) => {
      const show = settings.enabled && !suspended && !disposed && renderScene === scene && !scene.overrideMaterial && updatePlacement()
      geometry.setDrawRange(0, show ? geometry.index.count : 0)
    }
    group.add(proxy)
    if (!updatePlacement()) { release(); reason = 'incompatible-current-height'; return getStatus() }
    scene.add(group); reason = null
    onChange?.(getStatus())
    return getStatus()
  }
  function update(patch = {}) {
    if (Object.hasOwn(patch, 'version') && [1, 2].includes(patch.version)) settings.version = patch.version
    if (Object.hasOwn(patch, 'enabled')) settings.enabled = patch.enabled === true
    if (Object.hasOwn(patch, 'version') || Object.hasOwn(patch, 'enabled')) config.roadMarkingRecovery = { ...settings }
    const status = refresh(); onChange?.(status); return status
  }
  function withOriginals(callback) {
    if (disposed) return callback()
    suspended++; group.removeFromParent()
    const finish = () => {
      suspended--
      if (disposed || suspended) return
      if (pendingRefresh) refresh()
      else if (settings.enabled && proxy) scene.add(group)
    }
    try { const result = callback(); if (result && typeof result.then === 'function') return Promise.resolve(result).finally(finish); finish(); return result }
    catch (error) { finish(); throw error }
  }
  function getStatus() { return { ...settings, active: !!proxy && !suspended && !disposed, reason, source: SOURCE_NAME, sourceTriangles: proxy ? 4 : 0,
    extraDrawCalls: proxy ? 1 : 0, derivedEndpointRepairs: proxy ? 1 : 0, verticalDelta, stopPlane: plane.value.toArray(), stopGap: STOP_GAP, alignment: pathStatus, derivedTriangles: geometry ? geometry.index.count / 3 : 0, sourceGeometryChanged: false } }
  function dispose() { if (disposed) return; disposed = true; release(); source = detail = stop = null }
  refresh()
  return { refresh, update, getStatus, withOriginals, withBaseline: withOriginals, dispose }
}

function buildAlignedYellowGeometry(source, detail, stop) {
  const sourcePosition = source.geometry.attributes.position
  const worldPoint = (object, id) => new THREE.Vector3().fromBufferAttribute(object.geometry.attributes.position, id).applyMatrix4(object.matrixWorld)
  const mean = points => points.reduce((result, point) => result.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length)
  const p = id => worldPoint(source, id)
  const upperNear = [40, 41, 50, 51].map(id => worldPoint(detail, id))
  const upperFar = [42, 43, 48, 49].map(id => worldPoint(detail, id))
  // The original detailed upper pair and the four white lane dividers share
  // this axis. Its extrapolation agrees with the stopping-line centre edge.
  const upperA = mean(upperNear), upperB = mean(upperFar)
  if (upperA.distanceTo(new THREE.Vector3(-10.261198323166475, upperA.y, .12548198120409637)) > .0001
    || upperB.distanceTo(new THREE.Vector3(-3.9295498055547053, upperB.y, -9.935448907510025)) > .0001) return null
  const stops = STOP_VERTICES.map(id => worldPoint(stop, id))
  const tangent = stops[2].clone().sub(stops[0]); tangent.set(-tangent.z, 0, tangent.x).normalize()
  if (tangent.dot(p(3947).sub(p(3944))) < 0) tangent.negate()
  const cross = new THREE.Vector3(tangent.z, 0, -tangent.x)
  const startT = Math.max(...stops.map(point => point.dot(tangent))) + STOP_GAP
  const nearT = upperA.dot(tangent), nearQ = upperA.dot(cross)
  const slope = (nearQ - upperB.dot(cross)) / (nearT - upperB.dot(tangent))
  const lineQ = t => nearQ + slope * (t - nearT)
  const nearWidths = [upperNear[1].clone().sub(upperNear[0]).length(), upperNear[2].clone().sub(upperNear[3]).length()]
  const stripeWidth = (nearWidths[0] + nearWidths[1]) / 2
  const separation = mean(upperNear.slice(2)).sub(mean(upperNear.slice(0, 2))).dot(cross)
  // Far joint edges are the existing endpoints. The first left edge alone is
  // reconstructed because the original far source collapsed it to its right.
  const farEdges = [p(3947).sub(p(3946).sub(p(3944))), p(3947), p(3969), p(3971)]
  const farCenter = mean(farEdges), endT = farCenter.dot(tangent), endQ = farCenter.dot(cross)
  const continuation = mean([3949, 3951, 3973, 3975].map(p)).sub(farCenter)
  const endSlope = continuation.dot(cross) / continuation.dot(tangent)
  // The last detailed white dashes (components 868/892) end at t=23.517.
  // Keep the complete marked carriageway straight; transition only beyond it.
  const transitionT = 23.55
  if (!(startT < transitionT && transitionT < endT)) return null
  const length = endT - transitionT, q0 = lineQ(transitionT)
  const pointAt = t => {
    if (t <= transitionT) return { q: lineQ(t), slope, blend: 0 }
    const u = (t - transitionT) / length, u2 = u * u, u3 = u2 * u
    const q = (2 * u3 - 3 * u2 + 1) * q0 + (u3 - 2 * u2 + u) * length * slope
      + (-2 * u3 + 3 * u2) * endQ + (u3 - u2) * length * endSlope
    const derivative = ((6 * u2 - 6 * u) * q0 + (3 * u2 - 4 * u + 1) * length * slope
      + (-6 * u2 + 6 * u) * endQ + (3 * u2 - 2 * u) * length * endSlope) / length
    return { q, slope: derivative, blend: 3 * u2 - 2 * u3 }
  }
  const toWorld = (t, q) => tangent.clone().multiplyScalar(t).addScaledVector(cross, q).setY(p(3944).y)
  const farWidth = (farEdges[1].clone().sub(farEdges[0]).dot(cross) + farEdges[3].clone().sub(farEdges[2]).dot(cross)) / 2
  const farSeparation = mean(farEdges.slice(2)).sub(mean(farEdges.slice(0, 2))).dot(cross)
  const stations = [startT, transitionT, ...Array.from({ length: 24 }, (_, i) => transitionT + length * (i + 1) / 24)]
  const inverse = source.matrixWorld.clone().invert(), attributes = {}, indices = []
  for (const name of Object.keys(source.geometry.attributes)) attributes[name] = []
  const samples = []
  for (let station = 0; station < stations.length; station++) {
    const t = stations[station], { q, slope: derivative, blend } = pointAt(t)
    const width = THREE.MathUtils.lerp(stripeWidth, farWidth, blend), spacing = THREE.MathUtils.lerp(separation, farSeparation, blend)
    const center = toWorld(t, q), direction = tangent.clone().addScaledVector(cross, derivative).normalize()
    const across = new THREE.Vector3(direction.z, 0, -direction.x)
    const offsets = [-spacing / 2 - width / 2, -spacing / 2 + width / 2, spacing / 2 - width / 2, spacing / 2 + width / 2]
    samples.push({ t, q, center: center.toArray(), width, spacing })
    for (let edge = 0; edge < 4; edge++) {
      const point = station === stations.length - 1 ? farEdges[edge].clone() : center.clone().addScaledVector(across, offsets[edge])
      const local = point.applyMatrix4(inverse), u = (t - startT) / (endT - startT)
      const sourceNearId = [3944, 3946, 3968, 3970][edge], sourceFarId = [3945, 3947, 3969, 3971][edge]
      for (const [name, attribute] of Object.entries(source.geometry.attributes)) {
        for (let component = 0; component < attribute.itemSize; component++) attributes[name].push(name === 'position' ? local.getComponent(component)
          : THREE.MathUtils.lerp(attribute.array[sourceNearId * attribute.itemSize + component], attribute.array[sourceFarId * attribute.itemSize + component], u))
      }
    }
    if (station) for (const edge of [0, 2]) {
      const a = (station - 1) * 4 + edge, b = a + 1, c = station * 4 + edge, d = c + 1
      // Source plane normal is upward: follow that winding in XZ.
      indices.push(a, c, b, b, c, d)
    }
  }
  const geometry = new THREE.BufferGeometry()
  for (const [name, values] of Object.entries(attributes)) {
    const original = source.geometry.attributes[name], attribute = new THREE.BufferAttribute(new original.array.constructor(values), original.itemSize, original.normalized)
    attribute.name = original.name; attribute.usage = original.usage; attribute.gpuType = original.gpuType
    geometry.setAttribute(name, attribute)
  }
  geometry.setIndex(indices)
  return { geometry, status: { method: 'detailed-lane-axis-to-original-far-joint', start: samples[0].center, transition: samples[1].center, end: farCenter.toArray(),
    tangent: tangent.toArray(), cross: cross.toArray(), startT, transitionT, endT, slope, endSlope, stripeWidth, separation, samples } }
}
