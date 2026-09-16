const VERSION = 1
const BINDING = 'nanjingBinding'
const MODEL_BINDING = 'nanjingMaterialBindingId'
const storageOf = entry => entry?.storage || entry?.group
const slotsOf = object => Array.isArray(object.material) ? object.material : [object.material]
const recoveries = new WeakMap(), restored = new WeakMap()

function modelRoots(editor) {
  return editor.scene.children.filter(object => object.editorType === 'isModelGroup' && !object.userData?.nanjingUtility)
}
function unique(values) { return values.length === 1 ? values[0] : null }
function findSavedRoot(entry, roots, index, used) {
  const storage = storageOf(entry), available = roots.filter(root => !used.has(root))
  const id = entry.modelInfo?.[MODEL_BINDING]
  return unique(available.filter(root => storage?.uuid && root.uuid === storage.uuid))
    || unique(available.filter(root => id && root.modelInfo?.[MODEL_BINDING] === id))
    || unique(available.filter(root => root.modelInfo === entry.modelInfo))
    || unique(available.filter(root => root.modelInfo?.url === entry.modelInfo?.url && root.name === storage?.name))
    || unique(available.filter(root => root.modelInfo?.url === entry.modelInfo?.url))
    // Core getStorage serializes its scene-root array with map(), in this order.
    || (available.includes(roots[index]) && roots[index].modelInfo?.url === entry.modelInfo?.url ? roots[index] : null)
}
function geometryShape(object) {
  return { positions: object.geometry?.attributes?.position?.count ?? null, indices: object.geometry?.index?.count ?? null }
}
function usages(root) {
  const result = new Map()
  function visit(object, path) {
    if (object.isMesh && object.material) slotsOf(object).forEach((material, slot) => {
      if (!material?.isMaterial) throw new Error('模型包含无效材质槽')
      if (!result.has(material)) result.set(material, [])
      result.get(material).push({ path: [...path], slot, slots: slotsOf(object).length,
        array: Array.isArray(object.material), geometry: geometryShape(object) })
    })
    object.children.forEach((child, index) => visit(child, [...path, index]))
  }
  visit(root, [])
  return result
}

/** Call inside save's source wrappers, immediately after the core serializer. */
export function annotateNanjingMaterialBindings(editor, data) {
  const entries = data?.modelCores
  if (!Array.isArray(entries)) return { version: VERSION, models: 0, materials: 0, targets: 0 }
  const roots = modelRoots(editor), used = new Set(), staged = []
  let materials = 0, targets = 0
  entries.forEach((entry, index) => {
    const storage = storageOf(entry), rows = storage?.RootMaterials
    if (!Array.isArray(rows) || !rows.length) return
    const root = findSavedRoot(entry, roots, index, used)
    if (!root || !Array.isArray(root.RootMaterials) || root.RootMaterials.length !== rows.length) {
      throw new Error('无法对应模型材质存储表，已停止保存以避免材质错位')
    }
    used.add(root)
    const references = usages(root), bindings = root.RootMaterials.map(material => {
      const locations = references.get(material)
      if (!locations?.length) throw new Error('材质存储表包含未绑定的材质，已停止保存')
      targets += locations.length
      return { version: VERSION, name: material.name || '', type: material.type, targets: locations }
    })
    if (new Set(root.RootMaterials).size !== rows.length || references.size !== rows.length) {
      throw new Error('模型材质清单与物体材质槽不一致，已停止保存')
    }
    const id = storage.uuid || root.uuid
    staged.push({ entry, storage, rows, bindings, root, id })
    materials += rows.length
  })
  // Validation is complete before touching any serialized entry.
  for (const { entry, storage, rows, bindings, root, id } of staged) {
    storage.RootMaterials = rows.map((row, index) => ({ ...row, [BINDING]: bindings[index] }))
    storage.nanjingMaterialBindings = { version: VERSION, id, materialCount: rows.length }
    entry.modelInfo = { ...entry.modelInfo, [MODEL_BINDING]: id }
    const recovery = recoveries.get(root)
    if (recovery) storage.nanjingMaterialBindingRecovery = recovery
  }
  return { version: VERSION, models: staged.length, materials, targets }
}

function findEntry(root, params) {
  const entries = (params?.modelCores || []).filter(entry => storageOf(entry))
  const id = root.modelInfo?.[MODEL_BINDING]
  return unique(entries.filter(entry => entry.modelInfo === root.modelInfo))
    || unique(entries.filter(entry => id && entry.modelInfo?.[MODEL_BINDING] === id && entry.modelInfo?.url === root.modelInfo?.url))
    || unique(entries.filter(entry => storageOf(entry).uuid === root.uuid))
    || unique(entries.filter(entry => entry.modelInfo?.url === root.modelInfo?.url))
}
function resolvePath(root, path) {
  if (!Array.isArray(path) || path.length > 128 || path.some(index => !Number.isSafeInteger(index) || index < 0)) return null
  let object = root
  for (const index of path) { object = object.children?.[index]; if (!object) return null }
  return object
}
function copyMap(texture) {
  const result = texture.clone()
  for (const key of ['textureUrl', 'textureType']) if (texture[key] !== undefined) result[key] = texture[key]
  if (texture.animation !== undefined) result.animation = JSON.parse(JSON.stringify(texture.animation))
  return result
}
function blockUnsafeTable(root, storage, rows, error) {
  const recovery = { version: VERSION, reason: error.message || String(error), RootMaterials: rows,
    binding: storage.nanjingMaterialBindings || null }
  if (storage.nanjingMaterialBindingRecovery) recovery.previous = storage.nanjingMaterialBindingRecovery
  // Jm reads this property AFTER scene.add/ADDCALL. Keep its original table as
  // recoverable metadata, but prevent Wr from falling back to unsafe indices.
  storage.nanjingMaterialBindingRecovery = recovery
  storage.RootMaterials = []
  recoveries.set(root, recovery)
  return { handled: true, applied: false, blockedCoreRestore: true, error: recovery.reason,
    materials: rows.length, recoveryField: 'nanjingMaterialBindingRecovery' }
}

/** Call at the start of scene.ADDCALL, before previousAdd and core Jm's Wr. */
export function restoreNanjingMaterialBindings(root, params) {
  if (root?.editorType !== 'isModelGroup') return { handled: false, applied: false }
  const entry = findEntry(root, params), storage = storageOf(entry), rows = storage?.RootMaterials
  if (!Array.isArray(rows) || !rows.length) return { handled: false, applied: false }
  if (!storage.nanjingMaterialBindings && !rows.some(row => row?.[BINDING])) return { handled: false, applied: false, legacy: true }
  const previous = restored.get(root)
  if (previous?.rows === rows) return { ...previous.status, repeated: true }
  const assignments = new Map(), sourceMaterials = [], newMaterials = [], newTextures = [], changes = []
  const oldList = root.RootMaterials
  try {
    if (storage.nanjingMaterialBindings?.version !== VERSION || storage.nanjingMaterialBindings.materialCount !== rows.length) {
      throw new Error('材质绑定版本或数量不匹配')
    }
    for (let index = 0; index < rows.length; index++) {
      const binding = rows[index]?.[BINDING]
      if (binding?.version !== VERSION || typeof binding.name !== 'string' || !Array.isArray(binding.targets) || !binding.targets.length) {
        throw new Error(`第 ${index + 1} 项材质绑定不完整`)
      }
      let source = null
      for (const target of binding.targets) {
        const object = resolvePath(root, target.path), shape = object && geometryShape(object)
        if (!object?.isMesh || !object.material || !Number.isSafeInteger(target.slot) || !Number.isSafeInteger(target.slots)
          || target.slots < 1 || target.slot < 0 || target.slot >= target.slots || typeof target.array !== 'boolean'
          || (!target.array && (target.slots !== 1 || target.slot !== 0))
          || shape.positions !== target.geometry?.positions || shape.indices !== target.geometry?.indices) {
          throw new Error(`第 ${index + 1} 项材质的模型路径或几何不匹配`)
        }
        let assignment = assignments.get(object)
        if (!assignment) {
          assignment = { object, original: object.material, array: target.array, slots: new Array(target.slots) }
          assignments.set(object, assignment)
        }
        if (assignment.array !== target.array || assignment.slots.length !== target.slots || assignment.slots[target.slot] !== undefined) {
          throw new Error('材质槽存在重复或冲突的绑定')
        }
        const current = slotsOf(object)[target.slot] || slotsOf(object)[0]
        if (!current?.isMaterial) throw new Error('模型源材质不存在')
        source ||= current
        assignment.slots[target.slot] = index
      }
      sourceMaterials.push(source)
    }
    for (const assignment of assignments.values()) {
      if (Array.from(assignment.slots).some(index => index === undefined)) throw new Error('物体材质槽未完整绑定')
    }
    // No mesh may silently fall through to a differently ordered source table.
    root.traverse(object => { if (object.isMesh && object.material && !assignments.has(object)) throw new Error('模型出现未绑定的材质物体') })
    const output = sourceMaterials.map((source, index) => {
      // A fresh model can itself be a clone sharing materials with another
      // model root. Every saved identity owns a material, including slot zero;
      // otherwise core Wr for this model would overwrite that other instance.
      const material = source.clone(); newMaterials.push(material)
      material.onBeforeCompile = source.onBeforeCompile
      material.customProgramCacheKey = source.customProgramCacheKey
      const map = source.map?.isTexture ? copyMap(source.map) : source.map
      if (map && map !== source.map) newTextures.push(map)
      changes.push({ material, name: material.name, map: material.map, nextName: rows[index][BINDING].name, nextMap: map })
      return material
    })
    // Commit only after every path, slot, clone and texture is ready.
    for (const change of changes) { change.material.name = change.nextName; change.material.map = change.nextMap }
    for (const assignment of assignments.values()) {
      const materials = assignment.slots.map(index => output[index])
      assignment.object.material = assignment.array ? materials : materials[0]
    }
    root.RootMaterials = output
    const status = { handled: true, applied: true, blockedCoreRestore: false, materials: output.length,
      objects: assignments.size, clones: newMaterials.length, isolatedMaps: newTextures.length, error: null }
    restored.set(root, { rows, status })
    if (storage.nanjingMaterialBindingRecovery) recoveries.set(root, storage.nanjingMaterialBindingRecovery)
    return status
  } catch (error) {
    for (const assignment of assignments.values()) assignment.object.material = assignment.original
    for (const change of changes) { change.material.name = change.name; change.material.map = change.map }
    root.RootMaterials = oldList
    for (const material of newMaterials) material.dispose()
    for (const texture of newTextures) texture.dispose()
    return blockUnsafeTable(root, storage, rows, error)
  }
}
