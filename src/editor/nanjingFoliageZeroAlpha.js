import * as THREE from 'three'

const MATERIAL = 'Material_25'
const MARKER = '// nanjing-foliage-exact-zero-alpha-v1'
const ANCHOR = '#include <alphahash_fragment>'
const TAIL_CHUNKS = new Set(['roughnessmap_fragment', 'metalnessmap_fragment', 'normal_fragment_begin', 'normal_fragment_maps',
  'clearcoat_normal_fragment_begin', 'clearcoat_normal_fragment_maps', 'emissivemap_fragment', 'lights_physical_fragment',
  'lights_fragment_begin', 'lights_fragment_maps', 'lights_fragment_end', 'aomap_fragment', 'transmission_fragment',
  'opaque_fragment', 'tonemapping_fragment', 'colorspace_fragment', 'fog_fragment', 'premultiplied_alpha_fragment', 'dithering_fragment'])

// These are checked at the actual color draw, not only when the shader compiles.
// Alpha zero must have no color, depth or stencil effect in the original pass.
export function isNanjingFoliageZeroAlphaSafe(material) {
  return material?.name === MATERIAL && material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial
    && material.transparent === true && material.depthWrite === false && material.stencilWrite === false
    && material.blending === THREE.NormalBlending && !material.transmission && !material.alphaHash
    && !material.alphaToCoverage && !material.premultipliedAlpha
}

export function patchNanjingFoliageZeroAlphaShader(shader) {
  const source = shader?.fragmentShader
  if (typeof source !== 'string' || !source.includes('#define STANDARD')) return false
  if (source.includes(MARKER)) return true
  const anchor = source.indexOf(ANCHOR)
  const map = source.indexOf('#include <map_fragment>'), alphaMap = source.indexOf('#include <alphamap_fragment>')
  const alphaTest = source.indexOf('#include <alphatest_fragment>')
  if (map < 0 || alphaMap <= map || alphaTest <= alphaMap || anchor <= alphaTest
    || source.indexOf(ANCHOR, anchor + ANCHOR.length) >= 0) return false
  const tail = source.slice(anchor + ANCHOR.length)
  // A custom hook that changes final alpha or substitutes unfamiliar chunks is
  // left untouched. Normal lighting/RGB hooks still run in their original order.
  if (/\b(?:diffuseColor|gl_FragColor)\b/.test(tail)) return false
  for (const match of tail.matchAll(/#include\s*<([^>]+)>/g)) if (!TAIL_CHUNKS.has(match[1])) return false
  if (!tail.includes('#include <opaque_fragment>') || !tail.includes('#include <lights_fragment_begin>')) return false
  shader.fragmentShader = source.replace(ANCHOR,
    `${ANCHOR}\n${MARKER}\nif ( diffuseColor.a == 0.0 ) discard;`)
  return true
}

// A display-only shader optimization. Source material values, maps, texture
// alpha, object callbacks, geometry and shadow materials are never changed.
export function createNanjingFoliageZeroAlpha(editor, options = {}) {
  const renderer = editor.renderer, scene = editor.scene
  const originalDraw = renderer?.renderBufferDirect
  const drawDescriptor = renderer && Object.getOwnPropertyDescriptor(renderer, 'renderBufferDirect')
  const records = new Map(), scope = THREE.MathUtils.generateUUID()
  let enabled = options.enabled !== false, suspended = 0, disposed = false, compiled = 0, rejectedShaders = 0, guardedDraws = 0
  const unsupported = typeof originalDraw !== 'function' ? '当前渲染器不支持叶片片元优化' : null

  function detach(material, record) {
    record.active = false
    if (material.onBeforeCompile === record.compile) material.onBeforeCompile = record.originalCompile
    if (material.customProgramCacheKey === record.cacheKey) material.customProgramCacheKey = record.originalCacheKey
    material.needsUpdate = true
  }
  function install(material) {
    const record = { originalCompile: material.onBeforeCompile, originalCacheKey: material.customProgramCacheKey, active: true,
      feature: enabled && isNanjingFoliageZeroAlphaSafe(material) }
    record.compile = function(shader, compileRenderer) {
      record.originalCompile.call(this, shader, compileRenderer)
      if (!record.active || !record.feature || disposed || suspended || !isNanjingFoliageZeroAlphaSafe(this)) return
      if (patchNanjingFoliageZeroAlphaShader(shader)) compiled++
      else rejectedShaders++
    }
    record.cacheKey = function() {
      const base = record.originalCacheKey.call(this)
      return record.active && !disposed && !suspended ? `${base}|${record.originalCompile.toString()}|foliage-zero-alpha-v1|${scope}|${+record.feature}` : base
    }
    material.onBeforeCompile = record.compile; material.customProgramCacheKey = record.cacheKey
    material.needsUpdate = true
    records.set(material, record)
  }
  function refresh() {
    if (disposed || suspended || unsupported) return
    const materials = new Set()
    scene.traverse(object => {
      if (!object.isMesh || object.userData?.nanjingUtility) return
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material?.name === MATERIAL && material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) materials.add(material)
      }
    })
    for (const [material, record] of records) {
      if (!materials.has(material) || !record.active || material.onBeforeCompile !== record.compile || material.customProgramCacheKey !== record.cacheKey) {
        detach(material, record); records.delete(material)
      }
    }
    for (const material of materials) {
      if (!records.has(material)) install(material)
      const record = records.get(material), feature = enabled && isNanjingFoliageZeroAlphaSafe(material)
      if (record.feature !== feature) { record.feature = feature; material.needsUpdate = true }
    }
  }
  function draw(camera, drawScene, geometry, material, object, group) {
    const record = records.get(material)
    const active = !disposed && !suspended && enabled && !!record && isNanjingFoliageZeroAlphaSafe(material)
    // StandardMaterial uniforms do not upload on every draw. A distinct cached
    // program variant reliably honors live depth/blending edits even when two
    // consecutive objects share the same material and no GUI refresh fires.
    if (record && record.feature !== active) { record.feature = active; material.needsUpdate = true }
    if (active) guardedDraws++
    return originalDraw.call(this, camera, drawScene, geometry, material, object, group)
  }
  function setEnabled(value) {
    enabled = !!value
    for (const [material, record] of records) {
      const feature = enabled && !suspended && !disposed && isNanjingFoliageZeroAlphaSafe(material)
      if (record.feature !== feature) { record.feature = feature; material.needsUpdate = true }
    }
    options.onChange?.(); return enabled
  }
  function withOriginals(callback) {
    if (disposed) return callback()
    suspended++
    if (suspended === 1) for (const [material, record] of records) detach(material, record)
    let finished = false
    const finish = () => { if (finished) return; finished = true; suspended--; if (!suspended && !disposed) refresh() }
    try { const value = callback(); if (value?.then) return Promise.resolve(value).finally(finish); finish(); return value }
    catch (error) { finish(); throw error }
  }
  function dispose() {
    if (disposed) return
    disposed = true
    for (const [material, record] of records) detach(material, record)
    records.clear()
    if (renderer?.renderBufferDirect === draw) {
      if (drawDescriptor) Object.defineProperty(renderer, 'renderBufferDirect', drawDescriptor)
      else delete renderer.renderBufferDirect
    }
  }
  function getStatus() { return { configuredEnabled: enabled, enabled: enabled && !disposed && !suspended && !unsupported, materials: records.size,
    safeMaterials: [...records.keys()].filter(isNanjingFoliageZeroAlphaSafe).length, compiled, rejectedShaders, guardedDraws,
    threshold: 0, strategy: 'discard-exact-zero-alpha-only', unsupported, disposed } }
  if (!unsupported) { renderer.renderBufferDirect = draw; refresh() }
  return { refresh, setEnabled, withOriginals, dispose, getStatus }
}
