import * as THREE from 'three'

export const NANJING_TRANSPARENT_SHADOW_DEFAULTS = Object.freeze({ version: 3, enabled: true, mode: 'solid', opacity: 1 })

const GLASS_MATERIAL_NAMES = new Set([
  '建筑_蓝灰玻璃', '场地_蓝灰玻璃', '地库入口_蓝灰玻璃', 'Glass door.002', 'Material 27',
  '建筑_通透玻璃', '建筑_低粗糙玻璃', '建筑_镜面玻璃',
  '建筑_a2外层介电玻璃', '建筑_a3外层介电玻璃', '建筑_a4外层介电玻璃'
])
const materialsOf = object => Array.isArray(object.material) ? object.material : [object.material]
const automaticExclusion = object => materialsOf(object).length > 0 && materialsOf(object).every(material => material
  && ((material.transmission || 0) > 0 || (material.opacity < 0.98 && !(material.alphaTest > 0))))
const listedBlendedGlass = object => materialsOf(object).length > 0 && materialsOf(object).every(material => material
  && GLASS_MATERIAL_NAMES.has(material.name) && material.transparent)
const loadedConfigProvenance = new WeakMap()
const loadedConfigAutomaticObjects = new WeakMap()

// This source asset puts the pole, arm and luminaire in one mesh with the
// emissive lampshade material. Its transparency is a display property, not a
// request to remove the whole streetlight's ordinary solid shadow.
export function isNanjingSolidRoadLamp(object) {
  if (!object?.isMesh || object.isInstancedMesh || object.isSkinnedMesh || object.isBatchedMesh
    || object.morphTargetInfluences?.length || Array.isArray(object.material)
    || object.material?.name !== '灯具_发光灯罩' || !object.material.isMeshStandardMaterial
    || object.material.alphaTest > 0 || object.material.alphaHash) return false
  let named = false
  for (let node = object; node; node = node.parent) {
    if (node.userData?.nanjingUtility) return false
    if (/^道路灯具_道路灯_\d+$/.test(node.name)) named = true
  }
  const geometry = object.geometry, position = geometry?.attributes?.position
  if (!named || !geometry?.isBufferGeometry || !position || !position.count
    || Object.keys(geometry.morphAttributes || {}).length) return false
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  const box = geometry.boundingBox
  return box && !box.isEmpty() && [...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)
}

function normalize(value = {}) {
  if (value === false) value = { enabled: false, userConfigured: true }
  if (!value || typeof value !== 'object') value = {}
  return { ...value, version: NANJING_TRANSPARENT_SHADOW_DEFAULTS.version, mode: 'solid',
    enabled: value.enabled === undefined ? NANJING_TRANSPARENT_SHADOW_DEFAULTS.enabled : value.enabled === true,
    opacity: 1,
    automaticObjects: Object.fromEntries(Object.entries(value.automaticObjects || {}).filter(([, castShadow]) => typeof castShadow === 'boolean')) }
}

function migrateDefaults(value) {
  // Coverage now migrates to solid, but a saved off choice remains off. Partial
  // v1 records also retain their original implicit off state. Fresh projects
  // continue to use the enabled default.
  return value?.version === 1 ? { ...value, enabled: value.enabled === true } : value
}

function solidCoverage(material) {
  // r184 copies display map/alphaMap/alphaTest into even custom shadow materials
  // immediately before drawing. Keep full coverage on these owned runtime
  // materials without touching display materials, object hooks or ShaderChunk.
  // Geometry displacement, clipping and sidedness still follow the native path.
  for (const [key, value] of Object.entries({ map: null, alphaMap: null, alphaTest: 0, alphaHash: false, opacity: 1 })) {
    Object.defineProperty(material, key, { configurable: true, enumerable: true, get: () => value, set() {} })
  }
  return material
}

// Only the named building glass uses solid depth coverage. Keep the existing
// exclusion/provenance policy and every explicit castShadow choice separate.
export function createNanjingTransparentShadows(editor, config, options = {}) {
  const records = new Map()
  const sourceSettings = config.transparentShadows
  const sourceObjects = Object.values(config.objects || {})
  const loadedAutomaticObjects = loadedConfigAutomaticObjects.get(config)
    || Object.fromEntries(Object.entries(sourceSettings?.automaticObjects || {}).filter(([, value]) => typeof value === 'boolean'))
  loadedConfigAutomaticObjects.set(config, loadedAutomaticObjects)
  const loadedProvenance = loadedConfigProvenance.get(config) || {
    settingsPresent: Object.hasOwn(config, 'transparentShadows'), version: sourceSettings?.version ?? null,
    enabled: sourceSettings?.enabled ?? null, opacity: sourceSettings?.opacity ?? null,
    userConfigured: sourceSettings?.userConfigured === true,
    automaticMapPresent: sourceSettings != null && Object.hasOwn(sourceSettings, 'automaticObjects'),
    automaticObjectCount: Object.values(sourceSettings?.automaticObjects || {}).filter(value => typeof value === 'boolean').length,
    matchingAutomaticObjectCount: Object.entries(loadedAutomaticObjects).filter(([name, value]) => config.objects?.[name]?.castShadow === value).length,
    objectOverrideCount: sourceObjects.length,
    fullSnapshotObjects: sourceObjects.filter(value => value && typeof value.visible === 'boolean'
      && typeof value.castShadow === 'boolean' && typeof value.receiveShadow === 'boolean' && Number.isFinite(value.renderOrder)).length,
    sceneName: config.sceneName ?? null, renderFixVersion: config.renderFixVersion ?? null,
    globalCastShadow: config.shadows?.castShadow ?? null
  }
  loadedConfigProvenance.set(config, loadedProvenance)
  let settings = normalize(migrateDefaults(config.transparentShadows))
  config.transparentShadows = settings
  // ADDCALL can install this controller before the whole saved model or its
  // materials have been restored. Keep proven automatic origins until their
  // objects can actually be managed; an early scan must not erase that history.
  const pendingAutomaticObjects = new Map(Object.entries(settings.automaticObjects)
    .filter(([name, castShadow]) => config.objects?.[name]?.castShadow === castShadow))
  let disposed = false, suspended = 0, pendingUpdate = false
  let suspendedRecords = []
  let explicitOverrides = 0, skipped = [], explicitOverrideSamples = []

  function isEditorUtility(object) {
    for (let parent = object; parent; parent = parent.parent) {
      if (parent.userData?.nanjingUtility || parent.isHelper || parent.type?.endsWith('Helper')
        || parent.isTransformControlsRoot || parent.isTransformControlsGizmo || parent.isTransformControlsPlane
        || parent.type?.startsWith('TransformControls')) return true
    }
    return false
  }

  function eligibleReason(object) {
    if (isNanjingSolidRoadLamp(object)) return null
    if (Array.isArray(object.material)) return 'multiple-materials'
    if (!GLASS_MATERIAL_NAMES.has(object.material.name)) return 'outside-glass-material-list'
    if (object.isInstancedMesh || object.isSkinnedMesh || object.isBatchedMesh) return 'special-mesh'
    // The current instancer already excludes transmission and blended surfaces.
    // Do not accidentally disable its batching if a user changes this material.
    if (!object.material.transparent && !(object.material.transmission > 0)) return 'opaque-material'
    return null
  }

  function restoreOwned(record) {
    const object = record.object
    let changed = false
    if (record.depth && object.customDepthMaterial === record.depth) {
      object.customDepthMaterial = record.originalDepth; changed = true
    }
    if (record.distance && object.customDistanceMaterial === record.distance) {
      object.customDistanceMaterial = record.originalDistance; changed = true
    }
    return changed
  }

  function freeOwned(record) {
    const changed = restoreOwned(record)
    record.depth?.dispose(); record.distance?.dispose()
    record.depth = null; record.distance = null
    return changed
  }

  function release(record) {
    let changed = freeOwned(record)
    if (record.object.castShadow === record.lastCastShadow) {
      changed = record.object.castShadow !== record.originalCastShadow || changed
      record.object.castShadow = record.originalCastShadow
    }
    records.delete(record.object)
    return changed
  }

  function markChanged() {
    if (editor.renderer?.shadowMap) editor.renderer.shadowMap.needsUpdate = true
    editor.scene.traverse(object => { if (object.isLight && object.shadow && !isEditorUtility(object)) object.shadow.needsUpdate = true })
    options.onChange?.(getStatus())
  }

  function scan() {
    if (disposed || suspended) { pendingUpdate = !disposed; return false }
    const seen = new Set()
    explicitOverrides = 0; skipped = []; explicitOverrideSamples = []
    let changed = false
    editor.scene.traverse(object => {
      if (!object.isMesh || !object.material) return
      if (isEditorUtility(object)) { pendingAutomaticObjects.delete(object.name); return }
      let record = records.get(object)
      const ordinaryRoadLamp = isNanjingSolidRoadLamp(object)
      if (!automaticExclusion(object) && !listedBlendedGlass(object) && !ordinaryRoadLamp) {
        if (record) changed = release(record) || changed
        return
      }
      const explicit = config.objects?.[object.name]?.castShadow
      const savedAutomatic = Object.hasOwn(settings.automaticObjects, object.name)
        && settings.automaticObjects[object.name] === explicit
      if (typeof explicit === 'boolean' && !savedAutomatic) {
        if (explicitOverrideSamples.length < 8 || object.name === 'a1玻璃外墙') {
          const props = config.objects[object.name]
          explicitOverrideSamples.push({ name: object.name, material: materialsOf(object).map(material => material?.name),
            objectFields: Object.keys(props), visible: props.visible, castShadow: props.castShadow,
            receiveShadow: props.receiveShadow, renderOrder: props.renderOrder,
            hadAutomaticEntry: Object.hasOwn(settings.automaticObjects, object.name),
            automaticValue: settings.automaticObjects[object.name] ?? null,
            hadLoadedAutomaticEntry: Object.hasOwn(loadedAutomaticObjects, object.name),
            loadedAutomaticValue: loadedAutomaticObjects[object.name] ?? null })
        }
        if (record) changed = release(record) || changed
        pendingAutomaticObjects.delete(object.name)
        delete settings.automaticObjects[object.name]
        changed = object.castShadow !== explicit || changed
        object.castShadow = explicit; explicitOverrides++
        return
      }
      if (record && object.castShadow !== record.lastCastShadow) {
        // Keep an editor change made between updates, including an explicit
        // request for conventional opaque shadowing, through save and cleanup.
        record.originalCastShadow = object.castShadow
        record.editedCastShadow = object.castShadow
        config.objects ||= {}
        config.objects[object.name] = { ...config.objects[object.name], castShadow: object.castShadow }
        delete settings.automaticObjects[object.name]
      }
      const externalDepth = object.customDepthMaterial && object.customDepthMaterial !== record?.depth
      const externalDistance = object.customDistanceMaterial && object.customDistanceMaterial !== record?.distance
      if (externalDepth || externalDistance) {
        if (record) changed = release(record) || changed
        skipped.push({ name: object.name, reason: 'existing-custom-shadow-material' })
        return
      }
      if (!record) {
        record = { object, originalCastShadow: savedAutomatic ? (config.shadows?.castShadow ?? true) : object.castShadow, lastCastShadow: object.castShadow,
          originalDepth: object.customDepthMaterial, originalDistance: object.customDistanceMaterial,
          depth: null, distance: null, editedCastShadow: undefined }
        records.set(object, record)
      }
      pendingAutomaticObjects.delete(object.name)
      seen.add(object)
      record.ordinaryRoadLamp = ordinaryRoadLamp
      record.reason = eligibleReason(object)
      if (record.reason) skipped.push({ name: object.name, material: Array.isArray(object.material) ? null : object.material.name, reason: record.reason })
      const solid = settings.enabled && !record.reason
        && config.shadows?.castShadow !== false && record.editedCastShadow === undefined
      if (solid && !ordinaryRoadLamp) {
        if (!record.depth) {
          record.depth = solidCoverage(new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking,
            alphaHash: false, opacity: 1, transparent: false, depthWrite: true }))
          record.depth.name = '南京透明物体实体投影（运行时）'
          record.distance = solidCoverage(new THREE.MeshDistanceMaterial({ depthWrite: true, colorWrite: true }))
          record.distance.name = '南京透明物体实体投影（点光源）'
        }
        if (object.customDepthMaterial !== record.depth || object.customDistanceMaterial !== record.distance) changed = true
        object.customDepthMaterial = record.depth; object.customDistanceMaterial = record.distance
      } else changed = freeOwned(record) || changed
      // A saved automatic false is proven by automaticObjects above; an
      // explicit false has already returned unchanged. Keep this provenance
      // while migrating these 85 lamps back to their ordinary source policy.
      const castShadow = record.editedCastShadow ?? (ordinaryRoadLamp ? config.shadows?.castShadow !== false : solid)
      if (object.castShadow !== castShadow) { object.castShadow = castShadow; changed = true }
      record.lastCastShadow = object.castShadow
    })
    for (const [object, record] of records) if (!seen.has(object)) changed = release(record) || changed
    // snapshotConfig serializes every castShadow field. This provenance keeps
    // those generated booleans from becoming user overrides on the next load.
    for (const [name, castShadow] of pendingAutomaticObjects) {
      if (config.objects?.[name]?.castShadow !== castShadow) pendingAutomaticObjects.delete(name)
    }
    settings.automaticObjects = Object.fromEntries([...pendingAutomaticObjects, ...[...records.values()]
      .filter(record => record.editedCastShadow === undefined)
      .map(record => [record.object.name, record.object.castShadow])])
    for (const [name, castShadow] of Object.entries(settings.automaticObjects)) {
      // Keep an earlier full snapshot in step with a later automatic toggle;
      // otherwise its stale boolean would look like a new explicit override.
      if (config.objects?.[name]) config.objects[name].castShadow = castShadow
    }
    if (changed) markChanged()
    return changed
  }

  function update(values = {}) {
    if (disposed) return false
    const explicitChoice = Object.hasOwn(values, 'enabled') || Object.hasOwn(values, 'opacity')
    settings = normalize({ ...config.transparentShadows, ...values, ...(explicitChoice ? { userConfigured: true } : {}) })
    config.transparentShadows = settings
    return scan()
  }

  function withOriginals(callback) {
    if (disposed) return callback()
    if (!suspended) scan()
    suspended++
    if (suspended === 1) {
      suspendedRecords = []
      for (const record of records.values()) {
        const object = record.object
        const saved = { record, depth: object.customDepthMaterial, distance: object.customDistanceMaterial }
        restoreOwned(record)
        suspendedRecords.push(saved)
      }
    }
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true; suspended--
      if (suspended) return
      const saved = suspendedRecords; suspendedRecords = []
      if (disposed) return
      for (const item of saved) {
        const { record } = item, object = record.object
        if (object.customDepthMaterial === record.originalDepth && item.depth === record.depth) object.customDepthMaterial = record.depth
        if (object.customDistanceMaterial === record.originalDistance && item.distance === record.distance) object.customDistanceMaterial = record.distance
      }
      if (pendingUpdate) { pendingUpdate = false; scan() }
    }
    try {
      const result = callback()
      if (result?.then) return Promise.resolve(result).finally(finish)
      finish(); return result
    } catch (error) { finish(); throw error }
  }

  // Use this for an explicit UI/programmatic choice, including choosing the
  // same boolean as the current automatic result but requesting a solid shadow.
  function setObjectCastShadow(object, value) {
    if (disposed || !object?.isMesh || isEditorUtility(object) || ![true, false, 'auto'].includes(value)) return false
    config.objects ||= {}
    config.objects[object.name] ||= {}
    delete settings.automaticObjects[object.name]
    pendingAutomaticObjects.delete(object.name)
    const record = records.get(object)
    if (value === 'auto') {
      if (record) release(record)
      delete config.objects[object.name].castShadow
      object.castShadow = config.shadows?.castShadow ?? true
    } else config.objects[object.name].castShadow = value
    return scan()
  }

  function getStatus() {
    const entries = [...records.values()]
    return { ...settings, automaticObjects: { ...settings.automaticObjects }, enabled: settings.enabled && !disposed, disposed,
      mode: 'solid', supportedLightTypes: ['DirectionalLight', 'SpotLight', 'PointLight'],
      supportsPointLights: true, managedObjects: entries.length,
      eligibleObjects: entries.filter(record => !record.reason).length,
      activeObjects: entries.filter(record => record.depth && record.object.customDepthMaterial === record.depth).length,
      ordinaryRoadLampObjects: entries.filter(record => record.ordinaryRoadLamp && record.object.castShadow).length,
      excludedObjects: entries.filter(record => !record.object.castShadow).length,
      explicitOverrides, skipped: skipped.map(item => ({ ...item })),
      provenance: { loaded: { ...loadedProvenance }, pendingAutomaticObjectCount: pendingAutomaticObjects.size,
        explicitOverrideSamples: explicitOverrideSamples.map(item => ({ ...item,
        material: [...item.material], objectFields: [...item.objectFields] })) },
      warning: '按玻璃几何投射普通实体阴影，不改变玻璃显示材质；不模拟彩色透光或焦散。' }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    let changed = false
    for (const record of records.values()) changed = release(record) || changed
    suspendedRecords = []; pendingUpdate = false
    if (changed) markChanged()
  }

  scan()
  return { update, getStatus, setObjectCastShadow, withOriginals, dispose }
}
