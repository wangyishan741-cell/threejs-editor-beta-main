const GLASS_NAME = '建筑_蓝灰玻璃'
const COMPOSITION_VERSION = 4
const MODES = Object.freeze({
  physical: Object.freeze({ opacity: 1, transparent: false, depthWrite: true, transmission: 0.75, sheen: 0,
    metalness: 0.1329304724931717, roughness: 0.025, color: [0.12, 0.2, 0.34] }),
  // Re-read from the current source .blend in Blender 5.1.2 and its GLB.
  source: Object.freeze({ opacity: 0.6706948280334473, transparent: true, depthWrite: false, transmission: 1, sheen: 1,
    metalness: 0.1329304724931717, roughness: 0, color: [0.29613590240478516, 0.4019780158996582, 0.610495924949646] }),
})

/**
 * A blue-grey glass display preset, preserving source metalness/IOR and all
 * other material rules. Physical transmission already carries the background;
 * alpha blending would also attenuate the computed surface reflection. A depth
 * write stops subsequently drawn BLEND foliage from overlaying this facade.
 * This does not add transparent objects to Three's transmission background.
 * Darker tint, transmission, slight micro-roughness and removed sheen are display choices,
 * not corrections to the source exporter. Do not simulate glass as a metal.
 */
export function setNanjingGlassComposition(config, mode = 'physical') {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('A Nanjing configuration object is required')
  if (!Object.hasOwn(MODES, mode)) throw new RangeError(`Unknown glass composition mode: ${mode}`)
  if (config.materials != null && typeof config.materials !== 'object') throw new TypeError('Material rules must be an array or an object')
  const values = { ...MODES[mode] }
  const referencePreset = mode === 'physical' ? config.reference?.glassPreset : null
  if (referencePreset && typeof referencePreset === 'object' && !Array.isArray(referencePreset)) {
    // Reference-specific display choices cannot add material fields or alter
    // the verified source preset or defaults used by other projects.
    for (const key of Object.keys(MODES.physical)) {
      if (Object.hasOwn(referencePreset, key)) values[key] = referencePreset[key]
    }
  }
  const copyValues = () => ({ ...values, color: [...values.color] })
  if (Array.isArray(config.materials)) {
    let found = false
    for (const rule of config.materials) {
      if (rule?.name !== GLASS_NAME) continue
      // Update every duplicate exact rule: the material applier uses the last.
      Object.assign(rule, copyValues())
      found = true
    }
    if (!found) config.materials.push({ name: GLASS_NAME, ...copyValues() })
  } else {
    config.materials ||= {}
    config.materials[GLASS_NAME] = { ...config.materials[GLASS_NAME], ...copyValues() }
  }
  config.glassComposition = { ...config.glassComposition, version: COMPOSITION_VERSION, mode }
  config.reflections = { ...config.reflections, enabled: mode === 'physical', autoCapture: mode === 'physical' }
  return config
}

/** One-time project migration; an existing version preserves explicit choices. */
export function migrateNanjingGlassComposition(config) {
  const previous = config?.glassComposition
  if (previous?.version != null && (previous.version <= 0 || previous.version >= COMPOSITION_VERSION || !['physical', 'source'].includes(previous.mode))) return config
  if (previous?.mode === 'source') {
    config.glassComposition.version = COMPOSITION_VERSION
    return config
  }
  return setNanjingGlassComposition(config, 'physical')
}
