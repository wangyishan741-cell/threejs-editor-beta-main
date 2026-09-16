// A material is an editable resource, not one row per mesh using it. Keep
// independent resources separate even when their names and values happen to match.
function visitSources(object, visit) {
  if (!object || object.userData?.nanjingUtility || object.userData?.skipEditorTree
    || object.isHelper || object.isTransformControlsRoot || object.type?.endsWith('Helper')) return
  if (object.isMesh && object.material) visit(object)
  for (const child of object.children || []) visitSources(child, visit)
}

function slots(mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

function belongsTo(mesh, selected) {
  for (let object = mesh; object; object = object.parent) if (object === selected) return true
  return false
}

/** Collect actual scene material slots; render-only proxy branches are excluded. */
export function collectMaterialGroups(scene, selectedObject = null) {
  const byMaterial = new Map()
  visitSources(scene, mesh => {
    slots(mesh).forEach((material, index) => {
      if (!material?.isMaterial || material.isShaderMaterial || material.isRawShaderMaterial) return
      let record = byMaterial.get(material)
      if (!record) {
        record = { material, mesh, slot: Array.isArray(mesh.material) ? index : null, usages: [], selected: false }
        byMaterial.set(material, record)
      }
      record.usages.push({ mesh, slot: Array.isArray(mesh.material) ? index : null })
      record.selected ||= !!selectedObject && belongsTo(mesh, selectedObject)
    })
  })
  const records = [...byMaterial.values()]
  const names = new Map(), ordinals = new Map()
  for (const record of records) {
    const name = record.material.name || record.material.type || '未命名材质'
    names.set(name, (names.get(name) || 0) + 1)
  }
  for (const record of records) {
    const name = record.material.name || record.material.type || '未命名材质'
    const ordinal = (ordinals.get(name) || 0) + 1
    ordinals.set(name, ordinal)
    record.meshCount = new Set(record.usages.map(usage => usage.mesh)).size
    const variant = names.get(name) > 1 ? ` · ${record.material.type} ${ordinal}` : ''
    record.label = `${name}${variant}（${record.meshCount} 个模型）`
  }
  return records.sort((a, b) => Number(b.selected) - Number(a.selected))
}

function refreshMaterialRoots(meshes) {
  const roots = new Set()
  for (const mesh of meshes) for (let root = mesh; root; root = root.parent) {
    if (Array.isArray(root.RootMaterials) || root.editorType === 'isModelGroup') roots.add(root)
  }
  for (const root of roots) {
    const materials = new Set()
    visitSources(root, mesh => slots(mesh).forEach(material => { if (material?.isMaterial) materials.add(material) }))
    // Keep existing slot order where possible; the binding serializer annotates
    // all live usages and must never encounter an orphaned old material.
    const retained = (root.RootMaterials || []).filter((material, index, list) => materials.has(material) && list.indexOf(material) === index)
    root.RootMaterials = [...retained, ...[...materials].filter(material => !retained.includes(material))]
  }
}

/** Replace every current source reference atomically at the mesh-slot level.
 * Re-scan because the panel may have remained open across clone/remove/edit.
 * No geometries, textures or previous materials are disposed by this operation.
 */
export function replaceMaterialGroup(scene, record, replacement) {
  if (!replacement?.isMaterial) throw new TypeError('替换材质无效')
  const source = record.material
  if (replacement === source) return { meshes: 0, slots: 0 }
  const changes = []
  visitSources(scene, mesh => {
    const current = slots(mesh)
    const count = current.filter(material => material === source).length
    if (!count) return
    changes.push({ mesh, count, material: Array.isArray(mesh.material)
      ? current.map(material => material === source ? replacement : material) : replacement })
  })
  if (!changes.length) throw new Error('该材质已不在当前场景中，请重新打开材质面板')
  for (const change of changes) change.mesh.material = change.material
  refreshMaterialRoots(changes.map(change => change.mesh))
  record.material = replacement
  record.usages = changes.flatMap(({ mesh }) => slots(mesh).flatMap((material, index) => material === replacement
    ? [{ mesh, slot: Array.isArray(mesh.material) ? index : null }] : []))
  record.mesh = changes[0].mesh
  record.slot = record.usages[0].slot
  record.meshCount = changes.length
  return { meshes: changes.length, slots: changes.reduce((count, change) => count + change.count, 0) }
}
