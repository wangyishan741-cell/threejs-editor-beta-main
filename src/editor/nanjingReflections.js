import * as THREE from 'three'

const PROJECTION_VARYING = 'vNanjingReflectionWorldPosition'
const PROJECTION_ANCHOR = 'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );'
const PROJECTION_GLSL = /* glsl */`
uniform bool nanjingBoxProjectionEnabled;
uniform vec3 nanjingReflectionBoxMin;
uniform vec3 nanjingReflectionBoxMax;
uniform vec3 nanjingReflectionProbe;
varying vec3 vNanjingReflectionWorldPosition;

vec3 nanjingBoxProjectedDirection( vec3 direction, vec3 position ) {
  float directionLengthSquared = dot( direction, direction );
  if ( ! ( directionLengthSquared > 1e-12 && directionLengthSquared < 1e30 ) ) return vec3( 0.0, 0.0, 1.0 );
  direction *= inversesqrt( directionLengthSquared );
  if ( ! nanjingBoxProjectionEnabled ) return direction;
  if ( any( lessThan( position, nanjingReflectionBoxMin ) ) || any( greaterThan( position, nanjingReflectionBoxMax ) ) ) return direction;
  // A parallel axis contributes no exit, instead of dividing by zero. Inputs
  // are world-space finite vectors; the renderer has already normalized R.
  vec3 exitDistance = vec3( 1e20 );
  if ( direction.x > 1e-6 ) exitDistance.x = ( nanjingReflectionBoxMax.x - position.x ) / direction.x;
  else if ( direction.x < -1e-6 ) exitDistance.x = ( nanjingReflectionBoxMin.x - position.x ) / direction.x;
  if ( direction.y > 1e-6 ) exitDistance.y = ( nanjingReflectionBoxMax.y - position.y ) / direction.y;
  else if ( direction.y < -1e-6 ) exitDistance.y = ( nanjingReflectionBoxMin.y - position.y ) / direction.y;
  if ( direction.z > 1e-6 ) exitDistance.z = ( nanjingReflectionBoxMax.z - position.z ) / direction.z;
  else if ( direction.z < -1e-6 ) exitDistance.z = ( nanjingReflectionBoxMin.z - position.z ) / direction.z;
  float distanceToBox = min( min( exitDistance.x, exitDistance.y ), exitDistance.z );
  if ( distanceToBox < 0.0 || distanceToBox > 1e19 ) return direction;
  vec3 corrected = position + direction * distanceToBox - nanjingReflectionProbe;
  float lengthSquared = dot( corrected, corrected );
  return lengthSquared > 1e-12 && lengthSquared < 1e30 ? corrected * inversesqrt( lengthSquared ) : direction;
}
`

/** CPU reference for the shader's finite, normalized ray/box correction. */
export function nanjingBoxProjectedDirection(direction, position, probe, boxMin, boxMax, target = new THREE.Vector3()) {
  const finite = vector => [vector.x, vector.y, vector.z].every(Number.isFinite)
  target.copy(direction)
  if (!finite(direction) || target.lengthSq() <= 1e-12 || target.lengthSq() >= 1e30) return target.set(0, 0, 1)
  target.normalize()
  if (![position, probe, boxMin, boxMax].every(finite)) return target
  if (['x', 'y', 'z'].some(axis => boxMin[axis] > boxMax[axis] || position[axis] < boxMin[axis] || position[axis] > boxMax[axis])) return target
  let distance = 1e20
  for (const axis of ['x', 'y', 'z']) {
    const component = target[axis]
    if (component > 1e-6) distance = Math.min(distance, (boxMax[axis] - position[axis]) / component)
    else if (component < -1e-6) distance = Math.min(distance, (boxMin[axis] - position[axis]) / component)
  }
  if (distance < 0 || distance > 1e19) return target
  const corrected = position.clone().addScaledVector(target, distance).sub(probe)
  return corrected.lengthSq() > 1e-12 ? target.copy(corrected).normalize() : target
}

/** Apply only the physical specular envmap direction, preserving PMREM cubeUV. */
export function patchNanjingReflectionShader(shader, uniforms) {
  const vertexAnchor = '#include <worldpos_vertex>'
  const fragmentAnchor = '#include <envmap_physical_pars_fragment>'
  if (!shader.vertexShader.includes(vertexAnchor) || !shader.vertexShader.includes('#include <common>')) return false
  let fragment = shader.fragmentShader
  if (fragment.includes(fragmentAnchor)) fragment = fragment.replace(fragmentAnchor, THREE.ShaderChunk.envmap_physical_pars_fragment)
  const functionStart = fragment.indexOf('vec3 getIBLRadiance(')
  const anchorIndex = fragment.indexOf(PROJECTION_ANCHOR, functionStart)
  const nextFunction = fragment.indexOf('vec3 getIBLAnisotropyRadiance(', functionStart)
  if (functionStart < 0 || anchorIndex < 0 || nextFunction >= 0 && anchorIndex > nextFunction || !fragment.includes('#include <common>')) return false
  // Compose after a source callback. Do not replace another callback's existing
  // lighting, tone mapping, diffuse irradiance, or environment rotation logic.
  fragment = fragment.slice(0, anchorIndex) + PROJECTION_ANCHOR
    + `\n reflectVec = nanjingBoxProjectedDirection( reflectVec, ${PROJECTION_VARYING} );`
    + fragment.slice(anchorIndex + PROJECTION_ANCHOR.length)
  shader.fragmentShader = fragment.replace('#include <common>', '#include <common>\n' + PROJECTION_GLSL)
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 ${PROJECTION_VARYING};`)
    .replace(vertexAnchor, vertexAnchor + `\n#ifdef USE_ENVMAP\n${PROJECTION_VARYING} = worldPosition.xyz;\n#endif`)
  Object.assign(shader.uniforms, uniforms)
  return true
}

// A static, local reflection approximation. Capture is explicit: this controller
// installs no frame callbacks, timers, animation loops or change listeners.
export function createNanjingReflectionResources(renderer, size = 512) {
  size = [256, 512, 1024].includes(size) ? size : 512
  const cubeTarget = new THREE.WebGLCubeRenderTarget(size, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, colorSpace: THREE.LinearSRGBColorSpace,
    generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: true, stencilBuffer: false
  })
  const cubeCamera = new THREE.CubeCamera(0.05, 250, cubeTarget)
  const pmrem = new THREE.PMREMGenerator(renderer)
  return { size, cubeTarget, cubeCamera, pmrem, dispose() { cubeTarget.dispose(); pmrem.dispose() } }
}

export function createNanjingReflections(editor, options = {}) {
  const { scene, renderer } = editor
  const size = [256, 512, 1024].includes(options.size) ? options.size : 512
  const targetNames = new Set(options.targetNames ?? ['a1玻璃外墙'])
  const sharedTargetNames = new Set(options.sharedTargetNames ?? [])
  const materialNames = new Set(options.materialNames ?? ['建筑_蓝灰玻璃'])
  // This source object is a1's internal metal structure despite its generic
  // Blender name. At the probe center it blocks all four horizontal directions.
  const excludedNames = new Set(options.excludeNames ?? ['Plane028'])
  const records = [], clones = new Map()
  const cubeTarget = options.resources?.cubeTarget ?? new THREE.WebGLCubeRenderTarget(size, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, colorSpace: THREE.LinearSRGBColorSpace,
    generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: true, stencilBuffer: false
  })
  const cubeCamera = options.resources?.cubeCamera ?? new THREE.CubeCamera(options.near ?? 0.05, options.far ?? 250, cubeTarget)
  const pmrem = options.resources?.pmrem ?? options.pmremGenerator ?? new THREE.PMREMGenerator(renderer)
  const probePosition = new THREE.Vector3()
  let environmentTarget = null, disposed = false, enabled = options.enabled !== false
  let suspended = 0, capturing = false, captures = 0, lastCaptureMs = 0, lastError = null
  let preservedEditedMaterials = 0
  let boxProjectionEnabled = options.boxProjection !== false, projectionShaderPatches = 0, projectionShaderError = null
  const boxMargin = Number.isFinite(options.boxMargin) && options.boxMargin >= 0 ? options.boxMargin : 3
  const projectionBounds = new THREE.Box3()
  const projectionUniforms = {
    nanjingBoxProjectionEnabled: { value: false },
    nanjingReflectionBoxMin: { value: new THREE.Vector3() },
    nanjingReflectionBoxMax: { value: new THREE.Vector3() },
    nanjingReflectionProbe: { value: new THREE.Vector3() },
  }
  const updateProjectionState = () => { projectionUniforms.nanjingBoxProjectionEnabled.value = boxProjectionEnabled && enabled && !disposed && !suspended && !!environmentTarget }

  function materialState(material) {
    const encode = (value, depth = 0) => {
      if (value == null || typeof value !== 'object') return typeof value === 'function' ? undefined : value
      if (value.isTexture) return { texture: value.uuid }
      if (value.toArray) return value.toArray()
      if (depth > 3) return value.constructor?.name
      if (Array.isArray(value)) return value.map(item => encode(item, depth + 1))
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, encode(value[key], depth + 1)]))
    }
    return JSON.stringify(Object.fromEntries(Object.entries(material)
      .filter(([key]) => !['id', 'uuid', 'version', 'envMap', '_listeners'].includes(key))
      .map(([key, value]) => [key, encode(value)])))
  }
  const materialsOf = object => Array.isArray(object.material) ? object.material : [object.material]
  function isTarget(object, names = targetNames) {
    for (let node = object; node && node !== scene; node = node.parent) if (names.has(node.name)) return true
    return false
  }
  function refreshMaterialLists() {
    scene.traverse(root => {
      if (!Array.isArray(root.RootMaterials)) return
      const materials = new Set()
      root.traverse(object => materialsOf(object).filter(Boolean).forEach(material => materials.add(material)))
      root.RootMaterials = [...materials]
    })
  }
  scene.traverse(object => {
    if (!object.isMesh || object.userData?.nanjingUtility || !isTarget(object) && !isTarget(object, sharedTargetNames)) return
    const source = object.material
    let changed = false
    const list = materialsOf(object).map(material => {
      if (!materialNames.has(material?.name) || !material.isMeshStandardMaterial) return material
      if (!clones.has(material)) {
        const clone = material.clone()
        const originalCompile = material.onBeforeCompile
        const originalCacheKey = material.customProgramCacheKey
        function compile(shader, compileRenderer) {
          originalCompile.call(this, shader, compileRenderer)
          if (patchNanjingReflectionShader(shader, projectionUniforms)) projectionShaderPatches++
          else projectionShaderError = '当前材质着色器不兼容视差校正；使用普通静态环境反射'
        }
        // Material's default cache key inspects this.onBeforeCompile. Include
        // the original callback too so distinct source shaders do not collapse
        // to the identical wrapper's program cache entry.
        function cacheKey() { return originalCacheKey.call(this) + '|' + originalCompile.toString() + '|nanjing-box-projection-v1' }
        clone.onBeforeCompile = compile
        clone.customProgramCacheKey = cacheKey
        clones.set(material, { source: material, clone, originalEnvMap: material.envMap,
          originalEnvMapIntensity: material.envMapIntensity, boundEnvMapIntensity: null,
          originalCompile, originalCacheKey, compile, cacheKey, baseline: materialState(clone) })
      }
      changed = true
      return clones.get(material).clone
    })
    if (changed) records.push({ object, source, shared: !isTarget(object), rendered: Array.isArray(source) ? list : list[0] })
  })
  function bind() {
    if (!enabled || disposed || suspended || !environmentTarget) return
    for (const entry of clones.values()) {
      entry.clone.envMap = environmentTarget.texture
      entry.boundEnvMapIntensity = Number.isFinite(scene.environmentIntensity) ? scene.environmentIntensity : 1
      entry.clone.envMapIntensity = entry.boundEnvMapIntensity
      entry.clone.needsUpdate = true
    }
    updateProjectionState()
    for (const record of records) if (record.object.material === record.source || record.object.material === record.rendered) record.object.material = record.rendered
    refreshMaterialLists()
  }
  function withOriginals(callback) {
    if (disposed) return callback()
    suspended++
    updateProjectionState()
    const maps = []
    for (const entry of clones.values()) {
      if (environmentTarget && entry.clone.envMap === environmentTarget.texture) {
        const restoreIntensity = entry.clone.envMapIntensity === entry.boundEnvMapIntensity
        maps.push([entry, entry.clone.envMap, restoreIntensity, entry.clone.envMapIntensity])
        entry.clone.envMap = entry.originalEnvMap
        if (restoreIntensity) entry.clone.envMapIntensity = entry.originalEnvMapIntensity
        entry.clone.needsUpdate = true
      }
    }
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true; suspended--
      updateProjectionState()
      if (disposed || !enabled) return
      for (const [entry, texture, restoreIntensity, intensity] of maps) if (entry.clone.envMap === entry.originalEnvMap) {
        entry.clone.envMap = texture; entry.clone.needsUpdate = true
        if (restoreIntensity && entry.clone.envMapIntensity === entry.originalEnvMapIntensity) entry.clone.envMapIntensity = intensity
      }
    }
    try {
      const result = callback()
      if (result?.then) return Promise.resolve(result).finally(finish)
      finish(); return result
    } catch (error) { finish(); throw error }
  }
  function capture() {
    if (disposed) return null
    for (const camera of cubeCamera.children) {
      const near = options.near ?? 0.05, far = options.far ?? 250
      if (camera.near !== near || camera.far !== far) {
        camera.near = near; camera.far = far; camera.updateProjectionMatrix()
      }
    }
    const hidden = new Map()
    const visibility = object => { if (!hidden.has(object)) hidden.set(object, object.visible); object.visible = false }
    const targets = new Set(records.map(record => record.object))
    const bounds = new THREE.Box3()
    scene.updateMatrixWorld(true)
    // Connected glazing uses this same probe/material, while the validated
    // tower capture center and projection box remain defined by its shell.
    for (const record of records) if (!record.shared) bounds.union(new THREE.Box3().setFromObject(record.object))
    if (options.position) cubeCamera.position.fromArray(options.position)
    else bounds.getCenter(cubeCamera.position)
    probePosition.copy(cubeCamera.position)
    if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray(), ...cubeCamera.position.toArray()].every(Number.isFinite)) throw new Error('局部反射包围盒无效')
    projectionBounds.copy(bounds)
    projectionBounds.min.x -= boxMargin; projectionBounds.min.z -= boxMargin
    projectionBounds.max.x += boxMargin; projectionBounds.max.z += boxMargin
    projectionBounds.min.y = Math.min(bounds.min.y, Number.isFinite(options.groundY) ? options.groundY : bounds.min.y) - 0.05
    projectionBounds.max.y += 0.05
    if (options.bounds?.min && options.bounds?.max) {
      const customBounds = new THREE.Box3(new THREE.Vector3().fromArray(options.bounds.min), new THREE.Vector3().fromArray(options.bounds.max))
      if (customBounds.isEmpty() || ![...customBounds.min.toArray(), ...customBounds.max.toArray()].every(Number.isFinite)) throw new Error('局部反射视差范围无效')
      projectionBounds.copy(customBounds)
    }
    projectionUniforms.nanjingReflectionBoxMin.value.copy(projectionBounds.min)
    projectionUniforms.nanjingReflectionBoxMax.value.copy(projectionBounds.max)
    projectionUniforms.nanjingReflectionProbe.value.copy(cubeCamera.position)
    cubeCamera.layers.mask = options.layersMask ?? editor.camera?.layers?.mask ?? 1
    cubeCamera.updateMatrixWorld(true)
    const previous = {
      target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(),
      viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
      scissorTest: renderer.getScissorTest(), autoClear: renderer.autoClear,
      toneMapping: renderer.toneMapping, xr: renderer.xr.enabled,
      shadowAuto: renderer.shadowMap.autoUpdate, shadowUpdate: renderer.shadowMap.needsUpdate
    }
    const exclude = options.excludeObject ?? (object => /^a1(?:\D|$)/.test(object.name || ''))
    try {
      scene.traverse(object => {
        if (targets.has(object) || excludedNames.has(object.name) || exclude(object) || object.isHelper || object.type?.endsWith('Helper')
          || object.isTransformControlsRoot || object.name === '南京场景选择提示') visibility(object)
      })
      // Callers can sync visible source records into their existing instance
      // batches, or wrap the whole capture with instancing.withOriginals().
      options.syncCaptureVisibility?.()
      renderer.autoClear = true
      renderer.setScissorTest(false)
      renderer.toneMapping = THREE.NoToneMapping
      renderer.shadowMap.autoUpdate = false
      renderer.shadowMap.needsUpdate = false
      cubeCamera.update(renderer, scene)
      return pmrem.fromCubemap(cubeTarget.texture)
    } finally {
      hidden.forEach((visible, object) => { object.visible = visible })
      renderer.toneMapping = previous.toneMapping
      renderer.autoClear = previous.autoClear
      renderer.xr.enabled = previous.xr
      renderer.shadowMap.autoUpdate = previous.shadowAuto
      renderer.shadowMap.needsUpdate = previous.shadowUpdate
      renderer.setViewport(previous.viewport)
      renderer.setScissor(previous.scissor)
      renderer.setScissorTest(previous.scissorTest)
      // Target-owned viewport/scissor are physical pixels. Restore the default
      // logical canvas values first, then let an active target restore its own.
      renderer.setRenderTarget(previous.target, previous.face, previous.mip)
      options.syncCaptureVisibility?.()
    }
  }
  async function update() {
    if (disposed || capturing || suspended) return getStatus()
    if (!records.length) {
      lastError = '未找到 a1 玻璃外墙，无法生成局部反射'
      return getStatus()
    }
    // The real sources may have layers.test suppressed by render-only instances.
    // Never silently capture a scene with stale self-building proxies.
    let hasInstances = false
    scene.traverse(object => { if (object.userData?.nanjingInstancing && object.isGroup && object.visible) hasInstances = true })
    if (hasInstances && !options.withCaptureScene && !options.syncCaptureVisibility) throw new Error('局部反射捕获需要 withCaptureScene 或 syncCaptureVisibility 同步实例层')
    if (renderer.extensions?.has && !renderer.extensions.has('EXT_color_buffer_float') && !renderer.extensions.has('EXT_color_buffer_half_float')) throw new Error('当前 WebGL 不支持 HDR 半浮点反射目标')
    capturing = true; lastError = null
    const started = globalThis.performance?.now() ?? Date.now()
    let nextTarget = null
    try {
      options.beforeCapture?.()
      // Removing every local envMap during capture prevents self-feedback and
      // makes repeated manual captures stable. Other materials keep the sky IBL.
      nextTarget = await withOriginals(() => options.withCaptureScene ? options.withCaptureScene(capture) : capture())
      if (disposed) { nextTarget?.dispose(); return getStatus() }
      const previousTarget = environmentTarget
      environmentTarget = nextTarget
      bind()
      previousTarget?.dispose()
      captures++
      lastCaptureMs = (globalThis.performance?.now() ?? Date.now()) - started
      const status = { ...getStatus(), capturing: false }
      options.onChange?.(status)
      return status
    } catch (error) {
      lastError = error.message
      if (nextTarget && nextTarget !== environmentTarget) nextTarget.dispose()
      throw error
    } finally { capturing = false }
  }
  function setEnabled(value) {
    enabled = !!value
    if (enabled) bind()
    else for (const entry of clones.values()) if (environmentTarget && entry.clone.envMap === environmentTarget.texture) {
      entry.clone.envMap = entry.originalEnvMap; entry.clone.needsUpdate = true
      if (entry.clone.envMapIntensity === entry.boundEnvMapIntensity) entry.clone.envMapIntensity = entry.originalEnvMapIntensity
    }
    updateProjectionState()
    options.onChange?.(getStatus())
  }
  function setBoxProjection(value) {
    boxProjectionEnabled = !!value
    updateProjectionState()
    options.onChange?.(getStatus())
  }
  function getStatus() {
    return { enabled, ready: !!environmentTarget && !disposed, capturing, captures, size,
      objects: records.length, materials: clones.size, position: probePosition.toArray(),
      sharedObjects: records.filter(record => record.shared).map(record => record.object.name),
      lastCaptureMs, lastError, preservedEditedMaterials,
      boxProjection: boxProjectionEnabled, boxProjectionApproximate: true, boxMargin,
      bounds: projectionBounds.isEmpty() ? null : { min: projectionBounds.min.toArray(), max: projectionBounds.max.toArray() },
      projectionShaderPatches, projectionShaderError }
  }
  function dispose() {
    if (disposed) return
    disposed = true; enabled = false
    updateProjectionState()
    const replacement = new Map()
    for (const entry of clones.values()) {
      const customEnvironment = entry.clone.envMap !== entry.originalEnvMap && entry.clone.envMap !== environmentTarget?.texture
      if (entry.clone.envMap === environmentTarget?.texture) entry.clone.envMap = entry.originalEnvMap
      if (entry.clone.envMapIntensity === entry.boundEnvMapIntensity) entry.clone.envMapIntensity = entry.originalEnvMapIntensity
      const editedCallbacks = entry.clone.onBeforeCompile !== entry.compile || entry.clone.customProgramCacheKey !== entry.cacheKey
      if (entry.clone.onBeforeCompile === entry.compile) entry.clone.onBeforeCompile = entry.originalCompile
      if (entry.clone.customProgramCacheKey === entry.cacheKey) entry.clone.customProgramCacheKey = entry.originalCacheKey
      entry.clone.needsUpdate = true
      const edited = customEnvironment || editedCallbacks || materialState(entry.clone) !== entry.baseline
      replacement.set(entry.clone, edited ? entry.clone : entry.source)
      if (edited) preservedEditedMaterials++
    }
    for (const record of records) {
      if (record.object.material !== record.rendered) continue
      const materials = materialsOf(record.object).map(material => replacement.get(material) ?? material)
      record.object.material = Array.isArray(record.rendered) ? materials : materials[0]
    }
    refreshMaterialLists()
    for (const entry of clones.values()) if (replacement.get(entry.clone) !== entry.clone) entry.clone.dispose()
    environmentTarget?.dispose()
    if (!options.resources) cubeTarget.dispose()
    if (!options.resources && !options.pmremGenerator) pmrem.dispose()
    environmentTarget = null
  }
  return { update, withOriginals, setEnabled, setBoxProjection, getStatus, dispose }
}

/** Four independent probes, one retained capture camera/target/generator. */
export function createNanjingBuildingReflections(editor, options = {}) {
  const resources = options.resources ?? createNanjingReflectionResources(editor.renderer, options.size ?? 512)
  const definitions = [{ id: 'a1', targetNames: ['a1玻璃外墙'], materialNames: ['建筑_蓝灰玻璃'] }]
  if (options.facades) {
    definitions.push(
      { id: 'a2', targetNames: ['a2玻璃层'], materialNames: ['建筑_a2外层介电玻璃'], excludeNames: [] },
      { id: 'a3', targetNames: ['a3玻璃外层'], materialNames: ['建筑_a3外层介电玻璃'], excludeNames: ['a3&a4外层镂空'] },
      { id: 'a4', targetNames: ['a4玻璃外层'], sharedTargetNames: ['a3&a4连廊玻璃外层'], materialNames: ['建筑_a4外层介电玻璃'], excludeNames: ['a3&a4外层镂空'] }
    )
  }
  const controllers = []
  let disposed = false, capturing = false
  const withOriginals = callback => controllers.reduceRight((next, entry) => () => entry.controller.withOriginals(next), callback)()
  const withFacadeOriginals = callback => controllers.filter(entry => entry.id !== 'a1')
    .reduceRight((next, entry) => () => entry.controller.withOriginals(next), callback)()
  try {
    for (const definition of definitions) {
      const selfPattern = new RegExp(`^${definition.id}(?:\\D|$)`)
      const excludeObject = definition.id === 'a1' ? undefined : object => {
        for (let node = object; node && node !== editor.scene; node = node.parent) if (selfPattern.test(node.name || '')) return true
        return false
      }
      const controller = createNanjingReflections(editor, { ...options, ...definition, resources, excludeObject,
        withCaptureScene: capture => withOriginals(() => options.withCaptureScene ? options.withCaptureScene(capture) : capture()) })
      controllers.push({ id: definition.id, controller })
    }
  } catch (error) {
    controllers.forEach(entry => entry.controller.dispose())
    if (!options.resources) resources.dispose()
    throw error
  }
  function getStatus() {
    const buildings = controllers.map(entry => ({ id: entry.id, ...entry.controller.getStatus() }))
    return { ...buildings[0], buildings, capturing, sharedCaptureResources: true,
      ready: !disposed && buildings.length > 0 && buildings.every(building => building.ready),
      lastError: buildings.find(building => building.lastError)?.lastError ?? null,
      perFrameCaptures: 0 }
  }
  async function update() {
    if (disposed || capturing) return getStatus()
    capturing = true
    try {
      for (const entry of controllers) {
        if (disposed) break
        await entry.controller.update()
      }
    } finally { capturing = false }
    return getStatus()
  }
  return { update, withOriginals, withFacadeOriginals, getStatus,
    setEnabled: value => controllers.forEach(entry => entry.controller.setEnabled(value)),
    setBoxProjection: value => controllers.forEach(entry => entry.controller.setBoxProjection(value)),
    dispose() {
      if (disposed) return
      disposed = true
      controllers.forEach(entry => entry.controller.dispose())
      if (!options.resources) resources.dispose()
    }
  }
}
