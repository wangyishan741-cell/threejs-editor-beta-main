import { classifyNanjingGpu } from './nanjingDeviceProfile.js'

export const NANJING_DISPLAY_QUALITY_KEY = 'nanjing.displayQuality.v1'
const qualities = new Set(['full', 'balanced', 'fast'])

// Only an explicit client selection is persisted. A saved project or temporary
// benchmark must not silently become this device's viewing preference.
export function readNanjingDisplayQuality(storage) {
  try {
    const value = (storage === undefined ? globalThis.localStorage : storage)?.getItem(NANJING_DISPLAY_QUALITY_KEY)
    return qualities.has(value) ? value : null
  } catch { return null }
}

export function writeNanjingDisplayQuality(quality, storage) {
  if (!qualities.has(quality)) return false
  try {
    const target = storage === undefined ? globalThis.localStorage : storage
    if (!target?.setItem) return false
    target.setItem(NANJING_DISPLAY_QUALITY_KEY, quality)
    return true
  } catch { return false }
}

export function resolveNanjingDisplayQuality({ preference, gpu, baseline = false, capture = false } = {}) {
  if (baseline || capture) return 'full'
  if (qualities.has(preference)) return preference
  // Before WebGL exposes the adapter, use balanced instead of opening a saved
  // full-resolution scene. The restore host resolves again once GPU is known.
  return classifyNanjingGpu(gpu).gpuTier === 'integrated' ? 'fast' : 'balanced'
}

export function snapshotNanjingDisplayQuality(state) {
  if (qualities.has(state?.benchmarkQualityRestore)) return state.benchmarkQualityRestore
  return qualities.has(state?.quality) ? state.quality : 'balanced'
}
