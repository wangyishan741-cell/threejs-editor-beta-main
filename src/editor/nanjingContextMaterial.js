const SOURCE = '场地区块_近景建筑群_01'
const TARGET = '场地区块_近景建筑群_02'
const MATERIAL = '场地_蓝灰玻璃'

function visitSources(object, visit) {
  if (!object || object.userData?.nanjingUtility || object.userData?.skipEditorTree
    || object.isHelper || object.isTransformControlsRoot || object.type?.endsWith('Helper')) return
  if (object.isMesh) visit(object)
  for (const child of object.children || []) visitSources(child, visit)
}

// Plan the same live, unique source-material tables as the material editor.
// Substitute only this target's slot while planning; other users of its previous
// material keep both their reference and their existing table position.
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

/** The authorized context block reuses the actual editable source material.
 * No material values, geometry, object transforms or shadow flags are changed.
 * Call after source bindings/material rules have finished restoring.
 */
export function applyNanjingContextMaterial(editor, config = {}) {
  const enabled = config.contextMaterial !== false && config.contextMaterial?.enabled !== false
  config.contextMaterial = { version: 1, enabled }
  const result = { active: false, target: TARGET, source: SOURCE, material: MATERIAL, changed: false, errors: [] }
  if (!enabled) return result
  const sources = [], targets = []
  visitSources(editor?.scene, object => {
    if (object.name === SOURCE) sources.push(object)
    if (object.name === TARGET) targets.push(object)
  })
  if (sources.length !== 1) result.errors.push(`源区块“${SOURCE}”应唯一，当前找到 ${sources.length} 个`)
  if (targets.length !== 1) result.errors.push(`目标区块“${TARGET}”应唯一，当前找到 ${targets.length} 个`)
  if (result.errors.length) return result
  const source = sources[0], target = targets[0], material = source.material
  if (!material?.isMaterial || material.name !== MATERIAL) {
    result.errors.push(`源区块须使用单一材质“${MATERIAL}”`)
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
