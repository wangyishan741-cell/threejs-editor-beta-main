export const NANJING_SURFACE_LIGHTING_DEFAULTS = Object.freeze({ version: 1, enabled: true, amount: 1 })

const lightFactors = new Map([['灯光_总览_01', 0.4], ['灯光_总览_02', 0.5]])
const boundedAmount = (value, fallback = 1) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback
const owned = object => {
  for (let node = object; node; node = node.parent) if (node.userData?.nanjingUtility) return false
  return true
}
const valid = (value, unit = false) => Number.isFinite(value) && value >= 0 && (!unit || value <= 1)
const plainValues = value => value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {}

/**
 * A project lighting adjustment, applied only on creation or explicit update.
 * Install after the source materials/lights/environment have been restored.
 * Source material slots, leaf coverage, the main sun and reflection materials
 * remain untouched. The caller can refresh its one-shot reflection separately.
 */
export function createNanjingSurfaceLighting(editor, config, { onChange } = {}) {
  if (!editor?.scene?.traverse || !editor.renderer || !config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('A scene, renderer and project configuration are required')
  }
  const saved = config.surfaceLighting === false ? { enabled: false } : config.surfaceLighting || {}
  const settings = { ...NANJING_SURFACE_LIGHTING_DEFAULTS,
    enabled: saved.enabled !== false, amount: boundedAmount(saved.amount),
    baseline: { values: plainValues(saved.baseline?.values) }, overrides: plainValues(saved.overrides) }
  const records = [], skipped = [], lights = new Map([...lightFactors.keys()].map(name => [name, []])), materials = new Set()
  let disposed = false, suspended = 0, pendingApply = false, restoreOnDispose = false, updates = 0

  editor.scene.traverse(object => {
    if (!owned(object)) return
    if (object.isDirectionalLight && lights.has(object.name)) lights.get(object.name).push(object)
    if (object.isMesh) for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (material?.isMeshStandardMaterial && material.name === 'Material_25') materials.add(material)
    }
  })
  const effectiveAmount = () => settings.enabled ? settings.amount : 0
  const adjusted = (record, amount) => record.factor !== undefined
    ? record.base * (1 + (record.factor - 1) * amount)
    : record.base + (record.target - record.base) * amount
  function add(key, object, property, options) {
    const current = object[property], unit = options.unit === true
    if (!valid(current, unit)) { skipped.push({ key, reason: '当前源数值无效，未覆盖' }); return }
    const savedBase = settings.baseline.values[key]
    const hasBaseline = valid(savedBase, unit)
    const record = { key, object, property, unit, base: hasBaseline ? savedBase : current,
      original: current, lastApplied: current, ...options }
    settings.baseline.values[key] = record.base
    if (!valid(settings.overrides[key], unit)) delete settings.overrides[key]
    // A saved project normally contains the adjusted values; a fresh source
    // may contain the original baseline. Any third value is an external edit.
    const expected = settings.overrides[key] ?? adjusted(record, effectiveAmount())
    if (hasBaseline && current !== expected && current !== record.base) settings.overrides[key] = current
    records.push(record)
  }
  for (const [name, matches] of lights) {
    if (matches.length !== 1) { skipped.push({ key: `light:${name}`, reason: matches.length ? '同名灯不唯一，未覆盖' : '未找到该灯' }); continue }
    add(`light:${name}:intensity`, matches[0], 'intensity', { factor: lightFactors.get(name) })
  }
  add('environment:intensity', editor.scene, 'environmentIntensity', { factor: 0.85 })
  add('renderer:exposure', editor.renderer, 'toneMappingExposure', { factor: 0.9 })
  // The actual GLB has one shared Material_25. Ordered entries also preserve
  // distinct same-named editable materials without introducing material clones.
  let index = 0
  for (const material of materials) {
    add(`foliage:${index}:metalness`, material, 'metalness', { target: 0, unit: true })
    add(`foliage:${index}:roughness`, material, 'roughness', { target: 0.68, unit: true })
    index++
  }
  function persist() {
    config.surfaceLighting = { version: 1, enabled: settings.enabled, amount: settings.amount,
      baseline: { values: { ...settings.baseline.values } }, overrides: { ...settings.overrides } }
  }
  function captureExternalEdits() {
    let changed = false
    for (const record of records) {
      const current = record.object[record.property]
      if (current !== record.lastApplied && valid(current, record.unit)) {
        if (settings.overrides[record.key] !== current) changed = true
        settings.overrides[record.key] = current
      }
    }
    return changed
  }
  function write(record, value) {
    const changed = record.object[record.property] !== value
    if (changed) record.object[record.property] = value
    record.lastApplied = value
    return changed
  }
  function apply() {
    let changed = false
    for (const record of records) changed = write(record, settings.overrides[record.key] ?? adjusted(record, effectiveAmount())) || changed
    updates++
    return changed
  }
  function getStatus() {
    return { version: 1, enabled: !disposed && settings.enabled, amount: settings.amount,
      effectiveAmount: disposed ? 0 : effectiveAmount(), disposed, updates, materials: materials.size,
      fields: records.map(record => ({ key: record.key, baseline: record.base, current: record.object[record.property],
        applied: record.lastApplied, overridden: Object.hasOwn(settings.overrides, record.key),
        pendingExternalEdit: record.object[record.property] !== record.lastApplied })),
      overrides: { ...settings.overrides }, skipped: skipped.map(item => ({ ...item })) }
  }
  function update(patch = {}) {
    if (disposed) return getStatus()
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Surface lighting settings must be an object')
    let changed = suspended ? false : captureExternalEdits()
    if (Object.hasOwn(patch, 'enabled')) { changed = settings.enabled !== (patch.enabled !== false) || changed; settings.enabled = patch.enabled !== false }
    if (Object.hasOwn(patch, 'amount')) {
      const amount = boundedAmount(patch.amount, settings.amount)
      changed = amount !== settings.amount || changed; settings.amount = amount
    }
    if (patch.resetOverrides === true) { changed = Object.keys(settings.overrides).length > 0 || changed; settings.overrides = {} }
    if (suspended) pendingApply = true
    else changed = apply() || changed
    persist()
    if (changed) onChange?.(getStatus())
    return getStatus()
  }
  function withBaseline(callback) {
    if (typeof callback !== 'function') throw new TypeError('A comparison callback is required')
    if (disposed) return callback()
    if (suspended) {
      // The outer scope owns the temporary values and their restoration.
      suspended++
      const finishNested = () => { suspended-- }
      try {
        const result = callback()
        if (result?.then) return Promise.resolve(result).finally(finishNested)
        finishNested(); return result
      } catch (error) { finishNested(); throw error }
    }
    captureExternalEdits(); persist()
    const snapshot = records.map(record => ({ record, value: record.object[record.property], lastApplied: record.lastApplied,
      temporary: settings.overrides[record.key] ?? record.base }))
    suspended++
    for (const item of snapshot) item.record.object[item.record.property] = item.temporary
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true; suspended--
      for (const item of snapshot) {
        const record = item.record, current = record.object[record.property]
        if (current === item.temporary) {
          if (!restoreOnDispose) record.object[record.property] = item.value
        } else if (valid(current, record.unit)) settings.overrides[record.key] = current
        record.lastApplied = record.object[record.property]
      }
      if (!disposed) {
        if (pendingApply) { pendingApply = false; apply() }
        persist()
      }
    }
    try {
      const result = callback()
      if (result?.then) return Promise.resolve(result).finally(finish)
      finish(); return result
    } catch (error) { finish(); throw error }
  }
  function dispose({ restore = false } = {}) {
    if (disposed) return
    if (!suspended) { captureExternalEdits(); persist() }
    restoreOnDispose = restore
    if (restore) for (const record of records) {
      if (record.object[record.property] === record.lastApplied && !Object.hasOwn(settings.overrides, record.key)) {
        record.object[record.property] = record.base
      }
    }
    disposed = true
  }
  const changed = apply()
  persist()
  if (changed) onChange?.(getStatus())
  return { update, getStatus, withBaseline, dispose }
}
