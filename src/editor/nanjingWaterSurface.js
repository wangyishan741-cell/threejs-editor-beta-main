import { DataTexture, RGBAFormat, UnsignedByteType, RepeatWrapping, LinearFilter, LinearMipmapLinearFilter, NoColorSpace } from 'three'

export const NANJING_WATER_SURFACE_VERSION = 'water-world-ripples-v1'
export const NANJING_WATER_SURFACE_TARGET = Object.freeze({ name: '远景_休闲区域', material: '远景_浅蓝水面', positions: 409, indices: 1023 })
export const NANJING_WATER_SURFACE_DEFAULTS = Object.freeze({ version: 1, enabled: false,
  rippleScale: .65, rippleStrength: .22, metalness: 0, roughness: .27, envMapIntensity: .75, ior: 1.333, specularIntensity: 1 })
export const NANJING_NATURAL_WATER_DEFAULTS = Object.freeze({ ...NANJING_WATER_SURFACE_DEFAULTS,
  style: 'natural-v2', rippleScale: .75, rippleStrength: .12, roughness: .34, envMapIntensity: .45, specularIntensity: .75 })

const EDIT_FIELDS = ['color', 'emissive', 'specularColor', 'sheenColor', 'attenuationColor', 'normalScale', 'clearcoatNormalScale',
  'roughness', 'metalness', 'opacity', 'transparent', 'depthWrite', 'depthTest', 'alphaTest', 'side', 'shadowSide',
  'transmission', 'ior', 'thickness', 'attenuationDistance', 'envMapIntensity', 'emissiveIntensity', 'specularIntensity',
  'clearcoat', 'clearcoatRoughness', 'sheen', 'sheenRoughness', 'iridescence', 'iridescenceIOR', 'iridescenceThicknessRange',
  'anisotropy', 'anisotropyRotation', 'bumpScale', 'aoMapIntensity', 'lightMapIntensity', 'normalMapType',
  'displacementScale', 'displacementBias', 'wireframe', 'toneMapped', 'vertexColors', 'alphaToCoverage', 'visible',
  'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'premultipliedAlpha', 'forceSinglePass',
  'map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap', 'lightMap', 'bumpMap',
  'displacementMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'iridescenceMap', 'iridescenceThicknessMap',
  'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularIntensityMap', 'specularColorMap', 'anisotropyMap', 'envMap']
const FINISH_FIELDS = ['metalness', 'roughness', 'envMapIntensity', 'ior', 'specularIntensity', 'specularColor']
const editValue = value => value?.toArray ? value.toArray() : Array.isArray(value) ? value.slice() : value
const sameEdit = (a, b) => Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => Object.is(v, b[i])) : Object.is(a, b)
const editSnapshot = material => Object.fromEntries(EDIT_FIELDS.filter(key => key in material).map(key => [key, editValue(material[key])]))
const slots = object => (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean)
function copyEdit(target, source, key) {
  if (!(key in target)) return
  if (target[key]?.copy && source[key]?.toArray) target[key].copy(source[key])
  else target[key] = Array.isArray(source[key]) ? source[key].slice() : source[key]
}
function visit(object, callback) {
  if (!object || object.userData?.nanjingUtility || object.userData?.skipEditorTree || object.isHelper || object.isTransformControlsRoot) return
  callback(object)
  for (const child of object.children || []) visit(child, callback)
}
function validateNumber(field, value) {
  const range = field === 'rippleScale' ? [.01, 20] : field === 'envMapIntensity' ? [0, 5] : field === 'ior' ? [1, 2.333] : [0, 1]
  if (!Number.isFinite(value) || value < range[0] || value > range[1]) throw new TypeError(`水面 ${field} 须在 ${range[0]}–${range[1]} 之间`)
  return value
}
export function normalizeNanjingWaterSurface(value) {
  // Missing/unknown versions belong to older history, whose appearance stays intact.
  if (!value || value.version !== 1) return { ...NANJING_WATER_SURFACE_DEFAULTS }
  if (value.style !== undefined && value.style !== 'natural-v2') throw new TypeError('未知的水面样式')
  const result = { ...(value.style === 'natural-v2' ? NANJING_NATURAL_WATER_DEFAULTS : NANJING_WATER_SURFACE_DEFAULTS), enabled: value.enabled === true }
  for (const key of Object.keys(NANJING_WATER_SURFACE_DEFAULTS)) {
    if (key !== 'version' && key !== 'enabled' && value[key] !== undefined) result[key] = validateNumber(key, value[key])
  }
  if (value.materialOverrides !== undefined) {
    if (!value.materialOverrides || typeof value.materialOverrides !== 'object' || Array.isArray(value.materialOverrides)) throw new TypeError('水面材质覆盖须为对象')
    const overrides = {}
    for (const [field, input] of Object.entries(value.materialOverrides)) {
      if (!FINISH_FIELDS.includes(field)) throw new TypeError('水面材质覆盖字段无效')
      if (field === 'specularColor') {
        if (!Array.isArray(input) || input.length !== 3 || !input.every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw new TypeError('水面高光颜色须为三个 0–1 数值')
        overrides[field] = input.slice()
      } else overrides[field] = validateNumber(field, input)
    }
    if (Object.keys(overrides).length) result.materialOverrides = overrides
  }
  return result
}

/** A deterministic, seamless slope field. All Fourier frequencies are integers,
 * so RepeatWrapping has no seams. Mipmaps suppress distant specular shimmer.
 * The texture is created once per controller, never each frame or refresh. */
export function createNanjingWaterRippleTexture(size = 256, style) {
  if (!Number.isInteger(size) || size < 64 || size > 512 || (size & (size - 1))) throw new TypeError('水纹纹理尺寸须为 64–512 内的二次幂')
  if (style === 'natural-v2') return createNaturalRippleTexture(size)
  const modes = [[5, 2], [7, 3], [9, 4], [11, 3], [13, 5], [16, 7], [19, 8], [23, 9],
    [3, -6], [4, -9], [5, -12], [7, -15], [-8, 3], [-12, 5], [15, -3], [21, 4]]
  const data = new Uint8Array(size * size * 4)
  const waves = modes.map(([x, y], i) => ({ x, y, phase: ((i * 2.399963229728653) % (Math.PI * 2)),
    amplitude: (i < 8 ? .72 : .32) / Math.sqrt(x * x + y * y) }))
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let sx = 0, sy = 0
    for (const wave of waves) {
      const a = Math.cos((wave.x * x + wave.y * y) / size * Math.PI * 2 + wave.phase) * wave.amplitude
      sx += wave.x * a; sy += wave.y * a
    }
    sx *= .19; sy *= .19
    const inverse = 1 / Math.sqrt(sx * sx + sy * sy + 1), offset = (y * size + x) * 4
    data[offset] = Math.round((sx * inverse * .5 + .5) * 255)
    data[offset + 1] = Math.round((sy * inverse * .5 + .5) * 255)
    data[offset + 2] = Math.round((inverse * .5 + .5) * 255)
    data[offset + 3] = 255
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  texture.name = '南京水面_运行时微波纹'
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter
  texture.colorSpace = NoColorSpace; texture.generateMipmaps = true; texture.needsUpdate = true
  return texture
}

// A band-limited, spread-direction height spectrum produces broken capillary
// ripples rather than parallel corrugations. Periodic domain warping keeps the
// tile seamless; derivatives of the resulting height keep its normals coherent.
function createNaturalRippleTexture(size) {
  let seed = 0x69ae31
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const tau = Math.PI * 2, waves = []
  for (let i = 0; i < 56; i++) {
    const angle = random() * tau, frequency = 6 + random() * 31
    const x = Math.round(Math.cos(angle) * frequency), y = Math.round(Math.sin(angle) * frequency)
    const direction = .55 + .45 * Math.pow(Math.cos(angle - .6), 2)
    waves.push({ x, y, phase: random() * tau, amplitude: direction / (frequency * Math.sqrt(56)) })
  }
  const heights = new Float32Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size
    const wu = u + .015 * Math.sin(tau * (2 * u + v)) + .009 * Math.sin(tau * (u - 3 * v) + .73)
    const wv = v + .013 * Math.sin(tau * (u - 2 * v) + 1.1) + .007 * Math.sin(tau * (3 * u + v))
    let h = 0
    for (const wave of waves) h += Math.sin(tau * (wave.x * wu + wave.y * wv) + wave.phase) * wave.amplitude
    heights[y * size + x] = h
  }
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = (heights[y * size + (x + 1) % size] - heights[y * size + (x + size - 1) % size]) * size * .045
    const sy = (heights[((y + 1) % size) * size + x] - heights[((y + size - 1) % size) * size + x]) * size * .045
    const inverse = 1 / Math.sqrt(sx * sx + sy * sy + 1), offset = (y * size + x) * 4
    data[offset] = Math.round((sx * inverse * .5 + .5) * 255)
    data[offset + 1] = Math.round((sy * inverse * .5 + .5) * 255)
    data[offset + 2] = Math.round((inverse * .5 + .5) * 255)
    data[offset + 3] = 255
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  texture.name = '南京水面_自然细涟漪_v2'
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter
  texture.colorSpace = NoColorSpace; texture.generateMipmaps = true; texture.needsUpdate = true
  return texture
}

/** Keep the normal map selected by the user, then add two low-amplitude water
 * slope samples in world XZ. No vertex displacement, extra draw, reflection
 * capture, derivatives loop, clock or new transparency/transmission pass. */
export function patchNanjingWaterShader(shader, uniforms) {
  if (shader.uniforms.nanjingWaterRipples) return true
  for (const [source, token] of [[shader.vertexShader, '#include <common>'], [shader.vertexShader, '#include <project_vertex>'],
    [shader.fragmentShader, '#include <common>'], [shader.fragmentShader, '#include <normal_fragment_maps>']]) if (!source.includes(token)) return false
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vNanjingWaterXZ;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvNanjingWaterXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;')
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
    varying vec2 vNanjingWaterXZ;
    uniform sampler2D nanjingWaterRipples;
    uniform float nanjingWaterRippleScale;
    uniform float nanjingWaterRippleStrength;`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
    vec2 nanjingWaterUv = vNanjingWaterXZ * nanjingWaterRippleScale;
    mat2 nanjingWaterRotation = mat2( .8, -.6, .6, .8 );
    vec2 nanjingWaterSlopeA = texture2D( nanjingWaterRipples, nanjingWaterUv ).rg * 2.0 - 1.0;
    vec2 nanjingWaterSlopeB = texture2D( nanjingWaterRipples, nanjingWaterRotation * nanjingWaterUv * 1.83 + vec2( .37, .61 ) ).rg * 2.0 - 1.0;
    vec2 nanjingWaterSlope = ( nanjingWaterSlopeA + .42 * mat2( .8, .6, -.6, .8 ) * nanjingWaterSlopeB ) * nanjingWaterRippleStrength;
    float nanjingWaterUp = inverseTransformDirection( normal, viewMatrix ).y;
    float nanjingWaterFace = nanjingWaterUp < 0.0 ? -1.0 : 1.0;
    // The audited mesh includes 16 vertical edge vertices. Keep its banks flat.
    nanjingWaterSlope *= smoothstep( .65, .95, abs( nanjingWaterUp ) );
    normal = normalize( normal + mat3( viewMatrix ) * vec3( nanjingWaterSlope.x, 0.0, nanjingWaterSlope.y ) * nanjingWaterFace );`)
  Object.assign(shader.uniforms, uniforms)
  return true
}

/** Display-only material on an exact audited source mesh. withOriginals wraps
 * project serialization, so saved GLB geometry/material/image bindings remain
 * the editable originals; config.waterSurface reconstructs this appearance. */
export function createNanjingWaterSurface(editor, config = {}, { onChange } = {}) {
  const scene = editor?.scene
  let settings = normalizeNanjingWaterSurface(config.waterSurface), records = [], disposed = false, suspended = 0, pending = false, skipped = [], activeRestore = null
  const ownedSources = new WeakMap(), sources = new Set()
  let materialEdits = 0, shaderErrors = 0, rippleTexture = null
  const uniforms = { nanjingWaterRipples: { value: null }, nanjingWaterRippleScale: { value: settings.rippleScale }, nanjingWaterRippleStrength: { value: settings.rippleStrength } }
  function saveOverride(field, value) {
    settings.materialOverrides ??= {}
    settings.materialOverrides[field] = editValue(value)
    config.waterSurface = structuredClone(settings)
  }
  function applyValues(row) {
    const before = editSnapshot(row.material), overrides = settings.materialOverrides || {}
    for (const field of EDIT_FIELDS) if (field in row.source) copyEdit(row.material, row.source, field)
    for (const field of FINISH_FIELDS) if (field in row.material) {
      if (field === 'specularColor') row.material.specularColor.fromArray(overrides.specularColor || [1, 1, 1])
      else row.material[field] = overrides[field] ?? settings[field]
    }
    if (EDIT_FIELDS.some(field => !sameEdit(before[field], editValue(row.material[field])))) row.material.needsUpdate = true
    row.sourceValues = editSnapshot(row.source); row.copyValues = editSnapshot(row.material)
  }
  function syncMaterialEdits() {
    if (disposed) return getStatus()
    for (const row of records) {
      const sourceNow = editSnapshot(row.source), copyNow = editSnapshot(row.material)
      for (const field of EDIT_FIELDS) {
        if (!(field in row.source)) continue
        const sourceChanged = !sameEdit(sourceNow[field], row.sourceValues[field]), copyChanged = !sameEdit(copyNow[field], row.copyValues[field])
        // An edit through the source panel wins when both sides changed.
        if (copyChanged && !sourceChanged) { copyEdit(row.source, row.material, field); row.source.needsUpdate = true; materialEdits++ }
        if ((sourceChanged || copyChanged) && FINISH_FIELDS.includes(field)) saveOverride(field, row.source[field])
      }
      applyValues(row)
    }
    return getStatus()
  }
  function restoreMaterials() { for (const row of records) if (row.object.material === row.material) row.object.material = row.source }
  function attachMaterials() { for (const row of records) if (row.object.material === row.source) row.object.material = row.material }
  function syncOwnedMaterialLists() {
    const plans = []
    scene?.traverse(root => {
      const previous = root.RootMaterials
      if (!Array.isArray(previous)) return
      const live = new Set()
      root.traverse(object => { if (object.isMesh) for (const material of slots(object)) live.add(material) })
      const relevant = previous.some(material => ownedSources.has(material) || sources.has(material)) || [...live].some(material => ownedSources.has(material) || sources.has(material))
      if (!relevant) return
      const originalDuplicates = new Set(previous).size !== previous.length, seen = new Set(), next = []
      for (const material of previous) {
        let mapped = material
        const source = ownedSources.get(material)
        if (source && !live.has(material)) mapped = live.has(source) ? source : null
        else if (sources.has(material) && !live.has(material)) mapped = null
        if (!mapped) continue
        if (!originalDuplicates && seen.has(mapped) && (source || sources.has(mapped))) continue
        next.push(mapped); seen.add(mapped)
      }
      for (const material of live) if ((ownedSources.has(material) || sources.has(material)) && !seen.has(material)) { next.push(material); seen.add(material) }
      if (next.length !== previous.length || next.some((material, index) => material !== previous[index])) plans.push({ root, previous, next })
    })
    const applied = []
    try { for (const plan of plans) { plan.root.RootMaterials = plan.next; applied.push(plan) } }
    catch (error) { for (const plan of applied.reverse()) if (plan.root.RootMaterials === plan.next) plan.root.RootMaterials = plan.previous; throw error }
    return () => { for (const { root, previous, next } of plans) if (root.RootMaterials === next) root.RootMaterials = previous }
  }
  function release() {
    restoreMaterials(); syncOwnedMaterialLists()
    for (const row of records) row.material.dispose()
    records = []
  }
  function refresh() {
    if (disposed) return getStatus()
    if (suspended) { pending = true; return getStatus() }
    const hadRecords = records.length > 0
    syncMaterialEdits(); restoreMaterials(); syncOwnedMaterialLists()
    const previous = records
    records = []; skipped = []
    if (settings.enabled && scene) {
      const target = NANJING_WATER_SURFACE_TARGET, candidates = []
      visit(scene, object => { if (object.name === target.name) candidates.push(object) })
      const object = candidates.length === 1 ? candidates[0] : null, source = object?.material
      if (!object?.isMesh || object.isInstancedMesh || object.isBatchedMesh || object.isSkinnedMesh || object.morphTargetInfluences?.length
        || !source?.isMeshStandardMaterial || source.name !== target.material
        || object.geometry?.attributes.position?.count !== target.positions || object.geometry?.index?.count !== target.indices) {
        skipped.push({ name: target.name, reason: '水面源对象、材质或几何版本不匹配' })
      } else {
        let row = previous.find(item => item.object === object && item.source === source)
        if (!row) {
          const material = source.clone()
          row = { object, source, material }
          material.onBeforeCompile = (shader, renderer) => {
            source.onBeforeCompile.call(source, shader, renderer)
            if (!patchNanjingWaterShader(shader, uniforms)) shaderErrors++
          }
          material.customProgramCacheKey = () => source.customProgramCacheKey.call(source) + '|' + NANJING_WATER_SURFACE_VERSION + '|' + (settings.style || 'legacy')
          ownedSources.set(material, source); sources.add(source)
        }
        rippleTexture ??= createNanjingWaterRippleTexture(256, settings.style)
        uniforms.nanjingWaterRipples.value = rippleTexture
        applyValues(row); records.push(row)
      }
      try { attachMaterials(); syncOwnedMaterialLists() }
      catch (error) { release(); throw error }
    }
    for (const row of previous) if (!records.includes(row)) row.material.dispose()
    if (hadRecords || records.length) onChange?.(getStatus())
    return getStatus()
  }
  function update(patch = {}) {
    if (disposed) return getStatus()
    syncMaterialEdits()
    const next = normalizeNanjingWaterSurface({ ...settings, ...patch })
    if (next.style !== settings.style) {
      rippleTexture?.dispose(); rippleTexture = null
      for (const row of records) row.material.needsUpdate = true
    }
    settings = next; config.waterSurface = structuredClone(next)
    uniforms.nanjingWaterRippleScale.value = next.rippleScale; uniforms.nanjingWaterRippleStrength.value = next.rippleStrength
    return refresh()
  }
  function withOriginals(callback) {
    if (disposed) return callback()
    const outer = suspended === 0
    if (outer) syncMaterialEdits()
    suspended++
    let finished = false
    if (outer) {
      restoreMaterials()
      try { activeRestore = syncOwnedMaterialLists() }
      catch (error) { suspended--; attachMaterials(); throw error }
    }
    const finish = () => {
      if (finished) return
      finished = true; suspended--
      if (suspended || disposed) return
      const restore = activeRestore; activeRestore = null
      restore?.()
      if (pending) { pending = false; refresh() }
      else { syncMaterialEdits(); attachMaterials(); syncOwnedMaterialLists() }
    }
    try {
      const value = callback()
      if (value?.then) return Promise.resolve(value).finally(finish)
      finish(); return value
    } catch (error) { finish(); throw error }
  }
  function getStatus() { return { version: 1, active: !disposed && !suspended && records.length > 0, settings: structuredClone(settings), materialEdits,
    objects: records.map(row => row.object.name), materials: records.length, skipped: skipped.slice(), shaderErrors,
    mapping: 'world-XZ', textureSize: rippleTexture?.image?.width || 0, textureBytes: rippleTexture?.image?.data?.byteLength || 0,
    textureSamples: 2, animated: false, extraDrawCalls: 0, extraRenderPasses: 0,
    geometryChanged: false, sourceColorChanged: false, sourceTexturesChanged: false, sourceMaterialsChanged: false } }
  function dispose() {
    if (disposed) return
    syncMaterialEdits(); disposed = true; release(); sources.clear()
    rippleTexture?.dispose(); rippleTexture = null; uniforms.nanjingWaterRipples.value = null
  }
  refresh()
  return { refresh, update, syncMaterialEdits, withOriginals, withBaseline: withOriginals, getStatus, dispose,
    getOriginalMaterial: material => ownedSources.get(material) || material }
}
