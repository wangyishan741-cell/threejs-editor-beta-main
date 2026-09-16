import { MathUtils } from 'three'

// The hash identifies the actual patch; the UUID identifies its uniform owner.
// A module counter alone can collide after HMR while an old renderer survives.
export function createNanjingShadowProgramKey(shaderSource) {
  let hash = 2166136261
  for (let index = 0; index < shaderSource.length; index++) hash = Math.imul(hash ^ shaderSource.charCodeAt(index), 16777619)
  return `nanjing-height-groups-${(hash >>> 0).toString(16)}-${MathUtils.generateUUID()}`
}

// Explicit diagnostics only. gl.getUniform reads the last uploaded values of a
// program; it does not imply that every material using that program was visible.
export function inspectNanjingShadowBindings(renderer, materials) {
  const gl = renderer.getContext?.()
  const programs = new Map(), records = []
  for (const material of new Set(materials)) {
    const properties = renderer.properties?.get(material), program = properties?.currentProgram
    const uniforms = properties?.uniforms
    const record = { material: material.name, materialId: material.id, materialUuid: material.uuid,
      programId: program?.id ?? null, compiled: !!program,
      js: Object.fromEntries(['nanjingLayerReady', 'nanjingLayerStrength', 'nanjingLayerExposure'].map(name => [name, uniforms?.[name]?.value ?? null])) }
    records.push(record)
    if (!program || programs.has(program)) continue
    const binding = { programId: program.id, cacheKeySuffix: String(program.cacheKey ?? '').slice(-140),
      linked: null, uniforms: {}, activeLayerUniforms: [], error: null }
    programs.set(program, binding)
    if (!gl?.getProgramParameter || !gl?.getUniform) { binding.error = '当前渲染器不支持 GPU uniform 读取'; continue }
    try {
      binding.linked = !!gl.getProgramParameter(program.program, gl.LINK_STATUS)
      if (!binding.linked) continue
      const count = gl.getProgramParameter(program.program, gl.ACTIVE_UNIFORMS)
      for (let index = 0; index < count; index++) {
        const uniform = gl.getActiveUniform(program.program, index)
        if (!uniform?.name.startsWith('nanjingLayer')) continue
        binding.activeLayerUniforms.push(uniform.name)
        if (!/^(?:nanjingLayer(?:Ready|Strength|Exposure|Reversed|HighDepth|LowDepth))$/.test(uniform.name)) continue
        const value = gl.getUniform(program.program, gl.getUniformLocation(program.program, uniform.name))
        binding.uniforms[uniform.name] = ArrayBuffer.isView(value) ? Array.from(value) : value
      }
    } catch (error) { binding.error = error.message || String(error) }
  }
  return { materials: records, programs: [...programs.values()], meaning: 'GPU values last uploaded to each compiled program; read only when inspection is requested.' }
}

// Private draw-time materials leave editable/serialized material slots intact.
// High/low shadow intersection is shared by all receivers. Most source
// materials use one clone; an explicit per-object patch key can isolate one
// facade when another building shares its material.
const excludedKeys = new Set(['id', 'uuid', 'type', 'version', 'userData', '_listeners',
  'onBeforeCompile', 'customProgramCacheKey', 'onBeforeRender', 'onBuild'])
const uniformKeys = new Set(['name', 'color', 'roughness', 'metalness', 'opacity', 'emissive',
  'emissiveIntensity', 'envMapIntensity', 'envMapRotation', 'lightMapIntensity', 'aoMapIntensity',
  'bumpScale', 'normalScale', 'displacementScale', 'displacementBias', 'ior', 'reflectivity',
  'anisotropyRotation', 'clearcoatRoughness', 'clearcoatNormalScale', 'iridescenceIOR',
  'iridescenceThicknessRange', 'sheenColor', 'sheenRoughness', 'thickness',
  'attenuationDistance', 'attenuationColor', 'specularIntensity', 'specularColor', 'blendColor',
  'blendAlpha', 'wireframeLinewidth', 'polygonOffsetFactor', 'polygonOffsetUnits'])

function isReceiver(object, additionalReceiver = false) {
  if (!object?.isMesh || (!object.receiveShadow && !additionalReceiver)) return false
  // The caller supplies an audited exact-surface predicate for extra static
  // receivers. Ancestor utility exclusions below still apply.
  let matched = additionalReceiver === true
  for (let node = object; node; node = node.parent) {
    if (node.userData?.nanjingUtility) return false
    if (/^a[1-4]/.test(node.name) || /^场地区块_近景建筑群_\d+$/.test(node.name)
      || /^(?:地下停车设施_地下停车场入口|停车设施_停车场入口栏杆_|园区门牌_)/.test(node.name)) matched = true
  }
  return matched
}

function valueObject(value) {
  return value && (value.isColor || value.isVector2 || value.isVector3 || value.isVector4
    || value.isEuler || value.isQuaternion || value.isMatrix3 || value.isMatrix4 || value.isPlane)
}

function sameValue(a, b) {
  if (Object.is(a, b)) return true
  if (valueObject(a) && valueObject(b) && a.constructor === b.constructor) return a.equals(b)
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => sameValue(value, b[index]))
  return false
}

function copyValue(value) {
  if (valueObject(value)) return value.clone()
  if (Array.isArray(value)) return value.map(copyValue)
  return value // Texture resources are shared; this module never disposes them.
}

export function createNanjingShadowReceivers(editor, { patchShader, getPatchKey = () => '', beforeDraw, onChange, isEnabled = () => true, isAdditionalReceiver = () => false } = {}) {
  const renderer = editor.renderer, scene = editor.scene
  const original = renderer.renderBufferDirect
  const descriptor = Object.getOwnPropertyDescriptor(renderer, 'renderBufferDirect')
  const unsupported = typeof original !== 'function' ? '当前渲染器不支持独立建筑阴影接收层'
    : typeof patchShader !== 'function' ? '建筑阴影接收层接口不可用' : null
  const programScope = createNanjingShadowProgramKey(String(patchShader))
  const sources = new Map()
  const counters = { draws: 0, syncs: 0, compiled: 0, errors: 0 }
  let disposed = false, lastError = null

  function getStatus() {
    const materials = [...sources.values()].reduce((sum, record) => sum + record.clones.size, 0)
    return { enabled: !disposed && !unsupported && !!isEnabled(), sourceMaterials: sources.size,
      materials, clones: materials, ...counters, error: lastError, unsupported, disposed, programScope }
  }
  function notify() { onChange?.(getStatus()) }
  function report(error) {
    counters.errors++
    lastError = error instanceof Error ? error.message : String(error)
    notify()
  }
  function release(record) {
    record.source.removeEventListener('dispose', record.dispose)
    sources.delete(record.source)
    for (const entry of record.clones.values()) entry.material.dispose()
    record.clones.clear()
  }
  function sourceRecord(source) {
    let record = sources.get(source)
    if (record) return record
    record = { source, clones: new Map(), keys: [], version: -1 }
    record.dispose = () => { release(record); notify() }
    source.addEventListener('dispose', record.dispose)
    sources.set(source, record)
    return record
  }
  function sync(entry, record) {
    const source = record.source, material = entry.material
    if (record.version !== source.version) {
      record.keys = Object.keys(source).filter(key => !excludedKeys.has(key) && !key.startsWith('is')
        && typeof source[key] !== 'function')
      record.version = source.version
    }
    let changed = false, programChanged = entry.version !== source.version
    for (const originalKey of record.keys) {
      // Physical material feature setters update Three's program version when
      // a feature is enabled or disabled. Do not bypass them via _transmission.
      const key = originalKey.startsWith('_') && originalKey.slice(1) in source ? originalKey.slice(1) : originalKey
      const value = source[key], current = material[key]
      if (key === 'defines') {
        const keys = Object.keys(value ?? {})
        if (keys.length !== Object.keys(current ?? {}).length || keys.some(name => !Object.is(value[name], current?.[name]))) {
          material.defines = { ...value }; changed = true; programChanged = true
        }
      } else if (!sameValue(current, value)) {
        if (valueObject(current) && valueObject(value) && current.constructor === value.constructor) current.copy(value)
        else material[key] = copyValue(value)
        changed = true
        if (!uniformKeys.has(key)) programChanged = true
      }
    }
    const cacheKey = source.customProgramCacheKey() + '|' + entry.patchKey
    if (entry.compile !== source.onBeforeCompile || entry.cacheFunction !== source.customProgramCacheKey || entry.cacheKey !== cacheKey) {
      entry.compile = source.onBeforeCompile
      entry.cacheFunction = source.customProgramCacheKey
      entry.cacheKey = cacheKey
      programChanged = true
    }
    entry.version = source.version
    if (programChanged) material.needsUpdate = true
    if (changed || programChanged) counters.syncs++
  }
  function cloneFor(source, object) {
    const record = sourceRecord(source)
    const patchKey = String(getPatchKey(source, object))
    let entry = record.clones.get(patchKey)
    if (!entry) {
      const material = source.clone()
      entry = { material, object, patchKey, version: -1, cacheKey: null }
      material.onBeforeCompile = (shader, compileRenderer) => {
        // Keep source hooks (normal-map repairs, material extensions, etc.) in
        // their original context. The receiver patch only touches this clone.
        source.onBeforeCompile.call(source, shader, compileRenderer)
        const vertex = shader.vertexShader, fragment = shader.fragmentShader, uniforms = { ...shader.uniforms }
        try {
          if (patchShader(shader, source, entry.object) === false) throw new Error('接收材质着色器不兼容，保留原材质效果')
          counters.compiled++
        } catch (error) {
          shader.vertexShader = vertex; shader.fragmentShader = fragment; shader.uniforms = uniforms
          report(error)
        }
      }
      material.customProgramCacheKey = () => String(entry.cacheKey) + '|' + programScope
      record.clones.set(patchKey, entry)
      sync(entry, record)
      notify()
    } else { entry.object = object; sync(entry, record) }
    return entry.material
  }
  function renderBufferDirect(camera, renderScene, geometry, material, object, group) {
    let drawMaterial = material
    // WebGLShadowMap passes scene=null. Override/depth passes and render-only
    // utility proxies are also excluded; they keep the original draw behavior.
    if (!disposed && renderScene === scene && !scene.overrideMaterial
      && material?.isMeshStandardMaterial && isReceiver(object, isAdditionalReceiver(material, object)) && isEnabled()) {
      try {
        beforeDraw?.(material, object, camera)
        drawMaterial = cloneFor(material, object)
        counters.draws++
      } catch (error) { report(error) }
    }
    // Do not catch and repeat renderer failures: that could draw an object twice.
    return original.call(this, camera, renderScene, geometry, drawMaterial, object, group)
  }
  function dispose() {
    if (disposed) return
    disposed = true
    for (const record of [...sources.values()]) release(record)
    if (renderer.renderBufferDirect === renderBufferDirect) {
      if (descriptor) Object.defineProperty(renderer, 'renderBufferDirect', descriptor)
      else delete renderer.renderBufferDirect
    }
  }
  // This optional layer must never prevent the existing main shadows from
  // starting on a different renderer (or a lightweight non-WebGL test fixture).
  if (!unsupported) renderer.renderBufferDirect = renderBufferDirect
  return { getStatus, dispose, inspectBindings: () => inspectNanjingShadowBindings(renderer,
    [...sources.values()].flatMap(record => [...record.clones.values()].map(entry => entry.material))) }
}
