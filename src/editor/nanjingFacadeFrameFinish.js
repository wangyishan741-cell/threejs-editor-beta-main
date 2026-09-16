export const NANJING_FACADE_FRAME_FINISH_DEFAULTS = Object.freeze({ version: 1, enabled: false, metalness: 0.08, roughness: 0.72, sheen: 0 })
export const NANJING_FACADE_FRAME_FINISH_TARGETS = Object.freeze([
  Object.freeze({ name: 'a2外层镂空', positions: 10166, indices: 22008 }),
  Object.freeze({ name: 'a3&a4外层镂空', positions: 36262, indices: 72195 }),
])
// Track editable values on both sides: generated texture copies must never be
// saved as source maps, but edits made through a panel bound to a copy are real.
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
const editValue = value => value?.toArray ? value.toArray() : Array.isArray(value) ? value.slice() : value
const sameEdit = (a, b) => Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => Object.is(v, b[i])) : Object.is(a, b)
const editSnapshot = material => Object.fromEntries(EDIT_FIELDS.filter(key => key in material).map(key => [key, editValue(material[key])]))
function copyEdit(target, source, key) {
  if (!(key in target)) return
  if (target[key]?.copy && source[key]?.toArray) target[key].copy(source[key])
  else target[key] = Array.isArray(source[key]) ? source[key].slice() : source[key]
}

const sourceNames = new Set(['建筑_深灰金属框', '建筑_格栅涂层'])
const slots = object => (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean)
const excluded = object => object.userData?.nanjingUtility || object.userData?.skipEditorTree || object.isHelper || object.isTransformControlsRoot
function visit(object, callback) {
  if (!object || excluded(object)) return
  callback(object)
  for (const child of object.children || []) visit(child, callback)
}
export function normalizeNanjingFacadeFrameFinish(value) {
  // Old history and unknown future versions must retain the original surface.
  if (!value || value.version !== 1) return { ...NANJING_FACADE_FRAME_FINISH_DEFAULTS }
  const result = { ...NANJING_FACADE_FRAME_FINISH_DEFAULTS, enabled: value.enabled === true }
  for (const field of ['metalness', 'roughness', 'sheen']) if (value[field] !== undefined) {
    if (!Number.isFinite(value[field]) || value[field] < 0 || value[field] > 1) throw new TypeError(`外框 ${field} 须在 0–1 之间`)
    result[field] = value[field]
  }
  if (value.materialOverrides !== undefined) {
    if (!value.materialOverrides || typeof value.materialOverrides !== 'object' || Array.isArray(value.materialOverrides)) throw new TypeError('外框材质覆盖须为对象')
    const overrides = {}
    for (const [name, values] of Object.entries(value.materialOverrides)) {
      if (!NANJING_FACADE_FRAME_FINISH_TARGETS.some(target => target.name === name) || !values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError('外框材质覆盖目标无效')
      const entry = {}
      for (const [field, number] of Object.entries(values)) {
        if (!['metalness', 'roughness', 'sheen'].includes(field) || !Number.isFinite(number) || number < 0 || number > 1) throw new TypeError('外框材质覆盖字段须为 0–1')
        entry[field] = number
      }
      if (Object.keys(entry).length) overrides[name] = entry
    }
    if (Object.keys(overrides).length) result.materialOverrides = overrides
  }
  return result
}

/** Display-only copies on two audited meshes. Keep source names, texture
 * identities and shader hooks; existing receiver/reflection classification
 * stays unchanged. Save inside withOriginals and rebuild from versioned config. */
export function createNanjingFacadeFrameFinish(editor, config = {}, { onChange } = {}) {
  const scene = editor?.scene
  let settings = normalizeNanjingFacadeFrameFinish(config.facadeFrameFinish), records = [], disposed = false, suspended = 0, pending = false, skipped = [], activeRestore = null
  const ownedSources = new WeakMap(), sources = new Set()
  let materialEdits = 0
  const finishFields = ['metalness', 'roughness', 'sheen']
  function saveOverride(row, field, value) {
    settings.materialOverrides ??= {}
    settings.materialOverrides[row.object.name] ??= {}
    settings.materialOverrides[row.object.name][field] = value
    config.facadeFrameFinish = structuredClone(settings)
  }
  function applyValues(row) {
    const before = editSnapshot(row.material), overrides = settings.materialOverrides?.[row.object.name] || {}
    for (const field of EDIT_FIELDS) if (field in row.source) copyEdit(row.material, row.source, field)
    for (const field of finishFields) if (field in row.material) row.material[field] = overrides[field] ?? settings[field]
    if (EDIT_FIELDS.some(field => !sameEdit(before[field], editValue(row.material[field])))) row.material.needsUpdate = true
    row.sourceValues = editSnapshot(row.source); row.copyValues = editSnapshot(row.material)
  }
  function syncMaterialEdits() {
    if (disposed) return getStatus()
    for (const row of records) {
      const sourceNow = editSnapshot(row.source), copyNow = editSnapshot(row.material)
      for (const field of EDIT_FIELDS) {
        if (!(field in row.source)) continue
        const sourceChanged = !sameEdit(sourceNow[field], row.sourceValues[field])
        const copyChanged = !sameEdit(copyNow[field], row.copyValues[field])
        // The saved/source side wins if both sides changed since the last sync.
        if (copyChanged && !sourceChanged) { copyEdit(row.source, row.material, field); row.source.needsUpdate = true; materialEdits++ }
        if ((sourceChanged || copyChanged) && finishFields.includes(field)) saveOverride(row, field, row.source[field])
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
        // Preserve existing malformed duplicates/unrelated orphan rows so the
        // strict material-binding validator still catches those errors.
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
    restoreMaterials()
    syncOwnedMaterialLists()
    for (const row of records) row.material.dispose()
    records = []
  }
  function refresh() {
    if (disposed) return getStatus()
    if (suspended) { pending = true; return getStatus() }
    const hadRecords = records.length > 0
    syncMaterialEdits()
    restoreMaterials(); syncOwnedMaterialLists()
    const previous = records
    records = []; skipped = []
    if (settings.enabled && scene) {
      const matches = new Map(NANJING_FACADE_FRAME_FINISH_TARGETS.map(target => [target.name, []]))
      visit(scene, object => matches.get(object.name)?.push(object))
      for (const target of NANJING_FACADE_FRAME_FINISH_TARGETS) {
        const candidates = matches.get(target.name), object = candidates.length === 1 ? candidates[0] : null, source = object?.material
        if (!object?.isMesh || object.isInstancedMesh || object.isSkinnedMesh || object.morphTargetInfluences?.length
          || !source?.isMeshStandardMaterial || !sourceNames.has(source.name)
          || object.geometry?.attributes.position?.count !== target.positions || object.geometry?.index?.count !== target.indices) {
          skipped.push({ name: target.name, reason: '外框源对象、材质或几何版本不匹配' }); continue
        }
        // Keep the identity held by a live material panel across all refreshes.
        let row = previous.find(item => item.object === object && item.source === source)
        if (!row) {
          const material = source.clone()
          material.onBeforeCompile = source.onBeforeCompile
          material.customProgramCacheKey = source.customProgramCacheKey
          row = { object, source, material }
          ownedSources.set(material, source); sources.add(source)
        }
        applyValues(row)
        records.push(row)
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
    const next = normalizeNanjingFacadeFrameFinish({ ...settings, ...patch })
    settings = next; config.facadeFrameFinish = { ...next }
    return refresh()
  }
  function withOriginals(callback) {
    if (disposed) return callback()
    const outer = suspended === 0
    if (outer) syncMaterialEdits()
    suspended++
    let restoreLists = () => {}, finished = false
    if (outer) {
      restoreMaterials()
      try { restoreLists = syncOwnedMaterialLists(); activeRestore = restoreLists }
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
  function getStatus() { return { active: !disposed && !suspended && records.length > 0, settings: structuredClone(settings), materialEdits, objects: records.map(row => row.object.name), materials: records.length,
    skipped: skipped.slice(), geometryChanged: false, sourceColorChanged: false, sourceTexturesChanged: false, sourceMaterialsChanged: false } }
  function dispose() { if (disposed) return; syncMaterialEdits(); disposed = true; release(); sources.clear() }
  refresh()
  return { refresh, update, syncMaterialEdits, withOriginals, withBaseline: withOriginals, getStatus, dispose,
    getOriginalMaterial: material => ownedSources.get(material) || material }
}
