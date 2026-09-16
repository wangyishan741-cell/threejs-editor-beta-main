const SOURCE_NAME = '建筑_深灰金属框'
export const NANJING_FACADE_CLADDING_NAME = '建筑_格栅涂层'
const VERSION = 2
const OBJECT_NAMES = new Set(['a2外层镂空', 'a3&a4外层镂空'])
export const NANJING_FACADE_CLADDING_DEFAULTS = Object.freeze({
  color: Object.freeze([0.05, 0.05, 0.05]), metalness: 0.1, roughness: 0.58, sheen: 0
})

function prepareRule(config) {
  const previousVersion = config.facadeCladding?.version
  if (previousVersion != null) {
    if (previousVersion !== 1) return
    const previousRule = Array.isArray(config.materials)
      ? config.materials.filter(rule => rule?.name === NANJING_FACADE_CLADDING_NAME).at(-1)
      : config.materials?.[NANJING_FACADE_CLADDING_NAME]
    // Only migrate our complete untouched v1 preset. A change to any owned
    // field marks the coating as customized, including deleting a field/rule.
    if (Array.isArray(previousRule?.color) && previousRule.color.length === 3
      && previousRule.color.every(value => value === 0.12)
      && previousRule.metalness === 0.1 && previousRule.roughness === 0.58 && previousRule.sheen === 0) {
      previousRule.color = [...NANJING_FACADE_CLADDING_DEFAULTS.color]
    }
    config.facadeCladding.version = VERSION
    return
  }
  const defaults = { ...NANJING_FACADE_CLADDING_DEFAULTS, color: [...NANJING_FACADE_CLADDING_DEFAULTS.color] }
  if (Array.isArray(config.materials)) {
    const rules = config.materials.filter(rule => rule?.name === NANJING_FACADE_CLADDING_NAME)
    if (rules.length) {
      // The material applier uses the last exact rule. Fill missing defaults in
      // that rule without changing any existing user values or rule ordering.
      const last = rules[rules.length - 1]
      Object.assign(last, { ...defaults, ...last })
    } else config.materials.push({ name: NANJING_FACADE_CLADDING_NAME, ...defaults })
  } else {
    config.materials ||= {}
    config.materials[NANJING_FACADE_CLADDING_NAME] = {
      ...defaults, ...config.materials[NANJING_FACADE_CLADDING_NAME]
    }
  }
  config.facadeCladding = { ...config.facadeCladding, version: VERSION }
}

/**
 * A project material edit requested for the two exterior lattices. It separates
 * their coating from the shared source material used by a1 mullions, columns and
 * interiors. The normal material applier runs immediately after this function,
 * so its existing rules, texture handling and serialization remain authoritative.
 * Saved coating materials are recognized by name and are not cloned again.
 */
export function prepareNanjingFacadeCladding(editor, config) {
  if (!editor?.scene?.traverse || !config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('A scene and Nanjing configuration object are required')
  }
  if (config.materials != null && typeof config.materials !== 'object') {
    throw new TypeError('Material rules must be an array or an object')
  }
  const clones = new Map(), objects = []
  let existing = 0
  editor.scene.traverse(object => {
    if (!object.isMesh || !OBJECT_NAMES.has(object.name)) return
    const values = Array.isArray(object.material) ? object.material : [object.material]
    let changed = false, matched = false
    const prepared = values.map(material => {
      if (!material?.isMeshStandardMaterial) return material
      if (material.name === NANJING_FACADE_CLADDING_NAME) { existing += 1; matched = true; return material }
      if (material.name !== SOURCE_NAME) return material
      matched = true
      changed = true
      if (!clones.has(material)) {
        const clone = material.clone()
        clone.name = NANJING_FACADE_CLADDING_NAME
        clone.onBeforeCompile = material.onBeforeCompile
        clone.customProgramCacheKey = material.customProgramCacheKey
        clones.set(material, clone)
      }
      return clones.get(material)
    })
    if (changed) object.material = Array.isArray(object.material) ? prepared : prepared[0]
    if (matched) objects.push(object.name)
  })
  if (objects.length) prepareRule(config)
  return { objects, clonedMaterials: clones.size, existingMaterials: existing,
    materialName: NANJING_FACADE_CLADDING_NAME, version: config.facadeCladding?.version ?? null }
}
