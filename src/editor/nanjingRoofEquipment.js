const SOURCE_NAME = '建筑_深灰金属'
export const NANJING_ROOF_EQUIPMENT_NAME = '建筑_屋顶设备涂层'
export const NANJING_ROOF_EQUIPMENT_TARGETS = Object.freeze([
  'a1楼顶风扇', 'a1楼顶风扇-三联', 'a1楼顶风扇_001', 'Cube_016',
  'a2楼顶风扇', 'a2楼顶风扇_001', 'Cube',
  'a3通风管', 'a3通风管_001', 'a3通风结构',
  'a4通风管', 'a4通风管_001', 'a4通风结构'
])
// Match the roof's effective albedo: #686868 times its grey texture (~.199).
// Equipment has no base-colour texture, so its coating uses linear .02732.
// The original
// shared metal is also used by traffic signals and lower bridge structures.
export const NANJING_ROOF_EQUIPMENT_DEFAULTS = Object.freeze({
  type: 'MeshPhysicalMaterial', color: Object.freeze([0.02732089163382382, 0.02732089163382382, 0.02732089163382382]),
  metalness: 0, roughness: 1, ior: 1.5, specularIntensity: 1
})

function visitSources(object, visit) {
  if (!object || object.userData?.nanjingUtility || object.userData?.skipEditorTree
    || object.isHelper || object.isTransformControlsRoot || object.type?.endsWith('Helper')) return
  if (object.isMesh) visit(object)
  for (const child of object.children || []) visitSources(child, visit)
}

function prepareRule(config) {
  const defaults = { ...NANJING_ROOF_EQUIPMENT_DEFAULTS, color: [...NANJING_ROOF_EQUIPMENT_DEFAULTS.color] }
  const existing = Array.isArray(config.materials)
    ? config.materials.filter(rule => rule?.name === NANJING_ROOF_EQUIPMENT_NAME).at(-1)
    : config.materials?.[NANJING_ROOF_EQUIPMENT_NAME]
  const rule = { ...defaults, ...existing }
  if (Array.isArray(rule.color)) rule.color = [...rule.color]
  if (Array.isArray(config.materials)) {
    if (existing) Object.assign(existing, rule)
    else config.materials.push({ name: NANJING_ROOF_EQUIPMENT_NAME, ...rule })
  } else {
    config.materials ||= {}
    config.materials[NANJING_ROOF_EQUIPMENT_NAME] = rule
  }
}

function materialTablePlans(changes) {
  const roots = new Set(), replacements = new Map(changes.map(change => [change.object, change.next]))
  for (const { object } of changes) for (let root = object; root; root = root.parent) {
    if (Array.isArray(root.RootMaterials) || root.editorType === 'isModelGroup') roots.add(root)
  }
  const plans = []
  for (const root of roots) {
    const live = new Set()
    visitSources(root, object => {
      const material = replacements.get(object) || object.material
      for (const value of Array.isArray(material) ? material : [material]) if (value?.isMaterial) live.add(value)
    })
    const previous = root.RootMaterials
    const retained = (Array.isArray(previous) ? previous : []).filter((value, index, list) => live.has(value) && list.indexOf(value) === index)
    const next = [...retained, ...[...live].filter(value => !retained.includes(value))]
    if (!Array.isArray(previous) || next.length !== previous.length || next.some((value, index) => value !== previous[index])) {
      plans.push({ root, previous, next })
    }
  }
  return plans
}

/**
 * Run before ordinary applyMaterials, after saved material bindings restore.
 * One clone is shared by all selected users of each actual source identity;
 * independent source materials are never merged merely because names match.
 * Existing saved aliases and custom rules remain authoritative. Disabled means
 * no automatic reassignment; it does not undo a user's already saved material.
 * These aliases are ordinary saved resources, not disposable rendering proxies.
 */
export function prepareNanjingRoofEquipment(editor, config = {}) {
  if (!editor?.scene || !config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('A scene and configuration object are required')
  if (config.materials != null && typeof config.materials !== 'object') throw new TypeError('Material rules must be an array or object')
  const enabled = config.roofEquipment !== false && config.roofEquipment?.enabled !== false
  config.roofEquipment = { version: 1, enabled }
  const result = { active: false, materialName: NANJING_ROOF_EQUIPMENT_NAME, objects: [], clonedMaterials: 0, existingMaterials: 0, changed: false, errors: [] }
  if (!enabled) return result
  const names = new Map(NANJING_ROOF_EQUIPMENT_TARGETS.map(name => [name, []]))
  visitSources(editor.scene, object => names.get(object.name)?.push(object))
  const clones = new Map(), changes = [], existing = new Set()
  for (const [name, matches] of names) {
    if (!matches.length) continue // The model may still be loading.
    if (matches.length !== 1) { result.errors.push(`屋顶设备“${name}”不唯一，已保留原材质`); continue }
    const object = matches[0], source = object.material
    if (!source?.isMeshStandardMaterial || ![SOURCE_NAME, NANJING_ROOF_EQUIPMENT_NAME].includes(source.name)) continue
    result.objects.push(name)
    if (source.name === NANJING_ROOF_EQUIPMENT_NAME) { existing.add(source); continue }
    if (!clones.has(source)) {
      const clone = source.clone()
      clone.name = NANJING_ROOF_EQUIPMENT_NAME
      clone.onBeforeCompile = source.onBeforeCompile
      clone.customProgramCacheKey = source.customProgramCacheKey
      clones.set(source, clone)
    }
    changes.push({ object, previous: source, next: clones.get(source) })
  }
  const plans = materialTablePlans(changes)
  try {
    for (const change of changes) change.object.material = change.next
    for (const plan of plans) plan.root.RootMaterials = plan.next
    if (result.objects.length) prepareRule(config)
    result.active = result.objects.length > 0
    result.clonedMaterials = clones.size
    result.existingMaterials = existing.size
    result.changed = changes.length > 0
  } catch (error) {
    for (const change of changes) change.object.material = change.previous
    for (const plan of plans) if (plan.root.RootMaterials !== plan.previous) {
      if (plan.previous === undefined) delete plan.root.RootMaterials
      else plan.root.RootMaterials = plan.previous
    }
    for (const clone of clones.values()) clone.dispose()
    result.errors.push(error.message || String(error))
  }
  return result
}
