import { createNanjingWaterSurface, normalizeNanjingWaterSurface } from './nanjingWaterSurface.js'

export const NANJING_PREVIEW_METADATA_KEY = 'nanjingPreview'

function readSettings(value) {
  if (value?.version !== 1) return null
  try { return normalizeNanjingWaterSurface(value) } catch { return null }
}

// Only explicitly enabled, versioned project settings travel with a source GLB.
// The editable source material remains unchanged; compatible viewers rebuild
// the display-only shader from these scene extras.
export function createNanjingPreviewMetadata(config) {
  const waterSurface = readSettings(config?.waterSurface)
  return waterSurface?.enabled ? { version: 1, waterSurface } : null
}

export function readNanjingPreviewWater(model) {
  const metadata = model?.userData?.[NANJING_PREVIEW_METADATA_KEY]
  return metadata?.version === 1 ? readSettings(metadata.waterSurface) : null
}

/** Water appearance belongs to each loaded GLTF scene. An explicit JSON
 * setting (including disabled/unknown versions) overrides embedded GLB extras.
 * Call addModel after attaching a loaded model, including deferred JSON loads;
 * clear before disposing source meshes so display copies restore cleanly. */
export function createPreviewWaterSurface(root) {
  const models = new Map()
  let explicit = false, jsonSettings = null
  function attached(model) {
    for (let object = model; object; object = object.parent) if (object === root) return true
    return false
  }
  function refresh() {
    for (const [model, record] of models) {
      const settings = explicit ? jsonSettings : readNanjingPreviewWater(model)
      const signature = attached(model) && settings?.enabled ? JSON.stringify(settings) : null
      if (signature !== record.signature) {
        record.controller?.dispose()
        record.controller = null; record.signature = signature
        if (signature) record.controller = createNanjingWaterSurface({ scene: model }, { waterSurface: structuredClone(settings) })
      }
      record.controller?.refresh()
    }
    return getStatus()
  }
  function setJsonConfig(config) {
    const source = config?.nanjingRestore?.config
    explicit = !!source && Object.prototype.hasOwnProperty.call(source, 'waterSurface')
    jsonSettings = explicit ? readSettings(source.waterSurface) : null
    return refresh()
  }
  function addModel(model) {
    if (!models.has(model)) models.set(model, { controller: null, signature: null })
    return refresh()
  }
  function clear() {
    for (const record of models.values()) record.controller?.dispose()
    models.clear(); explicit = false; jsonSettings = null
  }
  function getStatus() {
    const status = [...models.values()].map(record => record.controller?.getStatus()).filter(Boolean)
    return { active: status.some(item => item.active), materials: status.reduce((total, item) => total + item.materials, 0),
      skipped: status.flatMap(item => item.skipped), shaderErrors: status.reduce((total, item) => total + item.shaderErrors, 0) }
  }
  return { setJsonConfig, addModel, refresh, clear, dispose: clear, getStatus }
}
