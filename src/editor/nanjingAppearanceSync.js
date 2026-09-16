// Shared appearance is JSON configuration, never scene objects, texture blobs,
// camera state or device quality. This module performs no I/O or live mutation.
export const NANJING_APPEARANCE_VERSION = 1
const absent = Symbol('absent')
const unsafe = new Set(['__proto__', 'prototype', 'constructor'])
const maxDepth = 32, maxNodes = 200000, maxText = 8 * 1024 * 1024
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const own = (object, key) => Object.hasOwn(object, key)
const object = fields => ({ fields })
const array = (item, length) => ({ item, length })
const dictionary = item => ({ dictionary: item })
const union = (...choices) => ({ choices })
const fields = (keys, schema) => Object.fromEntries(keys.split(' ').map(key => [key, schema]))
const number = 'number', boolean = 'boolean', string = 'string'
const vector2 = array(number, 2), vector3 = array(number, 3)
const color = union(number, string, vector3, object({ r: number, g: number, b: number }))
const optionalSettings = schema => union(schema, 'false', 'null')
const material = object({
  ...fields('name match type', string),
  ...fields('roughness metalness transmission ior opacity alphaTest emissiveIntensity envMapIntensity clearcoat clearcoatRoughness thickness specularIntensity sheen sheenRoughness iridescence iridescenceIOR attenuationDistance bumpScale aoMapIntensity side shadowSide polygonOffsetFactor polygonOffsetUnits', number),
  ...fields('transparent depthWrite depthTest wireframe toneMapped vertexColors alphaToCoverage polygonOffset', boolean),
  ...fields('color emissive specularColor sheenColor attenuationColor', color),
  normalScale: union(vector2, object({ x: number, y: number })),
  // Existing Restore supports null to remove a map. Omission retains its source
  // map; no URL, Texture object, data URL or browser-local blob is publishable.
  ...fields('map normalMap roughnessMap metalnessMap emissiveMap alphaMap aoMap', 'null'),
})
const shadowCamera = object(fields('near far left right top bottom', number))
const light = object({
  ...fields('name type', string), color, groundColor: color,
  ...fields('intensity distance decay angle penumbra width height', number),
  position: vector3, rotation: vector3, target: vector3,
  castShadow: boolean, visible: boolean,
  shadow: object({ ...fields('bias normalBias radius intensity extent near far', number),
    camera: shadowCamera }),
})
const sampling = object({
  ...fields('version radius biasMagnitude normalBias strength receiverPlaneMaxOffset', number),
  resolution: 'shadow-resolution',
  ...fields('enabled planarGroundCasters receiverPlaneBias buildingReceiverPlaneBias singleShadowLight fullSurfaceReceivers', boolean),
  primaryShadowLightName: union(string, 'null'), suppressedShadowLightNames: array(string),
})
const appearanceSchema = object({
  renderer: object({ toneMapping: union(number, string), exposure: number }),
  environment: object({ url: 'url', ...fields('intensity backgroundIntensity', number), rotation: vector3, background: boolean,
    colorBalance: optionalSettings(object({ version: number, enabled: boolean, gains: array('environment-color-gain', 3), scope: string })) }),
  background: union(color, 'null'), lights: array(light),
  materialDefaults: material, materials: union(dictionary(material), array(material)),
  shadows: object({ enabled: boolean, castShadow: boolean, receiveShadow: boolean, sampling }),
  shadowLayers: optionalSettings(object({ version: number, mode: string, enabled: boolean, strength: number })),
  contextMaterial: optionalSettings(object({ version: number, enabled: boolean })),
  curbMaterial: optionalSettings(object({ version: number, enabled: boolean })),
  roofEquipment: optionalSettings(object({ version: number, enabled: boolean })),
  roadLevels: optionalSettings(object({ version: number, enabled: boolean })),
  contextTextures: optionalSettings(object({ version: number, enabled: boolean, scope: 'context-texture-scope', facadeStyle: 'context-facade-style', facadeStrength: 'unit-interval', facadeWorldScale: number, parkingStrength: 'unit-interval', parkingWorldScale: number, pedestrianStrength: 'unit-interval' })),
  facadeFrameFinish: optionalSettings(object({ version: number, enabled: boolean, metalness: 'unit-interval', roughness: 'unit-interval', sheen: 'unit-interval', materialOverrides: object({ 'a2外层镂空': object({ metalness: 'unit-interval', roughness: 'unit-interval', sheen: 'unit-interval' }), 'a3&a4外层镂空': object({ metalness: 'unit-interval', roughness: 'unit-interval', sheen: 'unit-interval' }) }) })),
  internalRoadSurfaces: optionalSettings(object({ version: number, enabled: boolean, visibleRoadDecks: boolean, textureStrength: 'unit-interval', normalStrength: 'unit-interval', worldScale: number, materialOverrides: object({ '支路_路面': object({ metalness: 'unit-interval', roughness: 'unit-interval', specularIntensity: 'unit-interval', normalScale: vector2, map: boolean, normalMap: boolean }), '场地区块_建筑群路面_02': object({ metalness: 'unit-interval', roughness: 'unit-interval', specularIntensity: 'unit-interval', normalScale: vector2, map: boolean, normalMap: boolean }), '支路_路缘': object({ metalness: 'unit-interval', roughness: 'unit-interval', specularIntensity: 'unit-interval', normalScale: vector2, map: boolean, normalMap: boolean }) }) })),
  treePlacements: optionalSettings(object({ version: number, enabled: boolean, offsets: dictionary(vector2) })),
  roadMarkingRecovery: optionalSettings(object({ version: number, enabled: boolean })),
  junctionPaving: optionalSettings(object({ version: number, enabled: boolean })),
  a1AreaLighting: optionalSettings(object({ version: number, enabled: boolean })),
  a1GlassDaylight: optionalSettings(object({ version: number, enabled: boolean, directDiffuseScale: 'unit-interval', baseColorScale: 'nonnegative-number' })),
  fog: optionalSettings(object({ ...fields('version near far density', number), enabled: boolean, ...fields('type name', string), color })),
  glassComposition: object({ version: number, mode: string }),
  facadeCladding: object({ version: number, enabled: boolean }),
  facadeGlazing: object({ version: number, enabled: boolean }),
  transparentShadows: optionalSettings(object({ version: number, mode: string, enabled: boolean, opacity: number,
    userConfigured: boolean, automaticObjects: dictionary(boolean) })),
  contactShadows: optionalSettings(object({ version: number, enabled: boolean, strength: number, radius: number })),
  reflections: object({ ...fields('enabled autoCapture boxProjection', boolean), ...fields('near far boxMargin', number),
    targetNames: array(string), materialNames: array(string), excludeNames: array(string) }),
  surfaceLighting: optionalSettings(object({ version: number, enabled: boolean, amount: number,
    baseline: object({ values: dictionary(number) }), overrides: dictionary(number) })),
  objects: dictionary(object({ castShadow: boolean, receiveShadow: boolean, renderOrder: number })),
  renderFixVersion: number, glassFixVersion: number,
})

function fail(path, reason) { throw new TypeError(`Invalid Nanjing appearance at ${path || '<root>'}: ${reason}`) }
function plain(value, path) {
  if (!record(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, 'expected a plain object')
  for (const key of Object.keys(value)) {
    if (unsafe.has(key)) fail(`${path}.${key}`, 'unsafe key')
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !own(descriptor, 'value')) fail(`${path}.${key}`, 'accessors are not JSON')
  }
}

function assetUrl(value, path) {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\\\u0000-\u0020]/.test(value)) fail(path, 'expected a public asset URL')
  if (!(value.startsWith('/') && !value.startsWith('//')) && !/^https?:\/\//i.test(value)) fail(path, 'only root-relative or HTTP(S) assets are supported')
  const url = new URL(value, 'https://nanjing.invalid')
  if (url.username || url.password) fail(path, 'asset credentials are not supported')
  return value
}

function read(value, schema, strict, path = '', budget = { nodes: 0 }, depth = 0) {
  if (++budget.nodes > maxNodes || depth > maxDepth) fail(path, 'configuration is too large or deeply nested')
  if (schema?.choices) {
    let last
    for (const choice of schema.choices) {
      try { return read(value, choice, strict, path, budget, depth + 1) } catch (error) { last = error }
    }
    throw last
  }
  if (schema === 'number') { if (!Number.isFinite(value)) fail(path, 'expected a finite number'); return value }
  if (schema === 'nonnegative-number') { if (!Number.isFinite(value) || value < 0) fail(path, 'expected a finite nonnegative number'); return value }
  if (schema === 'context-texture-scope') { if (value !== 'near' && value !== 'distant') fail(path, 'expected near or distant'); return value }
  if (schema === 'context-facade-style') { if (value !== 'light-grid-v1') fail(path, 'expected light-grid-v1'); return value }
  if (schema === 'unit-interval') { if (!Number.isFinite(value) || value < 0 || value > 1) fail(path, 'expected a number from zero to one'); return value }
  if (schema === 'environment-color-gain') { if (!Number.isFinite(value) || value <= 0 || value > 8) fail(path, 'expected an HDR color gain above zero and at most eight'); return value }
  if (schema === 'shadow-resolution') {
    if (!Number.isInteger(value) || value < 256 || value > 8192 || (value & (value - 1)) !== 0) {
      fail(path, 'expected a power of two from 256 to 8192')
    }
    return value
  }
  if (schema === 'boolean') { if (typeof value !== 'boolean') fail(path, 'expected a boolean'); return value }
  if (schema === 'string') { if (typeof value !== 'string' || value.length > 4096) fail(path, 'expected a bounded string'); return value }
  if (schema === 'null') { if (value !== null) fail(path, 'only null is supported here'); return null }
  if (schema === 'false') { if (value !== false) fail(path, 'only false is supported here'); return false }
  if (schema === 'url') return assetUrl(value, path)
  if (schema.item) {
    if (!Array.isArray(value) || (schema.length != null && value.length !== schema.length)) fail(path, 'unexpected array shape')
    return value.map((item, index) => read(item, schema.item, strict, `${path}[${index}]`, budget, depth + 1))
  }
  plain(value, path)
  const result = {}
  for (const key of Object.keys(value)) {
    const child = schema.dictionary || (own(schema.fields, key) ? schema.fields[key] : undefined)
    if (!child) { if (strict) fail(`${path}.${key}`, 'field is not publishable'); continue }
    if (value[key] === undefined && !strict) continue
    // Legacy snapshots included editor helpers whose Infinity renderOrder was
    // serialized as null. Ignore that local-only invalid value, regardless of
    // object name; published snapshots must still pass the finite-number rule.
    if (!strict && key === 'renderOrder' && path.startsWith('objects.') && !Number.isFinite(value[key])) continue
    result[key] = read(value[key], child, strict, path ? `${path}.${key}` : key, budget, depth + 1)
  }
  return result
}

function copy(value, depth = 0, budget = { nodes: 0 }) {
  if (++budget.nodes > maxNodes || depth > maxDepth) fail('', 'configuration is too large or deeply nested')
  if (value === absent || value === null || value === undefined || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('', 'non-finite number'); return value }
  if (Array.isArray(value)) return value.map(item => copy(item, depth + 1, budget))
  plain(value, '')
  return Object.fromEntries(Object.keys(value).map(key => [key, copy(value[key], depth + 1, budget)]))
}

function equal(a, b) {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => equal(item, b[index]))
  if (!record(a) || !record(b)) return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => own(b, key) && equal(a[key], b[key]))
}

function validateCoupledAppearance(value) {
  const environmentColorBalance = value.environment?.colorBalance
  if (record(environmentColorBalance) && environmentColorBalance.scope !== undefined
    && !['both', 'lighting-only'].includes(environmentColorBalance.scope)) {
    fail('environment.colorBalance.scope', 'expected both or lighting-only')
  }
  if (record(environmentColorBalance) && environmentColorBalance.version === 1 && environmentColorBalance.enabled !== false
    && (environmentColorBalance.enabled !== true || !Array.isArray(environmentColorBalance.gains))) {
    fail('environment.colorBalance', 'publish the complete enabled v1 settings and RGB gains')
  }
  if (own(value, 'surfaceLighting')) {
    const settings = value.surfaceLighting
    if (!record(settings) || typeof settings.enabled !== 'boolean' || !Number.isFinite(settings.amount)
      || !record(settings.baseline?.values) || !record(settings.overrides)) {
      fail('surfaceLighting', 'publish the complete normalized settings, baseline and overrides')
    }
    const required = ['renderer:exposure', 'environment:intensity', 'light:灯光_总览_01:intensity', 'light:灯光_总览_02:intensity',
      'foliage:0:metalness', 'foliage:0:roughness']
    if (settings.amount < 0 || settings.amount > 1 || required.some(key => !own(settings.baseline.values, key))) {
      fail('surfaceLighting', 'the current project requires its complete lighting and foliage baseline')
    }
    const effective = key => {
      if (key === 'renderer:exposure') return value.renderer?.exposure
      if (key === 'environment:intensity') return value.environment?.intensity
      const lightKey = /^light:(灯光_总览_0[12]):intensity$/.exec(key)
      if (lightKey) {
        const matches = value.lights?.filter(item => item.name === lightKey[1] && item.type === 'DirectionalLight') || []
        return matches.length === 1 ? matches[0].intensity : undefined
      }
      const leafKey = /^foliage:(\d+):(metalness|roughness)$/.exec(key)
      if (leafKey) {
        const entries = Array.isArray(value.materials) ? value.materials.filter(item => item.name === 'Material_25' && !item.match)
          : value.materials?.Material_25 ? [value.materials.Material_25] : []
        return entries[Number(leafKey[1])]?.[leafKey[2]]
      }
      return undefined
    }
    for (const [key, baseline] of Object.entries(settings.baseline.values)) {
      if (!Number.isFinite(effective(key)) || baseline < 0 || (key.startsWith('foliage:') && baseline > 1)) {
        fail(`surfaceLighting.baseline.values.${key}`, 'missing matching effective value or unsupported baseline')
      }
    }
    for (const [key, override] of Object.entries(settings.overrides)) {
      if (!own(settings.baseline.values, key) || override < 0 || (key.startsWith('foliage:') && override > 1)) fail(`surfaceLighting.overrides.${key}`, 'override must match a published baseline')
    }
  }
  if (own(value, 'transparentShadows')) {
    const settings = value.transparentShadows
    if (!record(settings) || typeof settings.enabled !== 'boolean' || !record(settings.automaticObjects)) {
      fail('transparentShadows', 'publish the complete normalized settings and automatic-object markers')
    }
    for (const [name, cast] of Object.entries(settings.automaticObjects)) {
      if (value.objects?.[name]?.castShadow !== cast) fail(`transparentShadows.automaticObjects.${name}`, 'marker must match its published object castShadow')
    }
  }
  return value
}

/** Select only supported visual fields. Unknown local/editor fields are omitted. */
export function pickNanjingAppearance(config) {
  return read(config, appearanceSchema, false)
}

/** Validate an untrusted published JSON manifest. Throws before any live change. */
export function parseNanjingAppearanceEnvelope(value, { modelUrl, configUrl } = {}) {
  if (typeof value === 'string') {
    if (value.length > maxText) fail('', 'manifest is too large')
    try { value = JSON.parse(value) } catch { fail('', 'invalid JSON manifest') }
  }
  plain(value, '')
  const keys = new Set(['version', 'revision', 'modelUrl', 'configUrl', 'publishedAt', 'appearance'])
  for (const key of Object.keys(value)) if (!keys.has(key)) fail(key, 'unknown manifest field')
  if (value.version !== NANJING_APPEARANCE_VERSION) fail('version', 'unsupported manifest version')
  if (typeof value.revision !== 'string' || !value.revision || value.revision.length > 128 || /[\u0000-\u0020]/.test(value.revision)) fail('revision', 'expected a revision string')
  assetUrl(value.modelUrl, 'modelUrl'); assetUrl(value.configUrl, 'configUrl')
  if (modelUrl !== undefined && value.modelUrl !== modelUrl) fail('modelUrl', 'model does not match this project')
  if (configUrl !== undefined && value.configUrl !== configUrl) fail('configUrl', 'reference does not match this project')
  if (typeof value.publishedAt !== 'string' || value.publishedAt.length > 64 || !Number.isFinite(Date.parse(value.publishedAt))) fail('publishedAt', 'expected a publication date')
  return { version: NANJING_APPEARANCE_VERSION, revision: value.revision, modelUrl: value.modelUrl,
    configUrl: value.configUrl, publishedAt: value.publishedAt, appearance: validateCoupledAppearance(read(value.appearance, appearanceSchema, true)) }
}

/**
 * Arrays (including the light list) are atomic. Omitted published fields are
 * unspecified, not deletion commands. With no base, this explicit first sync
 * adopts every published field and returns a lossless prior appearance backup.
 * Later syncs retain local edits, reporting simultaneous differing edits.
 * Inputs are never changed; callers persist base beside the shared revision.
 */
export function mergeNanjingAppearance(localConfig, publishedAppearance, previousBase = null) {
  const published = validateCoupledAppearance(read(publishedAppearance, appearanceSchema, true))
  const base = previousBase == null ? null : read(previousBase, appearanceSchema, true)
  const previousAppearance = pickNanjingAppearance(localConfig)
  const conflicts = []
  const atomic = new Set(['surfaceLighting', 'transparentShadows.automaticObjects'])
  function merge(local, incoming, previous, path) {
    const comparableLocal = path === 'lights' && Array.isArray(local) ? read(local, array(light), false)
      : path === 'materials' && Array.isArray(local) ? read(local, array(material), false) : local
    if (equal(comparableLocal, incoming)) return copy(local)
    if (base !== null && equal(incoming, previous)) return copy(local)
    if (!atomic.has(path) && record(incoming) && record(local)) {
      const result = copy(local)
      for (const key of Object.keys(incoming)) {
        const merged = merge(own(local, key) ? local[key] : absent, incoming[key], record(previous) && own(previous, key) ? previous[key] : absent, path ? `${path}.${key}` : key)
        if (merged !== absent) result[key] = merged
      }
      return result
    }
    if (base === null || equal(comparableLocal, previous)) {
      return copy(incoming)
    }
    conflicts.push({ path, localPresent: local !== absent, basePresent: previous !== absent,
      ...(local !== absent ? { local: copy(local) } : {}), ...(previous !== absent ? { base: copy(previous) } : {}), published: copy(incoming) })
    return copy(local)
  }
  const config = merge(copy(localConfig), published, base ?? absent, '')
  const get = (value, path) => path.reduce((node, key) => record(node) && own(node, key) ? node[key] : absent, value)
  const set = (value, path, item) => {
    let node = value
    for (const key of path.slice(0, -1)) {
      if (!record(node[key])) { if (item === absent) return; node[key] = {} }
      node = node[key]
    }
    if (item === absent) delete node[path.at(-1)]
    else node[path.at(-1)] = copy(item)
  }
  // Baseline, effective values and external overrides are one lighting
  // transaction. Combining independent edits to them can multiply an already
  // adjusted value again, so a concurrent change preserves this local group.
  if (base !== null && [localConfig, published, base].some(value => own(value, 'surfaceLighting'))) {
    const paths = [['surfaceLighting'], ['renderer', 'exposure'], ['environment', 'intensity'], ['lights']]
    if ([localConfig, published, base].some(value => Array.isArray(value.materials))) paths.push(['materials'])
    else paths.push(['materials', 'Material_25', 'metalness'], ['materials', 'Material_25', 'roughness'])
    const group = (value, fallback) => Object.fromEntries(paths.map(path => {
      const item = get(value, path), before = fallback ? get(fallback, path) : absent
      return [path.join('.'), item === absent ? before : item]
    }))
    const localGroup = group(previousAppearance), baseGroup = group(base), incomingGroup = group(published, base)
    if (!equal(localGroup, baseGroup) && !equal(incomingGroup, baseGroup) && !equal(localGroup, incomingGroup)) {
      for (const path of paths) set(config, path, get(localConfig, path))
      const roots = paths.map(path => path.join('.'))
      for (let index = conflicts.length - 1; index >= 0; index--) if (roots.some(path => conflicts[index].path === path || conflicts[index].path.startsWith(`${path}.`))) conflicts.splice(index, 1)
      conflicts.push({ path: 'surfaceLighting', reason: 'coupled-lighting-edit', preservedPaths: roots })
    }
  }
  // A cast flag and its automatic-source marker must travel together. If the
  // local user edited either, do not let a new marker turn explicit off into
  // an automatic flag which the transparent-shadow controller may enable.
  if (base !== null) {
    const names = new Set([localConfig, published, base].flatMap(value => [
      ...Object.keys(value.objects || {}), ...Object.keys(value.transparentShadows?.automaticObjects || {})]))
    for (let index = conflicts.length - 1; index >= 0; index--) if (conflicts[index].path === 'transparentShadows.automaticObjects') conflicts.splice(index, 1)
    for (const name of names) {
      const paths = [['objects', name, 'castShadow'], ['transparentShadows', 'automaticObjects', name]]
      const oldPair = paths.map(path => get(base, path)), localPair = paths.map(path => get(localConfig, path))
      const incomingPair = paths.map((path, index) => {
        const value = get(published, path)
        // An explicitly published empty automatic map removes old markers.
        return value === absent && !(path[0] === 'transparentShadows' && record(published.transparentShadows?.automaticObjects)) ? oldPair[index] : value
      })
      const selected = equal(localPair, oldPair) ? incomingPair : localPair
      for (let index = 0; index < paths.length; index++) set(config, paths[index], selected[index])
      if (!equal(localPair, oldPair) && !equal(incomingPair, oldPair) && !equal(localPair, incomingPair)) {
        conflicts.push({ path: `objects.${name}.castShadow`, reason: 'shadow-source-edit' })
      }
    }
  }
  // The old per-light map allocation remains device-local. An explicit shared
  // shadows.sampling.resolution is a separate requested project setting; the
  // shadow controller gives it priority and applies the local hardware cap.
  // Without that optional setting, retain the historical per-light behavior.
  if (Array.isArray(localConfig.lights) && Array.isArray(config.lights)) {
    for (const light of config.lights) {
      const matches = localConfig.lights.filter(item => item.name === light.name && item.type === light.type)
      if (matches.length === 1 && config.lights.filter(item => item.name === light.name && item.type === light.type).length === 1
        && record(matches[0].shadow) && own(matches[0].shadow, 'mapSize')) {
        light.shadow ||= {}
        light.shadow.mapSize = copy(matches[0].shadow.mapSize)
      }
    }
  }
  // The local transparency performance strategy is not an appearance choice.
  // Preserve it for rule arrays as well as the usual named-material dictionary.
  const materialEntries = value => Array.isArray(value)
    ? value.filter(item => item.name && !item.match).map(item => [item.name, item])
    : record(value) ? Object.entries(value) : []
  const oldMaterials = materialEntries(localConfig.materials), newMaterials = materialEntries(config.materials)
  for (const [name, props] of newMaterials) {
    const matches = oldMaterials.filter(([oldName]) => oldName === name)
    if (matches.length === 1 && newMaterials.filter(([newName]) => newName === name).length === 1
      && typeof matches[0][1].forceSinglePass === 'boolean') props.forceSinglePass = matches[0][1].forceSinglePass
  }
  const actualChanges = []
  const changes = (a, b, path = '') => {
    if (equal(a, b)) return
    if (record(a) && record(b)) for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      changes(own(a, key) ? a[key] : absent, own(b, key) ? b[key] : absent, path ? `${path}.${key}` : key)
    } else actualChanges.push(path)
  }
  changes(localConfig, config)
  return { config, appearance: pickNanjingAppearance(config), base: copy(published),
    previousAppearance: base === null ? previousAppearance : null,
    conflicts, changed: actualChanges.length > 0, changedPaths: actualChanges }
}
