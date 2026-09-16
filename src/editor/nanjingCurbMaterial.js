const TARGET = '道路_踢脚线_02'
const MATERIAL = '周边_路缘_浅暖灰'

function visitSources(object, visit) {
  if (!object || object.userData?.nanjingUtility || object.userData?.skipEditorTree
    || object.isHelper || object.isTransformControlsRoot || object.type?.endsWith('Helper')) return
  if (object.isMesh) visit(object)
  for (const child of object.children || []) visitSources(child, visit)
}

function materialTablePlans(target, material) {
  const plans = []
  for (let root = target; root; root = root.parent) {
    if (!Array.isArray(root.RootMaterials) && root.editorType !== 'isModelGroup') continue
    const live = new Set()
    visitSources(root, mesh => {
      const value = mesh === target ? material : mesh.material
      for (const entry of Array.isArray(value) ? value : [value]) if (entry?.isMaterial) live.add(entry)
    })
    const previous = root.RootMaterials
    const retained = (Array.isArray(previous) ? previous : []).filter((entry, index, list) => live.has(entry) && list.indexOf(entry) === index)
    const next = [...retained, ...[...live].filter(entry => !retained.includes(entry))]
    if (!Array.isArray(previous) || next.length !== previous.length || next.some((entry, index) => entry !== previous[index])) {
      plans.push({ root, previous, next })
    }
  }
  return plans
}

// The thick park curb shares its old material with road surfaces. Reuse the
// surrounding light curb's actual material only on this exact mesh instead.
// Call after bindings and material rules restore; explicit false opts out.
export function applyNanjingCurbMaterial(editor, config = {}) {
  const enabled = config.curbMaterial !== false && config.curbMaterial?.enabled !== false
  config.curbMaterial = { version: 1, enabled }
  const result = { active: false, target: TARGET, material: MATERIAL, changed: false, sourceUsers: 0, errors: [] }
  if (!enabled) return result
  const targets = [], materials = new Set()
  visitSources(editor?.scene, object => {
    if (object.name === TARGET) { targets.push(object); return }
    const slots = Array.isArray(object.material) ? object.material : [object.material]
    const matches = slots.filter(material => material?.isMaterial && material.name === MATERIAL)
    if (matches.length) result.sourceUsers++
    for (const material of matches) materials.add(material)
  })
  if (targets.length !== 1) result.errors.push(`目标路缘“${TARGET}”应唯一，当前找到 ${targets.length} 个`)
  if (materials.size !== 1) result.errors.push(`参考路缘须共享同一“${MATERIAL}”材质，当前找到 ${materials.size} 个材质身份`)
  if (result.errors.length) return result
  const target = targets[0], material = [...materials][0]
  if (!target.material?.isMaterial) {
    result.errors.push(`目标路缘“${TARGET}”须使用单一材质`)
    return result
  }
  const previous = target.material, plans = materialTablePlans(target, material)
  try {
    if (previous !== material) target.material = material
    for (const plan of plans) plan.root.RootMaterials = plan.next
    result.active = true
    result.changed = previous !== material
  } catch (error) {
    if (target.material !== previous) target.material = previous
    for (const plan of plans) {
      if (plan.root.RootMaterials === plan.previous) continue
      if (plan.previous === undefined) delete plan.root.RootMaterials
      else plan.root.RootMaterials = plan.previous
    }
    result.errors.push(error.message || String(error))
  }
  return result
}
