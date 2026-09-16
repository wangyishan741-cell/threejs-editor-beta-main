export const NANJING_FACADE_GLAZING_NAME = '建筑_a2外层介电玻璃'
const VERSION = 2
const SOURCE_KEY = 'nanjingFacadeGlazingSource'
const SCALAR_FIELDS = ['metalness', 'ior', 'transmission', 'roughness', 'opacity', 'transparent', 'depthWrite', 'sheen']
export const NANJING_FACADE_GLAZING_DEFAULTS = Object.freeze({
  metalness: 0.1329304724931717, ior: 1.5, transmission: 0.75, roughness: 0.04,
  // These three shells have a window photograph; A1 has no base-color map.
  // The photo's median linear RGB is [.1981, .2789, .3712]. Multiplying by
  // this tint approaches A1's [.12, .2, .34] without tinting the photo twice.
  color: Object.freeze([0.606, 0.717, 0.916]), opacity: 1, transparent: false, depthWrite: true, sheen: 0
})
const LEGACY_DEFAULTS = Object.freeze({ ...NANJING_FACADE_GLAZING_DEFAULTS,
  metalness: 0, color: Object.freeze([0.12, 0.2, 0.34]) })
// Verified against this GLB and its connected Principled BSDF. This fallback is
// used only for an imported coating alias missing the saved source descriptor.
const MIRROR_SOURCE = Object.freeze({
  metalness: 1, ior: 1.5, transmission: 1, roughness: 0,
  color: Object.freeze([1, 1, 1]), opacity: 1, transparent: false, depthWrite: true, sheen: 0
})
const LOW_ROUGHNESS_SOURCE = Object.freeze({ ...MIRROR_SOURCE,
  metalness: 0.49546825885772705, roughness: 0.10876133292913437 })
export const NANJING_FACADE_GLAZING_TARGETS = Object.freeze([
  Object.freeze({ objectName: 'a2玻璃层', sourceName: '建筑_镜面玻璃', materialName: NANJING_FACADE_GLAZING_NAME, sourceDefaults: MIRROR_SOURCE }),
  Object.freeze({ objectName: 'a3玻璃外层', sourceName: '建筑_低粗糙玻璃', materialName: '建筑_a3外层介电玻璃', sourceDefaults: LOW_ROUGHNESS_SOURCE }),
  Object.freeze({ objectName: 'a4玻璃外层', sourceName: '建筑_低粗糙玻璃', materialName: '建筑_a4外层介电玻璃', sourceDefaults: LOW_ROUGHNESS_SOURCE }),
])
export const NANJING_FACADE_GLAZING_SHARED_TARGETS = Object.freeze([
  Object.freeze({ objectName: 'a3&a4连廊玻璃外层', sharedObjectName: 'a4玻璃外层',
    sourceName: '建筑_低粗糙玻璃', materialName: '建筑_a4外层介电玻璃' })
])

// The actual bridge and A3/A4 share one source material and texture. It only
// missed the shell preset because its object name was absent from the targets.
// Reuse the nearest shell's material identity instead of another saved alias.
function shareConnectedGlazing(editor, mode) {
  const objects = [], errors = []
  for (const target of NANJING_FACADE_GLAZING_SHARED_TARGETS) {
    const shells = [], connected = []
    const visit = object => {
      if (!object || object.userData?.nanjingUtility || object.isHelper || object.isTransformControlsRoot || object.type?.endsWith('Helper')) return
      if (object.isMesh && object.name === target.sharedObjectName) shells.push(object)
      if (object.isMesh && object.name === target.objectName) connected.push(object)
      for (const child of object.children || []) visit(child)
    }
    visit(editor.scene)
    if (!connected.length) continue
    if (shells.length !== 1 || connected.length !== 1) { errors.push(`连廊及相邻幕墙须唯一：${target.objectName}`); continue }
    const material = shells[0].material, previous = connected[0].material
    const expected = mode === 'source' ? target.sourceName : target.materialName
    if (!material?.isMeshPhysicalMaterial || material.name !== expected
      || !previous?.isMeshPhysicalMaterial || ![target.sourceName, target.materialName].includes(previous.name)) continue
    if (previous !== material) { connected[0].material = material; objects.push(target.objectName) }
  }
  return { sharedObjects: objects, sharedMaterialErrors: errors }
}

function cloneMaterial(material) {
  const clone = material.clone()
  clone.onBeforeCompile = material.onBeforeCompile
  clone.customProgramCacheKey = material.customProgramCacheKey
  return clone
}

function transformExactShell(editor, target, fromName, transform) {
  const clones = new Map(), objects = []
  let existing = 0
  editor.scene.traverse(object => {
    if (!object.isMesh || object.name !== target.objectName) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    let changed = false
    const prepared = materials.map(material => {
      if (!material?.isMeshPhysicalMaterial) return material
      if (material.name !== fromName) {
        if (material.name === target.materialName) existing += 1
        return material
      }
      if (!clones.has(material)) clones.set(material, transform(material))
      changed = true
      return clones.get(material)
    })
    if (changed) {
      object.material = Array.isArray(object.material) ? prepared : prepared[0]
      objects.push(object.name)
    }
  })
  return { objects, clonedMaterials: clones.size, existingMaterials: existing }
}

function prepareRules(config, targets) {
  const previousVersion = config.facadeGlazing?.version
  if (previousVersion != null && previousVersion !== 1 && previousVersion !== VERSION) return
  const defaults = { ...NANJING_FACADE_GLAZING_DEFAULTS, color: [...NANJING_FACADE_GLAZING_DEFAULTS.color] }
  const matchesLegacy = rule => SCALAR_FIELDS.every(key => typeof LEGACY_DEFAULTS[key] === 'number'
    ? Number.isFinite(rule[key]) && Math.abs(rule[key] - LEGACY_DEFAULTS[key]) < 1e-9
    : rule[key] === LEGACY_DEFAULTS[key])
    && Array.isArray(rule.color) && rule.color.length === 3
    && rule.color.every((value, index) => Math.abs(value - LEGACY_DEFAULTS.color[index]) < 1e-9)
  for (const target of targets) {
    const name = target.materialName
    let existing = Array.isArray(config.materials) ? config.materials.filter(rule => rule?.name === name).at(-1) : config.materials?.[name]
    // Only replace the complete, untouched v1 A2 preset. A user-edited alias
    // retains all its values, including zero and custom colors.
    if (previousVersion === 1 && name === NANJING_FACADE_GLAZING_NAME && existing && matchesLegacy(existing)) {
      Object.assign(existing, defaults, { color: [...defaults.color] })
    }
    if (Array.isArray(config.materials)) {
      if (existing) Object.assign(existing, { ...defaults, ...existing })
      else config.materials.push({ name, ...defaults, color: [...defaults.color] })
    } else {
      config.materials ||= {}
      config.materials[name] = { ...defaults, color: [...defaults.color], ...existing }
    }
  }
  config.facadeGlazing = { ...config.facadeGlazing, version: VERSION }
}

function aggregate(targets, mode, extra = {}) {
  return { objects: targets.flatMap(target => target.objects),
    clonedMaterials: targets.reduce((sum, target) => sum + target.clonedMaterials, 0),
    existingMaterials: targets.reduce((sum, target) => sum + target.existingMaterials, 0),
    mode, materialName: mode === 'source' ? NANJING_FACADE_GLAZING_TARGETS[0].sourceName : NANJING_FACADE_GLAZING_NAME,
    targets, ...extra }
}

/**
 * Restore source optical properties after switching the glass mode to source.
 * Does not change the configuration mode: the caller owns that selection.
 * Textures, side, shader hooks and unrelated material edits remain intact. The
 * source descriptor survives project serialization, so this works after reload.
 */
export function restoreNanjingFacadeGlazingSource(editor) {
  if (!editor?.scene?.traverse) throw new TypeError('An editor scene is required')
  let sourceFallbacks = 0
  const targets = NANJING_FACADE_GLAZING_TARGETS.map(target => {
    const status = transformExactShell(editor, target, target.materialName, material => {
      const clone = cloneMaterial(material)
      const stored = material.userData?.[SOURCE_KEY]
      const source = [1, VERSION].includes(stored?.version) && stored.name === target.sourceName ? stored : target.sourceDefaults
      if (source === target.sourceDefaults) sourceFallbacks += 1
      clone.name = target.sourceName
      clone.color.fromArray(source.color)
      for (const field of SCALAR_FIELDS) if (source[field] != null) clone[field] = source[field]
      delete clone.userData[SOURCE_KEY]
      clone.needsUpdate = true
      return clone
    })
    return { ...status, objectName: target.objectName, materialName: target.sourceName }
  })
  return aggregate(targets, 'source', { sourceFallbacks, ...shareConnectedGlazing(editor, 'source') })
}

/** Prepare before the editor's ordinary material-rule application and saving. */
export function prepareNanjingFacadeGlazing(editor, config) {
  if (!editor?.scene?.traverse || !config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('A scene and Nanjing configuration object are required')
  }
  if (config.materials != null && typeof config.materials !== 'object') {
    throw new TypeError('Material rules must be an array or an object')
  }
  if (config.glassComposition?.mode === 'source') return restoreNanjingFacadeGlazingSource(editor)
  if (config.facadeGlazing?.enabled === false) return aggregate([], 'disabled', { version: config.facadeGlazing.version ?? null })
  const targets = NANJING_FACADE_GLAZING_TARGETS.map(target => {
    const status = transformExactShell(editor, target, target.sourceName, material => {
      const clone = cloneMaterial(material)
      clone.name = target.materialName
      clone.userData[SOURCE_KEY] = {
        version: VERSION, name: target.sourceName, color: material.color.toArray(),
        ...Object.fromEntries(SCALAR_FIELDS.filter(field => material[field] != null).map(field => [field, material[field]]))
      }
      return clone
    })
    return { ...status, objectName: target.objectName, materialName: target.materialName }
  })
  const present = targets.filter(target => target.objects.length || target.existingMaterials)
  if (present.length) prepareRules(config, present)
  return aggregate(targets, 'physical', { version: config.facadeGlazing?.version ?? null, ...shareConnectedGlazing(editor, 'physical') })
}

const RULE_NUMBERS = ['roughness', 'metalness', 'transmission', 'ior', 'opacity', 'alphaTest', 'emissiveIntensity',
  'envMapIntensity', 'clearcoat', 'clearcoatRoughness', 'thickness', 'specularIntensity', 'sheen', 'sheenRoughness',
  'iridescence', 'iridescenceIOR', 'attenuationDistance', 'bumpScale', 'aoMapIntensity', 'side', 'shadowSide',
  'polygonOffsetFactor', 'polygonOffsetUnits']
const RULE_BOOLEANS = ['transparent', 'depthWrite', 'depthTest', 'wireframe', 'toneMapped', 'vertexColors',
  'alphaToCoverage', 'polygonOffset', 'forceSinglePass']
const RULE_COLORS = ['color', 'emissive', 'specularColor', 'sheenColor', 'attenuationColor']

/**
 * Mode-button path: prepare/restore this one shell, apply its ordinary rules,
 * and refresh the owning model's material inventory. It does not rebuild the
 * scene, lights, LOD, instancing, or any other material. Switching back to physical
 * reuses the persisted alias rule, including edits the user made before source.
 */
export function applyNanjingFacadeGlazingMode(editor, config) {
  const status = prepareNanjingFacadeGlazing(editor, config)
  // An untouched source-mode scene needs no material mutation. In particular,
  // do not edit a source material that another unrelated object may share.
  if (status.mode === 'disabled' || status.mode === 'source' && !status.clonedMaterials && !status.sharedObjects?.length) {
    return { ...status, appliedMaterials: 0, refreshedInventories: 0 }
  }
  const rules = Array.isArray(config.materials) ? config.materials
    : Object.entries(config.materials || {}).map(([name, props]) => ({ name, ...props }))
  const targets = new Map(status.targets.map(target => [target.objectName, target]))
  const applied = new Set()
  editor.scene.traverse(object => {
    if (!object.isMesh || !targets.has(object.name)) return
    const target = targets.get(object.name)
    // Do not run source-name rules over an untouched shared source material;
    // the same low-roughness glass is used by the bridge and A2's lower floor.
    if (status.mode === 'source' && !target.objects.includes(object.name)) return
    const exact = rules.filter(rule => rule?.name === target.materialName).at(-1)
    const pattern = rules.find(rule => rule?.match && new RegExp(rule.match).test(target.materialName))
    const props = { ...config.materialDefaults, ...pattern, ...exact }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material?.isMeshPhysicalMaterial || material.name !== target.materialName || applied.has(material)) continue
      for (const key of RULE_NUMBERS) if (props[key] != null && key in material) material[key] = props[key]
      for (const key of RULE_BOOLEANS) if (props[key] != null && key in material) material[key] = !!props[key]
      for (const key of RULE_COLORS) if (props[key] != null && material[key]?.isColor) {
        if (Array.isArray(props[key])) material[key].fromArray(props[key])
        else material[key].set(props[key])
      }
      if (props.normalScale && material.normalScale) {
        if (Array.isArray(props.normalScale)) material.normalScale.fromArray(props.normalScale)
        else material.normalScale.set(props.normalScale.x, props.normalScale.y)
      }
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap']) {
        if (props[key] === null) material[key] = null
      }
      material.needsUpdate = true
      applied.add(material)
    }
  })
  let refreshedInventories = 0
  for (const root of editor.scene.children) {
    if (root.editorType !== 'isModelGroup' && !Array.isArray(root.RootMaterials)) continue
    const materials = new Set()
    root.traverse(object => {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) materials.add(material)
    })
    root.RootMaterials = [...materials]
    refreshedInventories += 1
  }
  return { ...status, appliedMaterials: applied.size, refreshedInventories }
}
