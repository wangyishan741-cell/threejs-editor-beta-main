import { Color, Fog, FogExp2 } from 'three'

const VERSION = 2
export const NANJING_FOG_DEFAULTS = Object.freeze({ enabled: true, type: 'linear', near: 80, far: 360, density: 0.008, color: '#9abed4' })
const DEFAULTS = NANJING_FOG_DEFAULTS

function readColor(value) {
  if (value?.isColor) return value.clone()
  if (Array.isArray(value) && value.length === 3 && value.every(channel => Number.isFinite(channel) && channel >= 0)) {
    // Arrays and serialized Color objects are linear RGB, like Three's JSON.
    return new Color().fromArray(value)
  }
  if (value && ['r', 'g', 'b'].every(key => Number.isFinite(value[key]) && value[key] >= 0)) {
    return new Color(value.r, value.g, value.b)
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff) return new Color(value)
  if (typeof value === 'string' && (/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value) || Object.hasOwn(Color.NAMES, value.toLowerCase()))) {
    return new Color(value.toLowerCase())
  }
  throw new TypeError('Fog color must be a hex color, a named color, or three non-negative linear RGB values')
}

function validate(settings) {
  if (typeof settings.enabled !== 'boolean') throw new TypeError('Fog enabled must be a boolean')
  if (!['linear', 'exp2'].includes(settings.type)) throw new RangeError('Fog type must be linear or exp2')
  if (!Number.isFinite(settings.near) || settings.near < 0 || !Number.isFinite(settings.far) || settings.far <= settings.near) {
    throw new RangeError('Fog distances must be finite, with 0 <= near < far')
  }
  if (!Number.isFinite(settings.density) || settings.density < 0) throw new RangeError('Fog density must be finite and non-negative')
  return settings
}

function fromFog(fog, fallback) {
  if (!fog) return { ...fallback, enabled: false, color: fallback.color.clone() }
  if (!fog.isFog && !fog.isFogExp2) throw new TypeError('Unsupported scene fog')
  return {
    ...fallback,
    enabled: true,
    type: fog.isFogExp2 ? 'exp2' : 'linear',
    color: fog.color.clone(),
    name: fog.name,
    ...(fog.isFogExp2 ? { density: fog.density } : { near: fog.near, far: fog.far }),
  }
}

function fingerprint(fog) {
  return fog ? JSON.stringify([fog.isFogExp2 ? 'exp2' : 'linear', fog.name, ...fog.color.toArray(), fog.near, fog.far, fog.density]) : 'null'
}

/**
 * Distance haze for this model's scale: the overview's main buildings end at
 * camera depth 36.5; distant building centres typically lie at 90–170. The
 * blue-grey colour is a desaturated match to the EXR horizon (~#8bc3e6).
 *
 * config.fog persists linear RGB arrays without quantization. getStatus().color
 * is a hex string for a colour input. Existing Fog/FogExp2 choices are adopted;
 * false/null explicitly disable fog. Setting near/far selects linear distance
 * fog unless update also explicitly supplies type. No material is modified.
 */
export function createNanjingFog(editor, config, { onChange } = {}) {
  const scene = editor?.scene
  if (!scene?.isScene) throw new TypeError('A Three scene is required')
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('A Nanjing configuration object is required')
  const previousFog = scene.fog
  // An incomplete v1 record still inherits v1 distances; changing an absent
  // field must not silently alter a customized or disabled saved project.
  const legacyDefaults = config.fog?.version === 1 ? { near: 40, far: 180 } : {}
  const defaults = { ...DEFAULTS, ...legacyDefaults, name: '', color: readColor(DEFAULTS.color) }
  let settings = scene.fog ? fromFog(scene.fog, defaults) : defaults
  let configExtras = {}
  let version = VERSION

  if (Object.hasOwn(config, 'fog')) {
    const saved = config.fog
    if (saved === false || saved === null) settings = { ...settings, enabled: false }
    else if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      configExtras = { ...saved }
      version = saved.version ?? VERSION
      const type = saved.type === 'Fog' ? 'linear' : saved.type === 'FogExp2' ? 'exp2' : saved.type
      settings = { ...settings }
      for (const key of ['enabled', 'near', 'far', 'density', 'name']) {
        if (Object.hasOwn(saved, key)) settings[key] = saved[key]
      }
      if (type !== undefined) settings.type = type
      // A serialized Fog has no enabled flag and represents an enabled choice.
      if (saved.enabled === undefined) settings.enabled = true
      if (Object.hasOwn(saved, 'color')) settings.color = readColor(saved.color)
    } else throw new TypeError('Fog configuration must be an object, false, or null')
  }
  validate(settings)

  // Only complete, unchanged v1 presets are known to be ours. Preserve
  // explicit off/custom/native/future choices and lossless linear colors.
  const savedFog = config.fog
  if (savedFog?.version === 1 && savedFog.enabled === true && savedFog.near === 40 && [120, 180].includes(savedFog.far)
    && settings.enabled && settings.type === DEFAULTS.type && settings.density === DEFAULTS.density
    && !settings.name && settings.color.equals(readColor(DEFAULTS.color))) {
    settings = { ...settings, near: DEFAULTS.near, far: DEFAULTS.far }
    version = VERSION
  }

  let installedFog
  let installedFingerprint
  let disposed = false

  function saveConfig() {
    config.fog = { ...configExtras, version, enabled: settings.enabled, type: settings.type,
      near: settings.near, far: settings.far, density: settings.density,
      color: settings.color.toArray(), ...(settings.name ? { name: settings.name } : {}) }
  }

  function apply() {
    if (!settings.enabled) installedFog = null
    else {
      // Reuse the object while its type is unchanged. Three r184 notices fog
      // presence/type changes; uniform edits need no material.needsUpdate.
      const correctType = settings.type === 'exp2' ? installedFog?.isFogExp2 : installedFog?.isFog
      if (!correctType) installedFog = settings.type === 'exp2' ? new FogExp2() : new Fog()
      installedFog.name = settings.name
      installedFog.color.copy(settings.color)
      if (settings.type === 'exp2') installedFog.density = settings.density
      else {
        installedFog.near = settings.near
        installedFog.far = settings.far
      }
    }
    scene.fog = installedFog
    installedFingerprint = fingerprint(installedFog)
    saveConfig()
  }

  function getStatus() {
    const active = fromFog(scene.fog, settings)
    return { version, enabled: active.enabled, type: active.type, near: active.near, far: active.far,
      density: active.density, color: `#${active.color.getHexString()}`, colorLinear: active.color.toArray(),
      owned: !disposed && scene.fog === installedFog && fingerprint(scene.fog) === installedFingerprint, disposed }
  }

  function update(patch = {}) {
    if (disposed) throw new Error('This fog controller has been disposed')
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Fog update must be an object')
    // Respect direct edits made through the editor's existing fog panel before
    // applying this update, including a replacement Fog/FogExp2 object.
    const next = fromFog(scene.fog, settings)
    for (const key of ['enabled', 'near', 'far', 'density', 'type']) {
      if (Object.hasOwn(patch, key)) next[key] = patch[key]
    }
    if (!Object.hasOwn(patch, 'type') && (Object.hasOwn(patch, 'near') || Object.hasOwn(patch, 'far'))) next.type = 'linear'
    if (Object.hasOwn(patch, 'color')) next.color = readColor(patch.color)
    validate(next)
    settings = next
    apply()
    const status = getStatus()
    onChange?.(status)
    return status
  }

  function dispose() {
    if (disposed) return
    disposed = true
    // Do not undo a later external replacement or edits to the same fog object.
    if (scene.fog === installedFog && fingerprint(scene.fog) === installedFingerprint) scene.fog = previousFog
  }

  apply()
  return { update, getStatus, dispose }
}
